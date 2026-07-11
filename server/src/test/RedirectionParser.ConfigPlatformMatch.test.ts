import * as assert from 'assert';
import { matchesActiveConfiguration, RedirectionEntry } from '../solution/redirectionFileParserServer';

/**
 * #293 — a solution build configuration is "Config|Platform" (e.g. "Debug|Win32") but RED sections
 * are named by build configuration alone ([Debug]/[Release]/custom). The strict comparison dropped
 * every configuration section, collapsing search paths to [Common]-only and leaving ~99% of a real
 * 40-project solution's source files unresolvable at load (FRG built over 41 of 3016 files).
 */
suite('#293 matchesActiveConfiguration — Config|Platform forms', () => {
    function entry(section: string): RedirectionEntry {
        return { section, extension: '*.clw', paths: ['.'], redFile: 'x.red' } as RedirectionEntry;
    }

    test('[Debug] matches "Debug|Win32" (pipe-platform stripped)', () => {
        assert.strictEqual(matchesActiveConfiguration(entry('Debug'), 'Debug|Win32'), true);
    });

    test('[Release] does NOT match "Debug|Win32"', () => {
        assert.strictEqual(matchesActiveConfiguration(entry('Release'), 'Debug|Win32'), false);
    });

    test('[Common] always matches', () => {
        assert.strictEqual(matchesActiveConfiguration(entry('Common'), 'Debug|Win32'), true);
        assert.strictEqual(matchesActiveConfiguration(entry('common'), 'Release'), true);
    });

    test('exact section=configuration still matches (bare and custom names, case-insensitive)', () => {
        assert.strictEqual(matchesActiveConfiguration(entry('Debug'), 'debug'), true);
        assert.strictEqual(matchesActiveConfiguration(entry('Profile'), 'Profile'), true);
        assert.strictEqual(matchesActiveConfiguration(entry('Profile'), 'Release'), false);
    });

    test('custom section with a pipe form matches its config segment', () => {
        assert.strictEqual(matchesActiveConfiguration(entry('Profile'), 'Profile|Win32'), true);
    });

    test('degenerate configurations do not accidentally match', () => {
        assert.strictEqual(matchesActiveConfiguration(entry('Debug'), ''), false);
        assert.strictEqual(matchesActiveConfiguration(entry('Debug'), '|Win32'), false);
    });
});
