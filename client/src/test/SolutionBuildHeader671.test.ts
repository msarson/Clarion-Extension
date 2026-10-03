import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #671 — #531 made a build write what it builds, its configuration and the MSBuild command line
 * (ClarionBinPath, ConfigDir) to the Clarion Build output, but only executeBuildTask (a single
 * project) did. The full-solution build runs executeBuildTaskSync once per project and wrote
 * nothing, so there was no way to see which Clarion built the solution. Both now write the header
 * through one helper. (formatBuildHeader's own text is pinned by BuildHeader531.)
 */
const root = (() => {
    let dir = __dirname;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('project root not found');
})();

/** The body of `async function name(` or `export async function name(` in buildTasks.ts. */
function functionBody(src: string, name: string): string {
    const start = src.search(new RegExp(`(export )?async function ${name}\\(`));
    assert.ok(start >= 0, `${name} exists`);
    const next = src.slice(start + 1).search(/\n(export )?(async )?function /);
    return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

suite('Every build writes the Clarion Build header (#671)', () => {
    const src = fs.readFileSync(path.join(root, 'client', 'src', 'buildTasks.ts'), 'utf8');

    test('bug-pin: each project of a full-solution build writes the header', () => {
        assert.ok(/writeBuildHeader\(/.test(functionBody(src, 'executeBuildTaskSync')), 'executeBuildTaskSync writes the header');
    });

    test('a single-project build still writes it', () => {
        assert.ok(/writeBuildHeader\(/.test(functionBody(src, 'executeBuildTask')), 'executeBuildTask writes the header');
    });

    test('the header is written in one place', () => {
        assert.strictEqual((src.match(/formatBuildHeader\(/g) ?? []).length, 1, 'formatBuildHeader is called only by writeBuildHeader');
    });
});
