import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    ClarionSettingsStore,
    SettingsWriteTarget,
    shadowedSettingKeys,
    removeFolderCopies,
} from '../utils/SolutionSettingsScope';

/**
 * #587 — before #563, opening a solution wrote clarion.solutions / currentSolution / configuration
 * and the lookup-extension lists into the FIRST folder's .vscode/settings.json whatever scope they
 * came from. A folder value beats the .code-workspace file, so those leftovers shadow it: Mark's
 * workspace file said Release|Win32 and listed .pr/.prj extensions while the folder copies forced
 * Debug|Win32 and the defaults. #563 stopped new copies being written but cannot delete a user's
 * settings, so the conflict has to be reported and cleaned only on the user's say-so.
 */
const copy = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

class FakeStore implements ClarionSettingsStore {
    readonly layers: Record<SettingsWriteTarget, Map<string, unknown>> = { Workspace: new Map(), WorkspaceFolder: new Map() };
    readonly writes: string[] = [];
    constructor(readonly hasWorkspaceFile: boolean) { }
    inspect<T>(key: string) {
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
        this.writes.push(`${target}:${key}=${value === undefined ? 'undefined' : JSON.stringify(value)}`);
        if (value === undefined) this.layers[target].delete(key);
        else this.layers[target].set(key, copy(value));
    }
    set(target: SettingsWriteTarget, key: string, value: unknown): this {
        this.layers[target].set(key, value);
        return this;
    }
}

suite('Folder settings that shadow the workspace file (#587)', () => {
    test('Mark\'s case: the keys set in both places with different values are reported', () => {
        const store = new FakeStore(true)
            .set('Workspace', 'configuration', 'Release|Win32')
            .set('WorkspaceFolder', 'configuration', 'Debug|Win32')
            .set('Workspace', 'defaultLookupExtensions', ['.clw', '.inc', '.pr', '.prj'])
            .set('WorkspaceFolder', 'defaultLookupExtensions', ['.clw', '.inc', '.equ', '.eq', '.int'])
            .set('Workspace', 'currentSolution', 'E:\\Dev\\b47.sln')
            .set('WorkspaceFolder', 'currentSolution', 'E:\\Dev\\b47.sln');   // same value: not a conflict
        assert.deepStrictEqual(shadowedSettingKeys(store), ['configuration', 'defaultLookupExtensions']);
    });

    test('nothing is reported without a workspace file, or when only one scope sets a key', () => {
        const noWorkspaceFile = new FakeStore(false)
            .set('Workspace', 'configuration', 'Release|Win32')
            .set('WorkspaceFolder', 'configuration', 'Debug|Win32');
        assert.deepStrictEqual(shadowedSettingKeys(noWorkspaceFile), []);

        const folderOnly = new FakeStore(true).set('WorkspaceFolder', 'configuration', 'Debug|Win32');
        assert.deepStrictEqual(shadowedSettingKeys(folderOnly), []);

        const workspaceOnly = new FakeStore(true).set('Workspace', 'solutions', [{ solutionFile: 'a.sln' }]);
        assert.deepStrictEqual(shadowedSettingKeys(workspaceOnly), []);
    });

    test('a list or solutions entry differing only in order or spelling still counts as a conflict', () => {
        const store = new FakeStore(true)
            .set('Workspace', 'solutions', [{ solutionFile: 'E:\\Dev\\b47.sln', configuration: 'Release|Win32' }])
            .set('WorkspaceFolder', 'solutions', [{ solutionFile: 'E:\\Dev\\b47.sln', configuration: 'Debug|Win32' }]);
        assert.deepStrictEqual(shadowedSettingKeys(store), ['solutions']);
    });

    test('cleaning removes only the folder copies, leaving the workspace file alone', async () => {
        const store = new FakeStore(true)
            .set('Workspace', 'configuration', 'Release|Win32')
            .set('WorkspaceFolder', 'configuration', 'Debug|Win32')
            .set('Workspace', 'fileSearchExtensions', ['.clw', '.pr'])
            .set('WorkspaceFolder', 'fileSearchExtensions', ['.clw']);
        await removeFolderCopies(store, ['configuration', 'fileSearchExtensions']);
        assert.deepStrictEqual(store.writes, ['WorkspaceFolder:configuration=undefined', 'WorkspaceFolder:fileSearchExtensions=undefined']);
        assert.strictEqual(store.get('configuration', ''), 'Release|Win32', 'the workspace file value is now in force');
        assert.deepStrictEqual(store.get('fileSearchExtensions', []), ['.clw', '.pr']);
        assert.deepStrictEqual(shadowedSettingKeys(store), []);
    });

    test('the solution load offers the clean-up when a conflict is found', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', '..', '..', '..', 'client', 'src', 'solution', 'SolutionInitializer.ts'), 'utf8');
        assert.match(source, /shadowedSettingKeys\(/, 'the load must look for shadowed keys');
        assert.match(source, /removeFolderCopies\(/, 'and offer to remove the folder copies');
    });
});
