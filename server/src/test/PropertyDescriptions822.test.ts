import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PropertyService } from '../utils/PropertyService';
import { HoverFormatter } from '../providers/hover/HoverFormatter';

/**
 * #822: the PROP: descriptions in clarion-properties.json were scraped from the help, and
 * where the help page went on into a list, table or code block the scrape kept only the
 * sentence that introduced it - "The procedure's prototype must take three parameters:" -
 * so the card stopped there. These checks scan every entry for that shape.
 */

function loadEntries(): { name: string; description: string }[] {
    // Read the source JSON, not the compiled copy, so the scan sees what is checked in.
    const file = path.resolve(__dirname, '../../../../server/src/data/clarion-properties.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).properties;
}

/** A description that stops where a list, table or example should have followed. */
function isCutShort(description: string): boolean {
    const s = description.trim();
    if (s === '') return true;
    if (/[:,]$/.test(s)) return true;
    // "... sets the high byte of the RGB DWORD using" - ends on a word that needs a continuation
    return /\b(using|the|a|an|of|for|to|with|and|or|by|is|are)$/i.test(s);
}

suite('PROP: descriptions are not cut short (#822)', () => {
    test('no description ends where a list, table or example was dropped', () => {
        const cut = loadEntries().filter(e => isCutShort(e.description)).map(e => e.name);
        assert.deepStrictEqual(cut, [], `cut-short descriptions: ${cut.join(', ')}`);
    });

    test('PROP:VLBproc names the three parameters of the source procedure', () => {
        const entry = PropertyService.getInstance().getPropEntry('PROP:VLBproc');
        assert.ok(entry, 'PROP:VLBproc is known');
        assert.match(entry!.description, /PROCEDURE\(LONG,\s*LONG,\s*SHORT\),\s*STRING/);
        assert.match(entry!.description, /-1/, 'mentions the special row values');
    });

    test('PROP:VLBval says what the value is and how it reaches the procedure', () => {
        const entry = PropertyService.getInstance().getPropEntry('PROP:VLBval');
        assert.ok(entry, 'PROP:VLBval is known');
        assert.match(entry!.description, /ADDRESS\(SELF\)/);
        assert.match(entry!.description, /PROP:VLBproc/);
        assert.ok(!/:\s*$/.test(entry!.description));
    });

    test('the PROP:VLBval card carries the parameter list', () => {
        const entry = PropertyService.getInstance().getPropEntry('PROP:VLBval')!;
        const card = new HoverFormatter(undefined as any).formatPropEquate(entry);
        const value: string = (card.contents as { value: string }).value;
        assert.match(value, /LONG,\s*LONG,\s*SHORT/);
    });
});
