/**
 * #792 — a .cwproj's properties as the Clarion IDE's project options page sees them: a value
 * applies to all configurations (the unconditional PropertyGroup) or to one (the group whose
 * Condition is `'$(Configuration)' == 'Debug'`, or `'$(Configuration)|$(Platform)' == 'Debug|Win32'`).
 *
 * As MSBuild evaluates it, a property's value is its LAST assignment, in document order, among
 * the groups that apply — so a later shared value beats an earlier configuration one, and a
 * duplicate's last copy wins; reads and edits use that assignment. Comments and CDATA are not
 * project data. Edits change only the element concerned (its whole line when it stands alone),
 * so the file keeps its layout, comments and item groups; a value round-trips its escaping (XML
 * entities, and MSBuild's %XX — the IDE writes DefineConstants as `_ABCDllMode_=&gt;0%3b...`).
 * No vscode here.
 */
export type PropertyScope = 'all' | 'configuration' | 'unset';

interface Property {
    name: string; value: string;
    elementStart: number; elementEnd: number;
    /** The raw value's span; for a self-closing element both are elementStart. */
    valueStart: number; valueEnd: number; selfClosing: boolean;
    /** The element's line, and whether nothing else is on it. */
    lineStart: number; lineEnd: number; alone: boolean;
    indent: string;
}
interface Group { configuration: string | null; conditional: boolean; groupIndent: string; closeStart: number; closeEnd: number; closeAlone: boolean; closeLineStart: number; props: Property[] }

export const eolOf = (text: string) => text.includes('\r\n') ? '\r\n' : '\n';

