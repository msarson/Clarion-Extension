import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { settingsSaveFailureNotice } from '../utils/SettingsSaveFailure';

/**
 * #767 — when VS Code refused to write the folder's settings (its .vscode\settings.json had
 * an error), the solution never opened: no project owned any file, every lookup fell back to
 * the file's own folder, and every reopen asked for version and configuration again. The
 * solution now opens for the session and the notice names the file to fix.
 */
describe('A failed solution-settings save (#767)', () => {
    const vsCodeMessage = "Unable to write into folder settings. Please open the 'RF012' folder settings to correct errors/warnings in it and try again.";
    const folder = 'E:\\Sys\\RF012';
    const settingsFile = path.join(folder, '.vscode', 'settings.json');

    it('says the solution is open and quotes VS Code', () => {
        const notice = settingsSaveFailureNotice('E:\\Sys\\RF012\\RF012.sln', folder, vsCodeMessage, () => false);
        assert.ok(notice.message.includes('"RF012.sln" is open'), notice.message);
        assert.ok(notice.message.includes(vsCodeMessage), notice.message);
    });

    it('names the folder settings file and offers it when it exists', () => {
        const notice = settingsSaveFailureNotice('E:\\Sys\\RF012\\RF012.sln', folder, vsCodeMessage, p => p === settingsFile);
        assert.strictEqual(notice.settingsFile, settingsFile);
        assert.ok(notice.message.includes(settingsFile), notice.message);
    });

    it('offers no file when there is none', () => {
        assert.strictEqual(settingsSaveFailureNotice('E:\\Sys\\RF012\\RF012.sln', folder, vsCodeMessage, () => false).settingsFile, undefined);
        assert.strictEqual(settingsSaveFailureNotice('E:\\Sys\\RF012\\RF012.sln', undefined, vsCodeMessage, () => true).settingsFile, undefined);
    });

    it('the opener does not abandon the solution when the save fails', () => {
        // vscode-free pin: the opener must not branch on saveSolutionSettings' result.
        const root = path.resolve(__dirname, '..', '..', '..', '..');
        const source = fs.readFileSync(path.join(root, 'client', 'src', 'utils', 'SmartSolutionOpener.ts'), 'utf-8');
        assert.ok(source.includes('SettingsStorageManager.saveSolutionSettings('), 'opener no longer saves?');
        assert.ok(!/=\s*await\s+SettingsStorageManager\.saveSolutionSettings\(/.test(source),
            'SmartSolutionOpener branches on the save result again; a failed save must not stop the open');
    });
});
