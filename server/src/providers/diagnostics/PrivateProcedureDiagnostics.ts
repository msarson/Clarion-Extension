import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { TokenCache } from '../../TokenCache';
import { TokenHelper } from '../../utils/TokenHelper';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { ProcedureSignatureUtils } from '../../utils/ProcedureSignatureUtils';
import { moduleTargetMatchesFile } from '../../utils/ClarionSourceNaming';
import { pathToCanonicalUri } from '../../utils/UriUtils';
import * as nodePath from 'path';

/**
 * Every prototype of one name in one MAP, as seen from the file being validated.
 * Overloads share a name, and which one a call binds to is not resolved here.
 */
interface Prototype {
    /** True only when every overload is PRIVATE. */
    isPrivate: boolean;
    /** Each overload's MODULE() target as written, or null when it has no wrapper. */
    moduleTargets: (string | null)[];
    /** True when the MAP holding it is in the file being validated. */
    inCurrentFile: boolean;
}

/** Prototypes of one MAP, and the lines of the file they are visible on (null = all). */
interface MapScope {
    lines: { start: number; end: number } | null;
    prototypes: Map<string, Prototype>;
}

/** Structures whose contents are declarations, never calls. */
const DECLARATION_STRUCTURES = new Set(['MAP', 'MODULE', 'CLASS', 'INTERFACE']);

/**
 * #481 — reports a call to a PRIVATE MAP prototype from outside its own module.
 *
 * Compiler-verified on Clarion 10.0.12567 ("Invalid use of PRIVATE procedure"):
 *  - the owning module is the file named by the prototype's MODULE() wrapper, or the
 *    file holding the MAP when there is no wrapper; a call from any other file is an
 *    error — including the PROGRAM file, when a wrapper names somewhere else
 *  - that holds for EVERY MAP: the PROGRAM's, a MEMBER's own, and a procedure-local
 *    one. Where a MAP sits decides who can see a prototype, not who may call it
 *  - a CALL is an error in statement or expression position, with or without parens
 *  - a procedure REFERENCE is not: START(Proc) and ADDRESS(Proc) both build
 *
 * A call resolves to its innermost visible declaration — the containing procedure's
 * local MAP, then this file's module-level MAP, then the PROGRAM's — and is reported
 * only when that declaration is PRIVATE. The compiler's treatment of a name declared
 * at more than one level is unverified, so an inner non-PRIVATE declaration keeps
 * quiet rather than guessing.
 */
export async function validatePrivateProcedureCalls(
    tokens: Token[],
    document: TextDocument,
    getOpenDocumentContent?: (absPath: string) => string | null
): Promise<Diagnostic[]> {
    const text = document.getText();
    const currentBasename = nodePath.basename(decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, ''))).toLowerCase();
    const firstStatement = text.split('\n').find(l => l.trim() && !l.trim().startsWith('!'))?.trim().toUpperCase() ?? '';

    // Innermost first: procedure-local MAPs (narrowest range first), then module-level.
    const scopes = collectMapScopes(tokens, text.split('\n'), true)
        .sort((a, b) => span(a) - span(b));

    if (!firstStatement.startsWith('PROGRAM')) {
        const programScope = await loadProgramScope(tokens, document, getOpenDocumentContent);
        if (programScope) scopes.push(programScope);
    }
    if (!scopes.some(s => [...s.prototypes.values()].some(p => p.isPrivate))) return [];

    const declarationRanges = tokens
        .filter(t => t.type === TokenType.Structure && DECLARATION_STRUCTURES.has(t.value.toUpperCase()))
        .map(t => ({ start: t.line, end: t.finishesAt ?? t.line }));
    const inDeclaration = (line: number) => declarationRanges.some(r => line >= r.start && line <= r.end);

    const diagnostics: Diagnostic[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== TokenType.Function && t.type !== TokenType.Variable) continue;

        const name = t.value.toUpperCase();
        const proto = scopes.find(s => s.prototypes.has(name) && (!s.lines || (t.line >= s.lines.start && t.line <= s.lines.end)))
            ?.prototypes.get(name);
        if (!proto?.isPrivate || !isCall(tokens, i) || inDeclaration(t.line)) continue;

        // With overloads in different modules the bound one is unknown, so any match counts.
        const ownModule = proto.moduleTargets.some(target => target === null
            ? proto.inCurrentFile
            : moduleTargetMatchesFile(target, currentBasename));
        if (ownModule) continue;

        const owners = [...new Set(proto.moduleTargets.map(target => target ?? 'the PROGRAM file'))];
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: t.line, character: t.start },
                end: { line: t.line, character: t.start + t.value.length }
            },
            message: `Invalid use of PRIVATE procedure '${t.value}': it may only be called from ${owners.length === 1 ? owners[0] : 'its own module'}.`,
            source: 'clarion',
            code: 'private-procedure-call'
        });
    }
    return diagnostics;
}

