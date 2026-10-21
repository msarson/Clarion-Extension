import { Token, TokenType } from '../ClarionTokenizer';
import { LogicalLine } from '../DocumentStructure';
import { ControlDefinition, ControlService } from './ControlService';
import { AttributeService, attributeSnippet } from './AttributeService';

/** One attribute on a declaration, e.g. `HVSCROLL` or `AT(10,10,100,50)`. */
export interface DeclaredAttribute {
    /** Upper-cased attribute name. */
    name: string;
    /** The attribute's name token. */
    token: Token;
    /** The comma (at paren depth 0) that introduces the attribute. */
    comma: Token;
    /** The attribute's last token: its name, or the `)` that closes its value (#743). */
    end: Token;
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
    let comma: Token | null = null;
    let current: DeclaredAttribute | null = null;
    for (let i = start + 1; i < tokens.length; i++) {
        const token = tokens[i];
        const value = token.value;
        if (depth === 0 && value === ',') {
            comma = token;
            current = null;
            continue;
        }
        if (comma) {
            current = { name: value.toUpperCase(), token, comma, end: token };
            result.push(current);
            comma = null;
        } else if (current) {
            current.end = token;
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

/**
 * Problems with a declaration's attributes: not accepted here, unknown, mutually exclusive, or
 * present without the attribute it requires (#746: `ENCRYPT attribute requires OWNER`).
 */
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
    const setNames = new Set(declared.map(d => d.name));
    for (const attribute of declared) {
        const needs = def.requires?.[attribute.name];
        if (needs && !setNames.has(needs)) problems.push({ attribute, message: `${attribute.name} requires ${needs}` });
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
 *   **With value:** the attributes that take a value and are not set (ALRT always: one per key).
 * Empty when the definition carries no `attributes` list — the card then keeps its
 * generic "Common Attributes". With `links` (#731, #743), each name is an edit link: under
 * Attributes it removes the attribute with its value, under Available it adds the flag, and
 * under With value it adds the attribute as a snippet to type the value into.
 */
export function formatDeclaredAttributes(def: ControlDefinition, declared: DeclaredAttribute[], links?: EditLinkContext): string {
    if (!def.attributes || def.attributes.length === 0) return '';

    const accepted = parseAccepted(def);
    const acceptedNames = new Set(accepted.map(a => a.name));
    const known = AttributeService.getInstance();
    const notValid = declared.filter(d => !acceptedNames.has(d.name) && known.isAttribute(d.name)).map(d => d.name);
    const unknown = declared.filter(d => !acceptedNames.has(d.name) && !known.isAttribute(d.name)).map(d => d.name);
    const setNames = new Set(declared.map(d => d.name));
    const combined = findAttributeProblems(def, declared).filter(p => / are mutually exclusive$| requires \w+$/.test(p.message));

    const problems: string[] = [];
    if (notValid.length > 0) problems.push(`⚠ ${notValid.join(', ')}: not valid on ${def.name}`);
    if (unknown.length > 0) problems.push(`⚠ ${unknown.join(', ')}: not a known attribute`);
    for (const problem of combined) problems.push(`⚠ ${problem.message}`);
    // a FILE without DRIVER does not compile (#746); there is no attribute to hang it on
    for (const name of def.required ?? []) {
        if (!setNames.has(name)) problems.push(`⚠ ${def.name} requires ${name}`);
    }

    const blocks: string[] = [];
    // two trailing spaces: a markdown line break, so each block stays one paragraph
    if (problems.length > 0) blocks.push(problems.join('  \n'));

    const flags = new Set(accepted.filter(a => a.flag).map(a => a.name));
    const valid = declared.filter(d => acceptedNames.has(d.name));
    if (valid.length > 0) {
        // a required attribute (a FILE's DRIVER) is listed, never offered for removal
        const names = valid.map(d => !links || def.required?.includes(d.name)
            ? '`' + d.name + '`'
            : removeLink(d, def, declared, flags, links));
        blocks.push(`**Attributes:** ${names.join(' ')}`);
    }
    const available = accepted.filter(a => a.flag && !setNames.has(a.name)).map(a => a.name).sort();
    if (available.length > 0) {
        const items = available.map(name => ({
            visible: name,
            text: links ? addLink(name, def, declared, links) : name,
        }));
        // linked names are drawn as separate chips by a client: no separators needed
        blocks.push(wrapList('**Available:** ', items, AVAILABLE_LINE_WIDTH, links ? '' : ' ·'));
    }
    const withValue = accepted.filter(a => !a.flag && (!setNames.has(a.name) || REPEATABLE.has(a.name))).map(a => a.name).sort();
    if (withValue.length > 0) {
        const items = withValue.map(name => ({
            visible: name,
            text: links ? editLink(name, `Add ${plainSnippet(attributeSnippet(name))}`, [snippetEdit(name, links)]) : name,
        }));
        blocks.push(wrapList('**With value:** ', items, AVAILABLE_LINE_WIDTH, links ? '' : ' ·'));
    }
    return blocks.join('\n\n');
}

/** Attributes a declaration can carry more than once: ALRT, one per key. */
const REPEATABLE = new Set(['ALRT']);

/** Longest attribute text a remove title quotes before it is cut short. */
const TITLE_TEXT_WIDTH = 60;

/** `Add HIDE — hidden until UNHIDE`: a flag's link title. */
function flagTitle(verb: 'Add' | 'Remove', name: string): string {
    const short = AttributeService.getInstance().getAttribute(name)?.short;
    return `${verb} ${name}` + (short ? ` — ${short}` : '');
}

/**
 * `Remove TIP('Save the record')`: the text that goes. Removing USE breaks the code that refers to
 * the control's field equate, and removing AT moves the control, so their titles say so.
 */
function removeTitle(d: DeclaredAttribute, links: EditLinkContext): string {
    const source = sourceText(d, links.lines);
    const text = source.length > TITLE_TEXT_WIDTH ? source.slice(0, TITLE_TEXT_WIDTH - 1) + '…' : source;
    let warning = '';
    if (d.name === 'USE') {
        // USE(?Name), or USE(Var[,number][,?Name]): the equate is ?Var unless one is named, with
        // periods as colons and an array element's subscript after an underscore (?File:Name, ?Arr_1)
        const args = /^USE\s*\((.*)\)$/i.exec(source)?.[1].split(',').map(a => a.trim()) ?? [];
        const variable = args[0] ? '?' + args[0].replace(/\./g, ':').replace(/\[\s*(\w+)\s*\]/g, '_$1') : '';
        const equate = args.find(a => a.startsWith('?')) ?? variable;
        if (equate) warning = ` — code that refers to ${equate} will no longer compile`;
    } else if (d.name === 'AT') {
        warning = ' — the control falls back to the default position and size';
    }
    return `Remove ${text}${warning}`;
}

/** An attribute as written, its continuation lines joined: `FORMAT('20L' & |` + `'30R')` reads `FORMAT('20L' & '30R')`. */
function sourceText(d: DeclaredAttribute, lines: string[]): string {
    const parts: string[] = [];
    for (let line = d.token.line; line <= d.end.line; line++) {
        const text = lines[line] ?? '';
        const from = line === d.token.line ? d.token.start : 0;
        const to = line === d.end.line ? d.end.start + d.end.value.length : codeEnd(text);
        parts.push(text.slice(from, to).replace(/\|\s*$/, '').trim());
    }
    return parts.join(' ');
}

/** A snippet as the text it inserts when nothing is typed: `TIP('${1:text}')` reads `TIP('text')`. */
function plainSnippet(snippet: string): string {
    return snippet.replace(/\$\{\d+:([^}]*)\}/g, '$1').replace(/\$\{\d+\}|\$\d+/g, '');
}

/**
 * What the attribute edit links need: the document's lines, the line the hover was asked for, and
 * the declaration's logical line. Link edits are relative to that line, so a client whose line
 * numbers are offset from the server's (an embed view of a module) still lands on the right text.
 */
export interface EditLinkContext {
    lines: string[];
    anchorLine: number;
    logical: LogicalLine;
}

/**
 * One text edit of a link: lines relative to the anchor, 0-based columns, the original text of lines
 * l..el. `s` (#743) marks `t` as a VS Code snippet; a snippet edit is the link's only edit.
 */
interface LinkEdit { l: number; c: number; el: number; ec: number; t: string; o: string[]; s?: true; }

/** The command a client registers to apply an edit link (#731; VS Code: #739). */
export const ATTRIBUTE_EDIT_COMMAND = 'clarion.applyAttributeEdit';

/**
 * `[NAME](command:clarion.applyAttributeEdit?<args> "Add NAME — short")`; the title is the client's
 * tooltip. `args` is `[payload]`, JSON and URI-encoded, with `(` and `)` encoded as well: the
 * original lines are full of them (`AT(10,10)`), and a raw one can end a markdown link early.
 */
function editLink(name: string, title: string, edits: LinkEdit[]): string {
    // markdown escapes, so a value's double quote reads as itself in the tooltip
    title = title.replace(/[\\"]/g, '\\$&');
    const args = encodeURIComponent(JSON.stringify([{ e: edits }])).replace(/\(/g, '%28').replace(/\)/g, '%29');
    return `[${name}](command:${ATTRIBUTE_EDIT_COMMAND}?${args} "${title}")`;
}

function linkEdit(links: EditLinkContext, line: number, col: number, endLine: number, endCol: number, text: string): LinkEdit {
    return {
        l: line - links.anchorLine, c: col,
        el: endLine - links.anchorLine, ec: endCol,
        t: text,
        o: links.lines.slice(line, endLine + 1),
    };
}

/**
 * The remove link of a set attribute. Removing one that another set attribute requires removes that
 * one too (#746: OWNER takes ENCRYPT with it), since the declaration would not compile without it.
 */
function removeLink(d: DeclaredAttribute, def: ControlDefinition, declared: DeclaredAttribute[], flags: Set<string>, links: EditLinkContext): string {
    const dependants = declared.filter(x => def.requires?.[x.name] === d.name);
    const title = (flags.has(d.name) ? flagTitle('Remove', d.name) : removeTitle(d, links))
        + (dependants.length ? `, and ${dependants.map(x => x.name).join(' and ')}, which requires it` : '');
    return editLink(d.name, title, [d, ...dependants].flatMap(x => removeEdits(x, links)));
}

/**
 * The add link of an available flag. A flag that requires an attribute the declaration does not
 * set brings it along (#746): `,EXTERNAL,DLL`, or `,OWNER('password'),ENCRYPT` as a snippet with
 * the partner's value to type in.
 */
function addLink(name: string, def: ControlDefinition, declared: DeclaredAttribute[], links: EditLinkContext): string {
    const needs = def.requires?.[name];
    if (needs && !declared.some(d => d.name === needs)) {
        const line = links.logical.endLine;
        const end = codeEnd(links.lines[line] ?? '');
        const partnerIsFlag = parseAccepted(def).some(a => a.name === needs && a.flag);
        if (partnerIsFlag) {
            return editLink(name, `${flagTitle('Add', name)}, with ${needs}, which it requires`,
                [linkEdit(links, line, end, line, end, `,${needs},${name}`)]);
        }
        const snippet = attributeSnippet(needs);
        return editLink(name, `${flagTitle('Add', name)}, with ${plainSnippet(snippet)}, which it requires`,
            [{ ...linkEdit(links, line, end, line, end, `,${snippet},${name}`), s: true }]);
    }
    return editLink(name, flagTitle('Add', name), addEdits(name, def, declared, links));
}

/**
 * Remove an attribute: from its comma to its end, its value included. When the name opens a
 * continuation line, the comma (and the `|`) sit on the line before, so the rest of the last line
 * joins that line: `USE(?T), |` + `   READONLY  ! c` becomes `USE(?T)  ! c`.
 */
function removeEdits(d: DeclaredAttribute, links: EditLinkContext): LinkEdit[] {
    return [linkEdit(links, d.comma.line, d.comma.start, d.end.line, d.end.start + d.end.value.length, '')];
}

/** Add a value attribute (#743): `,` and its snippet at the end of the declaration's code. */
function snippetEdit(name: string, links: EditLinkContext): LinkEdit {
    const line = links.logical.endLine;
    const end = codeEnd(links.lines[line] ?? '');
    return { ...linkEdit(links, line, end, line, end, ',' + attributeSnippet(name)), s: true };
}

/**
 * Add a flag: replace a partner from the same `exclusive` group in place (VSCROLL becomes HVSCROLL)
 * and remove any further partner; otherwise append `,NAME` to the end of the declaration's code,
 * before a comment.
 */
function addEdits(name: string, def: ControlDefinition, declared: DeclaredAttribute[], links: EditLinkContext): LinkEdit[] {
    // every attribute that shares an exclusive group with NAME (HVSCROLL: HSCROLL and VSCROLL)
    const clashing = new Set((def.exclusive ?? []).filter(g => g.includes(name)).flat());
    const partners = declared.filter(d => d.name !== name && clashing.has(d.name));
    if (partners.length > 0) {
        const [first, ...rest] = partners;
        const t = first.token;
        return [
            linkEdit(links, t.line, t.start, t.line, t.start + t.value.length, name),
            ...rest.flatMap(d => removeEdits(d, links)),
        ];
    }
    const line = links.logical.endLine;
    const end = codeEnd(links.lines[line] ?? '');
    return [linkEdit(links, line, end, line, end, ',' + name)];
}

/** The column where a line's code ends: before a `!` comment outside quotes, trailing blanks dropped. */
function codeEnd(text: string): number {
    let inString = false;
    let end = text.length;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "'") inString = !inString;
        else if (text[i] === '!' && !inString) { end = i; break; }
    }
    return text.slice(0, end).replace(/\s+$/, '').length;
}

/**
 * `prefix A · B · C`, broken into markdown lines of at most `width` VISIBLE characters — an item's
 * text may be a link, its `visible` part is what is measured. Each broken line ends in `separator`.
 */
function wrapList(prefix: string, items: { text: string; visible: string }[], width: number, separator: string): string {
    const lines: string[] = [];
    let line = prefix;
    let visible = prefix.replace(/\*/g, '').length;
    for (let i = 0; i < items.length; i++) {
        const sep = i < items.length - 1 ? separator : '';
        const text = items[i].text + sep;
        const length = items[i].visible.length + sep.length;
        if (line === prefix) {
            line += text;
            visible += length;
        } else if (visible + 1 + length > width) {
            lines.push(line);
            line = text;
            visible = length;
        } else {
            line += ' ' + text;
            visible += 1 + length;
        }
    }
    lines.push(line);
    return lines.join('  \n');
}
