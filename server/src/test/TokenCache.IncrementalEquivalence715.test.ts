import * as assert from 'assert';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';

/**
 * #715 — the incremental re-tokenize must give the tokens a full tokenize of the edited text gives,
 * and it must actually be used for an ordinary edit, including one that adds or removes lines.
 * Pressing Enter shifted every later line, so all of them read as changed and the cache fell back
 * to a full tokenize after the incremental attempt had already run: 1.2 s a keystroke on a
 * 60k-line module.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syntheticModuleText } = require(path.join(__dirname, '..', '..', '..', '..', 'scripts', 'perf', 'synthetic-module.js'));

const FIELDS: (keyof Token)[] = ['line', 'start', 'type', 'subType', 'value', 'label', 'finishesAt', 'codeFinishesAt', 'declaringProcedureLine'];
const ref = (t: Token | undefined) => t ? `${t.line}:${t.value}` : '';
const sig = (t: Token) => FIELDS.map(f => String(t[f])).join('|') +
    `|parent=${ref(t.parent)}|exec=${ref(t.executionMarker)}|branches=${JSON.stringify((t.branches ?? []).map(b => [b.startLine, b.endLine]))}`;

function firstDifference(inc: Token[], full: Token[]): string | null {
    if (inc.length !== full.length) return `token count ${inc.length} incremental vs ${full.length} full`;
    for (let i = 0; i < inc.length; i++) {
        const a = sig(inc[i]), b = sig(full[i]);
        if (a !== b) return `token #${i}\n  incremental: ${a}\n  full:        ${b}`;
    }
    return null;
}

const BASE: string = syntheticModuleText(3000);
const LINES = BASE.split(/\r?\n/);
const after = (re: RegExp) => LINES.findIndex((l, i) => i > 1200 && re.test(l));
const replaceLine = (line: number, text: string) => ({ range: { start: { line, character: 0 }, end: { line, character: LINES[line].length } }, text });
const insertAt = (line: number, character: number, text: string) => ({ range: { start: { line, character }, end: { line, character } }, text });

type Edit = { range: { start: { line: number; character: number }; end: { line: number; character: number } }; text: string };
interface Case { name: string; edit: () => Edit | Edit[]; mustBeIncremental: boolean }

const CASES: Case[] = [
    { name: 'a space at the end of a line', mustBeIncremental: true, edit: () => { const i = after(/^\s+Loc:Name = PQ/); return insertAt(i, LINES[i].length, ' '); } },
    { name: 'END becomes a period', mustBeIncremental: true, edit: () => replaceLine(after(/^\s+END\s*$/), '    .') },
    { name: 'END deleted', mustBeIncremental: true, edit: () => replaceLine(after(/^\s+END\s*$/), '') },
    { name: 'IF commented out', mustBeIncremental: true, edit: () => { const i = after(/^\s+IF Loc:Count > 10/); return replaceLine(i, '!' + LINES[i]); } },
    { name: 'an unterminated IF added', mustBeIncremental: true, edit: () => { const i = after(/^\s+Loc:Total = Loc:Total/); return replaceLine(i, LINES[i] + ' ; IF Loc:Flag THEN Loc:Count = 1'); } },
    { name: 'CODE commented out', mustBeIncremental: true, edit: () => replaceLine(after(/^\s+CODE\s*$/), '! CODE') },
    { name: 'a procedure label renamed', mustBeIncremental: false, edit: () => { const i = after(/^Proc\d+\s+PROCEDURE/); return replaceLine(i, LINES[i].replace(/^Proc(\d+)/, 'Proc$1X')); } },
    { name: 'Enter at the end of a line', mustBeIncremental: true, edit: () => { const i = after(/^\s+Loc:Total = Loc:Total/); return insertAt(i, LINES[i].length, '\r\n        '); } },
    { name: 'Enter in the middle of a statement', mustBeIncremental: true, edit: () => { const i = after(/^\s+Loc:Total = Loc:Total/); return insertAt(i, 8, '\r\n'); } },
    { name: 'a line deleted', mustBeIncremental: true, edit: () => { const i = after(/^\s+Glo:Today = TODAY/); return { range: { start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } }, text: '' }; } },
    { name: 'three statements pasted', mustBeIncremental: true, edit: () => { const i = after(/^\s+Glo:Today = TODAY/); return insertAt(i, 0, '        Loc:Count = 1\r\n        IF Loc:Flag\r\n          Loc:Count = 2\r\n        END\r\n'); } },
    { name: 'an IF ... END block deleted across lines', mustBeIncremental: true, edit: () => { const i = after(/^\s+IF Loc:Count > 10/); const e = LINES.findIndex((l, k) => k > i && /^\s+END\s*$/.test(l)); return { range: { start: { line: i, character: 0 }, end: { line: e + 1, character: 0 } }, text: '' }; } },
    { name: 'a new procedure pasted between two', mustBeIncremental: false, edit: () => { const i = after(/^Proc\d+\s+PROCEDURE/); return insertAt(i, 0, 'Extra PROCEDURE\r\n  CODE\r\n  RETURN\r\n\r\n'); } },
    { name: 'an edit on the first line', mustBeIncremental: false, edit: () => insertAt(0, 0, '! header\r\n') },
    // A burst of typing in two places before the next request: two short spans, not one from the
    // first to the last (which is over 30% of the module, so it fell back to a full tokenize).
    { name: 'a space typed on two lines far apart, in one change', mustBeIncremental: true, edit: () => {
        const i = after(/^\s+Loc:Name = PQ/);
        const j = LINES.findIndex((l, k) => k > 2600 && /^\s+Loc:Total = Loc:Total/.test(l));
        return [insertAt(j, LINES[j].length, ' '), insertAt(i, LINES[i].length, ' ')];
    } },
    { name: 'an edit on the last line', mustBeIncremental: true, edit: () => { const i = LINES.length - 1; return insertAt(i, LINES[i].length, '\r\n! trailer'); } },
];

suite('#715 incremental re-tokenize equals a full tokenize', function () {
    this.timeout(60000);
    const proto = TokenCache.prototype as unknown as { incrementalTokenize: (...a: unknown[]) => Token[] | null };
    const original = proto.incrementalTokenize;
    let lastPath: 'incremental' | 'full' | 'none' = 'none';
    setup(() => {
        lastPath = 'none';
        proto.incrementalTokenize = function (this: unknown, ...a: unknown[]) {
            const r = original.apply(this, a);
            lastPath = r ? 'incremental' : 'full';
            return r;
        };
    });
    teardown(() => { proto.incrementalTokenize = original; });

    // Cumulative random edits, the guard applied as server.ts applies it: every result the cache
    // hands out must be what a full tokenize gives. The random snippets are mostly malformed code,
    // which is what an edit in progress looks like.
    test('fuzz: 120 cumulative random edits, each equal to a full tokenize', () => {
        const SNIPPETS = ['END', '.', '  IF Loc:Flag', '  LOOP', '  CASE X', '  OF 1', '  ELSE', '  CODE', 'Extra PROCEDURE',
            'Lbl ROUTINE', ' ; IF a THEN b.', 'x = 1 |', "'str'", '! c', 'Q QUEUE', 'G GROUP,PRE(G)', 'C CLASS', '  MAP', '  END', '  DO Lbl', 'ACCEPT'];
        let seed = 715;
        const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
        const randomEdit = (doc: TextDocument): Edit => {
            const n = doc.lineCount, line = rnd(n);
            const len = doc.getText({ start: { line, character: 0 }, end: { line, character: Number.MAX_SAFE_INTEGER } }).replace(/\r?\n$/, '').length;
            const at = { line, character: rnd(len + 1) };
            const pick = () => SNIPPETS[rnd(SNIPPETS.length)];
            switch (rnd(7)) {
                case 0: return { range: { start: at, end: at }, text: ' ' };
                case 1: return { range: { start: at, end: at }, text: '\r\n' };
                case 2: return { range: { start: { line, character: 0 }, end: { line: Math.min(n - 1, line + 1), character: 0 } }, text: '' };
                case 3: return { range: { start: { line, character: 0 }, end: { line, character: len } }, text: pick() };
                case 4: return { range: { start: { line, character: 0 }, end: { line, character: 0 } }, text: pick() + '\r\n' };
                case 5: return { range: { start: { line, character: 0 }, end: { line: Math.min(n - 1, line + 1 + rnd(8)), character: 0 } }, text: '' };
                default: return { range: { start: at, end: at }, text: [pick(), pick()].join('\r\n') };
            }
        };
        const cache = TokenCache.getInstance();
        const uri = 'file:///c%3A/eq715/fuzz.clw';
        cache.clearTokens(uri);
        let doc = TextDocument.create(uri, 'clarion', 1, syntheticModuleText(1500));
        cache.getTokens(doc);
        let incremental = 0;
        for (let k = 0; k < 120; k++) {
            doc = TextDocument.update(doc, [randomEdit(doc)], doc.version + 1);
            if (cache.isStructureAffectingEdit(doc)) cache.clearTokens(uri);
            lastPath = 'none';
            const inc = cache.getTokens(doc);
            if ((lastPath as string) === 'incremental') incremental++;
            const diff = firstDifference(inc, new ClarionTokenizer(doc.getText()).tokenize());
            assert.strictEqual(diff, null, `edit ${k}: ${diff}`);
        }
        assert.ok(incremental >= 20, `only ${incremental} of 120 edits took the incremental path - the fuzz no longer tests it`);
        cache.clearTokens(uri);
    });

    for (const c of CASES) {
        test(`${c.name}`, () => {
            const cache = TokenCache.getInstance();
            const uri = 'file:///c%3A/eq715/m.clw';
            cache.clearTokens(uri);
            let doc = TextDocument.create(uri, 'clarion', 1, BASE);
            cache.getTokens(doc);
            const e = c.edit();
            doc = TextDocument.update(doc, Array.isArray(e) ? e : [e], 2);
            lastPath = 'none';
            const inc = cache.getTokens(doc);
            const full = new ClarionTokenizer(doc.getText()).tokenize();
            const diff = firstDifference(inc, full);
            assert.strictEqual(diff, null, diff ?? '');
            if (c.mustBeIncremental) assert.strictEqual(lastPath, 'incremental', 'the edit fell back to a full tokenize');
            cache.clearTokens(uri);
        });
    }
});

suite('#715 which edits must re-tokenize the whole document', () => {
    const cache = TokenCache.getInstance();
    const uri = 'file:///c%3A/guard715/m.clw';
    const TEXT = [
        'Demo                PROCEDURE',
        'Loc:Count           LONG',
        '  CODE',
        '  Loc:Count = 1',
        '  IF Loc:Count > 0',
        '    Loc:Count = 2',
        '  END',
        '  Loc:Count = 3',
        '  RETURN',
    ].join('\r\n');
    const affects = (edit: Edit) => {
        cache.clearTokens(uri);
        const doc = TextDocument.create(uri, 'clarion', 1, TEXT);
        cache.getTokens(doc);
        const result = cache.isStructureAffectingEdit(TextDocument.update(doc, [edit], 2));
        cache.clearTokens(uri);
        return result;
    };
    const at = (line: number, character: number, text: string): Edit => ({ range: { start: { line, character }, end: { line, character } }, text });

    test('Enter after a plain statement, with END lines further down: no', () => {
        assert.strictEqual(affects(at(3, 15, '\r\n  ')), false);
    });
    test('a line deleted above an IF block: no', () => {
        assert.strictEqual(affects({ range: { start: { line: 7, character: 0 }, end: { line: 8, character: 0 } }, text: '' }), false);
    });
    test('a space typed on a plain statement: no', () => {
        assert.strictEqual(affects(at(5, 4, ' ')), false);
    });
    test('an END changed to a period: yes', () => {
        assert.strictEqual(affects({ range: { start: { line: 6, character: 2 }, end: { line: 6, character: 5 } }, text: '.' }), true);
    });
    test('a period alone in column 0: yes', () => {
        assert.strictEqual(affects({ range: { start: { line: 7, character: 0 }, end: { line: 7, character: 15 } }, text: '.' }), true);
    });
    test('a new PROCEDURE line: yes', () => {
        assert.strictEqual(affects(at(8, 0, 'Other PROCEDURE\r\n')), true);
    });
    test('a line holding END deleted: yes', () => {
        assert.strictEqual(affects({ range: { start: { line: 6, character: 0 }, end: { line: 7, character: 0 } }, text: '' }), true);
    });
});
