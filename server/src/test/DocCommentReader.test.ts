import * as assert from 'assert';
import { DocCommentReader, DocComment } from '../utils/DocCommentReader';

suite('DocCommentReader', () => {

    suite('read() - basic !!! parsing', () => {
        test('parses summary tag', () => {
            const lines = [
                '!!!<summary>Initializes the window.</summary>',
                'ThisWindow.Init   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 1);
            assert.ok(doc, 'should return a doc comment');
            assert.strictEqual(doc!.summary, 'Initializes the window.');
            assert.deepStrictEqual(doc!.params, []);
        });

        test('parses summary + param + returns', () => {
            const lines = [
                '!!!<summary>Gets a record by key.</summary>',
                '!!!<param name="fileLabel">The FILE label.</param>',
                '!!!<param name="keyLabel">The KEY or INDEX label.</param>',
                '!!!<returns>ERRORCODE() is set on failure.</returns>',
                'GET   PROCEDURE(FILE fileLabel, KEY keyLabel)'
            ];
            const doc = DocCommentReader.read(lines, 4);
            assert.ok(doc);
            assert.strictEqual(doc!.summary, 'Gets a record by key.');
            assert.strictEqual(doc!.params.length, 2);
            assert.strictEqual(doc!.params[0].name, 'fileLabel');
            assert.strictEqual(doc!.params[0].description, 'The FILE label.');
            assert.strictEqual(doc!.params[1].name, 'keyLabel');
            assert.strictEqual(doc!.params[1].description, 'The KEY or INDEX label.');
            assert.strictEqual(doc!.returns, 'ERRORCODE() is set on failure.');
        });

        test('parses remarks tag', () => {
            const lines = [
                '!!!<summary>Does something.</summary>',
                '!!!<remarks>Call Init before Open.</remarks>',
                'MyProc   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 2);
            assert.ok(doc);
            assert.strictEqual(doc!.summary, 'Does something.');
            assert.strictEqual(doc!.remarks, 'Call Init before Open.');
        });

        test('handles multi-line doc comment (joined with space)', () => {
            const lines = [
                '!!!<summary>First part of the description',
                '!!! second part of description.</summary>',
                'MyProc   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 2);
            assert.ok(doc);
            assert.ok(doc!.summary?.includes('First part'));
            assert.ok(doc!.summary?.includes('second part'));
        });
    });

    suite('read() - scan termination', () => {
        test('stops at blank line between comment and declaration', () => {
            const lines = [
                '!!!<summary>This belongs to something else.</summary>',
                '',
                'MyProc   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 2);
            assert.strictEqual(doc, null, 'blank line should break the scan');
        });

        test('stops at plain comment with text', () => {
            const lines = [
                '!!!<summary>Old comment.</summary>',
                '! separator text here',
                'MyProc   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 2);
            assert.strictEqual(doc, null, 'plain comment with text should break scan');
        });

        test('stops at !!!! (quadruple bang)', () => {
            const lines = [
                '!!!<summary>Old comment.</summary>',
                '!!!! regular comment, not a doc comment',
                'MyProc   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 2);
            assert.strictEqual(doc, null, '!!!! should terminate scan');
        });

        test('skips empty ! comment separators', () => {
            const lines = [
                '!',
                '!!!<summary>Initializes the window.</summary>',
                'MyProc   PROCEDURE()'
            ];
            // The single ! on line 0 is immediately above the !!!; scanning backwards from line 1:
            // line 1 = '!!!<summary>' → collect
            // line 0 = '!' → stop
            const doc = DocCommentReader.read(lines, 2);
            assert.ok(doc, 'should still find the !!! above the declaration');
            assert.strictEqual(doc!.summary, 'Initializes the window.');
        });
    });

    suite('read() - !!! vs !!!! disambiguation', () => {
        test('!!! is a doc comment', () => {
            const lines = [
                '!!!<summary>A doc comment.</summary>',
                'MyProc   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 1);
            assert.ok(doc);
        });

        test('!!!! is NOT a doc comment and terminates scan', () => {
            const lines = [
                '!!!!<summary>Not a doc comment.</summary>',
                'MyProc   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 1);
            assert.strictEqual(doc, null);
        });
    });

    suite('read() - inline ! fallback', () => {
        test('uses inline ! comment when no !!! block exists', () => {
            const lines = [
                'MyProc   PROCEDURE()  ! Does something useful'
            ];
            const doc = DocCommentReader.read(lines, 0);
            assert.ok(doc);
            assert.strictEqual(doc!.summary, 'Does something useful');
            assert.deepStrictEqual(doc!.params, []);
        });

        test('does NOT use inline fallback when !!! block exists', () => {
            const lines = [
                '!!!<summary>Doc comment summary.</summary>',
                'MyProc   PROCEDURE()  ! inline note'
            ];
            const doc = DocCommentReader.read(lines, 1);
            assert.ok(doc);
            assert.strictEqual(doc!.summary, 'Doc comment summary.', 'should use !!! not inline');
        });

        test('returns null when no comments of any kind', () => {
            const lines = [
                'MyProc   PROCEDURE()'
            ];
            const doc = DocCommentReader.read(lines, 0);
            assert.strictEqual(doc, null);
        });
    });

    suite('read() - edge cases', () => {
        test('returns null for declarationLine 0 with nothing above', () => {
            const lines = ['MyProc   PROCEDURE()'];
            assert.strictEqual(DocCommentReader.read(lines, 0), null);
        });

        test('returns null for out-of-range line', () => {
            const lines = ['MyProc   PROCEDURE()'];
            assert.strictEqual(DocCommentReader.read(lines, -1), null);
            assert.strictEqual(DocCommentReader.read(lines, 999), null);
        });

        test('handles only code above declaration (no comments)', () => {
            const lines = [
                'SomeVar   STRING(50)',
                'MyProc   PROCEDURE()'
            ];
            assert.strictEqual(DocCommentReader.read(lines, 1), null);
        });
    });

    suite('toMarkdown()', () => {
        test('formats summary only', () => {
            const doc: DocComment = { summary: 'Does something.', params: [] };
            const md = DocCommentReader.toMarkdown(doc);
            assert.ok(md.includes('Does something.'));
        });

        test('formats params section', () => {
            const doc: DocComment = {
                summary: 'Does something.',
                params: [
                    { name: 'fileLabel', description: 'The FILE label.' },
                    { name: 'keyLabel', description: 'The KEY label.' }
                ]
            };
            const md = DocCommentReader.toMarkdown(doc);
            assert.ok(md.includes('**Parameters:**'));
            assert.ok(md.includes('`fileLabel`'));
            assert.ok(md.includes('`keyLabel`'));
        });

        test('formats returns', () => {
            const doc: DocComment = { params: [], returns: 'SIGNED result.' };
            const md = DocCommentReader.toMarkdown(doc);
            assert.ok(md.includes('**Returns:** SIGNED result.'));
        });

        test('formats remarks', () => {
            const doc: DocComment = { params: [], remarks: 'Call Init before Open.' };
            const md = DocCommentReader.toMarkdown(doc);
            assert.ok(md.includes('*Call Init before Open.*'));
        });

        test('returns empty string for empty doc', () => {
            const doc: DocComment = { params: [] };
            const md = DocCommentReader.toMarkdown(doc);
            assert.strictEqual(md, '');
        });
    });
});
