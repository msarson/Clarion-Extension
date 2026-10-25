import { commands, window, workspace, Uri, Disposable } from 'vscode';
import * as path from 'path';
import { SolutionCache } from '../SolutionCache';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { includeFor, ItemKind, listItems, removeItem } from '../project/CwprojItems';
import { FILE_DRIVERS } from '../project/ProjectPropertyFields';
import { applyText } from '../project/ProjectPropertiesEditor';
import { folderAddition, isSolutionProjectFile, referenceCandidates } from '../views/ProjectFolders';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("ProjectFolderCommands");
logger.setLevel("error");

/** What a Solution View folder or entry node carries (#803). */
interface FolderNodeData { type: string; kind: ItemKind; cwproj: string; projectPath: string; projectName: string; include?: string }
type Pick = { include: string; guid?: string; name?: string };

/**
 * #803 — Add on a Solution View folder and Remove on an entry, as the Clarion IDE's Solution
 * Explorer offers them. The change is an edit of the .cwproj, the same as the Project Properties
 * Sources tab makes, saved at once as the IDE does (and undone like any other edit).
 */
export function registerProjectFolderCommands(solutionTreeDataProvider: SolutionTreeDataProvider | undefined): Disposable[] {
    /**
     * The change, saved at once as the IDE does. When the .cwproj already has unsaved changes (the
     * Project Properties page leaves its edits unsaved), saving would write them too: ask first, and
     * otherwise leave this change unsaved beside them. The tree reads the .cwproj from disk, so it
     * is redrawn when the save lands (the save hook below, #810).
     */
    const edit = async (data: FolderNodeData, change: (text: string) => string): Promise<'saved' | 'unsaved' | 'unchanged'> => {
        const document = await workspace.openTextDocument(Uri.file(data.cwproj));
        const before = document.getText();
        const after = change(before);
        if (after === before) return 'unchanged';
        const otherChanges = document.isDirty;
        await applyText(document, after);
        if (otherChanges) {
            const answer = await window.showWarningMessage(
                `${path.basename(data.cwproj)} has other changes not saved yet. Save them with this one?`,
                { modal: true }, 'Save All');
            if (answer !== 'Save All') {
                window.showInformationMessage(`The change to ${data.projectName} is made but not saved; save ${path.basename(data.cwproj)} to keep it.`);
                return 'unsaved';
            }
        }
        await document.save();
        return 'saved';
    };

    const picksFor = async (data: FolderNodeData, text: string): Promise<Pick[]> => {
        switch (data.kind) {
            case 'FileDriver': {
                // The installation's drivers the project does not have yet, as the Sources tab offers.
                const have = listItems(text).fileDrivers.map(d => d.include.toLowerCase());
                const choices = FILE_DRIVERS.filter(d => !have.includes(d.toLowerCase()));
                if (choices.length === 0) { window.showInformationMessage(`${data.projectName} has every file driver.`); return []; }
                const picked = await window.showQuickPick(choices, { canPickMany: true, title: `File drivers to add to ${data.projectName}` });
                return (picked ?? []).map(include => ({ include }));
            }
            case 'Library':
            case 'Include': {
                const files = await window.showOpenDialog({
                    canSelectMany: true,
                    defaultUri: Uri.file(data.projectPath),
                    openLabel: 'Add to project',
                    title: data.kind === 'Include' ? `Projects to include in ${data.projectName}` : `Libraries, objects and resources for ${data.projectName}`,
                    filters: data.kind === 'Include'
                        ? { 'TopSpeed project': ['prj', 'pr'] }
                        : { 'Libraries and objects': ['lib', 'obj'], 'Resources': ['ico', 'cur', 'bmp', 'gif', 'jpg', 'png', 'manifest', 'res', 'rc'], 'All files': ['*'] },
                });
                return (files ?? []).map(f => ({ include: includeFor(data.projectPath, f.fsPath) }));
            }
            case 'ProjectReference': {
                const solution = SolutionCache.getInstance().getSolutionInfo()?.projects ?? [];
                const candidates = referenceCandidates(text, data.cwproj, solution.map(p => ({
                    name: p.name, guid: p.guid, cwproj: path.join(p.path, p.filename),
                })));
                if (candidates.length === 0) { window.showInformationMessage(`There is no other project in the solution for ${data.projectName} to reference.`); return []; }
                const picked = await window.showQuickPick(candidates.map(c => ({ label: c.name, description: c.include, candidate: c })),
                    { canPickMany: true, title: `Projects ${data.projectName} references` });
                return (picked ?? []).map(p => p.candidate);
            }
            default:
                return [];
        }
    };

    return [
        commands.registerCommand('clarion.projectFolder.add', async (node?: { data?: FolderNodeData }) => {
            const data = node?.data;
            if (data?.type !== 'projectFolder') return;
            try {
                const text = (await workspace.openTextDocument(Uri.file(data.cwproj))).getText();
                const picks = await picksFor(data, text);
                if (picks.length > 0) await edit(data, current => folderAddition(current, data.kind, picks));
            } catch (err) {
                logger.error(`❌ Add to ${data.projectName}: ${err instanceof Error ? err.message : String(err)}`);
                window.showErrorMessage(`Could not change ${data.projectName}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }),
        commands.registerCommand('clarion.projectFolder.remove', async (node?: { data?: FolderNodeData; label?: string }) => {
            const data = node?.data;
            if (data?.type !== 'projectFolderItem' || !data.include) return;
            const include = data.include;
            const answer = await window.showWarningMessage(`Remove ${node?.label ?? include} from ${data.projectName}?`, { modal: true }, 'Remove');
            if (answer !== 'Remove') return;
            try {
                // The tree shows the file on disk; an unsaved edit may already have taken the item out.
                if (await edit(data, current => removeItem(current, data.kind, include)) === 'unchanged') {
                    window.showInformationMessage(`${node?.label ?? include} is not in the project ${data.projectName} as it stands; it may have been removed in an unsaved edit.`);
                }
            } catch (err) {
                logger.error(`❌ Remove from ${data.projectName}: ${err instanceof Error ? err.message : String(err)}`);
                window.showErrorMessage(`Could not change ${data.projectName}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }),
        // #810: one of the solution's .cwproj files saved, however it was edited (the Project
        // Properties page, whose edits the user saves; the folder commands above; the XML in a
        // text editor), redraws the tree, which reads each project's folders and sources from disk.
        // A redraw only: the .cwproj watcher still reloads the solution for the language server.
        workspace.onDidSaveTextDocument(document => {
            const projects = SolutionCache.getInstance().getSolutionInfo()?.projects ?? [];
            // #758: so does a legacy project file, which a project may include; the redraw reads the
            // sources of each expanded project again only when its files' text changed.
            if (isSolutionProjectFile(document.uri.fsPath, projects) || /\.(prj|pr|pi)$/i.test(document.uri.fsPath)) solutionTreeDataProvider?.redraw();
        }),
    ];
}
