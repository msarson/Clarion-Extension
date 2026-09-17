import * as assert from 'assert';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { DiagnosticsStore } from '../DiagnosticsStore';

/**
 * #545 — pull diagnostics. The server keeps the last computed set per document so a
 * `textDocument/diagnostic` request can be answered from it: a full report with a
 * resultId, or `unchanged` when the client already holds that resultId. Every record
 * gets a fresh resultId even for the same document version, because the sync pass and
 * the async pass record different sets for one version.
 */
suite('DiagnosticsStore (#545)', () => {

    const diag = (message: string): Diagnostic => ({
        severity: DiagnosticSeverity.Warning,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        message,
    });
    const URI = 'file:///c:/x/a.clw';

    test('an unknown document reports full with no items and no resultId', () => {
        const store = new DiagnosticsStore();
        assert.deepStrictEqual(store.report(URI), { kind: 'full', items: [] });
        assert.strictEqual(store.get(URI), undefined);
    });

    test('record then report: full with the items and a resultId', () => {
        const store = new DiagnosticsStore();
        const id = store.record(URI, 3, 'partial', [diag('a')]);
        assert.ok(id.startsWith('3:'), `resultId carries the version; got ${id}`);
        assert.deepStrictEqual(store.report(URI), { kind: 'full', resultId: id, items: [diag('a')] });
        assert.deepStrictEqual(store.get(URI)?.state, 'partial');
    });

    test('the same resultId back from the client answers unchanged', () => {
        const store = new DiagnosticsStore();
        const id = store.record(URI, 3, 'complete', [diag('a')]);
        assert.deepStrictEqual(store.report(URI, id), { kind: 'unchanged', resultId: id });
        assert.strictEqual(store.report(URI, 'stale').kind, 'full');
    });

    test('a second record for the SAME version gets a new resultId (sync set, then sync+async set)', () => {
        const store = new DiagnosticsStore();
        const first = store.record(URI, 3, 'partial', [diag('a')]);
        const second = store.record(URI, 3, 'complete', [diag('a'), diag('b')]);
        assert.notStrictEqual(first, second);
        assert.deepStrictEqual(store.report(URI, first), { kind: 'full', resultId: second, items: [diag('a'), diag('b')] });
    });

    test('the stored items are a copy: later mutation of the caller\'s array does not leak', () => {
        const store = new DiagnosticsStore();
        const items = [diag('a')];
        store.record(URI, 1, 'complete', items);
        items.push(diag('b'));
        assert.strictEqual(store.get(URI)!.diagnostics.length, 1);
    });

    test('clear forgets the document', () => {
        const store = new DiagnosticsStore();
        store.record(URI, 1, 'complete', [diag('a')]);
        store.clear(URI);
        assert.deepStrictEqual(store.report(URI), { kind: 'full', items: [] });
    });

    test('documents are independent and keyed exactly by uri', () => {
        const store = new DiagnosticsStore();
        const a = store.record(URI, 1, 'complete', [diag('a')]);
        const b = store.record('file:///c:/x/b.clw', 1, 'complete', [diag('b')]);
        assert.notStrictEqual(a, b);
        assert.deepStrictEqual(store.report(URI, b).kind, 'full', 'another document\'s id is not this one\'s');
    });
});
