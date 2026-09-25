import * as assert from 'assert';
import {
    ClarionSettingsStore,
    SettingsWriteTarget,
    saveSolutionSelection,
    saveActiveConfiguration,
    clearSolutionSetting,
    removeSolutionEntry,
} from '../utils/SolutionSettingsScope';

/**
 * #663 — from #659. A saved .code-workspace sets clarion.configuration, and the first folder's
 * .vscode/settings.json holds a copy an older version wrote there, with the same value. A pick of
 * Release went to the folder only (the folder copy is the one in force), so the workspace file
 * kept Debug|Win32 and a task defined in the workspace file built Debug. The #587 check only
 * reports copies that already differ, so nothing was said until the next load.
 *
 * A write now reaches every scope that sets the key, so the copies stay in step without the
 * user deleting anything. A key set in one scope is still written to that scope only.
 */
const copy = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

class FakeStore implements ClarionSettingsStore {
    readonly layers: Record<SettingsWriteTarget, Map<string, unknown>> = {
        Workspace: new Map(),
        WorkspaceFolder: new Map(),
    };
    readonly writes: string[] = [];
    constructor(readonly hasWorkspaceFile: boolean) { }

    inspect<T>(key: string): { workspaceValue?: T; workspaceFolderValue?: T } {
        return {
            workspaceValue: copy(this.layers.Workspace.get(key)) as T | undefined,
            workspaceFolderValue: copy(this.layers.WorkspaceFolder.get(key)) as T | undefined,
        };
    }
    get<T>(key: string, fallback: T): T {
        const v = this.layers.WorkspaceFolder.get(key) ?? this.layers.Workspace.get(key);
        return (v === undefined ? fallback : copy(v)) as T;
    }
    async update(key: string, value: unknown, target: SettingsWriteTarget): Promise<void> {
        this.writes.push(`${target}:${key}`);
        if (value === undefined) this.layers[target].delete(key);
        else this.layers[target].set(key, copy(value));
    }
    set(target: SettingsWriteTarget, key: string, value: unknown): this {
        this.layers[target].set(key, value);
        return this;
    }
    value(target: SettingsWriteTarget, key: string): unknown {
        return this.layers[target].get(key);
    }
}

const SLN = 'C:\\Dev\\App\\app.sln';
const OTHER = 'C:\\Dev\\Other\\other.sln';
const PROPS = 'C:\\Users\\dev\\AppData\\Roaming\\SoftVelocity\\Clarion\\11.0\\ClarionProperties.xml';
const VERSION = 'Clarion 11.0.13244';
const entry = (configuration: string, solutionFile = SLN) => ({ solutionFile, propertiesFile: PROPS, version: VERSION, configuration });
const configurations = (store: FakeStore, target: SettingsWriteTarget) =>
    (store.value(target, 'solutions') as Array<{ solutionFile: string; configuration: string }>).map(s => `${s.solutionFile}=${s.configuration}`);

/** The #659 layout: the workspace file and a leftover folder copy agree on Debug|Win32. */
const leftoverFolderCopy = () => new FakeStore(true)
    .set('Workspace', 'configuration', 'Debug|Win32')
    .set('Workspace', 'currentSolution', SLN)
    .set('Workspace', 'solutions', [entry('Debug|Win32')])
    .set('WorkspaceFolder', 'configuration', 'Debug|Win32')
    .set('WorkspaceFolder', 'currentSolution', SLN)
    .set('WorkspaceFolder', 'solutions', [entry('Debug|Win32')]);

