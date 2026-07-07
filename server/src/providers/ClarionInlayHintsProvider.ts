import { InlayHint, InlayHintKind, Range } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { CallSiteArgumentClassifier } from '../utils/CallSiteArgumentClassifier';
import { ProcedureParameter } from '../tokenizer/ProcedureParameterParser';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';
import { serverSettings } from '../serverSettings';

/**
 * ⚠️ DORMANT (2026-07-07): inlay hints are DISABLED — they added too much visual noise for
 * Clarion. This provider is fully intact but never invoked because the server no longer
 * advertises the `inlayHintProvider` capability (see server.ts). Kept for easy re-enable.
 *
 * Inlay hints for Clarion:
 *   - Implicit-variable TYPE hints — `Counter#` → `: LONG`, `Pct$` → `: REAL`, `Name"` → `: STRING`.
 *     Shown once per distinct implicit name within the requested range.
 *   - Parameter-NAME hints at call sites — `Save(⟨pName:⟩ 'report', ⟨pFlags:⟩ 3)`, for:
 *       • a single unambiguous same-file MAP procedure, and
 *       • a built-in function whose overload set is disambiguated by argument count
 *         (e.g. one signature has that arity) — otherwise skipped to avoid wrong names.
 *
 * Each hint type is independently toggleable via `clarion.inlayHints.*` (and all inlay hints
 * respect VS Code's own `editor.inlayHints.enabled`).
 */
export class ClarionInlayHintsProvider {
    private classifier = new CallSiteArgumentClassifier();
    private builtinService = BuiltinFunctionService.getInstance();

    private implicitType(name: string): string | undefined {
        switch (name.charAt(name.length - 1)) {
            case '#': return 'LONG';
            case '$': return 'REAL';
            case '"': return 'STRING';
            default:  return undefined;
        }
    }

    /** Extract a parameter's display name from a builtin signature parameter label
     *  (e.g. 'FILE file' → 'file', '<UNSIGNED length>' → 'length', '*? functionLabel' → 'functionLabel'). */
    private paramNameFromBuiltinLabel(label: string | [number, number]): string {
        const s = typeof label === 'string' ? label : '';
        const cleaned = s.replace(/[<>\[\]*&?]/g, ' ').trim();
        const parts = cleaned.split(/\s+/).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : '';
    }

    /** Resolve the parameter NAMES for a call to `name` with `argCount` arguments, or undefined
     *  when it can't be resolved unambiguously (caller emits no hints then). */
    private resolveParamNames(
        name: string,
        argCount: number,
        mapProcs: Map<string, { params: ProcedureParameter[]; count: number }>
    ): string[] | undefined {
        // 1. Same-file MAP procedure with a single signature.
        const proc = mapProcs.get(name.toUpperCase());
        if (proc && proc.count === 1) {
            return proc.params.map(p => p.name).filter((n): n is string => !!n);
        }

        // 2. Built-in function — pick a signature by arity (only if it's unambiguous).
        if (this.builtinService.isBuiltin(name)) {
            const sigs = this.builtinService.getSignatures(name).filter(s => (s.parameters?.length ?? 0) > 0);
            const candidates = sigs.length === 1
                ? sigs
                : sigs.filter(s => (s.parameters?.length ?? 0) === argCount);
            if (candidates.length === 1) {
                return (candidates[0].parameters ?? []).map(p => this.paramNameFromBuiltinLabel(p.label));
            }
        }
        return undefined;
    }

    public provideInlayHints(_document: TextDocument, range: Range, tokens: Token[]): InlayHint[] {
        const hints: InlayHint[] = [];
        const inRange = (line: number) => line >= range.start.line && line <= range.end.line;

        // ── Implicit-variable type hints (once per name within the range) ──
        if (serverSettings.inlayHintsImplicitTypes) {
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
                });
            }
        }

        // ── Parameter-name hints ──
        if (serverSettings.inlayHintsParameterNames) {
            const mapProcs = new Map<string, { params: ProcedureParameter[]; count: number; declLine: number }>();
            for (const t of tokens) {
                if (t.subType === TokenType.MapProcedure && t.label && t.parameters) {
                    const key = t.label.toUpperCase();
                    const existing = mapProcs.get(key);
                    if (existing) existing.count++;
                    else mapProcs.set(key, { params: t.parameters, count: 1, declLine: t.line });
                }
            }

            for (let i = 0; i < tokens.length; i++) {
                const t = tokens[i];
                if (!t.value || !inRange(t.line)) continue;
                // Skip a MAP declaration line (it's the signature, not a call).
                const declEntry = mapProcs.get(t.value.toUpperCase());
                if (declEntry && t.line === declEntry.declLine) continue;

                // A call = name immediately followed by `(`.
                let j = i + 1;
                while (j < tokens.length && tokens[j].line === t.line && tokens[j].type === TokenType.Comment) j++;
                if (j >= tokens.length || tokens[j].line !== t.line ||
                    !(tokens[j].type === TokenType.Delimiter && tokens[j].value === '(')) continue;

                const args = this.classifier.classifyArguments(tokens, i);
                if (!args || args.length === 0) continue;

                const paramNames = this.resolveParamNames(t.value, args.length, mapProcs);
                if (!paramNames) continue;

                for (let k = 0; k < args.length; k++) {
                    const pName = paramNames[k];
                    const a = args[k];
                    if (!pName) continue;
                    if (a.rawText.toLowerCase() === pName.toLowerCase()) continue; // redundant
                    hints.push({
                        position: { line: a.line, character: a.character },
                        label: `${pName}:`,
                        kind: InlayHintKind.Parameter,
                        paddingRight: true,
                    });
                }
            }
        }

        return hints;
    }
}
