import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { DocumentStructure } from '../../DocumentStructure';
import { AttributeService } from '../../utils/AttributeService';
import { isDotSuffix, isDotBase, isNestedInsideAttributeArgs } from '../../utils/AttributeContextGuards';
import { ControlService } from '../../utils/ControlService';
import { findDeclarationKeyword, readDeclaredAttributes, findAttributeProblems } from '../../utils/DeclaredAttributes';
import { conditionalLines, getConditionalBlockRanges } from './StructureDiagnostics';

const attributeService = AttributeService.getInstance();
const controlService = ControlService.getInstance();

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
 * The lines below each WINDOW, APPLICATION and REPORT header, through its END: a `.`
 * closing the structure on a control's line leaves that control inside. An unterminated
 * structure (still being typed) runs to the end of the file. (#760)
 */
function windowOrReportBodies(tokens: Token[]): [number, number][] {
    const bodies: [number, number][] = [];
    for (const t of tokens) {
        if (t.type !== TokenType.Structure) continue;
        const kw = t.value.toUpperCase();
        if (kw === 'WINDOW' || kw === 'APPLICATION' || kw === 'REPORT') {
            bodies.push([t.line, t.finishesAt ?? Number.MAX_SAFE_INTEGER]);
        }
    }
    return bodies;
}

/**
 * Warns when a known attribute is used on a control type that doesn't support it.
 * Only fires for attributes the tokenizer classifies as TokenType.Attribute and
 * that are present in clarion-attributes.json — unknown tokens are silently ignored here.
 * Only validates against unambiguous window controls (see VALIDATABLE_CONTROLS).
 * Then the declaration headers (validateHeaderAttributes) and, everywhere else, a word in
 * attribute position that is not an attribute at all (validateUnknownAttributes, #806).
 */
export function validateAttributeApplicability(tokens: Token[], document: TextDocument, documentStructure?: DocumentStructure): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = document.getText().split(/\r?\n/);

    // #258: production callers (DiagnosticProvider) pass the CACHED structure — this
    // previously re-processed the shared token array on every validation cycle. The
    // build-from-passed-tokens fallback remains for direct callers (tests) whose
    // tokens are authoritative and may not be cache-backed.
    let structure = documentStructure;
    if (!structure) {
        structure = new DocumentStructure(tokens);
        structure.process();
    }

    let bodies: [number, number][] | undefined;

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

        // Dot-suffix / dot-base guards (shared with HoverRouter's identical attribute-
        // vs-variable ambiguity — see AttributeContextGuards.ts): skip Attribute
        // tokens used as either end of a dotted member-access chain, e.g. the `Type`
        // in `SELF.Sectors.Type` (suffix) or the `Filter` in `USE(Filter.Item[1])`
        // (base). In these contexts the token is an identifier/variable reference,
        // not a Clarion attribute application.
        const lineText = lines[token.line] ?? '';
        if (isDotSuffix(lineText, token.start) || isDotBase(lineText, token.start, token.value.length)) {
            continue;
        }

        // Procedure/function parameter guard: skip Attribute tokens inside the
        // signature parameter list, e.g. PROCEDURE(STRING Item, STRING Type).
        // TYPE/ITEM keywords in parameter names are identifiers here, not attributes.
        const upperLine = lineText.toUpperCase();
        const procIdx = upperLine.indexOf('PROCEDURE');
        const funcIdx = upperLine.indexOf('FUNCTION');
        const sigIdx = procIdx >= 0 ? procIdx : funcIdx;
        if (sigIdx >= 0) {
            const openParen = lineText.indexOf('(', sigIdx);
            const closeParen = openParen >= 0 ? lineText.indexOf(')', openParen + 1) : -1;
            if (openParen >= 0 && closeParen > openParen &&
                token.start > openParen && token.start < closeParen) {
                continue;
            }
        }

        const attrName = token.value.toUpperCase();
        const attrDef = attributeService.getAttribute(attrName);
        if (!attrDef) continue; // Not in our JSON — don't guess

        const ctx = structure.getControlContextAt(token.line, token.start);
        if (!ctx.controlType) continue; // No specific control context — can't validate

        const controlType = ctx.controlType.toUpperCase();
        if (!VALIDATABLE_CONTROLS.has(controlType)) continue; // Ambiguous context — skip

        // A control is only declared inside a WINDOW, APPLICATION or REPORT. Elsewhere a
        // control word opening its line is a prototype or method named like one, e.g.
        // `BOX(SIGNED x,...),NAME('Cla$BOX')` in a MAP's MODULE. (#760)
        bodies ??= windowOrReportBodies(tokens);
        const controlLine = ctx.controlToken?.line ?? token.line;
        if (!bodies.some(([start, end]) => controlLine > start && controlLine <= end)) continue;

        // Paren-nesting guard (shared with HoverRouter — see AttributeContextGuards.ts):
        // skip Attribute tokens that sit inside the argument parentheses of a
        // PRECEDING attribute in this same control's declaration — e.g. the `Filter`
        // in `USE(Filter.Item[1])`, or a bare `USE(Filter)` with no dotted suffix at
        // all. Either way, `Filter` here is the VALUE passed to USE(), not a second,
        // standalone attribute application. Subsumes the dot-base guard above for
        // the control-declaration case, but is kept alongside it since the dot-base
        // guard also covers dotted access with no enclosing parens at all.
        if (ctx.controlToken && isNestedInsideAttributeArgs(tokens, i, ctx.controlToken)) {
            continue;
        }

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

    diagnostics.push(...validateHeaderAttributes(tokens, structure));
    // A line inside an OMIT or COMPILE block is not judged: the compiler may skip it (the review of #806).
    const conditional = conditionalLines(getConditionalBlockRanges(tokens, document), document.lineCount);
    diagnostics.push(...validateUnknownAttributes(tokens, structure, bodies ?? windowOrReportBodies(tokens), lines, conditional));
    return diagnostics;
}

