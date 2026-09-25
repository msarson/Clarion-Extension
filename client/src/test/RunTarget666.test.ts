import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { chooseRunProject } from '../utils/RunTargetChooser';

/**
 * #666 — Run Without Debugging (Ctrl+F5) and Debug (F5) refused to start without an open editor,
 * even with a startup project set or a single-project solution, and their keybindings only fired
 * from an editor. The project to run is now chosen in one place, the same way for both commands:
 * the startup project, else the only project, else the active file's project, else a picker.
 */
interface P { guid: string; name: string }
const app: P = { guid: '{AAA-1}', name: 'App' };
const lib: P = { guid: '{BBB-2}', name: 'Lib' };
const tool: P = { guid: '{CCC-3}', name: 'Tool' };

/** A file-to-projects lookup that records whether it was asked. */
function lookup(map: Record<string, P[]>) {
    const asked: string[] = [];
    const fn = async (file: string) => { asked.push(file); return map[file] ?? []; };
    return { fn, asked };
}

suite('Choosing the project to run or debug (#666)', () => {
    test('bug-pin: a startup project runs with no file open', async () => {
        const l = lookup({});
        const r = await chooseRunProject({ projects: [app, lib], startupGuid: 'bbb-2', activeFile: undefined, projectsContaining: l.fn });
        assert.deepStrictEqual(r, { kind: 'project', project: lib, source: 'startup' });
    });

    test('bug-pin: the only project runs with no file open', async () => {
        const l = lookup({});
        const r = await chooseRunProject({ projects: [app], startupGuid: undefined, activeFile: undefined, projectsContaining: l.fn });
        assert.deepStrictEqual(r, { kind: 'project', project: app, source: 'only' });
    });

    test('the startup project wins over the open file, and the file is not looked up', async () => {
        const l = lookup({ 'c:\\src\\lib.clw': [lib] });
        const r = await chooseRunProject({ projects: [app, lib], startupGuid: '{AAA-1}', activeFile: 'c:\\src\\lib.clw', projectsContaining: l.fn });
        assert.deepStrictEqual(r, { kind: 'project', project: app, source: 'startup' });
        assert.deepStrictEqual(l.asked, []);
    });

    test('the only project wins over a file outside it', async () => {
        const l = lookup({});
        const r = await chooseRunProject({ projects: [app], startupGuid: '', activeFile: 'c:\\elsewhere\\x.clw', projectsContaining: l.fn });
        assert.deepStrictEqual(r, { kind: 'project', project: app, source: 'only' });
    });

    test('with several projects, the open file picks its project', async () => {
        const l = lookup({ 'c:\\src\\lib.clw': [lib] });
        const r = await chooseRunProject({ projects: [app, lib, tool], startupGuid: undefined, activeFile: 'c:\\src\\lib.clw', projectsContaining: l.fn });
        assert.deepStrictEqual(r, { kind: 'project', project: lib, source: 'file' });
    });

    test('a file in several projects offers those projects', async () => {
        const l = lookup({ 'c:\\src\\shared.clw': [app, lib] });
        const r = await chooseRunProject({ projects: [app, lib, tool], startupGuid: undefined, activeFile: 'c:\\src\\shared.clw', projectsContaining: l.fn });
        assert.deepStrictEqual(r, { kind: 'pick', projects: [app, lib] });
    });

    test('bug-pin: several projects and no file open offers every project, instead of refusing', async () => {
        const l = lookup({});
        const r = await chooseRunProject({ projects: [app, lib, tool], startupGuid: undefined, activeFile: undefined, projectsContaining: l.fn });
        assert.deepStrictEqual(r, { kind: 'pick', projects: [app, lib, tool] });
    });

    test('several projects and a file outside them all offers every project', async () => {
        const l = lookup({});
        const r = await chooseRunProject({ projects: [app, lib, tool], startupGuid: undefined, activeFile: 'c:\\notes.txt', projectsContaining: l.fn });
        assert.deepStrictEqual(r, { kind: 'pick', projects: [app, lib, tool] });
    });

    test('a startup project the solution no longer has is reported, not guessed around', async () => {
        const l = lookup({});
        const r = await chooseRunProject({ projects: [app, lib], startupGuid: '{DEAD}', activeFile: undefined, projectsContaining: l.fn });
        assert.strictEqual(r.kind, 'error');
    });

    test('a solution with no projects is reported', async () => {
        const r = await chooseRunProject({ projects: [], startupGuid: undefined, activeFile: undefined, projectsContaining: lookup({}).fn });
        assert.strictEqual(r.kind, 'error');
    });
});

suite('Run and Debug are reachable without an editor (#666)', () => {
    const root = (() => {
        let dir = __dirname;
        while (dir !== path.dirname(dir)) {
            if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
            dir = path.dirname(dir);
        }
        throw new Error('project root not found');
    })();

    test('Ctrl+F5 and F5 fire whenever a solution is open and VS Code is not debugging', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const bindings = pkg.contributes.keybindings as Array<{ command: string; key: string; when?: string }>;
        for (const [command, key] of [['clarion.runWithoutDebugging', 'ctrl+f5'], ['clarion.startDebugging', 'f5']]) {
            const b = bindings.find(k => k.command === command && k.key === key);
            assert.ok(b, `${command} is bound to ${key}`);
            assert.strictEqual(b!.when, 'clarion.solutionOpen && !inDebugMode', `${command} when-clause`);
        }
    });

    test('both commands choose through chooseRunProject and no longer demand an open file', () => {
        const src = fs.readFileSync(path.join(root, 'client', 'src', 'commands', 'RunCommands.ts'), 'utf8');
        assert.ok(!src.includes('No active file'), 'the "No active file" refusal is gone');
        assert.ok((src.match(/resolveRunProject\(/g) ?? []).length >= 3, 'Run and Debug both call the shared resolver');
    });
});
