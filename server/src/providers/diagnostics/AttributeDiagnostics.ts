import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { DocumentStructure } from '../../DocumentStructure';
import { AttributeService } from '../../utils/AttributeService';

const attributeService = AttributeService.getInstance();

/**
 * Controls that are unambiguously window/report elements (TokenType.WindowElement).
 * These are safe to validate attributes against.
 *
 * Intentionally excludes GROUP, QUEUE, SHEET, TAB, MENU, MENUBAR, TOOLBAR, OLE,
 * OPTION — these are also used as data structures or layout containers and their
 * dual role makes attribute validation unreliable (e.g. OVER/PRE/TYPE are valid on
 * GROUP-as-data-structure but not on GROUP-as-window-control, and we can't tell
 * which role is in play from token context alone).
 */
const VALIDATABLE_CONTROLS = new Set([
    'BUTTON', 'ENTRY', 'TEXT', 'LIST', 'COMBO', 'CHECK', 'RADIO',
    'IMAGE', 'LINE', 'BOX', 'ELLIPSE', 'PANEL', 'PROGRESS',
    'REGION', 'PROMPT', 'SPIN', 'ITEM',
]);

/**
 * Warns when a known attribute is used on a control type that doesn't support it.
 * Only fires for attributes the tokenizer classifies as TokenType.Attribute and
 * that are present in clarion-attributes.json — unknown tokens are silently ignored.
 * Only validates against unambiguous window controls (see VALIDATABLE_CONTROLS).
 */
export function validateAttributeApplicability(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Build DocumentStructure so we can call getControlContextAt per token
    const structure = new DocumentStructure(tokens);
    structure.process();

    // Index-based loop (not `for ... of`) so the #175 compound-label-suffix guard
    // can look at neighboring tokens in O(1) per check rather than O(N) per
    // `tokens.indexOf(token)`. Keeps the overall loop O(N).
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== TokenType.Attribute) continue;

        // #175 compound-label-suffix guard: skip Attribute tokens that are actually
        // the suffix part of a compound USE-label like `RCFilter_SL_Clients:External`
        // or `?Prefix:External`. The Variable pattern doesn't include `:` in its
        // character class because `:typename` is the type-annotation separator (see
        // the sibling `TypeAnnotation` pattern), so the tokenizer correctly preserves
        // that grammatical distinction. When the suffix happens to match an attribute
        // keyword (EXTERNAL/HIDE/TRN/etc.), it greedy-matches the Attribute pattern
        // and surfaces here as a false positive against the enclosing control's
        // attribute-applicability rules.
        //
        // The `?`-prefixed compound case (#174) is handled at the tokenizer level by
        // the FieldEquateLabel pattern (which includes `:` per the substrate-symmetry
        // restoration with the `Label` pattern). This guard includes `FieldEquateLabel`
        // in the prev-prev check as belt-and-suspenders: if a `?`-prefixed compound
        // somehow slips through the tokenizer fix (e.g. a token-stream produced before
        // the fix landed), the guard still suppresses the false positive.
        //
        // Tokenizer-side fix considered + deferred to #176 follow-up — Variable
        // pattern has 128 references across 30 files (vs FieldEquateLabel's 4 files),
        // making the cascade audit non-trivial. Substrate-asymmetry framing (load-
        // bearing for #174) does NOT transfer: Variable's `:`-naivete is grammatically
        // intentional, not anomalous. See #175 commit body for full Phase A analysis.
        if (i >= 2 &&
            tokens[i - 1].value === ':' &&
            tokens[i - 1].line === token.line &&
            tokens[i - 2].line === token.line &&
            (tokens[i - 2].type === TokenType.Variable ||
             tokens[i - 2].type === TokenType.FieldEquateLabel)) {
            continue;
        }

        // #177 forward-direction symmetric guard — Attribute as PREFIX of compound
        // EQUATE name (e.g. `CREATE:Radio`, `CREATE:Check`, `CREATE:Region`,
        // `ICON:Custom`). These are Clarion built-in EQUATE constants representing
        // control-type numeric literals (or user-defined EQUATEs); they are NOT
        // attribute applications. The tokenizer splits them as
        // `Attribute(CREATE) + Delimiter(:) + (WindowElement|Variable|FieldEquateLabel)`
        // because CREATE is in the attribute keyword list and the suffix matches one
        // of those identifier-token categories.
        //
        // The Constant pattern in the same `TokenPatterns` file already enumerates
        // some common Attribute-prefix EQUATE constants inline (e.g. `LEVEL:BENIGN`,
        // `ICON:Asterisk`, `BUTTON:YES/NO/OK/CANCEL`), but this enumeration is
        // incomplete: user-defined EQUATEs and other built-in families (notably
        // `CREATE:Radio` and the rest) don't appear. Continually expanding the
        // Constant enumeration is structurally fragile; the diagnostic-side guard
        // is more future-proof and handles all keyword-symmetric cases by construction.
        //
        // WindowElement cascade audit yielded a small consumer count — well below the
        // architectural-surprise threshold from #175 — see the analogous #176 body
        // for the cascade-audit framework. Tokenizer-side fix is feasible at this
        // scale, but the diagnostic-side guard symmetric to #175's backward-direction
        // check is mechanically simpler.
        if (i + 2 < tokens.length &&
            tokens[i + 1].value === ':' &&
            tokens[i + 1].line === token.line &&
            tokens[i + 2].line === token.line &&
            (tokens[i + 2].type === TokenType.Variable ||
             tokens[i + 2].type === TokenType.FieldEquateLabel ||
             tokens[i + 2].type === TokenType.WindowElement)) {
            continue;
        }

        const attrName = token.value.toUpperCase();
        const attrDef = attributeService.getAttribute(attrName);
        if (!attrDef) continue; // Not in our JSON — don't guess

        const ctx = structure.getControlContextAt(token.line, token.start);
        if (!ctx.controlType) continue; // No specific control context — can't validate

        const controlType = ctx.controlType.toUpperCase();
        if (!VALIDATABLE_CONTROLS.has(controlType)) continue; // Ambiguous context — skip

        const isValid = isAttributeValidForControl(attrName, controlType, attrDef.applicableTo);
        if (isValid) continue;

        const validFor = attrDef.applicableTo.join(', ') || 'specific contexts';
        const range: Range = {
            start: { line: token.line, character: token.start },
            end: { line: token.line, character: token.start + token.value.length },
        };

        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range,
            message: `'${token.value}' is not applicable to ${ctx.controlType} (valid for: ${validFor})`,
            source: 'clarion',
            code: 'invalid-attribute-context',
        });
    }

    return diagnostics;
}

/**
 * Returns true if the attribute is valid for the given control type.
 * Uses applicableTo from clarion-attributes.json as the sole source of truth:
 *   - 'CONTROL' in applicableTo means valid on any window/report control
 *   - Otherwise the controlType must appear explicitly in applicableTo
 *
 * commonAttributes from clarion-controls.json is intentionally NOT used here —
 * that list describes typical window-layout usage and is not an exhaustive
 * allowlist. For example, GROUP has commonAttributes for its window role but
 * PRE/TYPE are also valid on GROUP when used as a data structure.
 */
function isAttributeValidForControl(attrName: string, controlType: string, applicableTo: string[]): boolean {
    if (applicableTo.includes('CONTROL')) return true;
    return applicableTo.some(ctx => ctx.toUpperCase() === controlType);
}
