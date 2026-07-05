import { InlayHint, InlayHintKind, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { CallSiteArgumentClassifier } from '../utils/CallSiteArgumentClassifier';
import { ProcedureParameter } from '../tokenizer/ProcedureParameterParser';

/**
 * Inlay hints for Clarion:
 *   - Implicit-variable TYPE hints — `Counter#` → `: LONG`, `Pct$` → `: REAL`, `Name"` → `: STRING`.
 *     The type is implied by the suffix, so this surfaces something otherwise invisible. Shown once
 *     per distinct implicit name within the requested range to avoid noise.
 *   - Parameter-NAME hints at call sites — `Save(⟨pName:⟩ 'report', ⟨pFlags:⟩ 3)`. Conservative:
 *     only for calls to a single unambiguous same-file MAP procedure (overloaded/unknown names
 *     skipped), reusing `Token.parameters` and the call-site argument classifier.
 */
export class ClarionInlayHintsProvider {
    private classifier = new CallSiteArgumentClassifier();

    private implicitType(name: string): string | undefined {
        switch (name.charAt(name.length - 1)) {
            case '#': return 'LONG';
            case '$': return 'REAL';
            case '"': return 'STRING';
            default:  return undefined;
        }
    }

    public provideInlayHints(_document: TextDocument, range: Range, tokens: Token[]): InlayHint[] {
        const hints: InlayHint[] = [];
        const inRange = (line: number) => line >= range.start.line && line <= range.end.line;

        // ── Implicit-variable type hints (once per name within the range) ──
        const seenImplicit = new Set<string>();
        for (const t of tokens) {
            if (t.type !== TokenType.ImplicitVariable || !inRange(t.line)) continue;
            const key = t.value.toUpperCase();
            if (seenImplicit.has(key)) continue;
            seenImplicit.add(key);
            const type = this.implicitType(t.value);
            if (!type) continue;
            hints.push({
                position: { line: t.line, character: t.start + t.value.length },
                label: `: ${type}`,
                kind: InlayHintKind.Type,
                paddingLeft: false,
            });
        }

        // ── Parameter-name hints for single-signature same-file MAP procedures ──
        const byName = new Map<string, { params: ProcedureParameter[]; count: number; declLine: number }>();
        for (const t of tokens) {
            if (t.subType === TokenType.MapProcedure && t.label && t.parameters) {
                const key = t.label.toUpperCase();
                const existing = byName.get(key);
                if (existing) existing.count++;
                else byName.set(key, { params: t.parameters, count: 1, declLine: t.line });
            }
        }
        if (byName.size > 0) {
            for (let i = 0; i < tokens.length; i++) {
                const t = tokens[i];
                if (!t.value || !inRange(t.line)) continue;
                const proc = byName.get(t.value.toUpperCase());
                if (!proc || proc.count !== 1 || t.line === proc.declLine) continue;

                // A call = name immediately followed by `(`.
                let j = i + 1;
                while (j < tokens.length && tokens[j].line === t.line && tokens[j].type === TokenType.Comment) j++;
                if (j >= tokens.length || tokens[j].line !== t.line ||
                    !(tokens[j].type === TokenType.Delimiter && tokens[j].value === '(')) continue;

                const args = this.classifier.classifyArguments(tokens, i);
                if (!args) continue;
                for (let k = 0; k < args.length; k++) {
                    const param = proc.params[k];
                    const a = args[k];
                    if (!param || !param.name) continue;
                    // Skip when the argument already reads as the parameter name (redundant).
                    if (a.rawText.toLowerCase() === param.name.toLowerCase()) continue;
                    hints.push({
                        position: { line: a.line, character: a.character },
                        label: `${param.name}:`,
                        kind: InlayHintKind.Parameter,
                        paddingRight: true,
                    });
                }
            }
        }

        return hints;
    }
}
