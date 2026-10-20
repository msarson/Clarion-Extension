import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ATTRIBUTE_EDIT_COMMAND, bindAttributeEditLinks, planAttributeEdit, PlannedEdit } from '../hover/attributeEditLinks';

/**
 * #739 — the VS Code half of the control card's attribute edit links (#731). The server emits
 * `[NAME](command:clarion.applyAttributeEdit?<encodeURIComponent(JSON.stringify([payload]))> "title")`
 * with `payload = { e: [{ l, c, el, ec, t, o }] }`: lines relative to the hovered line, 0-based
 * columns, the new text, and `o`, the original text of lines l..el. A command link cannot know which
 * line was hovered, so the hover middleware binds the anchor into each link; the command checks
 * every `o` line and applies the edits, or nothing.
 */

const anchor = { uri: 'file:///c%3A/src/main.clw', line: 7, character: 11 };

function link(name: string, payload: unknown, title?: string): string {
    const target = `command:${ATTRIBUTE_EDIT_COMMAND}?${encodeURIComponent(JSON.stringify([payload]))}`;
    return `[${name}](${target}${title ? ` "${title}"` : ''})`;
}

/** The arguments VS Code passes the command: the query, URI-decoded, then JSON-parsed. */
function argsOf(markdown: string): unknown[][] {
    // Bound arguments carry no raw parenthesis, so the target ends at the first one.
    const re = /\]\(command:clarion\.applyAttributeEdit\?([^\s")]+)/g;
    const result: unknown[][] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(markdown))) result.push(JSON.parse(decodeURIComponent(m[1])));
    return result;
}

