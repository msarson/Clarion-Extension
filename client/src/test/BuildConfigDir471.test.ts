import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { buildConfigDirArg } from "../utils/ClarionBuildArgs";

/**
 * #471 — telling the Clarion build targets which ClarionProperties.xml to read.
 *
 * `ConfigDir` is NOT an MSBuild concept: it appears nowhere in
 * Microsoft.Common.targets, `msbuild /help` has no such switch, and MSBuild attaches
 * no meaning to the name. It is an ordinary property that
 * `SoftVelocity.Build.Clarion.targets` passes into its own tasks — `Redirection` three
 * times and `CWClean` once — and never defines itself, so it can only come from the
 * caller. `clarion.exe` / `clarioncl.exe` expose the same thing as a `/ConfigDir=`
 * switch.
 *
 * What it selects is the folder holding ClarionProperties.xml, which is where the
 * compile target's version, its redirection file name, and its macros are read from.
 * Verified directly: invoking the `Redirection` task without it fails with
 * `InvalidVersionException: Could not find the Clarion version ...`, and a real
 * solution built against a properties file in a non-default folder succeeds only when
 * ConfigDir names that folder.
 *
 * We had never passed it, so an installation configured outside the default location
 * — the reporter's `%CWRoot%\Settings` layout, where a checked-out tree carries its
 * own IDE settings — built against the wrong settings or failed to resolve its
 * version, even after the user had selected the right properties file in the UI.
 */
describe('#471 — ConfigDir build argument', () => {

    it('names the FOLDER holding the selected ClarionProperties.xml', () => {
        const props = path.join('F:', 'CWRoot', 'Settings', 'ClarionProperties.xml');
        const arg = buildConfigDirArg(props);
        assert.strictEqual(arg, `/property:ConfigDir="${path.join('F:', 'CWRoot', 'Settings')}"`);
    });

    it('quotes the value so a path containing spaces survives the shell', () => {
        const props = path.join('C:', 'Program Files', 'My Clarion', 'ClarionProperties.xml');
        const arg = buildConfigDirArg(props);
        assert.ok(arg.includes('"'), `must be quoted; got: ${arg}`);
        assert.ok(arg.endsWith('"'), `the value must be closed; got: ${arg}`);
        assert.ok(arg.includes('Program Files'), `got: ${arg}`);
    });

    it('is OMITTED, not empty, when no properties file is selected', () => {
        // An empty ConfigDir is not the same as an absent one: the Clarion tasks fall
        // back to their default location only when the property is undefined. Passing
        // /property:ConfigDir="" would point them at nothing.
        assert.strictEqual(buildConfigDirArg(undefined), '');
        assert.strictEqual(buildConfigDirArg(null), '');
        assert.strictEqual(buildConfigDirArg(''), '');
    });

    it('preserves the previous behaviour when unset — the caller adds nothing', () => {
        const args = ['/t:build', '/property:Configuration=Debug'];
        const arg = buildConfigDirArg(undefined);
        if (arg) args.push(arg);
        assert.deepStrictEqual(args, ['/t:build', '/property:Configuration=Debug'],
            'an unconfigured workspace must produce exactly the old argument list');
    });
});
