import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { configurationAtLoad } from '../utils/ConfigurationPrecedence';

/**
 * #664 — on every start, a remembered solution's configuration was replaced by the Clarion IDE's
 * saved one (`preferences\<Solution>.sln.<hash>.xml`, ActiveConfiguration), whatever the user had
 * set. Seen in the #663 check: both settings files on Debug|Win32, the IDE's file on Release, and
 * the start rewrote both settings files to Release|Win32.
 *
 * The rule: an explicit setting wins, and the IDE's record is brought in line with it, so the IDE
 * opens on the configuration chosen in VS Code. With no explicit setting the IDE's choice is used.
 */
const ide = (activeConfiguration?: string, activePlatform?: string) => ({ activeConfiguration, activePlatform });

suite('The configuration a remembered solution loads with (#664)', () => {
    test('bug-pin: an explicit Debug|Win32 is kept when the IDE last used Release', () => {
        const r = configurationAtLoad('Debug|Win32', ide('Release', 'Win32'), 'Debug|Win32');
        assert.strictEqual(r.configuration, 'Debug|Win32');
        assert.strictEqual(r.source, 'explicit');
    });

    test('the IDE is told the explicit configuration when it holds another', () => {
        const r = configurationAtLoad('Debug|Win32', ide('Release', 'Win32'), 'Debug|Win32');
        assert.deepStrictEqual(r.updateIde, { activeConfiguration: 'Debug', activePlatform: 'Win32' });
    });

    test('the IDE is told when it has no record of the solution yet', () => {
        const r = configurationAtLoad('Debug', null, 'Debug');
        assert.deepStrictEqual(r.updateIde, { activeConfiguration: 'Debug', activePlatform: 'Win32' });
    });

    test('an explicit name without a platform keeps the IDE\'s platform', () => {
        const r = configurationAtLoad('Release', ide('Debug', 'x64'), 'Release');
        assert.strictEqual(r.configuration, 'Release');
        assert.deepStrictEqual(r.updateIde, { activeConfiguration: 'Release', activePlatform: 'x64' });
    });

    test('nothing is written when the IDE already agrees, in either spelling or case', () => {
        assert.strictEqual(configurationAtLoad('Debug|Win32', ide('Debug', 'Win32'), 'Debug|Win32').updateIde, null);
        assert.strictEqual(configurationAtLoad('debug', ide('Debug', 'Win32'), 'debug').updateIde, null);
        assert.strictEqual(configurationAtLoad('Debug', ide('Debug'), 'Debug').updateIde, null);
    });

    test('with no explicit setting the IDE\'s choice is used and nothing is written back', () => {
        const r = configurationAtLoad(null, ide('Release', 'Win32'), 'Debug|Win32');
        assert.strictEqual(r.configuration, 'Release|Win32');
        assert.strictEqual(r.source, 'ide');
        assert.strictEqual(r.updateIde, null);
    });

    test('with no explicit setting and an IDE record without a platform, the name is used', () => {
        assert.strictEqual(configurationAtLoad('', ide('Release'), 'Debug|Win32').configuration, 'Release');
    });

    test('with neither, the configuration already held stands', () => {
        const r = configurationAtLoad(null, null, 'Debug|Win32');
        assert.strictEqual(r.configuration, 'Debug|Win32');
        assert.strictEqual(r.source, 'current');
        assert.strictEqual(r.updateIde, null);
    });

    test('the solution load asks configurationAtLoad, not the IDE preferences directly', () => {
        // Source pin: the unconditional "Applying IDE configuration" override must not come back.
        const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'client', 'src', 'solution', 'SolutionInitializer.ts'), 'utf8');
        assert.ok(src.includes('configurationAtLoad('), 'SolutionInitializer uses configurationAtLoad');
        assert.ok(!/ideConfig !== globalSettings\.configuration/.test(src), 'the unconditional IDE override is gone');
    });
});
