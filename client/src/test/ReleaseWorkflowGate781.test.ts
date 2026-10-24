import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #781 — the Release workflow ran `npm run test:server || true` on ubuntu-latest, where the suite
 * cannot pass (file resolution is case-insensitive, as the compiler's is; #442). The 1.0.9 release
 * showed 331 failing under a green step. The release now runs the tests as the dry run does: on
 * Windows, server and client suites, failures counting, and nothing is merged, tagged or published
 * unless they pass, for the very commit they passed on.
 *
 * Read as text: jobs at two spaces under `jobs:`, their keys at four, steps at six. Comments are
 * dropped first, so a mention in a comment satisfies nothing; a reformatted file fails here rather
 * than passing.
 */
suite('The Release workflow gates on the Windows test suite (#781)', () => {
    let root = __dirname;
    while (!fs.existsSync(path.join(root, '.github', 'workflows', 'release.yml'))) {
        const parent = path.dirname(root);
        if (parent === root) throw new Error('.github/workflows/release.yml not found above ' + __dirname);
        root = parent;
    }
    const text = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8')
        .replace(/\r\n/g, '\n')
        .replace(/^\s*#.*\n/gm, '');

    /** Each job under `jobs:`, by name, as the text of its block. */
    const jobs = new Map<string, string>();
    const body = text.slice(text.search(/^jobs:\s*$/m));
    for (const m of body.matchAll(/^ {2}([\w-]+):\s*\n((?: {4}.*\n|\s*\n)*)/gm)) jobs.set(m[1], m[2]);
    const steps = (job: string) => job.split(/\n(?= {6}- name:)/).slice(1);
    const runsOnWindows = (job: string) => /^ {4}runs-on:\s*windows-latest\s*$/m.test(job);

    const [testName, testJob] = [...jobs].find(([, j]) =>
        runsOnWindows(j) && /npm run test:server/.test(j) && /npm run test:client/.test(j)) ?? [];
    const release = [...jobs.values()].find(j => /vsce publish/.test(j));

    test('a job runs the server and client suites on Windows, with failures counting', () => {
        assert.ok(testJob, 'no windows-latest job runs both npm run test:server and npm run test:client');
        assert.ok(!/^ {4}continue-on-error:/m.test(testJob!), 'the test job continues on error');
        assert.ok(!/^ {4}if:/m.test(testJob!), 'the test job has a condition that can skip it');
        for (const step of steps(testJob!).filter(s => /npm run test:/.test(s))) {
            assert.ok(!/\|\|\s*true/.test(step), `a test step ignores its exit code:\n${step}`);
            assert.ok(!/continue-on-error:\s*true/.test(step), `a test step continues on error:\n${step}`);
            assert.ok(!/^ {8}if:/m.test(step), `a test step has a condition that can skip it:\n${step}`);
        }
    });

    test('the release job waits for that job, and only for its success', () => {
        assert.ok(testName && release, 'no Windows test job, or no job that publishes');
        const needs = /^ {4}needs:\s*(.+)$/m.exec(release!)?.[1] ?? '';
        assert.ok(needs.split(/[\s,[\]]+/).includes(testName!), `the publishing job does not need "${testName}" (needs: ${needs || 'none'})`);
        assert.ok(!/^ {4}if:.*(always|cancelled|failure)\(\)/m.test(release!), 'the publishing job runs whatever the tests did');
    });

    test('the release ships the commit the tests passed on', () => {
        assert.ok(testName && testJob && release, 'no Windows test job, or no job that publishes');
        const output = /^ {4}outputs:\s*\n {6}([\w-]+):\s*\$\{\{\s*steps\.[\w-]+\.outputs\.[\w-]+\s*\}\}/m.exec(testJob!)?.[1];
        assert.ok(output, 'the test job does not export the commit it tested');
        assert.ok(new RegExp(`needs\\.${testName}\\.outputs\\.${output}`).test(release!),
            `the publishing job never checks its commit against needs.${testName}.outputs.${output}`);
    });

    test('a version tag already on another commit stops the release', () => {
        // A retry after a partial release would otherwise ship a VSIX the existing tag does not describe.
        assert.ok(release, 'no job that publishes');
        const verify = steps(release!).find(s => /git ls-remote[^\n]*refs\/tags\/v/.test(s));
        assert.ok(verify && /exit 1/.test(verify), 'the publishing job does not check an existing version tag against the tested commit');
    });

    test('the Marketplace gets the VSIX packaged from that commit, not a rebuild of master', () => {
        // `vsce publish` without --packagePath packages the working tree again, and by then the
        // release has checked out master and merged into it.
        assert.ok(release, 'no job that publishes');
        const publish = steps(release!).find(s => /vsce publish/.test(s));
        assert.ok(publish && /--packagePath\s+\S*\.vsix/.test(publish), `the Marketplace step does not publish the packaged VSIX:\n${publish}`);
    });

    test('no step in the workflow discards a test run\'s exit code', () => {
        for (const job of jobs.values()) {
            for (const step of steps(job).filter(s => /npm (run )?test/.test(s))) {
                assert.ok(!/\|\|\s*true/.test(step), `a test step ignores its exit code:\n${step}`);
            }
        }
    });
});
