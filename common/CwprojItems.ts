import * as path from 'path';
import { blankBetween, decode, encode, eolOf, lineEndAfter, lineStartAt, mask, restOfLineBlank } from './CwprojProperties';
import { SOURCE_PRAGMAS } from './ProjectPropertyFields';

/**
 * #792 — a .cwproj's items as the Project Properties page's Sources tab sees them: the compiled
 * sources (`<Compile Include="...">`, a Generated child marking the ones the IDE writes), the
 * project references (with their Name), the file drivers and the libraries. Items are not per
 * configuration.
 *
 * As with the properties, comments and CDATA are not project data, and an edit changes only the
 * element concerned: a removed item takes its line when it stands alone, children included, and
 * its ItemGroup when nothing is left in it; a new one goes after the last of its kind, indented
 * like its neighbours. An Include round-trips its XML and MSBuild %XX escaping. No vscode here.
 */
export type ItemKind = 'Compile' | 'ProjectReference' | 'FileDriver' | 'Library' | 'Include';

export interface ProjectItem {
    kind: ItemKind;
    include: string;
    /** A Compile item the IDE generates: `<Generated>true</Generated>`. */
    generated: boolean;
    /** A ProjectReference's `<Name>`. */
    name?: string;
    /** #816: a Compile item's own pragmas, by metadata name (only those it has). */
    pragmas?: Record<string, string>;
}

export interface ProjectItems {
    compile: ProjectItem[];
    projectReferences: ProjectItem[];
    fileDrivers: ProjectItem[];
    libraries: ProjectItem[];
    includes: ProjectItem[];
}

interface Item extends ProjectItem {
    elementStart: number; elementEnd: number;
    /** Where its open tag ends and its close tag starts; the same for a self-closed one. */
    openEnd: number; bodyEnd: number;
    lineStart: number; lineEnd: number; alone: boolean;
    indent: string;
    /** How its tag closes when it has no children: `/>` or ` />`. */
    selfClose: string | undefined;
}
interface Group { openStart: number; openEnd: number; closeStart: number; closeEnd: number; indent: string; items: Item[] }

/** #803: Include is the IDE's "Projects to include", a legacy TopSpeed project (.prj/.pr) pulled into the build. */
export const ITEM_KINDS: ItemKind[] = ['Compile', 'ProjectReference', 'FileDriver', 'Library', 'Include'];
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const indentAt = (text: string, index: number) => /^[ \t]*/.exec(text.slice(lineStartAt(text, index), index))![0];
const childText = (body: string, name: string) => {
    const m = new RegExp(`<${name}\\s*>([^<]*)</${name}\\s*>`).exec(body);
    return m ? decode(m[1].trim()) : undefined;
};

function readGroups(text: string): Group[] {
    const live = mask(text);
    const groups: Group[] = [];
    const open = /<ItemGroup(\s[^>]*)?>/g;
    let m: RegExpExecArray | null;
    while ((m = open.exec(live))) {
        if (m[0].endsWith('/>')) continue;
        const closeStart = live.indexOf('</ItemGroup>', open.lastIndex);
        if (closeStart < 0) break;
        const group: Group = {
            openStart: m.index, openEnd: open.lastIndex,
            closeStart, closeEnd: closeStart + '</ItemGroup>'.length,
            indent: indentAt(text, m.index), items: [],
        };
        const element = /<([A-Za-z_][\w.]*)(\s[^>]*?)?(\/?)>/g;
        element.lastIndex = group.openEnd;
        let e: RegExpExecArray | null;
        while ((e = element.exec(live)) && e.index < closeStart) {
            const elementStart = e.index;
            let elementEnd = element.lastIndex;
            const openEnd = elementEnd;
            let bodyEnd = openEnd;
            let body = '';
            if (!e[3]) {
                // An element with children ends at its own close tag; items do not nest.
                const close = new RegExp(`</${e[1]}\\s*>`, 'g');
                close.lastIndex = elementEnd;
                const c = close.exec(live);
                if (!c || c.index > closeStart) break;
                body = live.slice(elementEnd, c.index);
                bodyEnd = c.index;
                elementEnd = close.lastIndex;
                element.lastIndex = elementEnd;
            }
            const kind = ITEM_KINDS.find(k => k === e![1]);
            const include = /\bInclude\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(e[2] ?? '');
            if (!kind || !include) continue;
            const lineStart = lineStartAt(text, elementStart);
            group.items.push({
                kind,
                include: decode(include[1] ?? include[2]),
                generated: kind === 'Compile' && /^true$/i.test(childText(body, 'Generated') ?? ''),
                ...(kind === 'ProjectReference' ? { name: childText(body, 'Name') } : {}),
                ...(kind === 'Compile' ? { pragmas: pragmasOf(body) } : {}),
                elementStart, elementEnd, openEnd, bodyEnd,
                lineStart, lineEnd: lineEndAfter(text, elementEnd),
                alone: blankBetween(text, lineStart, elementStart) && restOfLineBlank(text, elementEnd),
                indent: indentAt(text, elementStart),
                selfClose: e[3] ? (/\s\/>$/.test(e[0]) ? ' />' : '/>') : undefined,
            });
        }
        open.lastIndex = group.closeEnd;
        groups.push(group);
    }
    return groups;
}

