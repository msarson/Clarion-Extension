import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { BuildResults, shouldClearForTask, OWN_BUILD_TASK } from '../utils/BuildResults';

/**
 * #670 (from #659) — a user who builds with their own task (Ctrl+Shift+B, a script) kept seeing the
 * extension's last build result: a failed build's status stayed in the status bar and its Problems
 * stayed listed, describing a build that is no longer current. A build-group task that is not the
 * extension's own now clears them, and `Clarion: Clear Build Results` does the same on demand.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();

const collection = () => { let cleared = 0; return { clear: () => { cleared++; }, get cleared() { return cleared; } }; };

suite('Clearing the extension\'s build results (#670)', () => {
    test('bug-pin: the user\'s own build task (Ctrl+Shift+B) clears them', () => {
        assert.strictEqual(shouldClearForTask({ name: 'Build.cmd', source: 'Workspace', groupId: 'build' }), true);
    });

    test('the extension\'s own build task does not (it sets them itself)', () => {
        assert.strictEqual(shouldClearForTask({ ...OWN_BUILD_TASK, groupId: 'build' }), false);
        assert.strictEqual(shouldClearForTask({ ...OWN_BUILD_TASK }), false);
    });

    test('a task outside the Build group does not', () => {
        assert.strictEqual(shouldClearForTask({ name: 'npm: watch', source: 'npm' }), false);
        assert.strictEqual(shouldClearForTask({ name: 'tests', source: 'Workspace', groupId: 'test' }), false);
    });

    test('bug-pin: clear empties every registered build collection and hides the build status', () => {
        let hidden = 0;
        const results = new BuildResults(() => { hidden++; });
        const main = results.register(collection());
        const msbuild = results.register(collection());
        const runBuild = results.register(collection());
        results.clear();
        assert.deepStrictEqual([main.cleared, msbuild.cleared, runBuild.cleared, hidden], [1, 1, 1, 1]);
    });

    test('registering the same collection twice clears it once', () => {
        const results = new BuildResults(() => { /* status */ });
        const c = collection();
        results.register(c); results.register(c);
        results.clear();
        assert.strictEqual(c.cleared, 1);
    });

    test('Clarion: Clear Build Results is a contributed command, and task starts are watched', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const cmd = (pkg.contributes.commands as Array<{ command: string; title: string; category?: string }>)
            .find(c => c.command === 'clarion.clearBuildResults');
        assert.ok(cmd, 'clarion.clearBuildResults is contributed');
        assert.strictEqual(`${cmd!.category}: ${cmd!.title}`, 'Clarion: Clear Build Results');
        const src = fs.readFileSync(path.join(root, 'client', 'src', 'extension.ts'), 'utf8');
        assert.ok(src.includes('tasks.onDidStartTask'), 'extension watches task starts');
        assert.ok(src.includes("'clarion.clearBuildResults'"), 'extension registers the command');
    });

    test('Run/Debug pre-builds and MSBuild errors no longer create a new collection per build', () => {
        const run = fs.readFileSync(path.join(root, 'client', 'src', 'commands', 'RunCommands.ts'), 'utf8');
        const build = fs.readFileSync(path.join(root, 'client', 'src', 'buildTasks.ts'), 'utf8');
        assert.ok(!/createDiagnosticCollection\("clarion-(run|debug)-build"\)/.test(run), 'Run/Debug reuse a registered collection');
        assert.ok(!/function processGeneralMSBuildErrors[\s\S]{0,200}createDiagnosticCollection/.test(build), 'MSBuild errors reuse one collection');
    });
});
