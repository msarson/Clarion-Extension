import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { MethodOverloadResolver } from '../../utils/MethodOverloadResolver';
import { TokenHelper } from '../../utils/TokenHelper';
import { isDiagnosticEnabled } from '../../serverSettings';

/**
 * Issue #121 — diagnostic for indistinguishable procedure prototypes that the
 * Clarion compiler treats as illegal duplicates (canonical docs
 * `rules_for_procedure_overloading.htm`).
 *
 * Tier-1 rules (Phase A.2b locked scope per Bob 2026-05-11):
 *   1. Zero-arity overlap — both decls callable with no args.
 *   2. Structural identity — same param shape (documentary labels ignored).
 *   3. `*COMPLEX` ≡ `COMPLEX` — `*` is implicit for complex types (project rule 6).
 *
 * Tier-2 rule (#123 Phase B' — Mark's 2026-05-11 empirical verdict):
 *   4. Scalar-pair indistinguishability — same arity AND every position pair
 *      is scalar (string or numeric family) on both sides. Covers same-family
 *      (LONG + SHORT) AND cross-family (LONG + STRING) since Clarion's
 *      bidirectional implicit conversion makes scalar literals interchangeable.
 *      Fires AFTER rules 1/2/3 so more-specific cases (complex-type `*`
 *      redundancy, structural identity) get the more-specific message.
 *
 * Scope traversal: CLASS / INTERFACE / MAP (module-level + procedure-local).
 * Decls are grouped per scope container; cross-scope same-name pairs are NOT
 * flagged (legal — different scopes don't collide).
 *
 * Token-walk implementation rather than `DocumentStructure.getClasses()` etc.
 * Reason: tokenizer already ran DocumentStructure.process() once; calling
 * process() a second time would double-push `.children` (children .push is
 * non-idempotent per `project_documentstructure_idempotency.md`). Tokens
 * already have `.subType` + `.finishesAt` populated from the tokenizer pass.
 *
 * Gate: `isDiagnosticEnabled('indistinguishablePrototypes')` (default true; #542).
 */

const MESSAGES = {
    rule1: 'Indistinguishable prototype: both declarations are callable with zero arguments.',
    rule2: 'Duplicate prototype: identical parameter shape as a previous declaration.',
    rule3: 'Duplicate prototype: `*` is implicit for complex types.',
    rule4: 'Indistinguishable prototype: scalar value-parameters are interchangeable in Clarion (cross-family conversion).',
};

const CONTAINER_VALUES = new Set(['CLASS', 'INTERFACE', 'MAP']);

const DECL_SUBTYPES = new Set<number>([
    TokenType.MethodDeclaration,
    TokenType.InterfaceMethod,
    TokenType.MapProcedure,
]);

export function validateIndistinguishablePrototypes(
    tokens: Token[],
    document: TextDocument
): Diagnostic[] {
    if (!isDiagnosticEnabled('indistinguishablePrototypes')) return [];

    const containers = tokens.filter(t =>
        t.type === TokenType.Structure &&
        typeof t.finishesAt === 'number' &&
        CONTAINER_VALUES.has(t.value.toUpperCase())
    );

    if (containers.length === 0) return [];

    const resolver = new MethodOverloadResolver();
    const lines = document.getText().split('\n');
    const diagnostics: Diagnostic[] = [];

    for (const [container, memberDecls] of declsByContainer(tokens, containers)) {
        const byName = new Map<string, Token[]>();
        for (const decl of memberDecls) {
            const key = decl.label!.toLowerCase();
            const list = byName.get(key) ?? [];
            list.push(decl);
            byName.set(key, list);
        }

        for (const decls of byName.values()) {
            if (decls.length < 2) continue;

            // Pair-wise comparison — diagnostic fires on the later decl (the one to remove).
            for (let j = 1; j < decls.length; j++) {
                for (let i = 0; i < j; i++) {
                    const sigA = lines[decls[i].line] ?? '';
                    const sigB = lines[decls[j].line] ?? '';

                    let message: string | null = null;
                    if (resolver.areZeroArityCompatible(sigA, sigB)) {
                        message = MESSAGES.rule1;
                    } else if (resolver.arePrototypesIdentical(sigA, sigB)) {
                        message = resolver.isComplexRefDuplicate(sigA, sigB)
                            ? MESSAGES.rule3
                            : MESSAGES.rule2;
                    } else if (resolver.areScalarPair(sigA, sigB)) {
                        message = MESSAGES.rule4;
                    }

                    if (message) {
                        diagnostics.push(makeDiagnostic(decls[j], message));
                        break;
                    }
                }
            }
        }
    }

    return diagnostics;
}

/**
 * Each container's member declarations: those whose nearest enclosing container
 * (the latest-starting one whose lines strictly enclose the declaration's) it is,
 * so a CLASS inside a MAP doesn't contribute methods to the MAP's name-group.
 *
 * #715 — one sweep in line order with a stack of open containers. It filtered
 * every token once per container, which on a generated module (a local CLASS in
 * every procedure) took over a second after every edit.
 */
function declsByContainer(tokens: Token[], containers: Token[]): Map<Token, Token[]> {
    const result = new Map<Token, Token[]>(containers.map(c => [c, []]));
    const byStart = [...containers].sort((a, b) => a.line - b.line);
    const open: Token[] = [];
    let next = 0;
    for (const t of tokens) {
        if (!(TokenHelper.isProcedureOrFunction(t) &&
            t.subType !== undefined && DECL_SUBTYPES.has(t.subType) && !!t.label)) continue;
        while (next < byStart.length && byStart[next].line < t.line) open.push(byStart[next++]);
        // Containers that end at or before this line no longer enclose it. One left
        // under a still-open later container never wins: the later one starts later.
        while (open.length > 0 && open[open.length - 1].finishesAt! <= t.line) open.pop();
        if (open.length > 0) result.get(open[open.length - 1])!.push(t);
    }
    return result;
}

function makeDiagnostic(decl: Token, message: string): Diagnostic {
    const range: Range = {
        start: { line: decl.line, character: 0 },
        end: { line: decl.line, character: Number.MAX_SAFE_INTEGER },
    };
    return {
        severity: DiagnosticSeverity.Warning,
        source: 'clarion',
        message,
        range,
    };
}
