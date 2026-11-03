import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PropertyService } from '../utils/PropertyService';

/**
 * #824: some PROP: descriptions in clarion-properties.json were not cut short (#822) but
 * held the wrong thing altogether - the first line of the help page's example
 * (`MDIChild WINDOW(...)`), the title of a page the help only linked to
 * ("SLIDER (declare a Slider control)"), or nothing but a syntax line (`AT( [ x ] ...)`).
 * These checks scan every entry, and every per-target meaning, for those shapes.
 */

interface Entry { name: string; description: string; targets?: Record<string, string> }

function loadEntries(): Entry[] {
    // Read the source JSON, not the compiled copy, so the scan sees what is checked in.
    const file = path.resolve(__dirname, '../../../../server/src/data/clarion-properties.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).properties;
}

/** Every text a card can show for an entry, labelled for the failure message. */
function texts(e: Entry): { label: string; text: string }[] {
    const out = [{ label: e.name, text: e.description }];
    for (const [target, text] of Object.entries(e.targets ?? {})) {
        out.push({ label: `${e.name} (${target})`, text });
    }
    return out;
}

/** Why a text is not a description of its property, or null when it reads as one. */
function wrongShape(text: string): string | null {
    const s = text.trim();
    if (/\(declare an? /i.test(s)) return "another help page's title";
    // AT( [ x ] ...), SLIDER , AT( ) ..., DRIVER('SQLDriver', ...)
    if (/^[A-Z][A-Z0-9_]*\s*[(,]/.test(s)) return 'a syntax line';
    // MDIChild WINDOW('Child One'),..., AFile FILE,DRIVER(...), AssertMy1 PROCEDURE(...)
    if (/^(?!(?:A|An|The)\s)\w+\s+(?:WINDOW|APPLICATION|REPORT|FILE|VIEW|PROCEDURE|CLASS|QUEUE|GROUP)\s*[(,]/.test(s)) {
        return "a declaration from the help's example";
    }
    // SYSTEM{PROP:AutoPaper} = '', Result = filelabel{PROP:GETINFO, property}
    if (/^[\w?]+\s*\{\s*PROP:/i.test(s) || /^\w+\s*=\s*[\w?]+\s*\{/.test(s)) return 'a code statement';
    // [ Where" = ] SEND(...), (how much a window or control has been scrolled)
    if (/^[[(]/.test(s)) return 'a syntax fragment';
    // ... for example: SYSTEM {PROP:Codepage} = 1253 !Greek
    if (/\{\s*PROP:[^}]*\}\s*=[^.]*![^.]*$/i.test(s)) return 'ends in a code example';
    if ((s.match(/\b[a-z]{2,}\b/g) ?? []).length < 3) return 'no prose';
    if (s.includes('�')) return 'a broken character';
    return null;
}

suite('PROP: cards describe their own property (#824)', () => {
    test('no description is another page\'s text or only a syntax line', () => {
        const bad = loadEntries().flatMap(texts)
            .map(t => ({ ...t, why: wrongShape(t.text) }))
            .filter(t => t.why !== null)
            .map(t => `${t.label}: ${t.why}`);
        assert.deepStrictEqual(bad, [], `${bad.length} wrong descriptions:\n${bad.join('\n')}`);
    });

    const service = () => PropertyService.getInstance();

    for (const name of ['PROP:AlwaysDrop', 'PROP:NumTabs', 'PROP:RejectCode']) {
        test(`${name} is not the help example's MDIChild window`, () => {
            const entry = service().getPropEntry(name);
            assert.ok(entry, `${name} is known`);
            assert.ok(!/MDIChild|WINDOW\(/.test(entry!.description), entry!.description);
        });
    }

    test('PROP:AlwaysDrop is about a dropping list', () => {
        assert.match(service().getPropEntry('PROP:AlwaysDrop')!.description, /DROP/);
    });

    test('PROP:NumTabs counts the TABs of a SHEET', () => {
        assert.match(service().getPropEntry('PROP:NumTabs')!.description, /TAB.*SHEET|SHEET.*TAB/);
    });

    test('PROP:RejectCode relates to REJECTCODE', () => {
        assert.match(service().getPropEntry('PROP:RejectCode')!.description, /REJECTCODE/);
    });

    for (const name of ['PROP:Step', 'PROP:Ticks', 'PROP:Vertical']) {
        test(`${name} is not the SLIDER page's title`, () => {
            const entry = service().getPropEntry(name);
            assert.ok(entry, `${name} is known`);
            assert.ok(!/declare a Slider/i.test(entry!.description), entry!.description);
            assert.match(entry!.description, /SLIDER/);
        });
    }

    for (const name of ['PROP:At', 'PROP:Bevel', 'PROP:Join', 'PROP:LogonScreen', 'PROP:Where']) {
        test(`${name} is described, not only a syntax line`, () => {
            const entry = service().getPropEntry(name);
            assert.ok(entry, `${name} is known`);
            assert.strictEqual(wrongShape(entry!.description), null, entry!.description);
        });
    }

    test('PROP:Join is the SHEET attribute, not the VIEW structure', () => {
        assert.match(service().getPropEntry('PROP:Join')!.description, /SHEET/);
    });

    test("PROP:Value's FILE meaning is in our own words", () => {
        const file = service().getPropEntry('PROP:Value')!.targets!.file!;
        assert.ok(file, 'PROP:Value has a FILE meaning');
        assert.ok(!/simple negative number/.test(file), file);
        assert.ok(!/decrement by 1 for each subsequent/.test(file), file);
        assert.match(file, /MEMO/);
        assert.match(file, /-1/);
    });
});
