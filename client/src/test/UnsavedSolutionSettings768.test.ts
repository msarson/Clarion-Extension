import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { mergeReference, unsavedSolutionForFolder, unsavedSettingsForSolution } from '../utils/UnsavedSolutionSettings';
import { settingsSaveFailureNotice } from '../utils/SettingsSaveFailure';
import type { SolutionReference } from '../utils/GlobalSolutionHistory';

/**
 * #768 — when VS Code refuses to write a folder's settings (#767), the solution's selection is
 * kept in the extension's own history, flagged as not saved, so the folder reopens it and
 * opening it again doesn't ask for everything. A successful save clears the flag.
 */
describe('A selection the folder settings could not hold (#768)', () => {
    const folder = 'E:\\Sys\\RF012';
    const sln = 'E:\\Sys\\RF012\\RF012.sln';
    const ref = (over: Partial<SolutionReference>): SolutionReference => ({
        folderPath: folder,
        settingsPath: path.join(folder, '.vscode', 'settings.json'),
        solutionFile: sln,
        lastOpened: new Date('2026-10-22'),
        propertiesFile: 'C:\\Users\\U\\AppData\\Roaming\\SoftVelocity\\Clarion\\11.0\\ClarionProperties.xml',
        version: 'INEC V11',
        configuration: 'Debug',
        settingsUnsaved: true,
        ...over,
    });
    const exists = (p: string) => p === sln;

    describe('mergeReference', () => {
        it('an add that leaves the settings out keeps what was stored', () => {
            const merged = mergeReference(ref({}), { folderPath: folder, settingsPath: '', solutionFile: sln, lastOpened: new Date('2026-10-23') });
            assert.strictEqual(merged.propertiesFile, ref({}).propertiesFile);
            assert.strictEqual(merged.version, 'INEC V11');
            assert.strictEqual(merged.configuration, 'Debug');
            assert.strictEqual(merged.settingsUnsaved, true);
            assert.strictEqual(merged.lastOpened.toISOString(), new Date('2026-10-23').toISOString());
        });

        it('values given win, and an explicit false clears the flag', () => {
            const merged = mergeReference(ref({}), ref({ version: 'INEC V6', settingsUnsaved: false }));
            assert.strictEqual(merged.version, 'INEC V6');
            assert.strictEqual(merged.settingsUnsaved, false);
        });

        it('with nothing stored, the new entry as given', () => {
            assert.deepStrictEqual(mergeReference(undefined, ref({})), ref({}));
        });
    });

    describe('unsavedSolutionForFolder', () => {
        it('the most recent flagged solution of the folder', () => {
            const older = ref({ solutionFile: 'E:\\Sys\\RF012\\Other.sln' });
            const found = unsavedSolutionForFolder([ref({}), older], 'e:\\sys\\rf012', p => p === sln || p === older.solutionFile);
            assert.strictEqual(found?.solutionFile, sln);
        });

        it('not a solution whose settings were saved, another folder, a missing file or an incomplete entry', () => {
            assert.strictEqual(unsavedSolutionForFolder([ref({ settingsUnsaved: false })], folder, exists), undefined);
            assert.strictEqual(unsavedSolutionForFolder([ref({ settingsUnsaved: undefined })], folder, exists), undefined);
            assert.strictEqual(unsavedSolutionForFolder([ref({})], 'E:\\Sys\\RF013', exists), undefined);
            assert.strictEqual(unsavedSolutionForFolder([ref({})], folder, () => false), undefined);
            assert.strictEqual(unsavedSolutionForFolder([ref({ version: undefined })], folder, exists), undefined);
            assert.strictEqual(unsavedSolutionForFolder([ref({ propertiesFile: undefined })], folder, exists), undefined);
        });
    });

    describe('unsavedSettingsForSolution', () => {
        it('the flagged entry\'s settings', () => {
            assert.deepStrictEqual(unsavedSettingsForSolution([ref({})], 'e:\\sys\\rf012\\rf012.sln'),
                { propertiesFile: ref({}).propertiesFile, version: 'INEC V11', configuration: 'Debug' });
        });

        it('nothing for an entry whose settings were saved', () => {
            assert.strictEqual(unsavedSettingsForSolution([ref({ settingsUnsaved: false })], sln), undefined);
        });
    });

    it('the warning says the choice is remembered, not asked again', () => {
        const notice = settingsSaveFailureNotice(sln, folder, 'VS Code message', () => false);
        assert.ok(!notice.message.includes('asked for them again'), notice.message);
        assert.ok(notice.message.includes('remember'), notice.message);
    });

    it('startup and the opener read the flagged entry; the save records and clears it', () => {
        const root = path.resolve(__dirname, '..', '..', '..', '..');
        const read = (rel: string) => fs.readFileSync(path.join(root, 'client', 'src', rel), 'utf-8');
        assert.ok(read('globals.ts').includes('unsavedSolutionForFolder('), 'startup does not reopen a flagged solution');
        assert.ok(read('utils/SmartSolutionOpener.ts').includes('unsavedSettingsForSolution('), 'the opener does not use the flagged settings');
        const manager = read('utils/SettingsStorageManager.ts');
        assert.ok(manager.includes('GlobalSolutionHistory.markSettingsSaved('), 'a successful save does not clear the flag');
        assert.ok(/GlobalSolutionHistory\.addSolution\([^;]*,\s*true\s*\)/.test(manager), 'a failed save does not record the selection');
    });
});
