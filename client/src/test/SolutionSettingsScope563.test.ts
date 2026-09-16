import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    ClarionSettingsStore,
    SettingsWriteTarget,
    readSolutionSelection,
    saveSolutionSelection,
    saveActiveConfiguration,
    isAlreadyApplied,
    isUnsetInEveryScope,
} from '../utils/SolutionSettingsScope';

/**
 * #563 — Mark's multi-root workspace (B47.code-workspace, ten folders, four configurations).
 * A pick in the status bar updated the status bar, but the Tools pane, the Solution View and
 * the build stayed on Debug. His client log showed the pick written to the first folder's
 * .vscode/settings.json and, 100ms later, the settings-change handler reading the selection back
 * resource-less, which in a multi-root workspace returns the .code-workspace value
 * ("configuration": "Debug|Win32") and skips folder settings.
 *
 * The fake store below resolves settings the way VS Code does for a resource-scoped setting read
 * with the first folder as the resource: the folder value overrides the workspace-file value.
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
        // A copy, as VS Code returns: editing the result must not change the stored setting.
        return (v === undefined ? fallback : JSON.parse(JSON.stringify(v))) as T;
    }
    async update(key: string, value: unknown, target: SettingsWriteTarget): Promise<void> {
        this.writes.push(`${target}:${key}`);
        // Deep copy, as settings JSON is serialised.
        this.layers[target].set(key, value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
    }
    set(target: SettingsWriteTarget, key: string, value: unknown): this {
        this.layers[target].set(key, value);
        return this;
    }
}

const SLN = 'E:\\Dev\\TSI\\5\\CW\\EstGit\\b47.sln';
const PROPS = 'c:\\Users\\win8m\\AppData\\Roaming\\SoftVelocity\\Clarion\\11.0\\ClarionProperties.xml';
const VERSION = 'Clarion 11.0.13244';
const entry = (configuration: string, solutionFile = SLN) => ({ solutionFile, propertiesFile: PROPS, version: VERSION, configuration });

/** Mark's B47.code-workspace as sent: everything in the workspace file, nothing in the folder. */
const marksWorkspace = () => new FakeStore(true)
    .set('Workspace', 'configuration', 'Debug|Win32')
    .set('Workspace', 'currentSolution', SLN)
    .set('Workspace', 'solutions', [entry('Debug|Win32')]);

suite('Solution settings are read and written in one scope (#563)', () => {
    test('bug-pin: Mark\'s workspace — a pick of TSI4_DBG reads back as TSI4_DBG', async () => {
        const store = marksWorkspace();
        await saveSolutionSelection(store, { solutionFile: SLN, propertiesFile: PROPS, version: VERSION, configuration: 'TSI4_DBG' });
        assert.strictEqual(readSolutionSelection(store)?.configuration, 'TSI4_DBG');
    });

    test('the change lands in the file that already holds the setting, not a new folder copy', async () => {
        const store = marksWorkspace();
        await saveSolutionSelection(store, { solutionFile: SLN, propertiesFile: PROPS, version: VERSION, configuration: 'TSI4_DBG' });
        assert.deepStrictEqual(store.writes.filter(w => w.startsWith('WorkspaceFolder')), []);
        assert.deepStrictEqual((store.layers.Workspace.get('solutions') as Array<{ configuration: string }>).map(s => s.configuration), ['TSI4_DBG']);
    });

    test('Mark\'s state after the bug: stale Debug in the workspace file, a folder copy the picker wrote — a new pick reads back', async () => {
        const store = marksWorkspace()
            .set('WorkspaceFolder', 'configuration', 'TSI4_DBG')
            .set('WorkspaceFolder', 'currentSolution', SLN)
            .set('WorkspaceFolder', 'solutions', [entry('TSI4_DBG')]);
        await saveSolutionSelection(store, { solutionFile: SLN, propertiesFile: PROPS, version: VERSION, configuration: 'TSI4_REL' });
        assert.strictEqual(readSolutionSelection(store)?.configuration, 'TSI4_REL');
    });

    test('keys split across files: each is written where its own value lives, and the pick reads back', async () => {
        const store = new FakeStore(true)
            .set('Workspace', 'solutions', [entry('Debug|Win32')])
            .set('Workspace', 'currentSolution', SLN)
            .set('WorkspaceFolder', 'configuration', 'Debug');
        await saveActiveConfiguration(store, 'Release');
        assert.strictEqual(readSolutionSelection(store)?.configuration, 'Release');
        assert.ok(store.writes.includes('Workspace:solutions'), store.writes.join(', '));
        assert.ok(store.writes.includes('WorkspaceFolder:configuration'), store.writes.join(', '));
    });

    test('a plain folder with nothing set yet writes to the folder', async () => {
        const store = new FakeStore(false);
        await saveSolutionSelection(store, { solutionFile: SLN, propertiesFile: PROPS, version: VERSION, configuration: 'Debug' });
        assert.deepStrictEqual(store.writes.filter(w => w.startsWith('Workspace:')), []);
        assert.strictEqual(readSolutionSelection(store)?.configuration, 'Debug');
    });

    test('a saved workspace with nothing set yet writes to the workspace file', async () => {
        const store = new FakeStore(true);
        await saveSolutionSelection(store, { solutionFile: SLN, propertiesFile: PROPS, version: VERSION, configuration: 'Debug' });
        assert.deepStrictEqual(store.writes.filter(w => w.startsWith('WorkspaceFolder:')), []);
    });

    test('the existing entry is updated even when its path is spelled differently — no duplicate', async () => {
        const store = new FakeStore(true)
            .set('Workspace', 'currentSolution', SLN.toLowerCase().replace(/\\/g, '/'))
            .set('Workspace', 'solutions', [entry('Debug', SLN.toLowerCase().replace(/\\/g, '/'))]);
        await saveSolutionSelection(store, { solutionFile: SLN, propertiesFile: PROPS, version: VERSION, configuration: 'Release' });
        const solutions = store.get<Array<{ configuration: string }>>('solutions', []);
        assert.strictEqual(solutions.length, 1);
        assert.strictEqual(solutions[0].configuration, 'Release');
        assert.strictEqual(readSolutionSelection(store)?.configuration, 'Release');
    });

    test('with no current solution the first entry is the selection (#104 fallback preserved)', () => {
        const store = new FakeStore(true).set('Workspace', 'solutions', [entry('Release')]);
        assert.strictEqual(readSolutionSelection(store)?.solutionFile, SLN);
    });

    test('nothing configured reads as no selection', () => {
        assert.strictEqual(readSolutionSelection(new FakeStore(true)), null);
    });
});

