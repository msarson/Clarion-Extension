import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';
import { SmartSolutionOpener } from '../utils/SmartSolutionOpener';
import { writeIdePreferences } from '../solution/ClarionIdePreferences';
import { buildCwprojContent, buildSlnContent, CwprojSpec, generateGuid } from '../solution/SolutionFiles';
import { FolderInference, inferProjects, SourceFile } from '../solution/FolderProjectInference';

const logger = LoggerManager.getLogger("NewSolutionCommands");
logger.setLevel("error");

function buildClwContent(): string {
    return [
        '  PROGRAM',
        '',
        '  MAP',
        '  END',
        '',
        '  CODE',
        "  MESSAGE('Hello World')"
    ].join('\r\n');
}

/** Folders a source scan never enters: hidden ones (.git, .vscode) and build output. */
const SKIP_DIRS = new Set(['node_modules', 'obj', 'bin']);

/** #763 — every .clw/.inc/.equ under the folder, paths relative to it. */
async function readSourceFiles(folderPath: string): Promise<SourceFile[]> {
    const files: SourceFile[] = [];
    const walk = async (dir: string): Promise<void> => {
        for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name.toLowerCase())) await walk(full);
            } else if (/\.(clw|inc|equ)$/i.test(entry.name)) {
                // Clarion source is ANSI; latin1 keeps every byte, and the rules only read ASCII keywords.
                files.push({ relPath: path.relative(folderPath, full), text: await fs.promises.readFile(full, 'latin1') });
            }
        }
    };
    await walk(folderPath);
    return files;
}