/** Apply planned edits to lines the way VS Code does: all against the original text. */
function applyTo(lines: string[], edits: PlannedEdit[]): string[] {
    const text = lines.join('\n');
    const offset = (line: number, ch: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + ch;
    let out = text;
    for (const e of [...edits].sort((a, b) => offset(b.startLine, b.startCharacter) - offset(a.startLine, a.startCharacter))) {
        out = out.slice(0, offset(e.startLine, e.startCharacter)) + e.text + out.slice(offset(e.endLine, e.endCharacter));
    }
    return out.split('\n');
}

suite('Attribute edit links: binding the hovered position (#739)', () => {
    const add = { e: [{ l: 0, c: 20, el: 0, ec: 20, t: ',HIDE', o: ['         TEXT,AT(10,10)'] }] };

    test('each link gets the hovered document and position as its second argument', () => {
        const md = `**Available:** ${link('HIDE', add, 'Add HIDE — hidden until UNHIDE')} · ${link('SKIP', add, 'Add SKIP')}`;
        const bound = bindAttributeEditLinks(md, anchor);
        assert.deepStrictEqual(argsOf(bound), [[add, anchor], [add, anchor]]);
        assert.ok(bound.startsWith('**Available:** [HIDE]('), bound);
        assert.ok(bound.includes(' "Add HIDE — hidden until UNHIDE")'), 'the title is kept');
    });

    test('a payload holding parentheses survives, with a title or without one', () => {
        const parens = { e: [{ l: 0, c: 9, el: 0, ec: 9, t: '', o: ['  TEXT,AT(10,10),USE(?T)'] }] };
        for (const md of [link('X', parens, 'Remove X'), link('X', parens), `(${link('X', parens)})`]) {
            const bound = bindAttributeEditLinks(md, anchor);
            assert.deepStrictEqual(argsOf(bound), [[parens, anchor]], md);
        }
    });

    test('other links, and a link whose arguments are not JSON, are left as they are', () => {
        const md = '[help](https://example.com/x) [run](command:clarion.other?%5B1%5D) [BAD](command:clarion.applyAttributeEdit?not-json)';
        assert.strictEqual(bindAttributeEditLinks(md, anchor), md);
    });
});

suite('Attribute edit links: planning the edit (#739)', () => {
    const doc = [
        "MyWindow WINDOW('Test'),AT(,,300,200)",
        '         TEXT,AT(10,10),USE(?T),VSCROLL,HSCROLL, |',
        '              READONLY  ! c',
        '         END',
    ];
    const lineAt = (n: number) => doc[n];

    test('an add on the hovered line lands at the right place', () => {
        const at = doc[1].indexOf(', |');
        const plan = planAttributeEdit({ e: [{ l: 0, c: at, el: 0, ec: at, t: ',HIDE', o: [doc[1]] }] }, 1, lineAt);
        assert.ok('edits' in plan, JSON.stringify(plan));
        assert.deepStrictEqual(applyTo(doc, plan.edits)[1], '         TEXT,AT(10,10),USE(?T),VSCROLL,HSCROLL,HIDE, |');
    });

    test('lines are relative to the hovered line', () => {
        const shifted = ['! a', '! b', ...doc];
        const at = doc[1].indexOf(', |');
        const plan = planAttributeEdit({ e: [{ l: 0, c: at, el: 0, ec: at, t: ',HIDE', o: [doc[1]] }] }, 3, n => shifted[n]);
        assert.ok('edits' in plan);
        assert.deepStrictEqual(plan.edits.map(e => [e.startLine, e.endLine]), [[3, 3]]);
    });

    test('a remove across a continuation joins the lines (the server\'s edit, applied verbatim)', () => {
        const comma = doc[1].indexOf(', |');
        const end = doc[2].indexOf('READONLY') + 'READONLY'.length;
        const plan = planAttributeEdit({ e: [{ l: 0, c: comma, el: 1, ec: end, t: '', o: [doc[1], doc[2]] }] }, 1, lineAt);
        assert.ok('edits' in plan);
        assert.deepStrictEqual(applyTo(doc, plan.edits).slice(1, 3), ['         TEXT,AT(10,10),USE(?T),VSCROLL,HSCROLL  ! c', '         END']);
    });

    test('several edits apply together (HVSCROLL replaces VSCROLL and removes HSCROLL)', () => {
        const v = doc[1].indexOf('VSCROLL');
        const h = doc[1].indexOf(',HSCROLL');
        const plan = planAttributeEdit({ e: [
            { l: 0, c: v, el: 0, ec: v + 7, t: 'HVSCROLL', o: [doc[1]] },
            { l: 0, c: h, el: 0, ec: h + 8, t: '', o: [doc[1]] },
        ] }, 1, lineAt);
        assert.ok('edits' in plan);
        assert.strictEqual(applyTo(doc, plan.edits)[1], '         TEXT,AT(10,10),USE(?T),HVSCROLL, |');
    });

    test('text that has changed since the hover refuses the whole edit', () => {
        const at = doc[1].indexOf(', |');
        const stale = { e: [
            { l: 0, c: at, el: 0, ec: at, t: ',HIDE', o: [doc[1]] },
            { l: 1, c: 0, el: 1, ec: 0, t: '', o: ['              READONLY'] },
        ] };
        assert.deepStrictEqual(planAttributeEdit(stale, 1, lineAt), { refused: 'changed' });
        const pastEnd = { e: [{ l: 5, c: 0, el: 5, ec: 0, t: 'X', o: [''] }] };
        assert.deepStrictEqual(planAttributeEdit(pastEnd, 1, lineAt), { refused: 'changed' });
    });

    test('#743: an edit marked `s` is a snippet, planned as one', () => {
        const at = doc[1].indexOf(', |');
        const plan = planAttributeEdit({ e: [{ l: 0, c: at, el: 0, ec: at, t: ",TIP('${1:text}')", o: [doc[1]], s: true }] }, 1, lineAt);
        assert.ok('edits' in plan, JSON.stringify(plan));
        assert.strictEqual(plan.edits[0].snippet, true);
        assert.strictEqual(plan.edits[0].text, ",TIP('${1:text}')");
        const flag = planAttributeEdit({ e: [{ l: 0, c: at, el: 0, ec: at, t: ',HIDE', o: [doc[1]] }] }, 1, lineAt);
        assert.ok('edits' in flag && !flag.edits[0].snippet);
    });

    test('#743: a snippet comes alone, and `s` must be a boolean', () => {
        const at = doc[1].indexOf(', |');
        const snip = { l: 0, c: at, el: 0, ec: at, t: ",TIP('${1:text}')", o: [doc[1]], s: true };
        const other = { l: 1, c: 0, el: 1, ec: 0, t: 'x', o: [doc[2]] };
        assert.deepStrictEqual(planAttributeEdit({ e: [snip, other] }, 1, lineAt), { refused: 'malformed' });
        assert.deepStrictEqual(planAttributeEdit({ e: [{ ...snip, s: 'yes' }] }, 1, lineAt), { refused: 'malformed' });
    });

    test('a malformed payload is refused', () => {
        const ok = { l: 0, c: 0, el: 0, ec: 0, t: '', o: [doc[1]] };
        for (const bad of [
            undefined, null, 'x', {}, { e: [] }, { e: 'x' },
            { e: [{ ...ok, o: [] }] },                          // o must cover l..el
            { e: [{ ...ok, el: 1 }] },
            { e: [{ ...ok, c: doc[1].length + 1, ec: doc[1].length + 1 }] }, // beyond the line
            { e: [{ ...ok, c: 4, ec: 2 }] },                    // ends before it starts
            { e: [{ ...ok, l: 0.5 }] },
            { e: [{ ...ok, t: 3 }] },
            { e: [{ ...ok, c: 0, ec: 5 }, { ...ok, c: 3, ec: 8 }] }, // overlapping
        ]) {
            assert.deepStrictEqual(planAttributeEdit(bad, 1, lineAt), { refused: 'malformed' }, JSON.stringify(bad));
        }
    });
});

suite('Attribute edit links: wiring (#739)', () => {
    let dir = __dirname;
    while (!fs.existsSync(path.join(dir, 'client', 'src', 'server', 'LanguageServerManager.ts'))) dir = path.dirname(dir);
    const read = (p: string) => fs.readFileSync(path.join(dir, p), 'utf8');

    test('the client announces the capability and binds links in its hover middleware', () => {
        const src = read('client/src/server/LanguageServerManager.ts');
        assert.match(src, /provideHover:/);
        assert.match(src, /trustAttributeEditLinks\(/);
        assert.match(src, /registerFeature\(attributeEditLinksFeature\)/);
        assert.match(read('client/src/hover/AttributeEditCommand.ts'), /clarionAttributeEditLinks: true/);
    });

    test('the command is registered at activation', () => {
        assert.match(read('client/src/extension.ts'), /registerAttributeEditCommand\(/);
    });
});
