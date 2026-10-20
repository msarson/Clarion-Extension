import { Token, TokenType } from '../ClarionTokenizer';
import { LogicalLine } from '../DocumentStructure';
import { ControlDefinition, ControlService } from './ControlService';
import { AttributeService } from './AttributeService';

/** One attribute on a declaration, e.g. `HVSCROLL` or `AT(10,10,100,50)`. */
export interface DeclaredAttribute {
    /** Upper-cased attribute name. */
    name: string;
    /** The attribute's name token. */
    token: Token;
}

/**
 * The declaration keyword token (WINDOW, APPLICATION…) at a position, if it opens its
 * logical line after its label. The same word anywhere else (an argument, a later
 * attribute, `Window{PROP:Alrt,255}` in code) is not a declaration.
 */
export function findDeclarationKeyword(logical: LogicalLine, line: number, character: number): Token | null {
    const keyword = findControlKeyword(logical, line, character);
    // The structure needs a label: an unlabelled `Window` opening a line is code.
    return keyword && logical.tokens.indexOf(keyword) >= 1 ? keyword : null;
}

/**
 * The control keyword token (TEXT, BUTTON…) at a position, if it opens its logical line,
 * optionally after a label: a control inside a WINDOW usually has none (`TEXT,AT(...)`).
 * The control card's check; a WINDOW header goes through findDeclarationKeyword.
 */
export function findControlKeyword(logical: LogicalLine, line: number, character: number): Token | null {
    const index = logical.tokens.findIndex(t => t.line === line && t.start === character);
    // A label is never the keyword, even when it is spelled like one (`Window WINDOW(...)`).
    if (index < 0 || logical.tokens[index].type === TokenType.Label) return null;
    for (let i = 0; i < index; i++) {
        if (logical.tokens[i].type !== TokenType.Label) return null;
    }
    return logical.tokens[index];
}

/**
 * The attributes a declaration carries, read from its logical line (`|` continuations
 * joined, comments dropped). The keyword's own parameter list (`WINDOW('Title')`,
 * `BUTTON('Go')`) is skipped: attributes start after the first comma at paren depth 0.
 */
export function readDeclaredAttributes(logical: LogicalLine, keyword: Token): DeclaredAttribute[] {
    const tokens = logical.tokens;
    const start = tokens.indexOf(keyword);
    if (start < 0) return [];

    const result: DeclaredAttribute[] = [];
    let depth = 0;
    let expectName = false;
    for (let i = start + 1; i < tokens.length; i++) {
        const token = tokens[i];
        const value = token.value;
        if (depth === 0 && value === ',') {
            expectName = true;
            continue;
        }
        if (expectName) {
            result.push({ name: value.toUpperCase(), token });
            expectName = false;
        }
        if (value === '(') depth++;
        else if (value === ')' && depth > 0) depth--;
    }
    return result;
}

/**
 * The definition whose `attributes` a control declaration is checked against (#736, #737).
 * Inside a REPORT the report definition decides: a report's TEXT accepts a different set
 * (RESIZE, not the scroll bars), and a STRING with a picture (`STRING(@n9)`) takes the totals
 * a constant one does not (SUM, PAGENO...). Undefined outside a WINDOW, APPLICATION or
 * REPORT, where STRING and GROUP are data types, and for a control without a list.
 */