async function promptSolutionName(defaultName: string): Promise<string | undefined> {
    const solutionName = await vscode.window.showInputBox({
        prompt: 'Solution name',
        value: defaultName,
        validateInput: (v) => {
            if (!v || v.trim().length === 0) return 'Solution name cannot be empty';
            if (/[\\/:*?"<>|]/.test(v)) return 'Solution name contains invalid characters';
            return undefined;
        }
    });
    return solutionName?.trim();
}

/** Asks before overwriting; true when the files may be written. */
async function confirmOverwrite(paths: string[]): Promise<boolean> {
    const existing = paths.filter(f => fs.existsSync(f));
    if (existing.length === 0) return true;
    const names = existing.map(f => path.basename(f)).join(', ');
    const answer = await vscode.window.showWarningMessage(
        `The following file(s) already exist: ${names}. Overwrite?`,
        { modal: true },
        'Overwrite'
    );
    return answer === 'Overwrite';
}

/**
 * #763 — the user confirms what the folder inference proposed: which programs become projects,
 * which of them are DLLs, where the modules named after no program go, and whether possible
 * leftovers are compiled. Returns the projects to write, or undefined when cancelled.
 */
async function confirmProjects(inference: FolderInference): Promise<CwprojSpec[] | undefined> {
    const programItems = inference.projects.map(p => ({
        label: p.name,
        description: `${p.kind === 'dll' ? 'DLL' : 'EXE'} · ${p.compile.length} source file${p.compile.length === 1 ? '' : 's'}`,
        detail: p.programFile,
        picked: true,
        project: p,
    }));
    const chosen = await vscode.window.showQuickPick(programItems, {
        title: 'New solution: one project per program',
        placeHolder: 'Untick a program to leave it out',
        canPickMany: true,
        ignoreFocusOut: true,
    });
    if (!chosen || chosen.length === 0) return undefined;
    const projects = chosen.map(c => c.project);

    const dllItems = projects.map(p => ({ label: p.name, description: p.programFile, picked: p.kind === 'dll', project: p }));
    const dlls = await vscode.window.showQuickPick(dllItems, {
        title: 'New solution: which projects are DLLs?',
        placeHolder: 'Ticked: a DLL (its main CODE is empty). Unticked: an EXE.',
        canPickMany: true,
        ignoreFocusOut: true,
    });
    if (!dlls) return undefined;
    const dllNames = new Set(dlls.map(d => d.project));
    const specs = projects.map(p => ({ name: p.name, guid: generateGuid(), compile: [...p.compile], kind: dllNames.has(p) ? 'dll' as const : 'exe' as const }));

    for (const module of inference.unassigned) {
        const LEAVE_OUT = 'Leave it out';
        const pick = await vscode.window.showQuickPick([...specs.map(s => s.name), LEAVE_OUT], {
            title: `New solution: ${module} names no program`,
            placeHolder: `Which project compiles ${module}?`,
            ignoreFocusOut: true,
        });
        if (pick === undefined) return undefined;
        specs.find(s => s.name === pick)?.compile.push(module);
    }

    const leftoverItems = projects.flatMap((p, i) => p.unreferenced.map(m => ({
        label: m, description: specs[i].name, picked: true, spec: specs[i],
    })));
    if (leftoverItems.length > 0) {
        const keep = await vscode.window.showQuickPick(leftoverItems, {
            title: `New solution: ${leftoverItems.length} module${leftoverItems.length === 1 ? '' : 's'} nothing calls through a MODULE`,
            placeHolder: 'A generator can leave old modules behind. Untick the ones the project no longer uses.',
            canPickMany: true,
            ignoreFocusOut: true,
        });
        if (!keep) return undefined;
        const kept = new Set(keep);
        for (const item of leftoverItems) {
            if (!kept.has(item)) item.spec.compile = item.spec.compile.filter(f => f !== item.label);
        }
    }
    return specs;
}

/**
 * Creates a new Clarion solution in the open workspace folder: from the programs already in it
 * (#763), or a new empty program (.sln + .cwproj + .clw).
 */
export async function newSolution(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Open a folder first before creating a new Clarion solution.');
        return;
    }

    const folderPath = workspaceFolders[0].uri.fsPath;
    const defaultName = path.basename(folderPath);

    // Step 1: Pick Clarion version/compiler before prompting for names
    const installResult = await SmartSolutionOpener.detectAndPickInstallation();
    if (!installResult) return;

    // Step 2: Pick build configuration (no .sln exists yet, offer standard options)
    const configChoice = await vscode.window.showQuickPick(['Debug', 'Release'], {
        placeHolder: 'Select build configuration'
    });
    if (!configChoice) return;

    // Step 3 (#763): a folder that already has programs can become their solution
    let inference: FolderInference | undefined;
    try {
        const sources = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: 'Reading the Clarion sources in this folder' },
            () => readSourceFiles(folderPath));
        inference = inferProjects(sources);
    } catch (err) {
        logger.error(`❌ Could not read the folder's sources: ${err}`);
    }
    let specs: CwprojSpec[] | undefined;
    if (inference && inference.projects.length > 0) {
        const n = inference.projects.length;
        const FROM_SOURCES = `From the ${n} program${n === 1 ? '' : 's'} in this folder`;
        const choice = await vscode.window.showQuickPick([FROM_SOURCES, 'A new empty program'], {
            placeHolder: 'Build the new solution from…'
        });
        if (!choice) return;
        if (choice === FROM_SOURCES) {
            specs = await confirmProjects(inference);
            if (!specs) return;
        }
    }

    // Step 4: Prompt for solution name
    const trimmedName = await promptSolutionName(defaultName);
    if (!trimmedName) return;
    const slnPath = path.join(folderPath, `${trimmedName}.sln`);

    let clwPath: string | undefined;
    if (!specs) {
        // Step 5: Prompt for main CLW filename
        const clwInput = await vscode.window.showInputBox({
            prompt: 'Main source file name',
            value: `${trimmedName}.clw`,
            validateInput: (v) => {
                if (!v || v.trim().length === 0) return 'File name cannot be empty';
                if (!v.trim().toLowerCase().endsWith('.clw')) return 'File must have a .clw extension';
                if (/[\\/:*?"<>|]/.test(v.trim())) return 'File name contains invalid characters';
                return undefined;
            }
        });
        if (!clwInput) return;
        const clwName = clwInput.trim();
        clwPath = path.join(folderPath, clwName);
        specs = [{ name: trimmedName, guid: generateGuid(), compile: [clwName], kind: 'exe' }];
    }

    const cwprojPaths = specs.map(s => path.join(folderPath, `${s.name}.cwproj`));
    // Step 6: Warn if any file already exists
    if (!await confirmOverwrite([slnPath, ...cwprojPaths, ...(clwPath ? [clwPath] : [])])) return;

    // Step 7: All user interaction done — write files
    const startup = specs.find(s => s.kind === 'exe') ?? specs[0];
    try {
        fs.writeFileSync(slnPath, buildSlnContent(specs), 'utf8');
        specs.forEach((s, i) => fs.writeFileSync(cwprojPaths[i], buildCwprojContent(s), 'utf8'));
        if (clwPath) fs.writeFileSync(clwPath, buildClwContent(), 'utf8');
        logger.info(`✅ Created new solution: ${trimmedName} (${specs.length} project(s)) in ${folderPath}`);

        // Create the Clarion IDE preferences XML so the IDE recognises startup project + config
        await writeIdePreferences(slnPath, installResult.installation.propertiesPath, {
            startupProjectGuid: startup.guid,
            activeConfiguration: configChoice,
            activePlatform: 'Win32'
        });
    } catch (err) {
        logger.error(`❌ Failed to create solution files: ${err}`);
        vscode.window.showErrorMessage(`Failed to create solution: ${err instanceof Error ? err.message : String(err)}`);
        return;
    }

    if (!clwPath && inference && inference.missingProgram.length > 0) {
        const m = inference.missingProgram.length;
        vscode.window.showInformationMessage(
            `${m} module${m === 1 ? ' names a program' : 's name programs'} not in this folder and ${m === 1 ? 'was' : 'were'} left out.`);
    }
    // A DLL links only with its export file, <name>.exp beside the project; the generator writes
    // it, but it is often not kept with the sources.
    const noExp = specs.filter(s => s.kind === 'dll' && !fs.existsSync(path.join(folderPath, `${s.name}.exp`))).map(s => s.name);
    if (noExp.length > 0) {
        vscode.window.showWarningMessage(
            `${noExp.join(', ')} ${noExp.length === 1 ? 'is a DLL and needs' : 'are DLLs and need'} an export file (${noExp.map(n => n + '.exp').join(', ')}) in this folder before ${noExp.length === 1 ? 'it builds' : 'they build'}.`);
    }

    // Step 8: Open with pre-selected values — skips all pickers in openDetectedSolution
    await vscode.commands.executeCommand('clarion.openDetectedSolution', slnPath, {
        installation: installResult.installation,
        compilerName: installResult.compilerName,
        configuration: configChoice
    });
}

export function registerNewSolutionCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('clarion.newSolution', newSolution)
    ];
}
