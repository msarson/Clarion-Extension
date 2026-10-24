/**
 * #792 — New Solution's review page, without vscode: what the page shows for the user's current
 * choices, and the projects those choices give. The page replaces #763's chain of quick picks
 * (programs, DLLs, modules to place, leftovers, then the name and the configuration), so its
 * defaults are theirs and its result is what they returned once references and exports were
 * worked out from the final compile lists.
 */
import * as path from 'path';
import { FolderInference, inferProjects, InferredProject, SourceFile } from './FolderProjectInference';
import { CwprojSpec, generateGuid } from './SolutionFiles';

/** A project New Solution writes: its program file, and whether its prototypes mark exports (a DLL's .exp). */
export type NewProjectSpec = CwprojSpec & { programFile?: string; exportsMarked?: boolean };

/** What the page is built from: the folder's inference under the chosen configuration's redirection. */
export interface ReviewInput {
    folder: string;
    files: SourceFile[];
    libraries: SourceFile[];
    inference: FolderInference;
    /** Where redirection or the folder finds an export file, by its name (<project>.exp). */
    exportFiles: Record<string, string>;
    /** The Clarion version the solution builds with, as the installation names it. */
    compiler: string;
    /** The .clw/.inc/.equ files the folder holds. */
    sourceCount: number;
}

/** The user's choices, keyed by program file (projects) and relative path (modules). */
export interface ReviewChoices {
    included: Record<string, boolean>;
    kinds: Record<string, 'exe' | 'dll'>;
    /** The project a module to place goes to; '' leaves it out. */
    placement: Record<string, string>;
    /** Whether a possible leftover stays compiled. */
    kept: Record<string, boolean>;
    name: string;
    configuration: string;
}

export interface ReviewResult { specs: NewProjectSpec[]; name: string; configuration: string }

export type ExportTone = 'good' | 'warn' | 'bad' | 'muted';
/** What happens to a project's export file, and what the user should know about it. */
export interface ExportFileStatus { text: string; tone: ExportTone; detail?: string }
export interface ReviewState {
    title: string;
    summary: string;
    /** What the page leaves out on purpose; empty when nothing is. */
    note: string;
    projects: {
        programFile: string; name: string; why: string; included: boolean; kind: 'exe' | 'dll';
        sources: string; references: string[]; exportFile: ExportFileStatus;
    }[];
    toPlace: { file: string; why: string; value: string; options: { value: string; label: string }[] }[];
    leftovers: { file: string; project: string; kept: boolean }[];
    name: string;
    nameError?: string;
    configuration: string;
    configurations: string[];
    createLabel: string;
    canCreate: boolean;
}

