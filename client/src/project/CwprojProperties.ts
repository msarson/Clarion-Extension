/**
 * #792 — a .cwproj's properties as the Clarion IDE's project options page sees them: a value
 * applies to all configurations (the unconditional PropertyGroup) or to one (the group whose
 * Condition is `'$(Configuration)' == 'Debug'`, or `'$(Configuration)|$(Platform)' == 'Debug|Win32'`).
 *
 * Edits are text edits on the lines they concern, so the file keeps its layout, comments and
 * item groups; a value round-trips its escaping (XML entities, and MSBuild's %XX — the IDE
 * writes DefineConstants as `_ABCDllMode_=&gt;0%3b_ABCLinkMode_=&gt;1`). No vscode here.
 */
export type PropertyScope = 'all' | 'configuration' | 'unset';

interface Property { name: string; value: string; lineStart: number; lineEnd: number; valueStart: number; valueEnd: number; indent: string }
interface Group { configuration: string | null; conditional: boolean; groupIndent: string; closeLineStart: number; closeEnd: number; props: Property[] }

const eolOf = (text: string) => text.includes('\r\n') ? '\r\n' : '\n';

const xmlUnescape = (s: string) => s.replace(/&(lt|gt|quot|apos|amp);/g, (_m, e: string) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' } as Record<string, string>)[e]);
const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const msbuildUnescape = (s: string) => s.replace(/%([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
/** `;` separates MSBuild list items and `%XX` is an escape: write both the way the IDE does. */
const msbuildEscape = (s: string) => s.replace(/%(?=[0-9a-fA-F]{2})/g, '%25').replace(/;/g, '%3b');

/** The display value of a property's raw text, and the raw text for a display value. */
const decode = (raw: string) => msbuildUnescape(xmlUnescape(raw));
const encode = (value: string) => xmlEscape(msbuildEscape(value));

const lineStartAt = (text: string, index: number) => text.lastIndexOf('\n', index - 1) + 1;
const lineEndAfter = (text: string, index: number) => {
    const nl = text.indexOf('\n', index);
    return nl < 0 ? text.length : nl + 1;
};

function configurationOf(condition: string): string | null | undefined {
    const m = /'\$\(Configuration\)(?:\|\$\(Platform\))?'\s*==\s*'([^'|]*)(?:\|[^']*)?'/.exec(condition);
    return m ? m[1] : undefined;
}

function readGroups(text: string): Group[] {
    const groups: Group[] = [];
    const open = /<PropertyGroup(\s[^>]*)?>/g;
    let m: RegExpExecArray | null;
    while ((m = open.exec(text))) {
        const attrs = m[1] ?? '';
        const close = text.indexOf('</PropertyGroup>', open.lastIndex);
        if (close < 0) break;
        const cond = /\bCondition\s*=\s*"([^"]*)"/.exec(attrs);
        const configuration = cond ? configurationOf(cond[1]) : null;
        const groupLineStart = lineStartAt(text, m.index);
        const group: Group = {
            configuration: configuration ?? null,
            conditional: !!cond,
            groupIndent: /^[ \t]*/.exec(text.slice(groupLineStart, m.index))![0],
            closeLineStart: lineStartAt(text, close),
            closeEnd: close + '</PropertyGroup>'.length,
            props: [],
        };
        // A group whose condition is not a configuration (a platform only) is not one the page edits.
        if (cond && configuration === undefined) { open.lastIndex = close; continue; }
        const body = /<([A-Za-z_][\w.]*)(\s[^>]*)?(?:\/>|>([^<]*)<\/\1>)/g;
        body.lastIndex = open.lastIndex;
        let p: RegExpExecArray | null;
        while ((p = body.exec(text)) && p.index < close) {
            // A property carrying its own Condition (the default Configuration) is no plain value.
            if (p[2] && /\bCondition\s*=/.test(p[2])) continue;
            const lineStart = lineStartAt(text, p.index);
            const valueStart = p[3] === undefined ? p.index : p.index + p[0].indexOf('>') + 1;
            group.props.push({
                name: p[1],
                value: decode(p[3] ?? ''),
                lineStart,
                lineEnd: lineEndAfter(text, p.index + p[0].length),
                valueStart,
                valueEnd: p[3] === undefined ? p.index : valueStart + p[3].length,
                indent: /^[ \t]*/.exec(text.slice(lineStart, p.index))![0],
            });
        }
        open.lastIndex = close;
        groups.push(group);
    }
    return groups;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const findGroup = (groups: Group[], configuration: string | null) =>
    groups.find(g => configuration === null ? !g.conditional : g.configuration !== null && sameName(g.configuration, configuration));

/** The configurations the project's PropertyGroups are written for, in file order. */
export function configurationsOf(text: string): string[] {
    const names: string[] = [];
    for (const g of readGroups(text)) {
        if (g.configuration && !names.some(n => sameName(n, g.configuration!))) names.push(g.configuration);
    }
    return names;
}

/** A property's value in a configuration, and whether it applies to all configurations or that one. */
export function readProperty(text: string, name: string, configuration: string): { value: string | undefined; scope: PropertyScope } {
    const groups = readGroups(text);
    const own = findGroup(groups, configuration)?.props.find(p => sameName(p.name, name));
    if (own) return { value: own.value, scope: 'configuration' };
    const shared = findGroup(groups, null)?.props.find(p => sameName(p.name, name));
    if (shared) return { value: shared.value, scope: 'all' };
    return { value: undefined, scope: 'unset' };
}

/**
 * Sets (or with null removes) a property in the unconditional group (`configuration` null) or a
 * configuration's group, creating that group when the project has none for it.
 */
export function setProperty(text: string, name: string, value: string | null, configuration: string | null): string {
    const eol = eolOf(text);
    const groups = readGroups(text);
    const group = findGroup(groups, configuration);
    const existing = group?.props.find(p => sameName(p.name, name));
    if (existing) {
        if (value === null) return text.slice(0, existing.lineStart) + text.slice(existing.lineEnd);
        if (existing.value === value) return text;
        if (existing.valueStart === existing.valueEnd && text.slice(existing.valueStart).startsWith('<')) {
            // A self-closing element: write it out in full.
            const end = text.indexOf('/>', existing.valueStart) + 2;
            return text.slice(0, existing.valueStart) + `<${existing.name}>${encode(value)}</${existing.name}>` + text.slice(end);
        }
        return text.slice(0, existing.valueStart) + encode(value) + text.slice(existing.valueEnd);
    }
    if (value === null) return text;
    if (group) {
        const last = group.props[group.props.length - 1];
        const indent = last ? last.indent : group.groupIndent + '  ';
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
 * beside each field does. To one configuration: the shared value is copied into every
 * configuration's group (the current one included) and leaves the unconditional group. To all:
 * the current configuration's value becomes the shared one and the per-configuration values go.
 */
export function setPropertyScope(text: string, name: string, scope: 'all' | 'configuration', configuration: string): string {
    const current = readProperty(text, name, configuration);
    if (current.value === undefined) return text;
    const configurations = configurationsOf(text);
    if (!configurations.some(c => sameName(c, configuration))) configurations.push(configuration);
    let result = text;
    if (scope === 'configuration') {
        if (current.scope === 'configuration') return text;
        result = setProperty(result, name, null, null);
        for (const c of configurations) {
            if (readProperty(result, name, c).scope !== 'configuration') result = setProperty(result, name, current.value, c);
        }
        return result;
    }
    for (const c of configurations) result = setProperty(result, name, null, c);
    return setProperty(result, name, current.value, null);
}
