import { describe, it } from 'mocha';
import * as assert from 'assert';
import {
    chooseConfiguration,
    explicitConfigurationFor,
    chooseSettingsWriteTarget,
    normalizeConfigurationTo,
} from '../utils/ConfigurationPrecedence';
import { decideConfiguration } from '../utils/ConfigurationPolicy';

/**
 * #530 — which build configuration wins, and where a change is written back.
 *
 * From Mark's multi-root workspace: the Actions view showed Release and nothing he
 * set would move it to Debug. Two causes. The Clarion IDE's `.sln.cache` (the
 * configuration the IDE last built with) was applied ahead of his explicit setting,
 * and settings were read from the `.code-workspace` file (resource-less read) but
 * written to the first folder's `.vscode/settings.json`, so a change through the
 * picker landed somewhere else. His hand-written `Debug|Win32` was also never
 * normalised to the `Debug` the picker produces.
 *
 * `ConfigurationPrecedence` is the pure decision point, in the vscode-API-free
 * pattern of `decideConfiguration` (#437).
 */
describe('chooseConfiguration (#530)', () => {
    const AVAILABLE = ['Debug', 'Release'];

    it('an explicit setting wins over the .sln.cache and the history', () => {
        assert.deepStrictEqual(
            chooseConfiguration({ explicit: 'Debug', slnCache: 'Release|Win32', history: 'Release', available: AVAILABLE }),
            { configuration: 'Debug', source: 'explicit' });
    });

    it('an explicit Config|Platform value is normalised to the name the solution declares', () => {
        assert.deepStrictEqual(
            chooseConfiguration({ explicit: 'Debug|Win32', slnCache: 'Release|Win32', available: AVAILABLE }),
            { configuration: 'Debug', source: 'explicit' });
    });

    it('the explicit match is case-insensitive', () => {
        assert.deepStrictEqual(
            chooseConfiguration({ explicit: 'debug', available: AVAILABLE }),
            { configuration: 'Debug', source: 'explicit' });
    });

    it('with no explicit setting the .sln.cache is used', () => {
        assert.deepStrictEqual(
            chooseConfiguration({ explicit: '', slnCache: 'Release|Win32', history: 'Debug', available: AVAILABLE }),
            { configuration: 'Release', source: 'sln.cache' });
    });

    it('with neither, the history is used', () => {
        assert.deepStrictEqual(
            chooseConfiguration({ history: 'Release', available: AVAILABLE }),
            { configuration: 'Release', source: 'history' });
    });

    it('an explicit value the solution does not declare is ignored, not forced', () => {
        assert.deepStrictEqual(
            chooseConfiguration({ explicit: 'Staging', slnCache: 'Release|Win32', available: AVAILABLE }),
            { configuration: 'Release', source: 'sln.cache' });
    });

    it('a single available configuration is chosen without a prompt', () => {
        assert.deepStrictEqual(
            chooseConfiguration({ available: ['Release'] }),
            { configuration: 'Release', source: 'only' });
    });

    it('several available and no source at all asks the user', () => {
        assert.deepStrictEqual(chooseConfiguration({ available: AVAILABLE }), { configuration: null, source: 'prompt' });
    });

    it('keeps the full Config|Platform form when the solution declares full forms', () => {
        assert.deepStrictEqual(
            chooseConfiguration({ explicit: 'Debug', available: ['Debug|Win32', 'Release|Win32'] }),
            { configuration: 'Debug|Win32', source: 'explicit' });
    });
});

describe('explicitConfigurationFor (#530)', () => {
    const SOLUTIONS = [
        { solutionFile: 'E:\\Dev\\b47.sln', configuration: 'Debug|Win32' },
        { solutionFile: 'E:\\Dev\\other.sln', configuration: 'Release' },
    ];

    it('prefers the solutions[] entry for the solution being opened', () => {
        assert.strictEqual(explicitConfigurationFor('e:\\dev\\B47.sln', 'Release', SOLUTIONS), 'Debug|Win32');
    });

    it('falls back to clarion.configuration when the solution has no entry', () => {
        assert.strictEqual(explicitConfigurationFor('E:\\Dev\\new.sln', 'Release', SOLUTIONS), 'Release');
    });

    it('returns null when nothing is set', () => {
        assert.strictEqual(explicitConfigurationFor('E:\\Dev\\new.sln', '', []), null);
    });
});

describe('chooseSettingsWriteTarget (#530)', () => {
    it('writes back to the folder when the value came from folder settings', () => {
        assert.strictEqual(chooseSettingsWriteTarget({ workspaceFolderValue: 'Debug' }, true), 'WorkspaceFolder');
    });

    it('writes back to the workspace file when the value came from there', () => {
        assert.strictEqual(chooseSettingsWriteTarget({ workspaceValue: 'Debug' }, true), 'Workspace');
    });

    it('a value in both places is treated as folder-owned (VS Code precedence)', () => {
        assert.strictEqual(chooseSettingsWriteTarget({ workspaceValue: 'Release', workspaceFolderValue: 'Debug' }, true), 'WorkspaceFolder');
    });

    it('nothing set yet in a saved workspace goes to the workspace file', () => {
        assert.strictEqual(chooseSettingsWriteTarget({}, true), 'Workspace');
    });

    it('nothing set yet in a plain folder goes to the folder', () => {
        assert.strictEqual(chooseSettingsWriteTarget({}, false), 'WorkspaceFolder');
    });
});

describe('normalizeConfigurationTo and decideConfiguration accept Config|Platform (#530)', () => {
    it('Debug|Win32 normalises to Debug against name-only availables', () => {
        assert.strictEqual(normalizeConfigurationTo('Debug|Win32', ['Debug', 'Release']), 'Debug');
    });

    it('Debug normalises to Debug|Win32 against full-form availables', () => {
        assert.strictEqual(normalizeConfigurationTo('Debug', ['Debug|Win32', 'Release|Win32']), 'Debug|Win32');
    });

    it('an unknown name normalises to null', () => {
        assert.strictEqual(normalizeConfigurationTo('Staging', ['Debug', 'Release']), null);
    });

    it('decideConfiguration treats a hand-written Debug|Win32 as a migration to Debug, not a prompt', () => {
        assert.deepStrictEqual(decideConfiguration(['Debug', 'Release'], 'Debug|Win32'), { kind: 'migrated', configuration: 'Debug' });
    });

    it('decideConfiguration is case-insensitive', () => {
        assert.deepStrictEqual(decideConfiguration(['Debug', 'Release'], 'release'), { kind: 'migrated', configuration: 'Release' });
    });
});
