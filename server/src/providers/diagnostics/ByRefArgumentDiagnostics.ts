import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../../tokenizer/TokenTypes';
import { CallSiteArgumentClassifier, ArgClassification } from '../../utils/CallSiteArgumentClassifier';
import { ProcedureParameter } from '../../tokenizer/ProcedureParameterParser';

/**
 * Issue #244 — flag passing a non-addressable value (a literal) to a by-reference parameter.
 *
 * A literal has no address, so it cannot bind a by-reference (`*TYPE`) parameter — a genuine
 * Clarion compile error. Complex types (QUEUE / GROUP / FILE / VIEW / RECORD / CLASS) are ALWAYS
 * passed by reference, so the `*` is not required for them; those are treated as by-ref too.
 *
 * Conservative to avoid false positives (runs on every edit):
 *   - only for calls resolving to a SINGLE unambiguous same-file MAP procedure (overloaded or
 *     unknown names are skipped — we can't know which signature/whether a by-value overload fits);
 *   - only flags clear literals (string / numeric / picture);
 *   - a call is a name immediately followed by `(` (so a declaration line `Name PROCEDURE(...)`
 *     is never mistaken for a call).
 */

const COMPLEX_STRUCT_KEYWORDS = new Set(['QUEUE', 'GROUP', 'FILE', 'VIEW', 'RECORD', 'CLASS']);

function isByRefParam(p: ProcedureParameter): boolean {
    if (p.byRef) return true; // explicit `*`
    const base = (p.type || '').toUpperCase().replace(/\(.*$/, '').trim();
    return COMPLEX_STRUCT_KEYWORDS.has(base); // complex types are by-ref even without `*`
}

function isNonAddressableLiteral(a: ArgClassification): boolean {
    return a.kind === 'literal_string' || a.kind === 'literal_numeric' || a.kind === 'literal_picture';
}

export function validateByRefArguments(
    tokens: Token[],
    _document: TextDocument
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // MAP procedures with an UNAMBIGUOUS single signature (skip overloaded names).
    const byName = new Map<string, { params: ProcedureParameter[]; count: number; declLine: number }>();
    for (const t of tokens) {
        if (t.subType === TokenType.MapProcedure && t.label && t.parameters) {
            const key = t.label.toUpperCase();
            const existing = byName.get(key);
            if (existing) existing.count++;
            else byName.set(key, { params: t.parameters, count: 1, declLine: t.line });
        }
    }
    if (byName.size === 0) return diagnostics;

    const classifier = new CallSiteArgumentClassifier();

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!t.value) continue;
        const proc = byName.get(t.value.toUpperCase());
        if (!proc || proc.count !== 1) continue;   // unknown or overloaded → skip
        if (t.line === proc.declLine) continue;     // the declaration itself

        // A call = name immediately followed by `(` (skipping comments). Excludes
        // `Name PROCEDURE(...)` declarations (next token is PROCEDURE, not `(`).
        let j = i + 1;
        while (j < tokens.length && tokens[j].line === t.line && tokens[j].type === TokenType.Comment) j++;
        if (j >= tokens.length || tokens[j].line !== t.line ||
            !(tokens[j].type === TokenType.Delimiter && tokens[j].value === '(')) continue;

        const args = classifier.classifyArguments(tokens, i);
        if (!args) continue;

        for (let k = 0; k < args.length; k++) {
            const param = proc.params[k];
            if (!param) continue; // more args than params (PARAMS/vararg) — skip
            if (isByRefParam(param) && isNonAddressableLiteral(args[k])) {
                const a = args[k];
                const paramLabel = `${param.byRef ? '*' : ''}${param.type}`;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: a.line, character: a.character },
                        end: { line: a.line, character: a.character + Math.max(a.rawText.length, 1) },
                    },
                    message: `Cannot pass a literal to by-reference parameter ${param.name ? `'${param.name}' ` : ''}(${paramLabel}) — a literal has no address; pass a variable.`,
                    source: 'clarion',
                });
            }
        }
    }

    return diagnostics;
}
