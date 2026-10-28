/**
 * #792 — the fields of the Project Properties page: the Clarion IDE's four project-option pages,
 * each field the .cwproj property it writes (names checked against real projects and against the
 * properties SoftVelocity.Build.Clarion.targets reads). No vscode here.
 */
export interface ProjectPropertyTab { id: string; label: string }

export interface ProjectPropertyField {
    tab: string;
    group: string;
    label: string;
    /** The MSBuild property, as the IDE writes it. */
    property: string;
    kind: 'text' | 'select' | 'check';
    options?: { value: string; label: string }[];
    /** A checkbox's stored values. */
    on?: string;
    off?: string;
    checkLabel?: string;
    placeholder?: string;
    note?: string;
    /** Only some installations' build reads it: offered when their targets file does. */
    needsTargets?: boolean;
}

export const PROJECT_PROPERTY_TABS: ProjectPropertyTab[] = [
    { id: 'application', label: 'Application' },
    { id: 'compiling', label: 'Compiling' },
    { id: 'debug', label: 'Debug' },
    { id: 'events', label: 'Build Events' },
];

const check = (tab: string, group: string, label: string, property: string, checkLabel: string, extra: Partial<ProjectPropertyField> = {}): ProjectPropertyField =>
    ({ tab, group, label, property, kind: 'check', on: 'True', off: 'False', checkLabel, ...extra });

export const PROJECT_PROPERTY_FIELDS: ProjectPropertyField[] = [
    { tab: 'application', group: 'Output', label: 'Target name', property: 'OutputName', kind: 'text' },
    { tab: 'application', group: 'Output', label: 'Output path', property: 'OutputPath', kind: 'text', placeholder: 'Beside the project' },
    { tab: 'application', group: 'Output', label: 'Output type', property: 'OutputType', kind: 'select',
        options: [{ value: 'Exe', label: 'Exe' }, { value: 'WinExe', label: 'WinExe' }, { value: 'Library', label: 'Library (DLL)' }, { value: 'Lib', label: 'Lib' }] },
    { tab: 'application', group: 'Output', label: 'Link mode', property: 'Model', kind: 'select',
        // #815: the build task parses <Model> as the IDE's model enum: Dll, Lib, CustomDll.
        options: [{ value: 'Dll', label: 'Dll' }, { value: 'Lib', label: 'Lib' }, { value: 'CustomDll', label: 'CustomDll' }],
        note: 'The runtime: in ClaRUN.dll, or linked in. Not whether this project is a DLL.' },
    { tab: 'application', group: 'Output', label: 'Application icon', property: 'ApplicationIcon', kind: 'text', placeholder: 'None' },

    { tab: 'compiling', group: 'General', label: 'Conditional compilation symbols', property: 'DefineConstants', kind: 'text', placeholder: 'name=>value;name=>value' },
    { tab: 'compiling', group: 'General', label: 'Stack size', property: 'stack_size', kind: 'text', placeholder: '16384' },
    check('compiling', 'General', 'Referenced DLLs', 'CopyCore', 'Copy to the output directory'),
    { tab: 'compiling', group: 'Output', label: 'Debug info', property: 'vid', kind: 'select',
        options: [{ value: 'full', label: 'full' }, { value: 'min', label: 'min' }, { value: 'off', label: 'off' }] },
    { tab: 'compiling', group: 'Output', label: 'Warning level', property: 'warnings', kind: 'select',
        options: [{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }] },
    check('compiling', 'Output', 'MAP file', 'GenerateMap', 'Generate a MAP file'),
    check('compiling', 'Output', 'Line numbers', 'line_numbers', 'Add line numbers to the MAP file'),
    check('compiling', 'Output', 'Dynamic base address', 'dynamic_base', 'Randomise the load address', { needsTargets: true }),
    check('compiling', 'Output', 'Data execution prevention', 'dep', 'Mark the image DEP-compatible', { needsTargets: true }),
    check('compiling', 'Runtime checks', 'Index out of range', 'check_index', 'Check array indexes'),
    check('compiling', 'Runtime checks', 'Stack overflow', 'check_stack', 'Check stack use'),

    { tab: 'debug', group: 'Start action', label: 'Start', property: 'StartAction', kind: 'select',
        options: [{ value: 'Project', label: 'Start the project' }, { value: 'Program', label: 'Start an external program' }, { value: 'StartURL', label: 'Start the browser at a URL' }] },
    { tab: 'debug', group: 'Start action', label: 'External program', property: 'StartProgram', kind: 'text', placeholder: 'Used when Start is an external program' },
    { tab: 'debug', group: 'Start action', label: 'URL', property: 'StartURL', kind: 'text', placeholder: 'Used when Start is the browser' },
    { tab: 'debug', group: 'Start options', label: 'Command line arguments', property: 'StartArguments', kind: 'text', placeholder: 'None' },
    { tab: 'debug', group: 'Start options', label: 'Working directory', property: 'StartWorkingDirectory', kind: 'text', placeholder: 'The output folder' },

    { tab: 'events', group: 'Build events', label: 'Pre-build command line', property: 'PreBuildEvent', kind: 'text', placeholder: 'None' },
    { tab: 'events', group: 'Build events', label: 'Post-build command line', property: 'PostBuildEvent', kind: 'text', placeholder: 'None' },
    { tab: 'events', group: 'Build events', label: 'Run the post-build event', property: 'RunPostBuildEvent', kind: 'select',
        options: [{ value: 'Always', label: 'Always' }, { value: 'OnBuildSuccess', label: 'On a successful build' }, { value: 'OnOutputUpdated', label: 'When the output changes' }] },
];

