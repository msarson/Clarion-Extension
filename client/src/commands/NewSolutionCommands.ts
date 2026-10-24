import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';
import { SmartSolutionOpener } from '../utils/SmartSolutionOpener';
import { writeIdePreferences } from '../solution/ClarionIdePreferences';
import { buildCwprojContent, buildMinimalExpContent, buildSlnContent, generateGuid } from '../solution/SolutionFiles';
import { classifySource, FolderInference, findLibraryFiles, inferProjects, SourceFile } from '../solution/FolderProjectInference';
import { CONFIGURATIONS, NewProjectSpec, ReviewInput, ReviewResult, solutionNameError } from '../solution/NewSolutionReview';
import { showNewSolutionReview } from '../solution/NewSolutionReviewPanel';
import { getLanguageClient, isClientReady } from '../LanguageClientManager';
import { versionPathSettings } from '../utils/VersionPathSettings';
import { ClarionInstallation } from '../utils/ClarionInstallationDetector';

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

/** A folder past this is not one application's sources (a drive or home folder): the scan stops. */
const MAX_SOURCE_FILES = 50000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface SourceScan { files: SourceFile[]; unreadable: number; tooLarge: boolean }

/**
 * #763 — every .clw/.inc/.equ under the folder, paths relative to it. Links are not followed
 * (a linked file or folder can lead outside it), and a folder that cannot be read is counted and
 * skipped rather than ending the scan.
 */
async function readSourceFiles(folderPath: string): Promise<SourceScan> {
    const scan: SourceScan = { files: [], unreadable: 0, tooLarge: false };
    const walk = async (dir: string): Promise<void> => {
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            scan.unreadable++;
            return;
        }
        for (const entry of entries) {
            if (scan.tooLarge) return;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name.toLowerCase())) await walk(full);
            } else if (entry.isFile() && /\.(clw|inc|equ)$/i.test(entry.name)) {
                if (scan.files.length >= MAX_SOURCE_FILES) { scan.tooLarge = true; return; }
                try {
                    // Clarion source is ANSI; latin1 keeps every byte, and the rules only read ASCII keywords.
                    scan.files.push({ relPath: path.relative(folderPath, full), text: await fs.promises.readFile(full, 'latin1') });
                } catch {
                    scan.unreadable++;
                }
            }
        }
    };
    await walk(folderPath);
    return scan;
}

/**
 * #763 — where the chosen installation's redirection finds `names` for this folder (Clarion's
 * libsrc, accessories): the server's own resolver, given this installation's paths and macros
 * because no solution is loaded yet. Throws when the server cannot answer.
 */
