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

    for (const token of tokens) {
        if (token.type !== TokenType.Attribute) continue;

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
