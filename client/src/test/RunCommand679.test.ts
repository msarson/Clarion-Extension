import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { runTerminalPlan } from '../utils/RunTerminal';

/**
 * #679 (from #659) — Run always started the output exe where it was compiled; some projects run
 * through a copy step and a batch file instead. `clarion.run.command`, when set, is what Run executes
 * in its PowerShell terminal, with ${exe}, ${projectDir} and ${args} substituted.
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();

suite('A custom run command (#679)', () => {
    test('bug-pin: the setting\'s command runs instead of the exe, with ${projectDir} substituted', () => {
        const plan = runTerminalPlan('C:\\app\\OS3DE.exe', undefined, undefined,
            { command: '& "${projectDir}\\CopyRunOS3DE.bat"', projectDir: 'C:\\app' });
        assert.strictEqual(plan.command, '& "C:\\app\\CopyRunOS3DE.bat"');
    });

    test('${exe} and ${args} are substituted, every occurrence', () => {
        const plan = runTerminalPlan('C:\\app\\OS3DE.exe', undefined, '/fast',
            { command: 'Copy-Item "${exe}" D:\\run; & D:\\run\\OS3DE.exe ${args} ${args}', projectDir: 'C:\\app' });
        assert.strictEqual(plan.command, 'Copy-Item "C:\\app\\OS3DE.exe" D:\\run; & D:\\run\\OS3DE.exe /fast /fast');
    });

    test('the custom command runs in the project folder unless the project names a working directory', () => {
        assert.strictEqual(runTerminalPlan('C:\\app\\bin\\OS3DE.exe', undefined, undefined, { command: 'x', projectDir: 'C:\\app' }).cwd, 'C:\\app');
        assert.strictEqual(runTerminalPlan('C:\\app\\bin\\OS3DE.exe', 'C:\\work', undefined, { command: 'x', projectDir: 'C:\\app' }).cwd, 'C:\\work');
    });

    test('an empty setting runs the exe as before', () => {
        assert.strictEqual(runTerminalPlan('C:\\app\\OS3DE.exe', undefined, undefined, { command: '  ', projectDir: 'C:\\app' }).command, '& "C:\\app\\OS3DE.exe"');
    });

    test('the setting is contributed and Run reads it', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        const props = pkg.contributes.configuration.properties ?? Object.assign({}, ...pkg.contributes.configuration.map((c: { properties: object }) => c.properties));
        assert.ok(props['clarion.run.command'], 'clarion.run.command is contributed');
        const src = fs.readFileSync(path.join(root, 'client', 'src', 'commands', 'RunCommands.ts'), 'utf8');
        assert.ok(src.includes("'run.command'") || src.includes('"run.command"'), 'Run reads clarion.run.command');
    });
});