async function lookupLibrarySources(
    folderPath: string,
    installation: ClarionInstallation,
    compilerName: string,
    configuration: string,
    names: string[]
): Promise<Record<string, string>> {
    const client = getLanguageClient();
    const version = installation.compilerVersions.find(v => v.name === compilerName);
    try {
        if (!client || !isClientReady() || !version) throw new Error('the language server is not ready, or the compiler version was not found');
        return await client.sendRequest<Record<string, string>>('clarion/resolveSourceFiles', {
            folder: folderPath,
            settings: { ...versionPathSettings(version), configuration },
            names,
        });
    } catch (err) {
        // The search then ends with what it has, and the folder alone decides: say so in the log.
        logger.warn(`⚠️ Library sources not resolved, New Solution uses the folder alone: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
    }
}

/** A library file larger than this is no Clarion source New Solution needs to read. */
const MAX_LIBRARY_FILE_BYTES = 4 * 1024 * 1024;

/** Reads a library file the server found, or nothing when it is unreadable or too large. */
async function readLibraryFile(filePath: string): Promise<string | undefined> {
    try {
        if ((await fs.promises.stat(filePath)).size > MAX_LIBRARY_FILE_BYTES) return undefined;
        return await fs.promises.readFile(filePath, 'latin1');
    } catch {
        return undefined;
    }
}

/**
 * #792 — where each of `names` (export files) is found before the review page shows them: through
 * the installation's redirection, else in the folder itself. The page says what will happen to
 * each; after confirmation the files are looked up again exactly as before.
 */
async function findExportFiles(
    folderPath: string,
    installation: ClarionInstallation,
    compilerName: string,
    configuration: string,
    names: string[]
): Promise<Record<string, string>> {
    let found: Record<string, string> = {};
    if (names.length === 0) return found;
    try {
        found = { ...await lookupLibrarySources(folderPath, installation, compilerName, configuration, names) };
    } catch {
        // Logged by the lookup; the folder itself is still checked below.
    }
    for (const name of names) {
        if (!found[name] && fs.existsSync(path.join(folderPath, name))) found[name] = path.join(folderPath, name);
    }
    return found;
}

async function promptSolutionName(defaultName: string): Promise<string | undefined> {
    const solutionName = await vscode.window.showInputBox({
        prompt: 'Solution name',
        value: defaultName,
        validateInput: (v) => solutionNameError(v)
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

    // Step 2 (#763): a folder that already has programs can become their solution
    const scan = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Reading the Clarion sources in this folder' },
        () => readSourceFiles(folderPath));
    let programs = 0;
    if (scan.tooLarge) {
        // Part of a folder would give wrong projects: offer only the empty program.
        vscode.window.showWarningMessage(`This folder holds more than ${MAX_SOURCE_FILES} Clarion source files, so New Solution does not build projects from them. Open the application's own folder to do that.`);
    } else {
        if (scan.unreadable > 0) {
            vscode.window.showWarningMessage(`${plural(scan.unreadable, 'file or folder')} could not be read and ${scan.unreadable === 1 ? 'is' : 'are'} not part of the new solution.`);
        }
        programs = scan.files.filter(f => /\.clw$/i.test(f.relPath) && classifySource(f.text).kind === 'program').length;
    }

    /**
     * The folder's proposal under a configuration: library sources the folder's directives reach
     * through its redirection (a MAP MODULE in CWUTIL.INC needs cwutil.clw listed; without the
     * server, the folder alone is used), and where each program's export file would be found.
     */
    const reviewInput = async (configuration: string): Promise<ReviewInput> => {
        const libraries = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: 'Finding the library sources this folder uses' },
            () => findLibraryFiles(scan.files,
                names => lookupLibrarySources(folderPath, installResult.installation, installResult.compilerName, configuration, names),
                readLibraryFile));
        const inference = inferProjects(scan.files, libraries);
        const exportFiles = await findExportFiles(folderPath, installResult.installation, installResult.compilerName, configuration,
            inference.projects.map(p => `${p.name}.exp`));
        return { folder: folderPath, files: scan.files, libraries, inference, exportFiles, compiler: installResult.compilerName, sourceCount: scan.files.length };
    };

    // Step 3 (#792): from the programs, one review page settles the projects, the solution name
    // and the configuration; an empty program asks for them in turn.
    let inference: FolderInference | undefined;
    let review: ReviewResult | undefined;
    if (programs > 0) {
        const FROM_SOURCES = `From the ${plural(programs, 'program')} in this folder`;
        const choice = await vscode.window.showQuickPick([FROM_SOURCES, 'A new empty program'], {
            placeHolder: 'Build the new solution from…'
        });
        if (!choice) return;
        if (choice === FROM_SOURCES) {
            const input = await reviewInput(CONFIGURATIONS[0]);
            inference = input.inference;
            review = await showNewSolutionReview(input, defaultName, reviewInput);
            if (!review) return;
        }
    }

    let specs: NewProjectSpec[] | undefined = review?.specs;
    let configChoice: string;
    let trimmedName: string;
    if (review) {
        configChoice = review.configuration;
        trimmedName = review.name;
    } else {
        // Pick build configuration (no .sln exists yet, offer standard options)
        const picked = await vscode.window.showQuickPick(CONFIGURATIONS, {
            placeHolder: 'Select build configuration'
        });
        if (!picked) return;
        configChoice = picked;

        // Step 4: Prompt for solution name
        const named = await promptSolutionName(defaultName);
        if (!named) return;
        trimmedName = named;
    }
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
            `${plural(m, 'module')} ${m === 1 ? 'names a program' : 'name programs'} not in this folder and ${m === 1 ? 'was' : 'were'} left out.`);
    }
    // #763: a DLL links only with its export file, <name>.exp, which the build finds through
    // redirection (a generated tree keeps it in genFiles\exp). Missing, a DLL that marks its
    // exports with EXPORT gets a minimal one; a generated DLL lists its exports in the .exp the
    // application generator writes, which cannot be made up here.
    const dllSpecs = specs.filter(s => s.kind === 'dll');
    let foundExp: Record<string, string> = {};
    if (dllSpecs.length > 0) {
        try {
            foundExp = await lookupLibrarySources(folderPath, installResult.installation, installResult.compilerName, configChoice, dllSpecs.map(s => `${s.name}.exp`));
        } catch {
            // Logged by the lookup; the folder itself is still checked below.
        }
    }
    const written: string[] = [], needGenerator: string[] = [];
    for (const spec of dllSpecs) {
        const expName = `${spec.name}.exp`;
        if (foundExp[expName] || fs.existsSync(path.join(folderPath, expName))) continue;
        if (spec.exportsMarked) {
            try {
                fs.writeFileSync(path.join(folderPath, expName), buildMinimalExpContent(spec.name), 'utf8');
                written.push(expName);
            } catch (err) {
                logger.error(`❌ Could not write ${expName}: ${err}`);
                needGenerator.push(spec.name);
            }
        } else {
            needGenerator.push(spec.name);
        }
    }
    if (written.length > 0) {
        // Some EXPORT attributes do not make the list complete: a procedure another project calls
        // without EXPORT on its prototype is not exported, so say what the file does.
        vscode.window.showInformationMessage(
            `Wrote ${written.join(', ')} with an empty export list, so ${written.length === 1 ? 'the DLL exports' : 'the DLLs export'} only the procedures their prototypes mark EXPORT. ` +
            `A procedure other projects call without EXPORT needs the attribute, or a line in the .exp.`);
    }
    if (needGenerator.length > 0) {
        vscode.window.showWarningMessage(
            `${needGenerator.join(', ')} ${needGenerator.length === 1 ? 'is a DLL whose export file was' : 'are DLLs whose export files were'} not found (${needGenerator.map(n => n + '.exp').join(', ')}). ` +
            `Generate the application in the Clarion IDE to write ${needGenerator.length === 1 ? 'it' : 'them'}, or mark the exported procedures with EXPORT.`);
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