export function controlDefinitionFor(
    logical: LogicalLine,
    keyword: Token,
    context: { inWindow: boolean; inReport: boolean } | undefined
): ControlDefinition | undefined {
    if (!context || (!context.inWindow && !context.inReport)) return undefined;
    const controls = ControlService.getInstance();
    const word = /^\w+/.exec(keyword.value)?.[0] ?? keyword.value;
    const def = (context.inReport ? controls.getReportControl(word) : undefined) ?? controls.getControl(word);
    if (!def?.attributes) return undefined;
    const at = logical.tokens.indexOf(keyword);
    // The tokenizer reads `STRING(@n9)` as one token; `STRING (@n9)` would be three.
    const isPicture = /^\w+\(\s*@/.test(keyword.value)
        || (logical.tokens[at + 1]?.value === '(' && logical.tokens[at + 2]?.value.startsWith('@'));
    return isPicture && def.pictureAttributes ? { ...def, attributes: def.pictureAttributes } : def;
}

/** `X()` in a definition's `attributes` list takes a value; a bare `X` is a flag. */
export function parseAccepted(def: ControlDefinition): { name: string; flag: boolean }[] {
    return (def.attributes ?? []).map(a => {
        const flag = !a.endsWith('()');
        return { name: (flag ? a : a.slice(0, -2)).toUpperCase(), flag };
    });
}

/** Problems with a declaration's attributes: not accepted here, unknown, or mutually exclusive. */
export function findAttributeProblems(def: ControlDefinition, declared: DeclaredAttribute[]): { attribute: DeclaredAttribute; message: string }[] {
    const accepted = new Set(parseAccepted(def).map(a => a.name));
    const problems: { attribute: DeclaredAttribute; message: string }[] = [];
    for (const attribute of declared) {
        if (accepted.has(attribute.name)) continue;
        const known = AttributeService.getInstance().isAttribute(attribute.name);
        problems.push({
            attribute,
            message: known
                ? `${attribute.name} is not valid on ${def.name}`
                : `${attribute.name} is not a known attribute`
        });
    }
    for (const group of def.exclusive ?? []) {
        const present = declared.filter(d => group.includes(d.name));
        if (present.length > 1) {
            problems.push({
                attribute: present[1],
                message: `${present.map(p => p.name).join(' and ')} are mutually exclusive`
            });
        }
    }
    return problems;
}

/** Longest Available line, in characters, before it wraps (keeps the card narrow). */
const AVAILABLE_LINE_WIDTH = 75;

/**
 * The card section for a declaration, compact and most important first:
 *   ⚠ problems (attributes not valid here grouped on one line),
 *   **Attributes:** the valid attributes the declaration carries, by name only — their
 *     values are in the code right above the card,
 *   **Available:** the flags the control accepts that are not set, alphabetical, wrapped.
 * Empty when the definition carries no `attributes` list — the card then keeps its
 * generic "Common Attributes".
 */
export function formatDeclaredAttributes(def: ControlDefinition, declared: DeclaredAttribute[]): string {
    if (!def.attributes || def.attributes.length === 0) return '';

    const accepted = parseAccepted(def);
    const acceptedNames = new Set(accepted.map(a => a.name));
    const known = AttributeService.getInstance();
    const notValid = declared.filter(d => !acceptedNames.has(d.name) && known.isAttribute(d.name)).map(d => d.name);
    const unknown = declared.filter(d => !acceptedNames.has(d.name) && !known.isAttribute(d.name)).map(d => d.name);
    const exclusive = findAttributeProblems(def, declared).filter(p => / are mutually exclusive$/.test(p.message));

    const problems: string[] = [];
    if (notValid.length > 0) problems.push(`⚠ ${notValid.join(', ')}: not valid on ${def.name}`);
    if (unknown.length > 0) problems.push(`⚠ ${unknown.join(', ')}: not a known attribute`);
    for (const problem of exclusive) problems.push(`⚠ ${problem.message}`);

    const blocks: string[] = [];
    // two trailing spaces: a markdown line break, so each block stays one paragraph
    if (problems.length > 0) blocks.push(problems.join('  \n'));

    const valid = declared.filter(d => acceptedNames.has(d.name));
    if (valid.length > 0) {
        blocks.push(`**Attributes:** ${valid.map(d => '`' + d.name + '`').join(' ')}`);
    }
    const setNames = new Set(declared.map(d => d.name));
    const available = accepted.filter(a => a.flag && !setNames.has(a.name)).map(a => a.name).sort();
    if (available.length > 0) {
        blocks.push(wrapList('**Available:** ', available, AVAILABLE_LINE_WIDTH));
    }
    return blocks.join('\n\n');
}

/** `prefix A · B · C`, broken into markdown lines of at most `width` visible characters. */
function wrapList(prefix: string, names: string[], width: number): string {
    const lines: string[] = [];
    let line = prefix;
    let visible = prefix.replace(/\*/g, '').length;
    for (let i = 0; i < names.length; i++) {
        const text = names[i] + (i < names.length - 1 ? ' ·' : '');
        if (line === prefix) {
            line += text;
            visible += text.length;
        } else if (visible + 1 + text.length > width) {
            lines.push(line);
            line = text;
            visible = text.length;
        } else {
            line += ' ' + text;
            visible += 1 + text.length;
        }
    }
    lines.push(line);
    return lines.join('  \n');
}
