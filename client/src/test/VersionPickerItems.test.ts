import { describe, it } from 'mocha';
import * as assert from 'assert';
import {
    buildCompileTargetItems,
    buildInstallationItems,
} from '../utils/VersionPickerItems';
import { ClarionInstallation } from '../utils/ClarionInstallationDetector';

function makeInstallation(
    ideVersion: string,
    propertiesPath: string,
    compileTargetNames: string[]
): ClarionInstallation {
    return {
        ideVersion,
        propertiesPath,
        compilerVersions: compileTargetNames.map(name => ({
            name,
            path: '',
            redirectionFile: '',
            macros: {},
            libsrc: '',
        })),
    };
}

describe('VersionPickerItems', () => {

    describe('buildCompileTargetItems', () => {

        it('lists every Compile Target then appends the switch-Installation sentinel', () => {
            const installation = makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['A', 'B', 'C']);
            const items = buildCompileTargetItems(installation, null);

            assert.strictEqual(items.length, 4);
            assert.strictEqual(items[0].targetName, 'A');
            assert.strictEqual(items[1].targetName, 'B');
            assert.strictEqual(items[2].targetName, 'C');
            assert.strictEqual(items[3].isSwitchInstallation, true);
            assert.strictEqual(items[3].targetName, undefined);
        });

        it('marks the active Compile Target with check + (current)', () => {
            const installation = makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['A', 'B']);
            const items = buildCompileTargetItems(installation, 'B');

            assert.strictEqual(items[0].description, undefined);
            assert.ok(items[1].description?.includes('check'), 'active target description should include check icon');
            assert.ok(items[1].description?.includes('(current)'), 'active target description should include (current)');
            // Sentinel is not marked active even when no Compile Target matched
            assert.strictEqual(items[2].description, 'Pick a different Clarion IDE installation');
        });

        it('marks nothing when activeCompileTargetName is null', () => {
            const installation = makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['A', 'B']);
            const items = buildCompileTargetItems(installation, null);

            assert.strictEqual(items[0].description, undefined);
            assert.strictEqual(items[1].description, undefined);
        });

        it('marks nothing when active name does not match any Compile Target', () => {
            const installation = makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['A', 'B']);
            const items = buildCompileTargetItems(installation, 'Z');

            assert.strictEqual(items[0].description, undefined);
            assert.strictEqual(items[1].description, undefined);
        });

        it('handles a single-Compile-Target Installation', () => {
            const installation = makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['Only']);
            const items = buildCompileTargetItems(installation, 'Only');

            assert.strictEqual(items.length, 2);
            assert.strictEqual(items[0].targetName, 'Only');
            assert.ok(items[0].description?.includes('current'));
            assert.strictEqual(items[1].isSwitchInstallation, true);
        });

        it('handles an Installation with zero Compile Targets (just the sentinel)', () => {
            const installation = makeInstallation('11.0', 'C:/x/11.0/CP.xml', []);
            const items = buildCompileTargetItems(installation, null);

            assert.strictEqual(items.length, 1);
            assert.strictEqual(items[0].isSwitchInstallation, true);
        });
    });

    describe('buildInstallationItems', () => {

        it('lists every Installation with label + propertiesPath + count in detail', () => {
            const items = buildInstallationItems([
                makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['t1', 't2', 't3']),
                makeInstallation('6.0', 'C:/x/6.0/CP.xml', ['only']),
            ], null);

            assert.strictEqual(items.length, 2);
            assert.strictEqual(items[0].label, 'Clarion 11.0');
            assert.strictEqual(items[0].ideVersion, '11.0');
            assert.strictEqual(items[0].propertiesPath, 'C:/x/11.0/CP.xml');
            assert.ok(items[0].detail?.includes('C:/x/11.0/CP.xml'), 'detail should contain full propertiesPath');
            assert.ok(items[0].detail?.includes('3 compile targets'), 'detail should pluralize count');
        });

        it('uses singular "compile target" when there is exactly one', () => {
            const items = buildInstallationItems([
                makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['only']),
            ], null);

            assert.ok(items[0].detail?.endsWith('1 compile target'), `detail should be singular, got: ${items[0].detail}`);
        });

        it('marks the active Installation by propertiesPath match', () => {
            const items = buildInstallationItems([
                makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['t']),
                makeInstallation('11.1', 'C:/x/11.1/CP.xml', ['t']),
            ], 'C:/x/11.1/CP.xml');

            assert.strictEqual(items[0].description, undefined);
            assert.ok(items[1].description?.includes('check'), 'active Installation description should include check icon');
            assert.ok(items[1].description?.includes('(current)'), 'active Installation description should include (current)');
        });

        it('marks nothing when activePropertiesPath is null', () => {
            const items = buildInstallationItems([
                makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['t']),
            ], null);

            assert.strictEqual(items[0].description, undefined);
        });

        it('marks nothing when activePropertiesPath does not match any Installation', () => {
            const items = buildInstallationItems([
                makeInstallation('11.0', 'C:/x/11.0/CP.xml', ['t']),
            ], 'C:/x/nope/CP.xml');

            assert.strictEqual(items[0].description, undefined);
        });

        it('returns an empty array for an empty Installation list', () => {
            const items = buildInstallationItems([], null);
            assert.deepStrictEqual(items, []);
        });
    });
});
