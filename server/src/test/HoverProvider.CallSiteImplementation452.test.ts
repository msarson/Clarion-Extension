import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';

/**
 * Issue #452 — hovering a CALL SITE offered only the MAP declaration, never the
 * implementation, and rendered the generic "Global procedure" card rather than the
 * procedure card.
 *
 * Root cause: `MEMBER('Parent')` is legal WITHOUT the extension. `HoverProvider`
 * resolved that target verbatim, so the path did not exist, the parent was never
 * loaded, and hover fell through to the generic symbol path — which has no notion of
 * an implementation. The declaration still resolved, through a different path that
 * already normalises, which is exactly what made the symptom confusing: a hover that
 * looks like it worked, carrying one of the two links it should have.
 *
 * The issue ruled the extension-less MEMBER out, on the grounds that a minimal fixture
 * using `MEMBER('parent')` "resolves the declaration fine". It does — that was the
 * trap. The declaration and the implementation are found by different code, and only
 * one of them normalised.
 *
 * NOT a Unicode matter, despite being reported on a USTRING file. These fixtures use
 * `*STRING` deliberately: the extension has no USTRING support yet (the Clarion 12
 * work in #398–#404 is unstarted, only the TextMate grammar has landed), so a fixture
 * written around USTRING would imply a capability that does not exist and would fail
 * for the wrong reason later. The original report confirmed the same behaviour with
 * `*STRING`.
 */

let tmpRoot: string;

interface Fixture { uri: string; text: string; }

/**
 * A PROGRAM whose MAP declares a procedure inside `MODULE('member.clw')`, and a MEMBER
 * that both calls and implements it — the shape of the reported file.
 *
 * `memberTarget` is the only variable: with or without the `.clw` extension.
 */
function buildFixture(memberTarget: string): Fixture {
    fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), [
        '  PROGRAM',
        '',
        '  MAP',
        "    MODULE('member.clw')",
        '      Caller        PROCEDURE()',
        '      CountChars    PROCEDURE(*STRING pText),PROC,LONG',
        '    END',
        '  END',
        '',
        '  CODE',
        '  RETURN',
        ''
    ].join('\n'));

    const text = [
        `  MEMBER('${memberTarget}')`,
        '',
        'Caller PROCEDURE()',
        '',
        'Name   STRING(10)',
        '',
        '  CODE',
        '  CountChars(Name)',
        '  RETURN',
        '',
        'CountChars PROCEDURE(*STRING pText)',
        '  CODE',
        '  RETURN(0)',
        ''
    ].join('\n');
    const file = path.join(tmpRoot, 'member.clw');
    fs.writeFileSync(file, text);

    return {
        uri: 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A'),
        text
    };
}

/** 0-based lines in member.clw. */
const LINE_CALL_SITE = 7;
const LINE_IMPLEMENTATION = 10;

async function hoverAt(fix: Fixture, line: number): Promise<string> {
    const doc = TextDocument.create(fix.uri, 'clarion', 1, fix.text);
    const lines = fix.text.split('\n');
    const character = lines[line].indexOf('CountChars') + 2;
    const hover = await new HoverProvider().provideHover(doc, { line, character }) as Hover | null;
    if (!hover || !hover.contents) return '';
    const c = hover.contents as { value?: string } | string;
    return typeof c === 'string' ? c : (c.value ?? '');
}

/** Distinct `file.clw:line` references the card links or cites. */
function references(text: string): string[] {
    return [...new Set(text.match(/[\w.]+\.clw:\d+/g) ?? [])];
}

suite('Issue #452 — a call site links its implementation, not just the MAP declaration', () => {

    setup(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-452-')); });
    teardown(() => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ } });

    for (const target of ['parent.clw', 'parent']) {
        const shape = target.endsWith('.clw') ? 'with the extension' : 'WITHOUT the extension (#452)';

        test(`call site offers both declaration and implementation — MEMBER ${shape}`, async () => {
            const text = await hoverAt(buildFixture(target), LINE_CALL_SITE);
            assert.notStrictEqual(text, '', 'a call site must produce a hover');

            const refs = references(text);
            assert.ok(refs.some(r => r.startsWith('parent.clw')),
                `must cite the MAP declaration; got: ${JSON.stringify(refs)}`);
            assert.ok(refs.some(r => r.startsWith('member.clw')),
                `must cite the implementation — the thing you usually want from a call site; got: ${JSON.stringify(refs)}`);
        });

        test(`call site renders the procedure card, not the generic symbol card — MEMBER ${shape}`, async () => {
            const text = await hoverAt(buildFixture(target), LINE_CALL_SITE);
            // Assert positively. "does not say Global procedure" is satisfied by an
            // EMPTY hover too, so on its own it passes even when the lookup fails
            // outright — which is exactly what the broken extension-less path produced.
            assert.ok(/Module Procedure/i.test(text),
                `expected the procedure card; got: ${text || '(no hover at all)'}`);
            assert.ok(!/Global procedure/i.test(text),
                `the generic card means the procedure path was never reached; got: ${text}`);
        });
    }

    test('the implementation itself still omits its own link', async () => {
        // The formatter drops whichever end the cursor is on, so standing on the
        // implementation should leave only the declaration. Guards against "fixing"
        // the call site by unconditionally appending both.
        const text = await hoverAt(buildFixture('parent'), LINE_IMPLEMENTATION);
        const refs = references(text);
        assert.ok(refs.some(r => r.startsWith('parent.clw')),
            `must cite the declaration; got: ${JSON.stringify(refs)}`);
        assert.ok(!refs.some(r => r.startsWith('member.clw')),
            `must not link the line the cursor is already on; got: ${JSON.stringify(refs)}`);
    });
});