/**
 * Attributes the catalogue does not carry, compiled on Clarion 10 (#806): a control's
 * justification (LEFT, RIGHT, DECIMAL), RTF on a TEXT, and COM on an INTERFACE; and EXPORT on
 * a CLASS, which the help does not document (#839, Clarion 10 and 12).
 */
const OTHER_ATTRIBUTE_WORDS = new Set(['LEFT', 'RIGHT', 'DECIMAL', 'RTF', 'COM', 'EXPORT']);

/**
 * The keyword token types a declaration opens with: a structure (CLASS, GROUP, QUEUE...), a data
 * type, a user type (`Q  MyQueueType,THREAD`), a reference (`&MyType`), LIKE, or a control.
 * PROCEDURE and FUNCTION prototypes are not among them: what follows their parameters is a return
 * type as well as attributes (`PROCEDURE(),LONG`).
 */
const DECLARATION_KEYWORD_TYPES = new Set([
    TokenType.Structure, TokenType.Type, TokenType.Variable, TokenType.ReferenceVariable,
    TokenType.TypeReference, TokenType.WindowElement, TokenType.Class, TokenType.Interface,
]);

/**
 * #806: a word in attribute position that is not a Clarion attribute, e.g. IMPLUMENTS on a CLASS.
 * The compiler (Clarion 10) refuses it with "Unknown attribute: IMPLUMENTS". The attributes are
 * read the way the declaration cards read them (readDeclaredAttributes: after the first comma at
 * paren depth 0, `|` continuations joined), on a labelled declaration in a data section and on a
 * control in a WINDOW, APPLICATION or REPORT. Declarations the header check already judges
 * (WINDOW, FILE, KEY... with an `attributes` list) are left to it; MAP and MODULE prototypes,
 * whose list carries a return type, are not read.
 */
