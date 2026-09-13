import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { describeNonDefaultConfigDir } from '../utils/ClarionConfigDir';
import { buildBrowseFooterItem, buildInstallationItems } from '../utils/VersionPickerItems';
import { ClarionInstallation } from '../utils/ClarionInstallationDetector';

/**
 * #479 — making a ClarionProperties.xml outside %APPDATA% reachable and visible.
 *
 * A properties file need not live under `%APPDATA%\SoftVelocity\Clarion`: `clarion.exe`
 * and `ClarionCL.exe` both take `/ConfigDir=`, and the build passes a matching
 * `ConfigDir` property since #471, so a checked-out tree can carry its own IDE settings.
 *
 * `detectInstallations()` scans AppData only, so such an installation is never
 * discovered. A picker that accepts any path already existed (#134) but ran in exactly
 * one situation — discovery returning nothing — so a developer with a normal AppData
 * install AND a ConfigDir tree could never reach it. Hence the footer entry.
 *
 * The display half matters because #471 changed what the version label means: the
 * compile-target name alone stopped being a unique identifier once two installations
 * could present the same name from different files, and the build now follows the file.
 */
describe('#479 — choosing and showing a non-default Clarion configuration', () => {

    const APPDATA = path.join('C:', 'Users', 'dev', 'AppData', 'Roaming');
    const DEFAULT_ROOT = path.join(APPDATA, 'SoftVelocity', 'Clarion');

    describe('describeNonDefaultConfigDir', () => {

        it('stays quiet for the ordinary AppData location', () => {
            const props = path.join(DEFAULT_ROOT, '12.0', 'ClarionProperties.xml');
            assert.strictEqual(describeNonDefaultConfigDir(props, APPDATA), null,
                'showing the default path to everyone would bury the signal the row carries');
        });

        it('reports the folder for a ConfigDir layout', () => {
            const props = path.join('E:', 'Dev', 'CWRoot', 'Settings', 'ClarionProperties.xml');
            assert.strictEqual(
                describeNonDefaultConfigDir(props, APPDATA),
                path.join('E:', 'Dev', 'CWRoot', 'Settings'));
        });

        it('is not fooled by a sibling whose name merely starts with the default root', () => {
            // ...\SoftVelocity\ClarionExtras is NOT inside ...\SoftVelocity\Clarion
            const props = path.join(APPDATA, 'SoftVelocity', 'ClarionExtras', 'ClarionProperties.xml');
            assert.notStrictEqual(describeNonDefaultConfigDir(props, APPDATA), null,
                'prefix matching without a separator anchor would hide a genuinely different folder');
        });

        it('compares case-insensitively, as Windows paths require', () => {
            const props = path.join(DEFAULT_ROOT.toUpperCase(), '12.0', 'ClarionProperties.xml');
            assert.strictEqual(describeNonDefaultConfigDir(props, APPDATA), null);
        });

        it('shows the folder rather than hiding it when APPDATA is unknown', () => {
            const props = path.join('E:', 'Settings', 'ClarionProperties.xml');
            assert.strictEqual(
                describeNonDefaultConfigDir(props, undefined),
                path.join('E:', 'Settings'),
                'unable to tell whether it is default — better to show than to mislead');
        });

        it('returns null when nothing is configured', () => {
            assert.strictEqual(describeNonDefaultConfigDir(undefined, APPDATA), null);
            assert.strictEqual(describeNonDefaultConfigDir('', APPDATA), null);
        });
    });

    describe('the Browse footer item', () => {

        const installations: ClarionInstallation[] = [{
            ideVersion: '12.0',
            propertiesPath: path.join(DEFAULT_ROOT, '12.0', 'ClarionProperties.xml'),
            compilerVersions: [{ name: 'Clarion 12.0.14234' } as any],
        } as any];

        it('is flagged so the caller can tell it from a real installation', () => {
            const item = buildBrowseFooterItem();
            assert.strictEqual(item.isBrowse, true);
            assert.ok(/Browse/i.test(item.label), `got: ${item.label}`);
        });

        it('carries no properties path — the path is whatever the user picks next', () => {
            const item = buildBrowseFooterItem();
            assert.strictEqual(item.propertiesPath, '',
                'a non-empty path here would be matched against the discovered list and resolve wrongly');
        });

        it('appends below the discovered installations without disturbing them', () => {
            const items = buildInstallationItems(installations, null);
            const before = items.length;
            items.push(buildBrowseFooterItem());

            assert.strictEqual(items.length, before + 1);
            assert.strictEqual(items[items.length - 1].isBrowse, true, 'must be last');
            assert.ok(items.slice(0, before).every(i => !i.isBrowse),
                'real installations must not be flagged as the sentinel');
        });

        it('does not collide with the current-installation match', () => {
            // The caller resolves a pick with
            //   installations.find(i => i.propertiesPath === picked.propertiesPath)
            // so the sentinel must not accidentally match a real entry.
            const items = buildInstallationItems(installations, null);
            items.push(buildBrowseFooterItem());
            const browse = items[items.length - 1];
            assert.strictEqual(
                installations.find(i => i.propertiesPath === browse.propertiesPath),
                undefined,
                'the sentinel must resolve to no installation, which is why it is handled first');
        });
    });
});
