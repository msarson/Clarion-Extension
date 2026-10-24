import { describe, it } from 'mocha';
import * as assert from 'assert';
import { rememberedSelectionForSwitch, folderSwitchConfigurationSources } from '../solution/FolderSwitchSelection';
import { chooseConfiguration } from '../utils/ConfigurationPrecedence';

/**
 * #780 — opening a solution in another folder (or with no folder open) recorded it in the
 * solution history with no Clarion version and switched folders. The restarted window found the
 * entry, could not load it without a version (#498) and stayed a plain folder. A switch now
 * carries a complete selection: the remembered one when it can still load, else the user picks
 * before the switch.
 */
describe('Selection carried across a folder switch (#780)', () => {
    const SLN = 'C:\\Sys\\ProjA\\ProjA.sln';
    const PROPS = 'C:\\Users\\u\\AppData\\Roaming\\SoftVelocity\\Clarion\\11.0\\ClarionProperties.xml';
    const loadable = () => true;

    it('a remembered selection that still loads is reused, with its configuration', () => {
        const remembered = [{ solutionFile: SLN, propertiesFile: PROPS, version: 'Clarion 11', configuration: 'Release' }];
        assert.deepStrictEqual(rememberedSelectionForSwitch(SLN, remembered, loadable),
            { propertiesFile: PROPS, version: 'Clarion 11', configuration: 'Release' });
    });

    it('the solution is matched by path, not by spelling', () => {
        const remembered = [{ solutionFile: 'c:/sys/proja/PROJA.SLN', propertiesFile: PROPS, version: 'Clarion 11' }];
        assert.deepStrictEqual(rememberedSelectionForSwitch(SLN, remembered, loadable),
            { propertiesFile: PROPS, version: 'Clarion 11', configuration: '' });
    });

    it('an entry with no version, as the switch used to write, means the user picks', () => {
        const remembered = [{ solutionFile: SLN }];
        assert.strictEqual(rememberedSelectionForSwitch(SLN, remembered, loadable), undefined);
    });

    it('a remembered version that can no longer load means the user picks', () => {
        const remembered = [{ solutionFile: SLN, propertiesFile: PROPS, version: 'INEC V11' }];
        assert.strictEqual(rememberedSelectionForSwitch(SLN, remembered, () => false), undefined);
    });

    it('another solution\'s selection is never borrowed', () => {
        const remembered = [{ solutionFile: 'C:\\Sys\\ProjB\\ProjB.sln', propertiesFile: PROPS, version: 'Clarion 11' }];
        assert.strictEqual(rememberedSelectionForSwitch(SLN, remembered, loadable), undefined);
    });
});

/**
 * #780 review — the configuration for a folder switch is chosen while the old folder is still
 * open, so its plain `clarion.configuration` belongs to another solution: it must not outrank the
 * target's own records. Only a `clarion.solutions[]` entry for the target is the user's choice;
 * the plain setting counts when no folder is open, where it is the user-level preference.
 */
describe('Configuration chosen for a folder switch (#780)', () => {
    const SLN = 'C:\\Sys\\ProjB\\ProjB.sln';
    const available = ['Debug', 'Release'];
    const choose = (s: Parameters<typeof folderSwitchConfigurationSources>[0]) =>
        chooseConfiguration(folderSwitchConfigurationSources(s)).configuration;

    it('the old folder\'s plain setting does not outrank the target\'s .sln.cache', () => {
        assert.strictEqual(choose({ solutionPath: SLN, folderOpen: true, settingValue: 'Debug', solutions: [],
            slnCache: 'Release|Win32', remembered: undefined, available }), 'Release');
    });

    it('a solutions[] entry for the target is still the user\'s choice', () => {
        assert.strictEqual(choose({ solutionPath: SLN, folderOpen: true, settingValue: 'Debug',
            solutions: [{ solutionFile: SLN, configuration: 'Debug' }],
            slnCache: 'Release|Win32', remembered: undefined, available }), 'Debug');
    });

    it('with no folder open the plain setting is the user\'s own and wins', () => {
        assert.strictEqual(choose({ solutionPath: SLN, folderOpen: false, settingValue: 'Debug', solutions: [],
            slnCache: 'Release|Win32', remembered: undefined, available }), 'Debug');
    });

    it('the remembered configuration is used when nothing else names one', () => {
        assert.strictEqual(choose({ solutionPath: SLN, folderOpen: true, settingValue: 'Debug', solutions: [],
            slnCache: null, remembered: 'Release', available }), 'Release');
    });
});
