import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runTerminalPlan } from '../utils/RunTerminal';

/**
 * #676 (from #659) — Run sent `& "<exe>"` (PowerShell's call operator) to a terminal with the user's
 * DEFAULT profile, so with cmd ("& was unexpected at this time.") or Git Bash as the default it
 * failed. The Run terminal is now a PowerShell terminal, whatever the default is.
 */
suite('Run works whatever the default terminal is (#676)', () => {
    test('bug-pin: the Run terminal is PowerShell', () => {
        const plan = runTerminalPlan('C:\\app\\OS3DE.exe');
        assert.ok(plan.shellPath && /powershell(\.exe)?$/i.test(plan.shellPath), `shellPath: ${plan.shellPath}`);
    });

    test('the command line is unchanged: the call operator, quoted exe, arguments', () => {
        assert.strictEqual(runTerminalPlan('C:\\app\\OS3DE.exe').command, '& "C:\\app\\OS3DE.exe"');
        assert.strictEqual(runTerminalPlan('C:\\app\\OS3DE.exe', undefined, ' /debug ').command, '& "C:\\app\\OS3DE.exe" /debug');
    });

    test('the working directory is the exe folder unless the project names one', () => {
        assert.strictEqual(runTerminalPlan('C:\\app\\bin\\OS3DE.exe').cwd, 'C:\\app\\bin');
        assert.strictEqual(runTerminalPlan('C:\\app\\bin\\OS3DE.exe', 'C:\\work').cwd, 'C:\\work');
    });

    test('RunCommands launches through runTerminalPlan', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'client', 'src', 'commands', 'RunCommands.ts'))) dir = path.dirname(dir);
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'commands', 'RunCommands.ts'), 'utf8');
        assert.ok(src.includes('runTerminalPlan('), 'runExecutable uses the plan');
        assert.ok(/shellPath: plan\.shellPath/.test(src), 'and passes its shellPath to createTerminal');
    });
});