const xmlUnescape = (s: string) => s.replace(/&(lt|gt|quot|apos|amp);/g, (_m, e: string) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' } as Record<string, string>)[e]);
const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const msbuildUnescape = (s: string) => s.replace(/%([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
/** `;` separates MSBuild list items and `%XX` is an escape: write both the way the IDE does. */
const msbuildEscape = (s: string) => s.replace(/%(?=[0-9a-fA-F]{2})/g, '%25').replace(/;/g, '%3b');

/** The display value of a property's raw text, and the raw text for a display value. */
export const decode = (raw: string) => msbuildUnescape(xmlUnescape(raw));
export const encode = (value: string) => xmlEscape(msbuildEscape(value));

export const lineStartAt = (text: string, index: number) => text.lastIndexOf('\n', index - 1) + 1;
export const lineEndAfter = (text: string, index: number) => {
    const nl = text.indexOf('\n', index);
    return nl < 0 ? text.length : nl + 1;
};
export const blankBetween = (text: string, from: number, to: number) => /^[ \t]*$/.test(text.slice(from, to));
export const restOfLineBlank = (text: string, from: number) => /^[ \t]*(\r?\n|$)/.test(text.slice(from));

/** The text with comments and CDATA blanked (newlines kept), so structure is matched on live XML at the same offsets. */
export const mask = (text: string) => text.replace(/<!--[^]*?-->|<!\[CDATA\[[^]*?\]\]>/g, m => m.replace(/[^\r\n]/g, ' '));

function configurationOf(condition: string): string | null | undefined {
    const m = /'\$\(Configuration\)(?:\|\$\(Platform\))?'\s*==\s*'([^'|]*)(?:\|[^']*)?'/.exec(condition);
    return m ? m[1] : undefined;
}

function readGroups(text: string): Group[] {
    const live = mask(text);
    const groups: Group[] = [];
    const open = /<PropertyGroup(\s[^>]*)?>/g;
    let m: RegExpExecArray | null;
    while ((m = open.exec(live))) {
        if (m[0].endsWith('/>')) continue;
        const attrs = m[1] ?? '';
        const close = live.indexOf('</PropertyGroup>', open.lastIndex);
        if (close < 0) break;
        const cond = /\bCondition\s*=\s*"([^"]*)"/.exec(attrs);
        const configuration = cond ? configurationOf(cond[1]) : null;
        open.lastIndex = close;
        // A group whose condition is not a configuration (a platform only) is not one the page edits.
        if (cond && configuration === undefined) continue;
        const groupLineStart = lineStartAt(text, m.index);
        const closeLineStart = lineStartAt(text, close);
        const group: Group = {
            configuration: configuration ?? null,
            conditional: !!cond,
            groupIndent: /^[ \t]*/.exec(text.slice(groupLineStart, m.index))![0],
            closeStart: close,
            closeEnd: close + '</PropertyGroup>'.length,
            closeAlone: blankBetween(text, closeLineStart, close),
            closeLineStart,
            props: [],
        };
        const body = /<([A-Za-z_][\w.]*)(\s[^>]*)?(?:\/>|>([^<]*)<\/\1\s*>)/g;
        body.lastIndex = m.index + m[0].length;
        let p: RegExpExecArray | null;
        while ((p = body.exec(live)) && p.index < close) {
            // A property carrying its own Condition (the default Configuration) is no plain value.
            if (p[2] && /\bCondition\s*=/.test(p[2])) continue;
            const elementStart = p.index, elementEnd = p.index + p[0].length;
            const selfClosing = p[3] === undefined;
            const valueStart = selfClosing ? elementStart : elementStart + p[0].indexOf('>') + 1;
            const lineStart = lineStartAt(text, elementStart);
            group.props.push({
                name: p[1],
                value: decode(selfClosing ? '' : text.slice(valueStart, valueStart + p[3].length)),
                elementStart, elementEnd, selfClosing,
                valueStart, valueEnd: selfClosing ? elementStart : valueStart + p[3].length,
                lineStart, lineEnd: lineEndAfter(text, elementEnd),
                alone: blankBetween(text, lineStart, elementStart) && restOfLineBlank(text, elementEnd),
                indent: /^[ \t]*/.exec(text.slice(lineStart, elementStart))![0],
            });
        }
        groups.push(group);
    }
    return groups;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** The groups that hold values for `configuration` (null: the unconditional ones), in document order. */
const groupsFor = (groups: Group[], configuration: string | null) =>
    groups.filter(g => configuration === null ? !g.conditional : g.configuration !== null && sameName(g.configuration, configuration));
const assignments = (groups: Group[], name: string) => groups.flatMap(g => g.props.filter(p => sameName(p.name, name)).map(p => ({ group: g, prop: p })));

/** The configurations the project's PropertyGroups are written for, in file order. */
export function configurationsOf(text: string): string[] {
    const names: string[] = [];
    for (const g of readGroups(text)) {
        if (g.configuration && !names.some(n => sameName(n, g.configuration!))) names.push(g.configuration);
    }
    return names;
}

/**
 * A property's value in a configuration — its last assignment among the groups that apply, as
 * MSBuild evaluates — and whether that assignment applies to all configurations or that one.
 */
export function readProperty(text: string, name: string, configuration: string): { value: string | undefined; scope: PropertyScope } {
    const applying = readGroups(text).filter(g => !g.conditional || (g.configuration !== null && sameName(g.configuration, configuration)));
    const all = assignments(applying, name);
    const last = all[all.length - 1];
    if (!last) return { value: undefined, scope: 'unset' };
    return { value: last.prop.value, scope: last.group.conditional ? 'configuration' : 'all' };
}

/** The span a removed property takes: its whole line when it stands alone, else just the element. */
const removalSpan = (p: Property): [number, number] => p.alone ? [p.lineStart, p.lineEnd] : [p.elementStart, p.elementEnd];

/**
 * Sets a property in the unconditional groups (`configuration` null) or a configuration's,
 * editing its last assignment there (the one MSBuild keeps), or adding it at the end of the last
 * such group, creating a group when the project has none for that configuration. With a null
 * value it removes every assignment there, so an earlier one does not come back.
 */
export function setProperty(text: string, name: string, value: string | null, configuration: string | null): string {
    const eol = eolOf(text);
    const groups = readGroups(text);
    const own = groupsFor(groups, configuration);
    const existing = assignments(own, name);
    if (value === null) {
        let result = text;
        for (const { prop } of [...existing].reverse()) {
            const [from, to] = removalSpan(prop);
            result = result.slice(0, from) + result.slice(to);
        }
        return result;
    }
    const last = existing[existing.length - 1]?.prop;
    if (last) {
        if (last.value === value) return text;
        if (last.selfClosing) return text.slice(0, last.elementStart) + `<${last.name}>${encode(value)}</${last.name}>` + text.slice(last.elementEnd);
        return text.slice(0, last.valueStart) + encode(value) + text.slice(last.valueEnd);
    }
    const group = own[own.length - 1];
    if (group) {
        if (!group.closeAlone) {
            // A group closed on a line with other content: the element goes just before the close.
            return text.slice(0, group.closeStart) + `<${name}>${encode(value)}</${name}>` + text.slice(group.closeStart);
        }
        const lastProp = group.props[group.props.length - 1];
        const indent = lastProp && lastProp.alone ? lastProp.indent : group.groupIndent + '  ';
        return text.slice(0, group.closeLineStart) + `${indent}<${name}>${encode(value)}</${name}>${eol}` + text.slice(group.closeLineStart);
    }
    // No group for it yet: a new one after the last PropertyGroup.
    const anchor = groups[groups.length - 1];
    const indent = anchor ? anchor.groupIndent : '  ';
    const condition = configuration === null ? '' : ` Condition=" '$(Configuration)' == '${configuration}' "`;
    const block = `${indent}<PropertyGroup${condition}>${eol}${indent}  <${name}>${encode(value)}</${name}>${eol}${indent}</PropertyGroup>${eol}`;
    const at = anchor ? lineEndAfter(text, anchor.closeEnd) : lineEndAfter(text, text.indexOf('>', text.indexOf('<Project')));
    return text.slice(0, at) + block + text.slice(at);
}

/**
 * Moves a property between "all configurations" and "this configuration", as the IDE's switch
 * beside each field does. To one configuration: the value the current configuration sees is
 * copied into every configuration's group and the shared assignments go. To all: that value
 * becomes the shared one and every configuration's own assignments go.
 */
export function setPropertyScope(text: string, name: string, scope: 'all' | 'configuration', configuration: string): string {
    const current = readProperty(text, name, configuration);
    if (current.value === undefined || current.scope === scope) return text;
    const configurations = configurationsOf(text);
    if (!configurations.some(c => sameName(c, configuration))) configurations.push(configuration);
    let result = text;
    if (scope === 'configuration') {
        // Each configuration keeps the value it sees now; then the shared assignments go.
        const seen = configurations.map(c => ({ c, value: readProperty(text, name, c).value ?? current.value! }));
        result = setProperty(result, name, null, null);
        for (const { c, value } of seen) {
            if (readProperty(result, name, c).scope !== 'configuration') result = setProperty(result, name, value, c);
        }
        return result;
    }
    for (const c of configurations) result = setProperty(result, name, null, c);
    return setProperty(result, name, current.value, null);
}
