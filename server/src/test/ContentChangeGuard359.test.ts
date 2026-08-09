import * as assert from 'assert';
import { ContentChangeGuard } from '../utils/ContentChangeGuard';

/**
 * #359 — the change-pipeline guard. The TextDocuments manager fires
 * onDidChangeContent for didOpen too (the "open echo"), and clients can emit
 * no-op didChange events (tab activation). Identical-content events must be
 * skippable so opening a MEMBER file stops re-validating its 68k-token parent
 * PROGRAM, while genuine edits still run the full pipeline.
 */
suite('ContentChangeGuard (#359)', () => {

    test('open echo: identical content after snapshot → unchanged', () => {
        const g = new ContentChangeGuard();
        g.snapshot('file:///a.clw', 'MEMBER(\'parent.clw\')\n  CODE\n');
        assert.strictEqual(g.hasChanged('file:///a.clw', 'MEMBER(\'parent.clw\')\n  CODE\n'), false,
            'the onDidChangeContent echo of a didOpen carries identical content and must be skippable');
    });

    test('genuine edit → changed', () => {
        const g = new ContentChangeGuard();
        g.snapshot('file:///a.clw', 'x = 1\n');
        assert.strictEqual(g.hasChanged('file:///a.clw', 'x = 2\n'), true);
    });

    test('same-length different content → changed (hash catches it)', () => {
        const g = new ContentChangeGuard();
        g.snapshot('file:///a.clw', 'abcdef');
        assert.strictEqual(g.hasChanged('file:///a.clw', 'abcdeg'), true,
            'length-first shortcut must not skip a same-length edit');
    });

    test('never-seen uri → changed (defensive)', () => {
        const g = new ContentChangeGuard();
        assert.strictEqual(g.hasChanged('file:///never.clw', 'anything'), true);
    });

    test('re-snapshot after accepted change tracks the new content', () => {
        const g = new ContentChangeGuard();
        g.snapshot('file:///a.clw', 'v1');
        assert.strictEqual(g.hasChanged('file:///a.clw', 'v2'), true);
        g.snapshot('file:///a.clw', 'v2');
        assert.strictEqual(g.hasChanged('file:///a.clw', 'v2'), false, 'second identical event skips');
        assert.strictEqual(g.hasChanged('file:///a.clw', 'v1'), true, 'reverting to old content is still a change');
    });

    test('clear drops the snapshot (close → reopen treated as changed)', () => {
        const g = new ContentChangeGuard();
        g.snapshot('file:///a.clw', 'text');
        g.clear('file:///a.clw');
        assert.strictEqual(g.hasChanged('file:///a.clw', 'text'), true);
    });
});
