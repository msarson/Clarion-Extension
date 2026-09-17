import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { versionPickEffect, VersionPick } from '../utils/VersionPickPolicy';

/**
 * #573 — with a solution loaded, a version picked through Set Version changed the client's
 * in-memory version only: the language server kept resolving through the old install, the
 * solution's settings kept the old version, and build/run (which read the in-memory paths)
 * disagreed with the editor. Decided: the pick is saved as the solution's version and the
 * solution is reinitialized. With no solution loaded the pick stays session-only.
 */
const C12 = 'C:\\Users\\me\\AppData\\Roaming\\SoftVelocity\\Clarion\\12.0\\ClarionProperties.xml';
const C10 = 'C:\\Users\\me\\AppData\\Roaming\\SoftVelocity\\Clarion\\10.0\\ClarionProperties.xml';
const pick = (over: Partial<VersionPick>): VersionPick => ({
    solutionLoaded: true,
    previousVersion: 'Clarion 12.0.14313',
    previousPropertiesFile: C12,
    pickedVersion: 'Clarion 10.0.12463',
    pickedPropertiesFile: C10,
    ...over,
});

suite('Set Version with a solution loaded (#573)', () => {
    test('another version is saved for the solution and the solution reinitialized', () => {
        assert.strictEqual(versionPickEffect(pick({})), 'save-and-reinitialize');
    });

    test('another compile target in the same properties file counts as a change', () => {
        assert.strictEqual(versionPickEffect(pick({ pickedVersion: 'Clarion 12.0.99999', pickedPropertiesFile: C12 })), 'save-and-reinitialize');
    });

    test('the same version from another properties file counts as a change', () => {
        assert.strictEqual(versionPickEffect(pick({ pickedVersion: 'Clarion 12.0.14313', pickedPropertiesFile: 'D:\\Portable\\ClarionProperties.xml' })), 'save-and-reinitialize');
    });

    test('picking the version already in use changes nothing, in any spelling', () => {
        assert.strictEqual(versionPickEffect(pick({ pickedVersion: 'Clarion 12.0.14313', pickedPropertiesFile: C12 })), 'unchanged');
        assert.strictEqual(versionPickEffect(pick({ pickedVersion: 'clarion 12.0.14313', pickedPropertiesFile: C12.toLowerCase().replace(/\\/g, '/') })), 'unchanged');
    });

    test('with no solution loaded the pick is the session\'s version only', () => {
        assert.strictEqual(versionPickEffect(pick({ solutionLoaded: false })), 'session-only');
        assert.strictEqual(versionPickEffect(pick({ solutionLoaded: false, pickedVersion: 'Clarion 12.0.14313', pickedPropertiesFile: C12 })), 'session-only');
    });

    test('both pickers apply the pick through the helper that acts on the effect', () => {
        // ClarionExtensionCommands imports vscode, so the wiring is pinned on the source.
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', '..', '..', '..', 'client', 'src', 'ClarionExtensionCommands.ts'), 'utf8');
        const direct = source.match(/\bsetActiveClarionVersion\(/g) ?? [];
        assert.strictEqual(direct.length, 1, 'only applyPickedVersion may call setActiveClarionVersion');
        const helper = source.slice(source.indexOf('private static async applyPickedVersion('));
        const body = helper.slice(0, helper.indexOf('\n  }\n') > 0 ? helper.indexOf('\n  }\n') : helper.indexOf('\r\n  }\r\n'));
        assert.ok(body.includes('setGlobalClarionSelection('), 'the pick must be saved for the loaded solution');
        assert.ok(body.includes("'clarion.reinitializeSolution'"), 'the loaded solution must be reinitialized');
    });
});
