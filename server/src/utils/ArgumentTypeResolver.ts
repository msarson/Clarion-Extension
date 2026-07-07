import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { ArgClassification } from './CallSiteArgumentClassifier';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { ChainedPropertyResolver } from './ChainedPropertyResolver';
import { ClassMemberResolver } from './ClassMemberResolver';
import { ScopeTypeIndexService } from '../services/ScopeTypeIndexService';
import { CrossFileCache } from '../providers/hover/CrossFileCache';
import { TokenCache } from '../TokenCache';

/**
 * Issue #245 — the single argument-type resolver shared by the overload consumers:
 * signature help and go-to-definition directly, and hover / Ctrl+F12 via the
 * #252 choke point (`MethodOverloadResolver.resolveOverloadDeclByArgs`).
 * Find-All-References deliberately does NOT use this class — its call-site
 * classification runs against the synchronous `ScopeTypeIndexService` index
 * (see the #257 assessment: FAR's matching core is sync and per-arg cross-file
 * I/O there would be an #188-class regression).
 *
 * Given call arguments already
 * classified by {@link CallSiteArgumentClassifier} (which types literals / EQUATE / implicit
 * variables from the token stream alone), it fills in the types that need real resolution:
 * dotted member access (`Self.Probs`, `obj.field`), reference variables (`x &Type`), and
 * cross-file / typed variables — recording both the type NAME (to match a user parameter like
 * `*MyQueueType`) and the structure KIND (to match a builtin parameter typed `QUEUE`/`GROUP`/
 * `FILE`).
 *
 * The classifier stays pure/sync; the async resolution (disk-walking INCLUDE/MEMBER files) is
 * confined here, applied as a post-classification enrichment.
 */
export class ArgumentTypeResolver {
    // #257 Phase 3 — MLS gets a CrossFileCache so its INCLUDE/MEMBER-chain walks
    // stop re-reading unchanged files from disk on every argument (mtime-validated).
    private memberLocator = new MemberLocatorService(new CrossFileCache(TokenCache.getInstance()));
    private chainedResolver = new ChainedPropertyResolver();
    private scopeTypeIndex = new ScopeTypeIndexService();

    /**
     * Enrich already-classified args in place: for each `variable` / `dotted_var` argument that
     * has no inferred type yet, resolve its declared type name + structure kind.
     */
    public async enrichArgs(
        args: ArgClassification[],
        tokens: Token[],
        document: TextDocument,
        position: Position
    ): Promise<void> {
        for (const a of args) {
            // 'prefixed_var' (#257 Phase 3): a PRE-prefixed field (`QUE:Fld`) is typed by
            // the scope-tier index's alias keys. FAR always typed these via the classifier
            // ctx it supplies; sighelp/F12 classify WITHOUT a ctx and rely on this
            // enrichment, so excluding the kind here left them conservative match-all.
            if ((a.kind === 'dotted_var' || a.kind === 'variable' || a.kind === 'prefixed_var') && !a.inferredType) {
                const resolved = await this.resolveArgType(a.rawText, tokens, document, position);
                if (resolved) {
                    a.inferredType = resolved.typeName;
                    if (resolved.structureKind) a.structureKind = resolved.structureKind;
                }
            }
        }
    }

    /**
     * Resolve an argument (given as raw text) to its declared type name and, when the type is a
     * structure, its kind. Returns undefined when it can't be resolved (caller keeps the
     * conservative match-all fallback).
     */
    public async resolveArgType(
        segment: string,
        tokens: Token[],
        document: TextDocument,
        position: Position
    ): Promise<{ typeName: string; structureKind?: string } | undefined> {
        const text = segment.trim();
        if (!text) return undefined;

        let typeName: string | undefined;

        const dot = text.lastIndexOf('.');
        if (dot > 0) {
            const beforeDot = text.slice(0, dot).trim();
            const member = text.slice(dot + 1).trim();
            if (!/^\w+$/.test(member)) return undefined;

            // Resolve the class that owns `member`.
            let ownerClass: string | null = null;
            if (beforeDot.toLowerCase() === 'self') {
                ownerClass = this.chainedResolver.resolveCurrentClassName(document, position, tokens);
            } else if (/^&?\w+$/.test(beforeDot)) {
                ownerClass = await this.resolveSimpleVarType(beforeDot, tokens, document, position.line) ?? null;
            } else {
                ownerClass = await this.chainedResolver.resolveFinalClassName(beforeDot, document, position);
            }
            if (!ownerClass) return undefined;

            const memberInfo = await this.memberLocator.findMemberInClass(ownerClass, member, document);
            if (!memberInfo?.type) return undefined;
            // extractClassName strips a leading `&` (reference) / LIKE(...) and returns undefined
            // for Clarion primitives — for a queue/group/file TYPE it yields the TYPE name.
            typeName = ClassMemberResolver.extractClassName(memberInfo.type) ?? undefined;
        } else if (/^&?[\w:]+$/.test(text)) {
            // Simple identifier (the `:` admits PRE-prefixed fields like `QUE:Fld`):
            // typed / reference / PRE:Field / cross-file variable.
            typeName = await this.resolveSimpleVarType(text, tokens, document, position.line);
        }

        if (!typeName) return undefined;
        return { typeName, structureKind: this.resolveTypeStructureKind(typeName, tokens) };
    }

    /**
     * #257 Phase 3 — resolve a simple (non-dotted) variable name to its declared type.
     *
     * Precedence rule (documented on #257): the sync scope-tier index is AUTHORITATIVE
     * for names it can key — it is the only resolver with correct Clarion scope
     * priority (routine-local shadowing > proc params/locals > module scope; the
     * MemberLocatorService walk scans document order, so a module var declared above
     * the procedure wrongly shadowed a later proc-local) and the only one that keys
     * PRE-prefix aliases (`que:fld`). A MISS or a LIKE(...)-shaped hit falls back to
     * MemberLocatorService, which owns the capabilities the index lacks: INCLUDE/
     * MEMBER-chain walks, LIKE dereference, and enclosing-procedure parameter parsing.
     * Reference declarations (`&Type`) are stored deref'd in the index — same shape
     * the MLS path returned (`typeName` sans `&`), so consumers are unaffected.
     */
    private async resolveSimpleVarType(
        name: string,
        tokens: Token[],
        document: TextDocument,
        line: number
    ): Promise<string | undefined> {
        const key = name.replace(/^&/, '').toLowerCase();
        const index = this.scopeTypeIndex.buildFileVarTypeIndex(tokens);
        const indexHit = this.scopeTypeIndex.lookupVarTypeAtLine(index, null, line, key);
        if (indexHit && !/^LIKE\s*\(/i.test(indexHit)) {
            return indexHit;
        }
        const t = await this.memberLocator.resolveVariableType(
            name.replace(/^&/, ''), tokens, document, line);
        return t?.typeName ?? undefined;
    }

    /**
     * The structure KIND (`QUEUE` / `GROUP` / `FILE` / `RECORD` / …) of a declared type, so a
     * structure-instance argument can match a builtin parameter typed by kind (e.g. GET's
     * `QUEUE queue`). Found from the type's column-0 declaration line in the current file.
     * Undefined for class/scalar types or when the declaration isn't local.
     */
    public resolveTypeStructureKind(typeName: string, tokens: Token[]): string | undefined {
        const nameU = typeName.toUpperCase();
        const decl = tokens.find(t =>
            t.start === 0 &&
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.value.toUpperCase() === nameU);
        if (!decl) return undefined;
        const structTok = tokens.find(t => t.line === decl.line && t.type === TokenType.Structure);
        return structTok?.value.toUpperCase();
    }
}