export const CONFIGURATIONS = ['Debug', 'Release'];
const LEAVE_OUT = 'Leave it out';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function solutionNameError(name: string): string | undefined {
    if (!name || name.trim().length === 0) return 'Solution name cannot be empty';
    if (/[\\/:*?"<>|]/.test(name)) return 'Solution name contains invalid characters';
    return undefined;
}

/** Modules the inference could not place: named after no program, or naming a program more than one folder holds. */
function modulesToPlace(inference: FolderInference) {
    return [
        ...inference.unassigned.map(file => ({ file, why: 'MEMBER() names no program', candidates: undefined as string[] | undefined })),
        ...inference.ambiguous.map(a => ({ file: a.file, why: 'MEMBER names a program more than one folder holds', candidates: a.candidates as string[] | undefined })),
    ];
}

const isIncluded = (choices: ReviewChoices, p: InferredProject) => choices.included[p.programFile] ?? true;
const kindOf = (choices: ReviewChoices, p: InferredProject) => choices.kinds[p.programFile] ?? p.kind;

/**
 * Where each module to place goes: the project chosen while it is still included, '' when the user
 * left it out, else the first project offered (the quick pick's first item, which Enter took).
 */
function placements(inference: FolderInference, choices: ReviewChoices) {
    const included = inference.projects.filter(p => isIncluded(choices, p)).map(p => p.name);
    return modulesToPlace(inference).map(m => {
        const offered = m.candidates ? included.filter(n => m.candidates!.includes(n)) : included;
        const chosen = choices.placement[m.file];
        const value = chosen === '' ? '' : chosen !== undefined && offered.includes(chosen) ? chosen : offered[0] ?? '';
        return { ...m, offered, value };
    });
}

/** Today's quick-pick defaults: every program, EXE or DLL as inferred, the first project for a module, every leftover kept. */
export function defaultChoices(inference: FolderInference, name: string): ReviewChoices {
    const choices: ReviewChoices = { included: {}, kinds: {}, placement: {}, kept: {}, name, configuration: CONFIGURATIONS[0] };
    for (const p of inference.projects) {
        choices.included[p.programFile] = true;
        choices.kinds[p.programFile] = p.kind;
        p.unreferenced.forEach(m => choices.kept[m] = true);
    }
    for (const m of placements(inference, choices)) choices.placement[m.file] = m.value;
    return choices;
}

/**
 * The projects the choices give, before references and exports are worked out (what #763's
 * confirmProjects returned): the included programs in order, each module placed appended to its
 * project, and the leftovers the user unticked dropped.
 */
export function chosenSpecs(inference: FolderInference, choices: ReviewChoices, guid: () => string = generateGuid): NewProjectSpec[] {
    const projects = inference.projects.filter(p => isIncluded(choices, p));
    const specs: NewProjectSpec[] = projects.map(p => ({ name: p.name, guid: guid(), compile: [...p.compile], kind: kindOf(choices, p), programFile: p.programFile }));
    for (const m of placements(inference, choices)) specs.find(s => s.name === m.value)?.compile.push(m.file);
    projects.forEach((p, i) => {
        for (const m of p.unreferenced) {
            if (choices.kept[m] === false) specs[i].compile = specs[i].compile.filter(f => f !== m);
        }
    });
    return specs;
}

/** The inference redone from the settled compile lists; the page asks again for every change, so the same lists are worked out once. */
const settledCache = new WeakMap<ReviewInput, Map<string, FolderInference>>();
function settledInference(input: ReviewInput, specs: NewProjectSpec[]): FolderInference {
    let cache = settledCache.get(input);
    if (!cache) settledCache.set(input, cache = new Map());
    const key = JSON.stringify(specs.map(s => [s.programFile, s.compile]));
    let settled = cache.get(key);
    if (!settled) {
        settled = inferProjects(input.files, input.libraries, { compile: new Map(specs.map(s => [s.programFile!, s.compile])) });
        cache.set(key, settled);
    }
    return settled;
}

/**
 * What the user settled on (modules placed, leftovers unticked) decides the libraries listed, the
 * projects referenced and whether a DLL marks its exports: work them out again from the final
 * compile lists.
 */
function settle(input: ReviewInput, specs: NewProjectSpec[]): NewProjectSpec[] {
    const settled = settledInference(input, specs);
    for (const spec of specs) {
        const project = settled.projects.find(p => p.programFile === spec.programFile);
        if (!project) continue;
        spec.compile = [...project.compile];
        spec.exportsMarked = project.exportsMarked;
        // Only projects the user kept: a reference to an unticked program is dropped.
        spec.references = project.references
            .map(name => specs.find(other => other.name === name))
            .filter((other): other is NewProjectSpec => !!other)
            .map(other => ({ name: other.name, guid: other.guid }));
    }
    return specs;
}

/** The projects to write, the solution name and configuration; undefined while nothing can be created. */
export function reviewResult(input: ReviewInput, choices: ReviewChoices, guid: () => string = generateGuid): ReviewResult | undefined {
    if (solutionNameError(choices.name)) return undefined;
    const specs = chosenSpecs(input.inference, choices, guid);
    if (specs.length === 0) return undefined;
    return { specs: settle(input, specs), name: choices.name.trim(), configuration: choices.configuration };
}

/** Where an export file was found, as the page says it: the folder, a folder in it, or the full path elsewhere. */
function foundIn(folder: string, file: string): string {
    const dir = path.win32.dirname(file);
    const rel = path.win32.relative(folder, dir);
    if (rel === '') return 'the folder';
    return rel.startsWith('..') || path.win32.isAbsolute(rel) ? dir : rel;
}

/**
 * What happens to a project's export file once the solution is created: a DLL links only with
 * <name>.exp, found through redirection; missing, it is written when the prototypes mark EXPORT.
 */
function exportFileStatus(input: ReviewInput, name: string, kind: 'exe' | 'dll', exportsMarked: boolean): ExportFileStatus {
    if (kind === 'exe') return { text: 'Not needed for an EXE', tone: 'muted' };
    const expName = `${name}.exp`;
    const found = Object.entries(input.exportFiles).find(([n]) => n.toLowerCase() === expName.toLowerCase())?.[1];
    if (found) return { text: `Found in ${foundIn(input.folder, found)}`, tone: 'good' };
    // What New Solution says once the files are written, said here before the user confirms.
    if (exportsMarked) return { text: 'Will be written: exports marked EXPORT', tone: 'warn', detail: 'The DLL exports only the procedures marked EXPORT.' };
    return { text: 'Missing', tone: 'bad', detail: `Generate the application in the Clarion IDE to write ${expName}, or mark the exported procedures with EXPORT.` };
}

export function buildReviewState(input: ReviewInput, choices: ReviewChoices): ReviewState {
    const { inference } = input;
    let n = 0;
    const specs = settle(input, chosenSpecs(inference, choices, () => `${n++}`));
    // A library source is listed by bare name, and is no file of the folder.
    const folderFiles = new Set(input.files.map(f => f.relPath));

    const projects = inference.projects.map(p => {
        const spec = specs.find(s => s.programFile === p.programFile);
        const kind = kindOf(choices, p);
        const compile = spec?.compile ?? p.compile;
        const libraries = compile.filter(f => !folderFiles.has(f));
        const sources = plural(compile.length - libraries.length, 'file')
            + (libraries.length === 0 ? '' : ' + ' + (libraries.length <= 2 ? libraries.join(', ') : plural(libraries.length, 'library source')));
        return {
            programFile: p.programFile,
            name: p.name,
            why: p.kind === 'dll' ? 'Main CODE is empty' : 'Main CODE runs the program',
            included: !!spec,
            kind,
            sources,
            references: spec?.references?.map(r => r.name) ?? [],
            exportFile: exportFileStatus(input, p.name, kind, spec?.exportsMarked ?? p.exportsMarked),
        };
    });

    const toPlace = placements(inference, choices).map(m => ({
        file: m.file,
        why: m.why,
        value: m.value,
        options: [...m.offered.map(name => ({ value: name, label: name })), { value: '', label: LEAVE_OUT }],
    }));

    const leftovers = inference.projects.filter(p => isIncluded(choices, p))
        .flatMap(p => p.unreferenced.map(file => ({ file, project: p.name, kept: choices.kept[file] ?? true })));

    const classes = inference.classImplementations.length;
    const notes: string[] = [];
    if (classes > 0) {
        notes.push(classes === 1
            ? '1 class implementation is built by its CLASS\'s LINK and is not listed.'
            : `${classes} class implementations are built by their CLASS's LINK and are not listed.`);
        if (input.libraries.length > 0) notes.push('Library sources are listed only where a project calls them.');
    }

    const nameError = solutionNameError(choices.name);
    const summary = `${plural(inference.projects.length, 'program')} in ${plural(input.sourceCount, 'source file')}`
        + (input.libraries.length > 0 ? `, ${plural(input.libraries.length, 'library source')} through redirection` : '')
        + ` · ${input.compiler} · ${choices.configuration}`;
    return {
        title: `New solution from ${input.folder}`,
        summary,
        note: notes.join(' '),
        projects,
        toPlace,
        leftovers,
        name: choices.name,
        nameError,
        configuration: choices.configuration,
        configurations: CONFIGURATIONS,
        createLabel: `Create ${plural(specs.length, 'project')}`,
        canCreate: specs.length > 0 && !nameError,
    };
}
