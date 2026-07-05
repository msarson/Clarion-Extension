import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { ArgClassification } from './CallSiteArgumentClassifier';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { ChainedPropertyResolver } from './ChainedPropertyResolver';
import { ClassMemberResolver } from './ClassMemberResolver';

/**
 * Issue #245 — the single argument-type resolver shared by every overload consumer
 * (signature help, go-to-definition, Find-All-References). Given call arguments already
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
    private memberLocator = new MemberLocatorService();
    private chainedResolver = new ChainedPropertyResolver();

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
            if ((a.kind === 'dotted_var' || a.kind === 'variable') && !a.inferredType) {
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
                const t = await this.memberLocator.resolveVariableType(
                    beforeDot.replace(/^&/, ''), tokens, document, position.line);
                ownerClass = t?.typeName ?? null;
            } else {
                ownerClass = await this.chainedResolver.resolveFinalClassName(beforeDot, document, position);
            }
            if (!ownerClass) return undefined;

            const memberInfo = await this.memberLocator.findMemberInClass(ownerClass, member, document);
            if (!memberInfo?.type) return undefined;
            // extractClassName strips a leading `&` (reference) / LIKE(...) and returns undefined
            // for Clarion primitives — for a queue/group/file TYPE it yields the TYPE name.
            typeName = ClassMemberResolver.extractClassName(memberInfo.type) ?? undefined;
        } else if (/^&?\w+$/.test(text)) {
            // Simple identifier: typed / reference / cross-file variable (resolver dereferences `&`).
            const t = await this.memberLocator.resolveVariableType(
                text.replace(/^&/, ''), tokens, document, position.line);
            typeName = t?.typeName ?? undefined;
        }

        if (!typeName) return undefined;
        return { typeName, structureKind: this.resolveTypeStructureKind(typeName, tokens) };
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
