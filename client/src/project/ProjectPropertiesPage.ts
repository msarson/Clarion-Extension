import { addItem, ITEM_KINDS, listItems, ProjectItems, removeItem } from './CwprojItems';
import { configurationsOf, PropertyScope, readProperty } from './CwprojProperties';
import { fieldAvailability, FILE_DRIVERS, PROJECT_PROPERTY_FIELDS, PROJECT_PROPERTY_TABS } from './ProjectPropertyFields';

/**
 * #792 — what the Project Properties page shows for one configuration: each IDE page's groups
 * and fields, every field's value and whether it applies to all configurations or that one, and
 * which configurations can be chosen; and the Sources tab's items with the file drivers that
 * can still be added. The webview only draws this. No vscode here.
 */
export interface PageField {
    property: string;
    value: string;
    scope: PropertyScope;
    /** A checkbox field's state: its stored value is its `on` value. */
    checked: boolean;
    available: boolean;
    reason?: string;
}

export interface PageState {
    configuration: string;
    configurations: string[];
    outputName: string;
    /** EXE or DLL, from OutputType. */
    kind: string;
    tabs: { id: string; label: string; groups: { title: string; fields: PageField[] }[] }[];
    /** The Sources tab: the project's items, which are not per configuration. */
    sources: ProjectItems & { driverChoices: string[] };
}

/** The configurations a project offers: its own groups' first, then Debug and Release. */
function configurationChoices(text: string, current: string): string[] {
    const names = configurationsOf(text);
    for (const n of ['Debug', 'Release', current]) {
        if (n && !names.some(x => x.toLowerCase() === n.toLowerCase())) names.push(n);
    }
    return names;
}

/** A Sources tab message: add or remove an item of a kind. */
export interface ItemMessage { type: string; kind?: string; value?: string }

/** The text after a Sources tab message; unchanged for one it does not take. */
export function editItems(text: string, msg: ItemMessage): string {
    const kind = ITEM_KINDS.find(k => k === msg.kind);
    const value = (msg.value ?? '').trim();
    if (!kind || !value) return text;
    if (msg.type === 'removeItem') return removeItem(text, kind, value);
    // A reference needs the project's GUID and name, which the page does not ask for.
    if (msg.type === 'addItem' && kind !== 'ProjectReference') return addItem(text, kind, value);
    return text;
}

export function buildPageState(text: string, configuration: string, targets: Set<string> | undefined): PageState {
    const tabs = PROJECT_PROPERTY_TABS.map(tab => {
        const groups: { title: string; fields: PageField[] }[] = [];
        for (const f of PROJECT_PROPERTY_FIELDS.filter(x => x.tab === tab.id)) {
            let group = groups.find(g => g.title === f.group);
            if (!group) groups.push(group = { title: f.group, fields: [] });
            const read = readProperty(text, f.property, configuration);
            const value = read.value ?? '';
            group.fields.push({
                property: f.property,
                value,
                scope: read.scope,
                checked: f.kind === 'check' && value.toLowerCase() === (f.on ?? 'True').toLowerCase(),
                ...fieldAvailability(f, targets),
            });
        }
        return { id: tab.id, label: tab.label, groups };
    });
    // Sources is the IDE's Solution Explorer view of the project, not an options page: no fields.
    tabs.push({ id: 'sources', label: 'Sources', groups: [] });
    const items = listItems(text);
    const outputType = readProperty(text, 'OutputType', configuration).value ?? '';
    return {
        configuration,
        configurations: configurationChoices(text, configuration),
        outputName: readProperty(text, 'OutputName', configuration).value ?? '',
        kind: /^library$/i.test(outputType) ? 'DLL' : /^lib$/i.test(outputType) ? 'LIB' : 'EXE',
        tabs,
        sources: { ...items, driverChoices: FILE_DRIVERS.filter(d => !items.fileDrivers.some(f => f.include.toLowerCase() === d.toLowerCase())) },
    };
}
