import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { buildLogRow, buildLogMenu, runCommandRow, startupRow, settingsRow } from '../views/ToolsPaneRows';
import { recordBuildLog, lastBuildLog } from '../utils/LastBuildLog';

/**
 * #681 — the Clarion Tools pane shows the settings that change what its Build and Run buttons do:
 * whether the build log is kept (and the last one), a custom run command, the startup project
 * (clickable), and a way into the build settings.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

suite('Clarion Tools pane settings rows (#681)', () => {
    test('build log row: not kept, kept, kept with a last log', () => {
        assert.deepStrictEqual(
            { value: buildLogRow(false).value, command: buildLogRow(false).command },
            { value: 'Not kept', command: 'buildLogMenu' });
        assert.strictEqual(buildLogRow(true).value, 'Kept');
        const row = buildLogRow(true, 'C:\\app\\build_output.log');
        assert.strictEqual(row.value, 'Kept: build_output.log');
        assert.strictEqual(row.title, 'C:\\app\\build_output.log');
        assert.strictEqual(row.command, 'buildLogMenu');
    });

    test('build log menu: open (when there is a log) and the toggle', () => {
        assert.deepStrictEqual(buildLogMenu(false, false).map(i => i.action), ['keep']);
        assert.deepStrictEqual(buildLogMenu(true, false).map(i => i.action), ['stopKeeping']);
        assert.deepStrictEqual(buildLogMenu(true, true).map(i => i.action), ['open', 'stopKeeping']);
    });

    test('run row appears only when a run command is set', () => {
        assert.strictEqual(runCommandRow(''), undefined);
        assert.strictEqual(runCommandRow('   '), undefined);
        const row = runCommandRow('& "${projectDir}\\CopyRun.bat"')!;
        assert.strictEqual(row.label, 'Run');
        assert.strictEqual(row.value, 'Custom command');
        assert.strictEqual(row.title, '& "${projectDir}\\CopyRun.bat"');
        assert.strictEqual(row.command, 'openRunCommandSetting');
    });

    test('startup row is clickable, and says so when none is set', () => {
        assert.deepStrictEqual(
            { value: startupRow('MyApp').value, command: startupRow('MyApp').command },
            { value: 'MyApp', command: 'chooseStartupProject' });
        assert.strictEqual(startupRow(undefined).value, 'Not set');
        assert.strictEqual(startupRow(undefined).command, 'chooseStartupProject');
    });

    test('settings row opens the build settings', () => {
        assert.strictEqual(settingsRow().command, 'openBuildSettings');
    });

    test('the last build log is remembered while the file exists', () => {
        const tmp = path.join(require('os').tmpdir(), `clarion-681-${process.pid}.log`);
        fs.writeFileSync(tmp, 'Build started');
        try {
            recordBuildLog(tmp);
            assert.strictEqual(lastBuildLog(), tmp);
        } finally {
            fs.unlinkSync(tmp);
        }
        assert.strictEqual(lastBuildLog(), undefined, 'a deleted log is not offered');
    });

    test('the pane handles every row command, and both build paths record the kept log', () => {
        const toolbar = read('client', 'src', 'views', 'SolutionToolbarProvider.ts');
        for (const cmd of ['buildLogMenu', 'chooseStartupProject', 'openRunCommandSetting', 'openBuildSettings']) {
            assert.ok(toolbar.includes(`case '${cmd}':`), `the pane handles ${cmd}`);
        }
        for (const make of ['buildLogRow(', 'runCommandRow(', 'startupRow(', 'settingsRow(']) {
            assert.ok(toolbar.includes(make), `the pane shows ${make}`);
        }
        const build = read('client', 'src', 'buildTasks.ts');
        assert.ok((build.match(/recordBuildLog\(/g) ?? []).length >= 2, 'the async and sequential builds record the kept log');
    });
});
