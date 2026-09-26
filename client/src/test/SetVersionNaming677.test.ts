import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #677 (from #659) — `Clarion: Set Active Version` and the Actions gear ("Set Active Clarion Version")
 * read as setting the user's default version, but with a solution open a pick saves the version as
 * THAT solution's and reloads it (#573); the default is a separate item in the list. The names now
 * say what the command does. The command id stays clarion.setActiveVersion.
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

suite('Set Version is named for what it does (#677)', () => {
    test('bug-pin: the command title no longer says "Active"', () => {
        const pkg = JSON.parse(read('package.json'));
        const cmd = (pkg.contributes.commands as Array<{ command: string; title: string }>).find(c => c.command === 'clarion.setActiveVersion');
        assert.ok(cmd, 'the command id is unchanged');
        assert.strictEqual(cmd!.title, 'Set Version'); // shown as Clarion: Set Version, as #498's and #535's prompts say
    });

    test('bug-pin: the Actions gear says it sets the version for the open solution', () => {
        const toolbar = read('client', 'src', 'views', 'SolutionToolbarProvider.ts');
        assert.ok(!/title="Set Active Clarion Version"/.test(toolbar), 'old tooltip gone');
        assert.ok(/title="Set the Clarion version for this solution"/.test(toolbar), 'new tooltip');
    });

    test('the handler\'s comment no longer claims it leaves the solution alone', () => {
        const src = read('client', 'src', 'ClarionExtensionCommands.ts');
        assert.ok(!src.includes('Does NOT touch solution-bound state'), 'stale comment corrected');
    });
});
