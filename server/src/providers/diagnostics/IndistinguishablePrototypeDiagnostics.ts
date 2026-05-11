import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { MethodOverloadResolver } from '../../utils/MethodOverloadResolver';
import { TokenHelper } from '../../utils/TokenHelper';
import { serverSettings } from '../../serverSettings';

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
 * Tier-2 (same-family / cross-family scalar pair detection) filed as #123,
 * blocked on this walker shipping. Mark's 2026-05-11 empirical verdict
 * confirms scalar-pair indistinguishability — canonical docs were wrong.
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
 * Gate: `serverSettings.indistinguishablePrototypesEnabled` (default true).
 */

const MESSAGES = {
    rule1: 'Indistinguishable prototype: both declarations are callable with zero arguments.',
    rule2: 'Duplicate prototype: identical parameter shape as a previous declaration.',
    rule3: 'Duplicate prototype: `*` is implicit for complex types.',
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
    if (!serverSettings.indistinguishablePrototypesEnabled) return [];

    const containers = tokens.filter(t =>
        t.type === TokenType.Structure &&
        typeof t.finishesAt === 'number' &&
        CONTAINER_VALUES.has(t.value.toUpperCase())
    );

    if (containers.length === 0) return [];

    const resolver = new MethodOverloadResolver();
    const lines = document.getText().split('\n');
    const diagnostics: Diagnostic[] = [];

    for (const container of containers) {
        const start = container.line;
        const end = container.finishesAt!;

        const memberDecls = tokens.filter(t =>
            t.line > start && t.line < end &&
            TokenHelper.isProcedureOrFunction(t) &&
            t.subType !== undefined && DECL_SUBTYPES.has(t.subType) &&
            !!t.label &&
            isImmediatelyContainedBy(t, container, containers)
        );

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
 * True when `decl`'s nearest enclosing structure-container is `container`.
 * Prevents nested-container leakage (a CLASS inside a MAP shouldn't contribute
 * methods to the MAP's name-group).
 */
function isImmediatelyContainedBy(decl: Token, container: Token, allContainers: Token[]): boolean {
    let nearest: Token | null = null;
    for (const c of allContainers) {
        const end = c.finishesAt;
        if (typeof end !== 'number') continue;
        if (decl.line <= c.line || decl.line >= end) continue;
        if (!nearest || c.line > nearest.line) {
            nearest = c;
        }
    }
    return nearest === container;
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