suite('A settings write reaches every scope that sets the key (#663)', () => {
    test('bug-pin: a Release pick updates the workspace file as well as the folder copy', async () => {
        const store = leftoverFolderCopy();
        await saveActiveConfiguration(store, 'Release');
        assert.strictEqual(store.value('WorkspaceFolder', 'configuration'), 'Release');
        assert.strictEqual(store.value('Workspace', 'configuration'), 'Release');
    });

    test('the solutions entry is updated in both lists', async () => {
        const store = leftoverFolderCopy();
        await saveActiveConfiguration(store, 'Release');
        assert.deepStrictEqual(configurations(store, 'WorkspaceFolder'), [`${SLN}=Release`]);
        assert.deepStrictEqual(configurations(store, 'Workspace'), [`${SLN}=Release`]);
    });

    test('each list keeps its own other entries: the workspace file list is not replaced by the folder list', async () => {
        const store = leftoverFolderCopy()
            .set('Workspace', 'solutions', [entry('Debug|Win32'), entry('Debug', OTHER)]);
        await saveActiveConfiguration(store, 'Release');
        assert.deepStrictEqual(configurations(store, 'Workspace'), [`${SLN}=Release`, `${OTHER}=Debug`]);
        assert.deepStrictEqual(configurations(store, 'WorkspaceFolder'), [`${SLN}=Release`]);
    });

    test('a list that does not hold the current solution is left alone by a pick', async () => {
        const store = leftoverFolderCopy()
            .set('Workspace', 'solutions', [entry('Debug', OTHER)]);
        await saveActiveConfiguration(store, 'Release');
        assert.deepStrictEqual(configurations(store, 'Workspace'), [`${OTHER}=Debug`]);
    });

    test('opening a solution records it in both scopes', async () => {
        const store = leftoverFolderCopy();
        await saveSolutionSelection(store, { solutionFile: OTHER, propertiesFile: PROPS, version: VERSION, configuration: 'Release' });
        for (const target of ['Workspace', 'WorkspaceFolder'] as const) {
            assert.strictEqual(store.value(target, 'currentSolution'), OTHER, `${target} currentSolution`);
            assert.strictEqual(store.value(target, 'configuration'), 'Release', `${target} configuration`);
            assert.deepStrictEqual(configurations(store, target), [`${SLN}=Debug|Win32`, `${OTHER}=Release`], `${target} solutions`);
        }
    });

    test('a key set only in the workspace file is still written there only', async () => {
        const store = new FakeStore(true)
            .set('Workspace', 'configuration', 'Debug|Win32')
            .set('Workspace', 'currentSolution', SLN)
            .set('Workspace', 'solutions', [entry('Debug|Win32')]);
        await saveActiveConfiguration(store, 'Release');
        assert.deepStrictEqual(store.writes.filter(w => w.startsWith('WorkspaceFolder')), []);
        assert.strictEqual(store.value('Workspace', 'configuration'), 'Release');
    });

    test('a key set only in the folder is still written there only', async () => {
        const store = new FakeStore(true)
            .set('WorkspaceFolder', 'configuration', 'Debug|Win32')
            .set('WorkspaceFolder', 'currentSolution', SLN)
            .set('WorkspaceFolder', 'solutions', [entry('Debug|Win32')]);
        await saveActiveConfiguration(store, 'Release');
        assert.deepStrictEqual(store.writes.filter(w => w.startsWith('Workspace:')), []);
        assert.strictEqual(store.value('WorkspaceFolder', 'configuration'), 'Release');
    });

    test('with no workspace file there is one settings file, written once', async () => {
        // A single-folder window: VS Code can report the folder's settings.json in both scopes.
        const store = new FakeStore(false)
            .set('Workspace', 'configuration', 'Debug|Win32')
            .set('WorkspaceFolder', 'configuration', 'Debug|Win32')
            .set('WorkspaceFolder', 'currentSolution', SLN)
            .set('WorkspaceFolder', 'solutions', [entry('Debug|Win32')]);
        await saveActiveConfiguration(store, 'Release');
        assert.deepStrictEqual(store.writes, ['WorkspaceFolder:solutions', 'WorkspaceFolder:configuration']);
    });

    test('closing a solution clears currentSolution in both scopes, so a reload does not reopen it', async () => {
        const store = leftoverFolderCopy();
        await clearSolutionSetting(store, 'currentSolution');
        assert.strictEqual(store.value('WorkspaceFolder', 'currentSolution'), '');
        assert.strictEqual(store.value('Workspace', 'currentSolution'), '');
    });

    test('a missing solution is removed from both lists, each keeping its other entries', async () => {
        const store = leftoverFolderCopy()
            .set('Workspace', 'solutions', [entry('Debug|Win32'), entry('Debug', OTHER)]);
        await removeSolutionEntry(store, SLN);
        assert.deepStrictEqual(configurations(store, 'Workspace'), [`${OTHER}=Debug`]);
        assert.deepStrictEqual(configurations(store, 'WorkspaceFolder'), []);
    });
});
