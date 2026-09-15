import { describe, it } from 'mocha';
import * as assert from 'assert';
import {
    rememberedSolutionState,
    registeredVersionNamesFromXml,
    versionRowLabel,
} from '../utils/SolutionFallbackPolicy';

/**
 * #535 — a remembered Clarion version that is no longer registered in the selected
 * ClarionProperties.xml is a stale name, not a usable version.
 *
 * After a Clarion 12 beta update the IDE rewrote ClarionProperties.xml with
 * "Clarion 12.0.14313"; the solution still remembered "Clarion 12.0.14234". The
 * string was non-empty, so #498's "needs-version" never fired, the sidebar showed the
 * stale name, redirection stayed unset, and the build failed with "Missing solution
 * file or Clarion redirection path".
 */
const PROPERTIES_XML = `<?xml version="1.0" encoding="utf-8"?>
<ClarionProperties xmlns="http://www.softvelocity.com/schemas/Clarion/Properties">
  <Properties name="Clarion.Dictionary">
    <Properties name="Something" />
  </Properties>
  <Properties name="Clarion.Versions">
    <Properties name="Clarion 12.0.14313">
      <path value="C:\\Clarion\\Clarion12-12.0.14204\\bin" />
      <Properties name="RedirectionFile">
        <Name value="Clarion120.red" />
      </Properties>
    </Properties>
    <Properties name="Clarion.NET 4.0.14313">
      <path value="C:\\Clarion\\Clarion12-12.0.14204\\bin" />
    </Properties>
    <Properties name="Clarion 11.1.13855">
      <path value="C:\\Clarion\\Clarion11.1\\bin" />
    </Properties>
  </Properties>
</ClarionProperties>`;

describe('registeredVersionNamesFromXml (#535)', () => {
    it('lists the Win32 version names under Clarion.Versions and skips Clarion.NET', () => {
        assert.deepStrictEqual(registeredVersionNamesFromXml(PROPERTIES_XML), ['Clarion 12.0.14313', 'Clarion 11.1.13855']);
    });

    it('returns an empty list when there is no Clarion.Versions block', () => {
        assert.deepStrictEqual(registeredVersionNamesFromXml('<ClarionProperties><Properties name="Clarion.Dictionary" /></ClarionProperties>'), []);
    });
});

describe('rememberedSolutionState with a version registry (#535)', () => {
    const SLN = 'C:\\Dev\\app.sln';
    const PROPS = 'C:\\Users\\me\\AppData\\Roaming\\SoftVelocity\\Clarion\\12.0\\ClarionProperties.xml';
    const REGISTERED = ['Clarion 12.0.14313', 'Clarion 11.1.13855'];

    it('a remembered version that the properties file no longer lists is stale', () => {
        assert.strictEqual(rememberedSolutionState(SLN, PROPS, 'Clarion 12.0.14234', REGISTERED), 'stale-version');
    });

    it('a remembered version that is listed is ready', () => {
        assert.strictEqual(rememberedSolutionState(SLN, PROPS, 'Clarion 12.0.14313', REGISTERED), 'ready');
    });

    it('when the registry could not be read, the name is not judged', () => {
        assert.strictEqual(rememberedSolutionState(SLN, PROPS, 'Clarion 12.0.14234', null), 'ready');
        assert.strictEqual(rememberedSolutionState(SLN, PROPS, 'Clarion 12.0.14234'), 'ready');
    });

    it('a missing version is still needs-version, whatever the registry says', () => {
        assert.strictEqual(rememberedSolutionState(SLN, PROPS, '', REGISTERED), 'needs-version');
        assert.strictEqual(rememberedSolutionState(SLN, '', 'Clarion 12.0.14313', REGISTERED), 'needs-version');
    });
});

describe('versionRowLabel (#535)', () => {
    const REGISTERED = ['Clarion 12.0.14313'];

    it('a stale name says so instead of posing as a usable version', () => {
        assert.strictEqual(versionRowLabel('Clarion 12.0.14234', '', REGISTERED), 'Clarion 12.0.14234 — not registered, use Set Version');
    });

    it('a registered name shows plainly, with the default when it differs', () => {
        assert.strictEqual(versionRowLabel('Clarion 12.0.14313', '', REGISTERED), 'Clarion 12.0.14313');
        assert.strictEqual(versionRowLabel('Clarion 12.0.14313', 'Clarion 11.1.13855', REGISTERED), 'Clarion 12.0.14313 (default: Clarion 11.1.13855)');
    });

    it('no version at all keeps the #498 wording', () => {
        assert.strictEqual(versionRowLabel('', '', REGISTERED), 'Not set — use Set Version');
    });
});