function validateUnknownAttributes(tokens: Token[], structure: DocumentStructure, bodies: [number, number][], lines: string[], conditional: Uint8Array): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const seenLines = new Set<number>();
    let inCode = false;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        // CODE opens a code section, DATA a routine's data; a procedure starts with its data and a
        // routine is code unless it opens with DATA
        if (token.type === TokenType.ExecutionMarker) { inCode = !/^DATA$/i.test(token.value); continue; }
        if (token.type !== TokenType.Label && token.type !== TokenType.Variable) {
            if (/^(PROCEDURE|FUNCTION)$/i.test(token.value)) { inCode = false; continue; }
            if (/^ROUTINE$/i.test(token.value)) { inCode = true; continue; }
        }
        if (inCode) continue;

        const isLabel = token.type === TokenType.Label;
        const inBody = bodies.some(([start, end]) => token.line > start && token.line <= end);
        if (!isLabel && !(inBody && (token.type === TokenType.WindowElement || token.type === TokenType.Structure))) continue;

        const logical = structure.getLogicalLine(token.line);
        if (!logical || logical.tokens[0] !== token || seenLines.has(logical.startLine)) continue;
        if (conditional[logical.startLine]) continue;
        // A procedure or method definition (`MyClass.Fn PROCEDURE(LONG x),LONG`) declares nothing
        // here; what follows its parameters is its prototype, not attributes.
        if (logical.tokens.some(t => /^(PROCEDURE|FUNCTION)$/i.test(t.value))) continue;
        const keyword = isLabel ? logical.tokens[1] : token;
        if (!keyword || !DECLARATION_KEYWORD_TYPES.has(keyword.type)) continue;
        seenLines.add(logical.startLine);
        if (structure.isInMapBlock(token.line) || structure.isInModuleBlock(token.line)) continue;
        if (controlService.getDeclarationStructure(/^\w+/.exec(keyword.value)?.[0] ?? keyword.value)?.attributes) continue;

        for (const attribute of readDeclaredAttributes(logical, keyword)) {
            const name = attribute.name;
            if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) continue; // a value, a string, a picture...
            if (attributeService.isAttribute(name) || OTHER_ATTRIBUTE_WORDS.has(name)) continue;
            const at = attribute.token;
            // a template marker in a window definition, e.g. `#ORIG(?Cancel)`
            if (lines[at.line]?.[at.start - 1] === '#') continue;
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: at.line, character: at.start },
                    end: { line: at.line, character: at.start + at.value.length },
                },
                message: `Unknown attribute: ${name}`,
                source: 'clarion',
                code: 'unknown-attribute',
            });
        }
    }
    return diagnostics;
}

/**
 * WINDOW/APPLICATION header lines have no control context, so the loop above never
 * checks them. Check them against the structure's `attributes` list instead (a
 * structure without one is not checked): the Clarion 11.1 compiler rejects
 * `MyWindow WINDOW('T'),HIDE` with "unknown attribute HIDE". FILE, KEY, INDEX, MEMO and
 * BLOB declarations are checked the same way (#746), including ENCRYPT without OWNER.
 */
function validateHeaderAttributes(tokens: Token[], structure: DocumentStructure): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const token of tokens) {
        const def = controlService.getDeclarationStructure(/^\w+/.exec(token.value)?.[0] ?? token.value);
        if (!def?.attributes) continue;
        const logical = structure.getLogicalLine(token.line);
        if (!logical || !findDeclarationKeyword(logical, token.line, token.start)) continue;
        for (const problem of findAttributeProblems(def, readDeclaredAttributes(logical, token))) {
            const at = problem.attribute.token;
            diagnostics.push({
                severity: problem.alternative ? DiagnosticSeverity.Hint : DiagnosticSeverity.Warning, // #738
                range: {
                    start: { line: at.line, character: at.start },
                    end: { line: at.line, character: at.start + at.value.length },
                },
                message: problem.message,
                source: 'clarion',
                code: problem.alternative ? 'alternative-attributes' : 'invalid-attribute-context',
            });
        }
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
