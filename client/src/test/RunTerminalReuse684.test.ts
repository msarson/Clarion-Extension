import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runTerminalPlan, RunTerminals } from '../utils/RunTerminal';

/**
 * #684 (from #659) — every Run opened a new "Run: OS3DE.exe" terminal and never closed the old one
 * (four after four runs), and with clarion.run.command set the name still named the exe. A Run now
 * closes the previous Run terminal of the same program before opening its own, and a custom command
 * says so in the name.
 */
class FakeTerminal {
    disposed = false;
    constructor(readonly id: number) {}
    dispose() { this.disposed = true; }
}

suite('Run reuses its terminal (#684)', () => {
    test('bug-pin: a second Run of the same program closes the first terminal', () => {
        const runs = new RunTerminals<FakeTerminal>();
        const first = runs.open('C:\\app\\OS3DE.exe', () => new FakeTerminal(1));
        const second = runs.open('C:\\APP\\os3de.exe', () => new FakeTerminal(2));
        assert.strictEqual(first.disposed, true, 'the old terminal is closed');
        assert.strictEqual(second.disposed, false);
    });

    test('a Run of another program leaves the first terminal alone', () => {
        const runs = new RunTerminals<FakeTerminal>();
        const first = runs.open('C:\\app\\OS3DE.exe', () => new FakeTerminal(1));
        runs.open('C:\\app\\Other.exe', () => new FakeTerminal(2));
        assert.strictEqual(first.disposed, false);
    });

    test('a terminal the user closed is forgotten, not disposed again', () => {
        const runs = new RunTerminals<FakeTerminal>();
        const first = runs.open('C:\\app\\OS3DE.exe', () => new FakeTerminal(1));
        runs.closed(first);
        let disposals = 0;
        first.dispose = () => { disposals++; };
        runs.open('C:\\app\\OS3DE.exe', () => new FakeTerminal(2));
        assert.strictEqual(disposals, 0);
    });

    test('bug-pin: with a custom command the name says so', () => {
        assert.strictEqual(runTerminalPlan('C:\\app\\OS3DE.exe').name, 'Run: OS3DE.exe');
        assert.strictEqual(
            runTerminalPlan('C:\\app\\OS3DE.exe', undefined, undefined, { command: '& "x.bat"', projectDir: 'C:\\app' }).name,
            'Run (custom): OS3DE');
    });

    test('runExecutable opens its terminal through the registry and forgets closed ones', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'client', 'src', 'commands', 'RunCommands.ts'))) dir = path.dirname(dir);
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'commands', 'RunCommands.ts'), 'utf8');
        assert.match(src, /runTerminals\.open\(/);
        assert.match(src, /onDidCloseTerminal\([^)]*runTerminals\.closed/);
    });
});