/** #816: a Compile item's own pragmas, the metadata the build task reads (named as it reads them). */
function pragmasOf(body: string): Record<string, string> {
    const pragmas: Record<string, string> = {};
    for (const p of SOURCE_PRAGMAS) {
        const value = childText(body, p.name);
        if (value) pragmas[p.name] = value;
    }
    return pragmas;
}

const strip = (i: Item): ProjectItem => ({
    kind: i.kind, include: i.include, generated: i.generated,
    ...(i.name !== undefined ? { name: i.name } : {}),
    ...(i.pragmas !== undefined ? { pragmas: i.pragmas } : {}),
});

/** The project's items of each kind, in file order. */
export function listItems(text: string): ProjectItems {
    const all = readGroups(text).flatMap(g => g.items);
    const of = (kind: ItemKind) => all.filter(i => i.kind === kind).map(strip);
    return { compile: of('Compile'), projectReferences: of('ProjectReference'), fileDrivers: of('FileDriver'), libraries: of('Library'), includes: of('Include') };
}

/** An attribute value: a property's encoding, and its quotes. */
const encodeAttribute = (value: string) => encode(value).replace(/"/g, '&quot;');

/**
 * Adds an item after the last of its kind in the first ItemGroup holding that kind, or in a new
 * ItemGroup after the last one (before `</Project>` when there is none). One already there, in
 * any case, is not added again. #803: `children` are written inside it, one per line, as the IDE
 * writes a project reference's `<Project>` GUID and `<Name>`.
 */
export function addItem(text: string, kind: ItemKind, include: string, children: [string, string][] = []): string {
    const groups = readGroups(text);
    const all = groups.flatMap(g => g.items);
    if (all.some(i => i.kind === kind && sameName(i.include, include))) return text;
    const eol = eolOf(text);
    const selfClose = all.find(i => i.selfClose)?.selfClose ?? ' />';
    const anchor = groups[groups.length - 1];
    const groupIndent = anchor?.indent ?? (indentAt(text, Math.max(0, mask(text).search(/<PropertyGroup\b/))) || '  ');
    const step = all[0] ? all[0].indent.slice(groups.find(g => g.items.includes(all[0]))!.indent.length) || '  ' : '  ';
    const open = `<${kind} Include="${encodeAttribute(include)}"`;
    // The element at an indent; with children, one per line a step further in.
    const element = (indent: string) => children.length === 0 ? `${open}${selfClose}`
        : `${open}>${children.map(([name, value]) => `${eol}${indent}${step}<${name}>${encode(value)}</${name}>`).join('')}${eol}${indent}</${kind}>`;

    const group = groups.find(g => g.items.some(i => i.kind === kind));
    if (group) {
        const last = group.items.filter(i => i.kind === kind).pop()!;
        if (!last.alone) return text.slice(0, last.elementEnd) + element(last.indent) + text.slice(last.elementEnd);
        const lineBreak = text.slice(last.lineStart, last.lineEnd).endsWith('\n') ? '' : eol;
        return text.slice(0, last.lineEnd) + lineBreak + `${last.indent}${element(last.indent)}${eol}` + text.slice(last.lineEnd);
    }

    // A new group, indented like the last one and its items, or one step in from <Project>.
    const block = `${groupIndent}<ItemGroup>${eol}${groupIndent}${step}${element(groupIndent + step)}${eol}${groupIndent}</ItemGroup>${eol}`;
    if (anchor) {
        const at = lineEndAfter(text, anchor.closeEnd);
        return text.slice(0, at) + (text.slice(0, at).endsWith('\n') ? '' : eol) + block + text.slice(at);
    }
    const close = mask(text).lastIndexOf('</Project>');
    if (close < 0) return text;
    const closeLine = lineStartAt(text, close);
    if (blankBetween(text, closeLine, close)) return text.slice(0, closeLine) + block + text.slice(closeLine);
    return text.slice(0, close) + eol + block + text.slice(close);
}

/** The span a removed element takes: its whole line when it stands alone; else the element and the spaces that would be left behind. */
function removalSpan(text: string, start: number, end: number, alone: boolean, lineStart: number, lineEnd: number): [number, number] {
    if (alone) return [lineStart, lineEnd];
    if (blankBetween(text, lineStart, start)) return [start, end + /^[ \t]*/.exec(text.slice(end))![0].length];
    return [start - /[ \t]*$/.exec(text.slice(lineStart, start))![0].length, end];
}

/**
 * Removes every item of a kind whose Include matches, in any case, children included; an
 * ItemGroup left with nothing in it (comments count as something) goes too.
 */
export function removeItem(text: string, kind: ItemKind, include: string): string {
    let result = text;
    for (;;) {
        const groups = readGroups(result);
        const group = groups.find(g => g.items.some(i => i.kind === kind && sameName(i.include, include)));
        if (!group) return result;
        const item = group.items.find(i => i.kind === kind && sameName(i.include, include))!;
        let [from, to] = removalSpan(result, item.elementStart, item.elementEnd, item.alone, item.lineStart, item.lineEnd);
        const leftInGroup = result.slice(group.openEnd, from) + result.slice(to, group.closeStart);
        if (/^\s*$/.test(leftInGroup)) {
            const lineStart = lineStartAt(result, group.openStart);
            const alone = blankBetween(result, lineStart, group.openStart) && restOfLineBlank(result, group.closeEnd);
            [from, to] = removalSpan(result, group.openStart, group.closeEnd, alone, lineStart, lineEndAfter(result, group.closeEnd));
        }
        result = result.slice(0, from) + result.slice(to);
    }
}

/**
 * #816: sets one metadata child of the first item of a kind whose Include matches (in any case),
 * as the IDE stores a source's own pragmas; null removes it. A self-closed item is opened for its
 * first child, a child one line each, a step in from the item; one left with no children closes
 * on one line again. A new child goes after the item's others; only the element concerned changes.
 */
export function setItemMetadata(text: string, kind: ItemKind, include: string, name: string, value: string | null): string {
    const groups = readGroups(text);
    const all = groups.flatMap(g => g.items);
    const item = all.find(i => i.kind === kind && sameName(i.include, include));
    if (!item || !/^[A-Za-z_][\w.]*$/.test(name)) return text;
    const live = mask(text);
    const eol = eolOf(text);
    // The child, if any: by its name as written (the build task reads metadata names as written).
    const childRe = new RegExp(`<${name}\\s*>([^<]*)</${name}\\s*>`, 'g');
    childRe.lastIndex = item.openEnd;
    const found = item.selfClose ? null : childRe.exec(live);
    const child = found && found.index < item.bodyEnd ? found : null;

    if (value === null) {
        if (!child) return text;
        const childStart = child.index, childEnd = child.index + child[0].length;
        const lineStart = lineStartAt(text, childStart);
        const alone = blankBetween(text, lineStart, childStart) && restOfLineBlank(text, childEnd);
        const [from, to] = removalSpan(text, childStart, childEnd, alone, lineStart, lineEndAfter(text, childEnd));
        if (/^\s*$/.test(text.slice(item.openEnd, from) + text.slice(to, item.bodyEnd))) {
            // Nothing left inside: back to one line, closed as the project's other items are.
            const selfClose = all.find(i => i.selfClose)?.selfClose ?? ' />';
            const open = text.slice(item.elementStart, item.openEnd).replace(/\s*>$/, selfClose);
            return text.slice(0, item.elementStart) + open + text.slice(item.elementEnd);
        }
        return text.slice(0, from) + text.slice(to);
    }

    const encoded = encode(value);
    if (child) {
        const valueStart = child.index + child[0].indexOf('>') + 1;
        return text.slice(0, valueStart) + encoded + text.slice(valueStart + child[1].length);
    }
    const element = `<${name}>${encoded}</${name}>`;
    // The last child already there, and its indent; else a step in from the item.
    const childOpen = /<([A-Za-z_][\w.]*)(\s[^>]*?)?(\/?)>/g;
    childOpen.lastIndex = item.openEnd;
    let lastEnd = -1, lastIndent = '';
    let c: RegExpExecArray | null;
    while ((c = childOpen.exec(live)) && c.index < item.bodyEnd) {
        let end = childOpen.lastIndex;
        if (!c[3]) {
            const close = new RegExp(`</${c[1]}\\s*>`, 'g');
            close.lastIndex = end;
            const m = close.exec(live);
            if (!m || m.index > item.bodyEnd) break;
            end = close.lastIndex;
            childOpen.lastIndex = end;
        }
        lastEnd = end;
        lastIndent = indentAt(text, c.index);
    }
    if (lastEnd >= 0) return text.slice(0, lastEnd) + eol + lastIndent + element + text.slice(lastEnd);
    const group = groups.find(g => g.items.includes(item))!;
    const step = item.indent.slice(group.indent.length) || '  ';
    const inner = `${eol}${item.indent}${step}${element}${eol}${item.indent}`;
    if (item.selfClose) {
        const open = text.slice(item.elementStart, item.elementEnd).replace(/\s*\/>$/, '>');
        return text.slice(0, item.elementStart) + open + inner + `</${kind}>` + text.slice(item.elementEnd);
    }
    return text.slice(0, item.openEnd) + inner + text.slice(item.bodyEnd);
}

/** The Include for a file added to a project: its path relative to the project's folder, with backslashes. */
export function includeFor(projectFolder: string, file: string): string {
    const p = /^[A-Za-z]:|^\\\\/.test(projectFolder) ? path.win32 : path.posix;
    return p.relative(projectFolder, file).replace(/\//g, '\\');
}
