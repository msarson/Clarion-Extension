import * as assert from 'assert';
import { TextEdit, Range } from 'vscode-languageserver-protocol';
import { canonicalLocationKey } from '../providers/ReferencesProvider';
import { canonicalFileKey, addEditToChanges } from '../providers/MapDeclarationCodeActionProvider';

// #196 follow-up — the same physical file reaches edit/reference builders under two
// URI spellings: `file:///f%3A/…` (encoded drive colon, VS Code's canonical form) and
// `file:///f:/…` (un-encoded, from manual `file:///${path}` construction). Keyed by the
// raw string they look distinct → duplicate references / overlapping edits → VS Code
// rejects with "Failed to apply edits". These helpers collapse the two spellings.
suite('#196 follow-up — URI-encoding canonicalization', () => {

    // ─── Tier 1: ReferencesProvider FAR dedup key ───────────────────────────────
    suite('canonicalLocationKey (FAR dedup)', () => {
        const encoded = 'file:///f%3A/Playground/TestIncInClw/MyFunctionsClass.clw';
        const raw     = 'file:///f:/Playground/TestIncInClw/MyFunctionsClass.clw';

        test('encoded and un-encoded spellings of the same file+line produce the SAME key', () => {
            assert.strictEqual(
                canonicalLocationKey(encoded, 16),
                canonicalLocationKey(raw, 16),
                'f%3A and f: must collapse — this is the duplicate that reached RenameProvider in #196');
        });

        test('case-insensitive (Windows paths)', () => {
            assert.strictEqual(
                canonicalLocationKey('file:///F%3A/Proj/Foo.clw', 3),
                canonicalLocationKey('file:///f:/proj/foo.clw', 3));
        });

        test('different lines do NOT collapse', () => {
            assert.notStrictEqual(canonicalLocationKey(encoded, 16), canonicalLocationKey(encoded, 17));
        });

        test('different files do NOT collapse', () => {
            assert.notStrictEqual(
                canonicalLocationKey('file:///f%3A/a.clw', 1),
                canonicalLocationKey('file:///f%3A/b.clw', 1));
        });

        test('malformed percent-escape falls back to lowercased raw (no throw)', () => {
            // '%zz' is not a valid escape — decodeURIComponent would throw; helper must not.
            const k = canonicalLocationKey('file:///f:/bad%zz/Foo.clw', 1);
            assert.ok(typeof k === 'string' && k.length > 0);
        });
    });

    // ─── Tier 2: MapDeclarationCodeActionProvider edit-merge ─────────────────────
    suite('addEditToChanges / canonicalFileKey (MAP-signature quick-fix)', () => {
        const encoded = 'file:///f%3A/Proj/Decls.clw';
        const raw     = 'file:///f:/Proj/Decls.clw';

        test('canonicalFileKey collapses uri spellings AND raw paths to one key', () => {
            assert.strictEqual(canonicalFileKey(encoded), canonicalFileKey(raw));
            assert.strictEqual(canonicalFileKey(encoded), canonicalFileKey('F:\\Proj\\Decls.clw'));
        });

        test('merging the same file under two encodings collapses to ONE key with ONE edit', () => {
            const changes: { [uri: string]: TextEdit[] } = {};
            const editAtLine5 = TextEdit.replace(Range.create(5, 10, 5, 20), '(LONG)');
            // First edit lands under the encoded spelling (e.g. the live-cached uri)...
            addEditToChanges(changes, encoded, editAtLine5);
            // ...then a caller merges the SAME decl line under the un-encoded spelling.
            addEditToChanges(changes, raw, TextEdit.replace(Range.create(5, 10, 5, 20), '(LONG)'));

            const keys = Object.keys(changes);
            assert.strictEqual(keys.length, 1, `same file under two encodings must be ONE key; got ${keys.length}`);
            assert.strictEqual(changes[keys[0]].length, 1,
                'duplicate decl-line edit must be deduped, not double-applied (the overlapping-edit bug)');
            assert.strictEqual(keys[0], encoded, 'reuses the first-seen key spelling');
        });

        test('distinct decl lines in the same file both kept (one key, two edits)', () => {
            const changes: { [uri: string]: TextEdit[] } = {};
            addEditToChanges(changes, encoded, TextEdit.replace(Range.create(5, 0, 5, 4), '(LONG)'));
            addEditToChanges(changes, raw, TextEdit.replace(Range.create(9, 0, 9, 4), '(LONG)'));
            assert.strictEqual(Object.keys(changes).length, 1);
            assert.strictEqual(changes[encoded].length, 2, 'different decl lines are not duplicates');
        });

        test('genuinely different files stay separate', () => {
            const changes: { [uri: string]: TextEdit[] } = {};
            addEditToChanges(changes, 'file:///f%3A/Proj/A.clw', TextEdit.replace(Range.create(1, 0, 1, 4), 'x'));
            addEditToChanges(changes, 'file:///f:/Proj/B.clw', TextEdit.replace(Range.create(1, 0, 1, 4), 'x'));
            assert.strictEqual(Object.keys(changes).length, 2);
        });
    });
});
