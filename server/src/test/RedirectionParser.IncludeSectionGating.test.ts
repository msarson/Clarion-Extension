import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer, matchesActiveConfiguration } from '../solution/redirectionFileParserServer';
import { serverSettings } from '../serverSettings';

/**
 * #436 — an `{include}` sitting INSIDE a section is not gated by that section.
 *
 * `redirection_file.htm` states: "any {include} within a section is only active
 * when that section is active." The shipped system does not behave that way.
 *
 * Verified 2026-09-06 against Clarion 12.0.14204 using the IDE's own redirection
 * trace. A parent whose `[Debug]` section contained `{include reddebug.red}`,
 * where that file claims `*.txt`, traced under a **Release** configuration:
 *
 *     Section:  Debug in file ...\Clarion120.red is not active.  Section skipped.
 *     Looking in Section:  Common in file ...\reddebug.red
 *     Pattern: *.txt matches
 *     FOUND: ...\redtest-debug\redtarget.txt
 *
 * The section's own entries are skipped; the included file is consulted anyway,
 * and the IDE labels its content "Common". So `{include}` splices content in and
 * the enclosing section does not gate it.
 *
 * This is the second place today where that help page proved an incomplete
 * description of the same subsystem — the first being custom-named sections and
 * `[Common]` staying active alongside them. In both cases our existing behaviour
 * was already right and the documented behaviour would have been a regression.
 *
 * These tests exist so that implementing the documented gating fails loudly
 * rather than silently dropping entries the compiler uses.
 */

interface Fixture { tmpRoot: string; projDir: string; }

function buildFixture(parentRed: string, files: { [rel: string]: string } = {}): Fixture {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-include-436-'));
    const projDir = path.join(tmpRoot, 'Proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'Clarion110.red'), parentRed);
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(projDir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return { tmpRoot, projDir };
}

suite('RedirectionParser — {include} inside a section is not gated by it (#436)', () => {

    let fixtures: Fixture[] = [];
    let savedRedirectionFile = '';
    let savedConfiguration = '';
    let savedLibsrc: string[] = [];
    let savedMacros: Record<string, string> = {};

    setup(() => {
        fixtures = [];
        savedRedirectionFile = serverSettings.redirectionFile;
        savedConfiguration = serverSettings.configuration;
        savedLibsrc = serverSettings.libsrcPaths;
        savedMacros = serverSettings.macros;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        serverSettings.macros = {};
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.configuration = savedConfiguration;
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.macros = savedMacros;
        for (const f of fixtures) {
            try { fs.rmSync(f.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
        }
    });

    /** The shape the IDE trace was run against: an include nested in [Debug]. */
    const PARENT = '[Debug]\n{include child.red}\n\n[Common]\n*.clw = .\n';
    const CHILD = '*.txt = .\\dbgonly\n';

    test('the included file\'s unsectioned entries are tagged Common, matching the IDE trace', () => {
        const fix = buildFixture(PARENT, { 'child.red': CHILD });
        fixtures.push(fix);
        serverSettings.configuration = 'Release|Win32';

        const entries = new RedirectionFileParserServer().parseRedFile(fix.projDir);
        const txt = entries.filter(e => e.extension.toLowerCase() === '*.txt');

        assert.strictEqual(txt.length, 1, 'the included file contributes its entry');
        assert.strictEqual(txt[0].section.toLowerCase(), 'common',
            `the IDE reports included content as "Section: Common"; got [${txt[0].section}]`);
    });

    test('that entry is ACTIVE under a Release configuration (the bug-pin)', () => {
        // The documented gating would make this inactive, because the {include}
        // sits inside [Debug]. Clarion resolves the file anyway — the trace found
        // it under Release. If this ever fails, the documented behaviour has been
        // implemented and entries the compiler uses are being dropped.
        const fix = buildFixture(PARENT, { 'child.red': CHILD });
        fixtures.push(fix);
        serverSettings.configuration = 'Release|Win32';

        const entries = new RedirectionFileParserServer().parseRedFile(fix.projDir);
        const txt = entries.find(e => e.extension.toLowerCase() === '*.txt')!;

        assert.ok(matchesActiveConfiguration(txt, serverSettings.configuration, fix.projDir),
            'an {include} inside [Debug] still contributes under Release — verified against Clarion 12.0.14204');
    });

    test('and under Debug too, so the entry is configuration-independent', () => {
        const fix = buildFixture(PARENT, { 'child.red': CHILD });
        fixtures.push(fix);
        serverSettings.configuration = 'Debug|Win32';

        const entries = new RedirectionFileParserServer().parseRedFile(fix.projDir);
        const txt = entries.find(e => e.extension.toLowerCase() === '*.txt')!;

        assert.ok(matchesActiveConfiguration(txt, serverSettings.configuration, fix.projDir),
            'the same entry is active under Debug — Common is always active');
    });

    test('sentinel: a sectioned entry in the PARENT is still gated normally', () => {
        // The section skip the trace showed ("Section: Debug ... is not active")
        // is real and must keep working — this is what stops the fix above from
        // being read as "sections do not gate anything".
        const fix = buildFixture('[Debug]\n*.inc = .\\dbginc\n\n[Common]\n*.clw = .\n');
        fixtures.push(fix);
        serverSettings.configuration = 'Release|Win32';

        const entries = new RedirectionFileParserServer().parseRedFile(fix.projDir);
        const inc = entries.find(e => e.extension.toLowerCase() === '*.inc')!;

        assert.strictEqual(inc.section.toLowerCase(), 'debug', 'parsed with its declared section');
        assert.ok(!matchesActiveConfiguration(inc, serverSettings.configuration, fix.projDir),
            'a [Debug] entry declared directly in the parent must NOT be active under Release');
    });
});
