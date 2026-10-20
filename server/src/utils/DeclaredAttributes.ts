import { Token, TokenType } from '../ClarionTokenizer';
import { LogicalLine } from '../DocumentStructure';
import { ControlDefinition } from './ControlService';
import { AttributeService } from './AttributeService';

/** One attribute on a declaration, e.g. `HVSCROLL` or `AT(10,10,100,50)`. */
export interface DeclaredAttribute {
    /** Upper-cased attribute name. */
    name: string;
    /** The attribute's name token. */
    token: Token;
}

/**
 * The declaration keyword token (WINDOW, TEXT, BUTTON…) at a position, if it opens its
 * logical line — optionally after a label. The same word anywhere else (an argument, a
 * later attribute) is not a declaration.
 */
export function findDeclarationKeyword(logical: LogicalLine, line: number, character: number): Token | null {
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

/** The upper-cased names in a definition's `attributes` list (`AT()` → `AT`). */
function acceptedNames(def: ControlDefinition): Set<string> {
    return new Set((def.attributes ?? []).map(a => (a.endsWith('()') ? a.slice(0, -2) : a).toUpperCase()));
}

/** Problems with a declaration's attributes: not accepted here, unknown, or mutually exclusive. */
export function findAttributeProblems(def: ControlDefinition, declared: DeclaredAttribute[]): { attribute: DeclaredAttribute; message: string }[] {
    const accepted = acceptedNames(def);
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
