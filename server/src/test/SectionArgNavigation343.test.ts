import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Position } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { SolutionManager } from '../solution/solutionManager';

/**
 * Issue #343 — navigation on the SECTION argument of INCLUDE('file','section').
 *
 * The filename argument regained hover/link/F12 in #342; the section argument
 * had neither (the retired client hover used to resolve SECTION locations).
 * F12 on the section name lands on the SECTION('name') line inside the
 * resolved include; hover names the resolved file + line. Both ride
 * SectionLocator so the surfaces agree. Fixture mirrors SmokeTest101's
 * sections.clw shape.
 */

let tmpDir = '';
let savedSm: unknown;
let clwUri = '';

const MEMBER_LINES = [
    "  MEMBER('noprog.clw')",                              // 0
    "  INCLUDE('sections.clw','SmokeSection'),ONCE",       // 1 — the shape under test
    "  INCLUDE('sections.clw','NoSuchSection'),ONCE",      // 2 — unknown section
    '  MAP',
    '  END',
];

const SECTIONS_LINES = [
    '! section include fixture',                            // 0
    "  SECTION('OtherSection')",                            // 1
    'OtherVar             LONG',                            // 2
    "  section('SmokeSection')",                            // 3 — lowercase on purpose
    'SectionVar           LONG',                            // 4
];

suite('Issue #343 — INCLUDE section-argument navigation', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = null; // same-dir fallback path
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '343-section-'));
        fs.writeFileSync(path.join(tmpDir, 'sections.clw'), SECTIONS_LINES.join('\r\n'), { encoding: 'latin1' });
        clwUri = 'file:///' + path.join(tmpDir, 'member.clw').replace(/\\/g, '/');
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    function makeDoc(): TextDocument {
        return TextDocument.create(clwUri, 'clarion', 1, MEMBER_LINES.join('\n'));
    }

    function posOn(line: number, needle: string): Position {
        const text = MEMBER_LINES[line];
        const idx = text.indexOf(needle);
        if (idx === -1) throw new Error(`'${needle}' not on line ${line}`);
        return { line, character: idx + 2 };
    }

    test('F12 on the section name lands on the SECTION line (case-insensitive)', async () => {
        const result = await new DefinitionProvider().provideDefinition(makeDoc(), posOn(1, 'SmokeSection'));
        const loc = (Array.isArray(result) ? result[0] : result) as Location | null;
        assert.ok(loc, 'expected a definition for the section argument');
        assert.ok(loc!.uri.toLowerCase().endsWith('sections.clw'), `expected sections.clw; got ${loc!.uri}`);
        assert.strictEqual(loc!.range.start.line, 3, 'must land on the section(SmokeSection) line');
    });

    test('F12 on an unknown section returns null (no misleading file-top jump)', async () => {
        const result = await new DefinitionProvider().provideDefinition(makeDoc(), posOn(2, 'NoSuchSection'));
        const loc = Array.isArray(result) ? result[0] : result;
        assert.ok(!loc, `expected null; got ${JSON.stringify(loc)}`);
    });

    test('hover on the section name names the resolved file + line', async () => {
        const hover = await new HoverProvider().provideHover(makeDoc(), posOn(1, 'SmokeSection'));
        assert.ok(hover, 'expected a hover card');
        const text = JSON.stringify(hover!.contents);
        assert.ok(text.includes('SmokeSection'), `card must name the section; got ${text.slice(0, 200)}`);
        assert.ok(/sections\.clw/i.test(text), `card must name the resolved file; got ${text.slice(0, 200)}`);
        assert.ok(text.includes(':4'), `card must carry the 1-based section line; got ${text.slice(0, 200)}`);
    });

    test('hover on an unknown section still shows a card with the not-found note', async () => {
        const hover = await new HoverProvider().provideHover(makeDoc(), posOn(2, 'NoSuchSection'));
        assert.ok(hover, 'expected a hover card');
        const text = JSON.stringify(hover!.contents);
        assert.ok(/not found/i.test(text), `expected the not-found note; got ${text.slice(0, 200)}`);
    });

    test('regression: F12 on the FILE argument still resolves the file itself', async () => {
        const result = await new DefinitionProvider().provideDefinition(makeDoc(), posOn(1, 'sections.clw'));
        const loc = (Array.isArray(result) ? result[0] : result) as Location | null;
        assert.ok(loc, 'file-argument F12 must keep working');
        assert.ok(loc!.uri.toLowerCase().endsWith('sections.clw'));
    });
});