/**
 * #816 — a source's own pragmas: the IDE's File Options, stored as metadata on the source's
 * Compile item (`<Compile Include="x.clw"><check_index>on</check_index></Compile>`). The build task
 * reads exactly these names and makes each a #pragma for that file alone; the values are the
 * IDE's. Default, the project's setting, is no metadata at all.
 */
export interface SourcePragma {
    /** The metadata name, as the IDE writes it. */
    name: string;
    label: string;
    /** A choice's values; none for free text. */
    options?: string[];
    placeholder?: string;
}

export const SOURCE_PRAGMAS: SourcePragma[] = [
    { name: 'defines', label: 'Defines', placeholder: 'name=>value;name=>value' },
    { name: 'vid', label: 'Debug info', options: ['off', 'full', 'min'] },
    { name: 'warnings', label: 'Warnings', options: ['off', 'on', 'err'] },
    { name: 'line_num', label: 'Line numbers', options: ['on', 'off'] },
    { name: 'check_stack', label: 'Stack overflow check', options: ['on', 'off'] },
    { name: 'check_index', label: 'Index out of range check', options: ['on', 'off'] },
];

/**
 * The Clarion file drivers a project can name in a FileDriver item, as the IDE registers them:
 * the drivers the help documents (In-Memory included) and the IDE's driver list ships.
 */
export const FILE_DRIVERS: string[] = [
    'ASCII', 'BASIC', 'BTRIEVE', 'CLARION', 'CLIPPER', 'DBASE3', 'DBASE4', 'DOS', 'FOXPRO', 'MEMORY',
    'MSSQL', 'ODBC', 'ORACLE', 'SCALABLE', 'SQLANYWHERE', 'SQLite', 'TOPSPEED',
];

/** The properties a build targets file reads: every `$(Name)` in it, lower-cased. */
export function targetsProperties(targetsText: string): Set<string> {
    return new Set([...targetsText.matchAll(/\$\(([A-Za-z_][\w.]*)\)/g)].map(m => m[1].toLowerCase()));
}

/**
 * Whether the page offers a field. One the build reads only on some installations (dep and
 * dynamic_base are in Clarion 12's targets, not Clarion 10's) is held back when the chosen
 * installation's targets do not read it; when the targets could not be read, nothing is.
 */
export function fieldAvailability(field: ProjectPropertyField, targets: Set<string> | undefined): { available: boolean; reason?: string } {
    if (!field.needsTargets || !targets || targets.has(field.property.toLowerCase())) return { available: true };
    return { available: false, reason: 'This installation’s build does not read it (Clarion 12 does).' };
}
