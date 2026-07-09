import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range, TextEdit } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import {
    GenerateRoutineCodeActionProvider,
    buildRoutineSkeleton
} from '../providers/GenerateRoutineCodeActionProvider';

/**
 * #280 — "Create routine 'X'" quick fix from an unresolved `DO X`.
 *
 * The load-bearing property is SCOPE: a ROUTINE is procedure-local and routine labels legally
 * repeat across procedures (#211/#264), so "is this DO resolved?" must be answered against the
 * enclosing procedure only. These tests pin that a same-name routine in a DIFFERENT procedure does
 * NOT count as resolved, and that a DO inside a routine body resolves against the parent procedure.
 */

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

/** Apply a single insert TextEdit (start === end) to `\n`-delimited text. */
function applyInsert(text: string, edit: TextEdit): string {
    const lines = text.split('\n');
    const { line, character } = edit.range.start;
    lines[line] = lines[line].slice(0, character) + edit.newText + lines[line].slice(character);
    return lines.join('\n');
}

function actionsFor(content: string, uri: string, line: number) {
    const doc = createDocument(content, uri);
    TokenCache.getInstance().getTokens(doc); // populate cache/structure
    const provider = new GenerateRoutineCodeActionProvider();
    return { doc, actions: provider.provideCodeActions(doc, Range.create(line, 0, line, 0)) };
}

suite('#280 buildRoutineSkeleton', () => {
    test('label at column 0, body indented with ! TODO placeholder', () => {
        assert.strictEqual(
            buildRoutineSkeleton('Setup', '  ', '\n'),
            'Setup ROUTINE\n  ! TODO'
        );
    });
});

suite('#280 GenerateRoutineCodeActionProvider', () => {
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    test('offers "Create routine" for an unresolved DO in a procedure', () => {
        const src = `MyProc PROCEDURE()\n  CODE\n  DO Setup`;
        const { actions } = actionsFor(src, 'file:///t280-a.clw', 2);
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].title, "Create routine 'Setup'");
        assert.strictEqual(actions[0].command?.command, 'clarion.placeCursor');
    });

    test('inserted skeleton is placed at the end of the enclosing procedure', () => {
        const src = `MyProc PROCEDURE()\n  CODE\n  DO Setup`;
        const { doc, actions } = actionsFor(src, 'file:///t280-b.clw', 2);
        const edit = actions[0].edit!.changes![doc.uri][0];
        const result = applyInsert(src, edit);
        assert.ok(result.includes('Setup ROUTINE'), `expected skeleton; got:\n${result}`);
        assert.ok(result.includes('! TODO'));
        // Skeleton comes after the DO, its label at column 0.
        assert.ok(result.indexOf('Setup ROUTINE') > result.indexOf('DO Setup'));
        assert.ok(/\nSetup ROUTINE/.test(result), 'label must sit at column 0');
    });

    test('no action when the routine is already defined in the SAME procedure', () => {
        const src = `MyProc PROCEDURE()\n  CODE\n  DO Setup\nSetup ROUTINE\n  ! done`;
        const { actions } = actionsFor(src, 'file:///t280-c.clw', 2);
        assert.strictEqual(actions.length, 0);
    });

    test('resolution is case-insensitive (DO setup ↔ Setup ROUTINE)', () => {
        const src = `MyProc PROCEDURE()\n  CODE\n  DO setup\nSetup ROUTINE\n  ! done`;
        const { actions } = actionsFor(src, 'file:///t280-ci.clw', 2);
        assert.strictEqual(actions.length, 0);
    });

    test('SCOPE: a same-name routine in a DIFFERENT procedure does NOT resolve — still offers', () => {
        const src = [
            'MyProc PROCEDURE()',   // 0
            '  CODE',               // 1
            '  DO Setup',           // 2
            '',                     // 3
            'OtherProc PROCEDURE()',// 4
            '  CODE',               // 5
            'Setup ROUTINE',        // 6
            '  ! elsewhere'         // 7
        ].join('\n');
        const { doc, actions } = actionsFor(src, 'file:///t280-scope.clw', 2);
        assert.strictEqual(actions.length, 1, 'Setup exists only in OtherProc — MyProc has none');
        // And the new routine lands inside MyProc (before OtherProc), not appended globally.
        const result = applyInsert(src, actions[0].edit!.changes![doc.uri][0]);
        assert.ok(
            result.indexOf('Setup ROUTINE\n  ! TODO') < result.indexOf('OtherProc PROCEDURE'),
            `new routine must be inside MyProc; got:\n${result}`
        );
    });

    test('DO inside a routine body resolves against the parent procedure (sibling exists → no action)', () => {
        const src = [
            'MyProc PROCEDURE()', // 0
            '  CODE',             // 1
            '  DO First',         // 2
            'First ROUTINE',      // 3
            '  DO Second',        // 4  (DO inside a routine)
            'Second ROUTINE',     // 5
            '  ! x'               // 6
        ].join('\n');
        const { actions } = actionsFor(src, 'file:///t280-sib.clw', 4);
        assert.strictEqual(actions.length, 0, 'Second is a sibling routine in the same procedure');
    });

    test('DO inside a routine body for a missing target still offers', () => {
        const src = [
            'MyProc PROCEDURE()', // 0
            '  CODE',             // 1
            '  DO First',         // 2
            'First ROUTINE',      // 3
            '  DO Third'          // 4  (Third does not exist)
        ].join('\n');
        const { actions } = actionsFor(src, 'file:///t280-miss.clw', 4);
        assert.strictEqual(actions.length, 1);
        assert.strictEqual(actions[0].title, "Create routine 'Third'");
    });

    test('no action when the cursor line is not a DO statement', () => {
        const src = `MyProc PROCEDURE()\n  CODE\n  x = 1`;
        const { actions } = actionsFor(src, 'file:///t280-nodo.clw', 2);
        assert.strictEqual(actions.length, 0);
    });

    test('no action for a DO in a comment or a namespaced DO', () => {
        const commented = `MyProc PROCEDURE()\n  CODE\n  ! DO Setup`;
        assert.strictEqual(actionsFor(commented, 'file:///t280-cmt.clw', 2).actions.length, 0);
        const namespaced = `MyProc PROCEDURE()\n  CODE\n  DO Dump::SaveState`;
        assert.strictEqual(actionsFor(namespaced, 'file:///t280-ns.clw', 2).actions.length, 0);
    });
});