function span(scope: MapScope): number {
    return scope.lines ? scope.lines.end - scope.lines.start : Number.MAX_SAFE_INTEGER;
}

/** The PROGRAM's module-level MAP, reached through this MEMBER's parent. */
async function loadProgramScope(
    tokens: Token[],
    document: TextDocument,
    getOpenDocumentContent?: (absPath: string) => string | null
): Promise<MapScope | null> {
    const memberToken = TokenHelper.findMemberHeaderToken(tokens);
    if (!memberToken?.referencedFile) return null;

    const cache = TokenCache.getInstance();
    const programPath = await new CrossFileResolver(cache).resolveFile(memberToken.referencedFile, document.uri);
    if (!programPath) return null;
    const loaded = CrossFileResolver.loadExternalFileTokens(cache, pathToCanonicalUri(programPath), programPath, getOpenDocumentContent);
    if (!loaded) return null;

    // A PROGRAM procedure's local MAP is invisible from here, so module level only.
    const merged = new Map<string, Prototype>();
    for (const scope of collectMapScopes(loaded.tokens, loaded.content.split('\n'), false)) {
        if (scope.lines) continue;
        for (const [name, proto] of scope.prototypes) {
            const existing = merged.get(name);
            if (!existing) { merged.set(name, proto); continue; }
            existing.isPrivate = existing.isPrivate && proto.isPrivate;
            existing.moduleTargets.push(...proto.moduleTargets);
        }
    }
    return merged.size > 0 ? { lines: null, prototypes: merged } : null;
}

/**
 * One scope per MAP in a file. A module-level MAP is visible on every line; a
 * procedure-local MAP only inside its procedure.
 */
function collectMapScopes(fileTokens: Token[], fileLines: string[], inCurrentFile: boolean): MapScope[] {
    const scopes = new Map<Token, MapScope>();

    // The wrapper is found by line range, not `t.parent`: the tokenizer parents a
    // keyword-less prototype (`Name(),PRIVATE`) to the MAP, skipping its MODULE().
    const modules = fileTokens.filter(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'MODULE');

    for (const t of fileTokens) {
        if (t.subType !== TokenType.MapProcedure || !t.label || !t.parent) continue;

        const parent = t.parent;
        const map = parent.type === TokenType.Structure && parent.value.toUpperCase() === 'MODULE' ? parent.parent : parent;
        if (!map || map.type !== TokenType.Structure || map.value.toUpperCase() !== 'MAP') continue;
        const wrapper = modules
            .filter(m => m.line > map.line && m.line < t.line && (m.finishesAt ?? m.line) >= t.line)
            .sort((a, b) => b.line - a.line)[0];

        let scope = scopes.get(map);
        if (!scope) {
            const owner = map.parent;
            const isLocal = owner !== undefined &&
                (owner.subType === TokenType.GlobalProcedure || owner.subType === TokenType.MethodImplementation);
            scope = {
                lines: isLocal ? { start: owner!.line, end: owner!.finishesAt ?? Number.MAX_SAFE_INTEGER } : null,
                prototypes: new Map()
            };
            scopes.set(map, scope);
        }

        const isPrivate = ProcedureSignatureUtils.isPrivatePrototype(fileLines, t.line);
        const moduleTarget = wrapper?.referencedFile ?? null;
        const existing = scope.prototypes.get(t.label.toUpperCase());
        if (existing) {
            existing.isPrivate = existing.isPrivate && isPrivate;
            existing.moduleTargets.push(moduleTarget);
        } else {
            scope.prototypes.set(t.label.toUpperCase(), { isPrivate, moduleTargets: [moduleTarget], inCurrentFile });
        }
    }
    return [...scopes.values()];
}

/**
 * True when tokens[i] CALLS the procedure it names rather than referring to it.
 * `Proc(...)` tokenizes as Function in either statement or expression position. A
 * bare `Proc` statement is a Variable alone on its line. A Variable anywhere else —
 * `START(Proc)`, `ADDRESS(Proc)` — is a reference, which the compiler allows.
 */
function isCall(tokens: Token[], i: number): boolean {
    const t = tokens[i];
    if (t.type === TokenType.Function) return true;
    if (t.type !== TokenType.Variable) return false;

    const prev = tokens[i - 1];
    if (prev && prev.line === t.line) return false;
    const next = tokens[i + 1];
    if (!next || next.line !== t.line) return true;
    return next.type === TokenType.EndStatement && (!tokens[i + 2] || tokens[i + 2].line !== t.line);
}
