import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';
import { writeIdePreferences } from '../solution/ClarionIdePreferences';
import { buildCwprojContent, buildMinimalExpContent, buildProgramContent, buildSlnContent, generateGuid } from '../solution/SolutionFiles';
import { classifySource, findLibraryFiles, inferProjects, SourceFile } from '../solution/FolderProjectInference';
import { NewProjectSpec, ReviewInput } from '../solution/NewSolutionReview';
import { NewSolutionFolder, showNewSolutionForm } from '../solution/NewSolutionReviewPanel';
import { GlobalSolutionHistory } from '../utils/GlobalSolutionHistory';
import { getLanguageClient, isClientReady } from '../LanguageClientManager';
import { versionPathSettings } from '../utils/VersionPathSettings';
import { ClarionInstallation, ClarionInstallationDetector } from '../utils/ClarionInstallationDetector';

const logger = LoggerManager.getLogger("NewSolutionCommands");
logger.setLevel("error");

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
 * Creates a new Clarion solution in a folder chosen on its page (the open one to start with): from
 * the programs already in it (#763), or a new empty program (.sln + .cwproj + .clw). Made in another
 * folder, the window then opens that folder with the solution.
 */
export async function newSolution(): Promise<void> {
    const openFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

    // The page starts on the default for new solutions (Set Version › Set as default for new
    // solutions), not the version in use, which is the last solution's. With no default it asks,
    // unless there is only one installation and compiler.
    const remembered = {
        propertiesFile: vscode.workspace.getConfiguration('clarion').inspect<string>('activePropertiesFile')?.globalValue || undefined,
        version: vscode.workspace.getConfiguration('clarion').inspect<string>('activeVersion')?.globalValue || undefined,
    };
    // The installations to choose from: the detected ones, and the default's when it is not among
    // them (#479: a ClarionProperties.xml outside the standard locations is never detected).
    const installations = await ClarionInstallationDetector.detectInstallations();
    if (remembered.propertiesFile && fs.existsSync(remembered.propertiesFile)
        && !installations.some(i => i.propertiesPath.toLowerCase() === remembered.propertiesFile!.toLowerCase())) {
        const current = await ClarionInstallationDetector.parseInstallationFromPropertiesPath(remembered.propertiesFile);
        if (current) installations.push(current);
    }

    /** #763: what a folder offers: the programs already in it, and its proposal for a selection. */
    const readFolder = async (folderPath: string): Promise<NewSolutionFolder> => {
        const scan = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: 'Reading the Clarion sources in this folder' },
            () => readSourceFiles(folderPath));
        let programs = 0;
        if (!scan.tooLarge) {
            if (scan.unreadable > 0) {
                vscode.window.showWarningMessage(`${plural(scan.unreadable, 'file or folder')} could not be read and ${scan.unreadable === 1 ? 'is' : 'are'} not part of the new solution.`);
            }
            programs = scan.files.filter(f => /\.clw$/i.test(f.relPath) && classifySource(f.text).kind === 'program').length;
        }
        return {
            programs,
            tooLarge: scan.tooLarge,
            /**
             * The library sources the folder's directives reach through the selection's redirection
             * (a MAP MODULE in CWUTIL.INC needs cwutil.clw listed; without the server, the folder
             * alone is used), and where each program's export file would be found.
             */
            review: async (installation: ClarionInstallation, compilerName: string, configuration: string): Promise<ReviewInput> => {
                const libraries = await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Window, title: 'Finding the library sources this folder uses' },
                    () => findLibraryFiles(scan.files,
                        names => lookupLibrarySources(folderPath, installation, compilerName, configuration, names),
                        readLibraryFile));
                const inference = inferProjects(scan.files, libraries);
                const exportFiles = await findExportFiles(folderPath, installation, compilerName, configuration,
                    inference.projects.map(p => `${p.name}.exp`));
                return { folder: folderPath, files: scan.files, libraries, inference, exportFiles, compiler: compilerName, sourceCount: scan.files.length };
            },
        };
    };

    // #792 — one page asks everything: the folder, the installation, compiler version and
    // configuration, the programs in the folder or a new empty program (and its main file), and the name.
    const choice = await showNewSolutionForm(openFolder, readFolder, installations, remembered);
    if (!choice) return;
    const folderPath = choice.folder;
    const installResult = { installation: choice.installation, compilerName: choice.compiler };
    const configChoice = choice.configuration;
    const trimmedName = choice.name;
    const slnPath = path.join(folderPath, `${trimmedName}.sln`);

    let specs: NewProjectSpec[];
    let clwPath: string | undefined;
    if (choice.start === 'programs') {
        specs = choice.specs;
    } else {
        clwPath = path.join(folderPath, choice.mainFile);
        specs = [{ name: trimmedName, guid: generateGuid(), compile: [choice.mainFile], kind: 'exe' }];
    }

    const cwprojPaths = specs.map(s => path.join(folderPath, `${s.name}.cwproj`));
    // Step 6: Warn if any file already exists
    if (!await confirmOverwrite([slnPath, ...cwprojPaths, ...(clwPath ? [clwPath] : [])])) return;

    // Step 7: All user interaction done — write files
    const startup = specs.find(s => s.kind === 'exe') ?? specs[0];
    try {
        fs.writeFileSync(slnPath, buildSlnContent(specs), 'utf8');
        specs.forEach((s, i) => fs.writeFileSync(cwprojPaths[i], buildCwprojContent(s), 'utf8'));
        if (clwPath) fs.writeFileSync(clwPath, buildProgramContent('exe', trimmedName), 'utf8');
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

    if (choice.start === 'programs' && choice.missingProgram.length > 0) {
        const m = choice.missingProgram.length;
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

    // Made in another folder (or with none open): the window opens that folder, and the restarted
    // window loads the solution from the history, with the selection made for it (#780).
    if (!openFolder || path.resolve(openFolder).toLowerCase() !== path.resolve(folderPath).toLowerCase()) {
        await GlobalSolutionHistory.addSolution(slnPath, folderPath,
            installResult.installation.propertiesPath, installResult.compilerName, configChoice);
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), false);
        return;
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