suite('The settings-change handler does not undo a change the extension applied (#563)', () => {
    test('the same configuration, in either spelling, is already applied', () => {
        assert.strictEqual(isAlreadyApplied('TSI4_DBG', 'TSI4_DBG'), true);
        assert.strictEqual(isAlreadyApplied('Debug', 'Debug|Win32'), true);
        assert.strictEqual(isAlreadyApplied('debug|win32', 'Debug'), true);
    });

    test('a different configuration (a hand edit of settings) is not', () => {
        assert.strictEqual(isAlreadyApplied('Debug', 'TSI4_DBG'), false);
        assert.strictEqual(isAlreadyApplied('TSI4_DBG', ''), false);
    });
});

suite('Seeding default lookup extensions does not replace a user list (#563)', () => {
    test('a list in the workspace file is a user value: no folder copy of the defaults', () => {
        assert.strictEqual(isUnsetInEveryScope({ workspaceValue: ['.clw', '.pr', '.prj'] }), false);
    });
    test('a list in user settings or the folder is a user value too', () => {
        assert.strictEqual(isUnsetInEveryScope({ globalValue: ['.clw'] }), false);
        assert.strictEqual(isUnsetInEveryScope({ workspaceFolderValue: ['.clw'] }), false);
    });
    test('set nowhere: the defaults may be seeded', () => {
        assert.strictEqual(isUnsetInEveryScope({}), true);
        assert.strictEqual(isUnsetInEveryScope(undefined), true);
    });
});

suite('No resource-less read of the solution settings (#563 sentinel)', () => {
    // A resource-less read skips folder settings in a multi-root workspace, so it can disagree
    // with every write. The keys must be read through the first folder (SolutionSettingsScope).
    const KEY = String.raw`(?:currentSolution|solutions|configuration)`;
    const PATTERNS = [
        // workspace.getConfiguration().get('clarion.currentSolution' ...)
        new RegExp(String.raw`getConfiguration\(\s*\)\s*\.get(?:<[^>]*>)?\(\s*['"]clarion\.${KEY}['"]`),
        // workspace.getConfiguration('clarion').get('solutions' ...)
        new RegExp(String.raw`getConfiguration\(\s*['"]clarion['"]\s*\)\s*\.get(?:<[^>]*>)?\(\s*['"]${KEY}['"]`),
    ];

    const root = (() => {
        let dir = __dirname;
        while (dir !== path.dirname(dir)) {
            if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
            dir = path.dirname(dir);
        }
        throw new Error('project root not found');
    })();
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== 'test') walk(full); }
            else if (e.name.endsWith('.ts')) files.push(full);
        }
    };
    walk(path.join(root, 'client', 'src'));

    test('client source reads currentSolution / solutions / configuration through the first folder', () => {
        const hits: string[] = [];
        // Also catch the two-step form: const config = workspace.getConfiguration("clarion"); … config.get("solutions")
        const twoStepDecl = /const\s+(\w+)\s*=\s*workspace\.getConfiguration\(\s*['"]clarion['"]\s*\)\s*;/;
        for (const file of files) {
            const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
            lines.forEach((line, i) => {
                if (PATTERNS.some(p => p.test(line))) hits.push(`${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
                const decl = twoStepDecl.exec(line);
                if (decl) {
                    const use = new RegExp(String.raw`\b${decl[1]}\.get(?:<[^>]*>)?\(\s*['"]${KEY}['"]`);
                    lines.slice(i + 1, i + 40).forEach((l, j) => {
                        if (use.test(l)) hits.push(`${path.relative(root, file)}:${i + j + 2}: ${l.trim()}`);
                    });
                }
            });
        }
        assert.deepStrictEqual(hits, []);
    });

    test('the solutions list is never written to a hard-coded scope', () => {
        const hits: string[] = [];
        for (const file of files) {
            fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
                if (/update\(\s*['"](?:solutions|currentSolution|configuration)['"][^)]*ConfigurationTarget\.WorkspaceFolder/.test(line)) {
                    hits.push(`${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        assert.deepStrictEqual(hits, []);
    });
});
