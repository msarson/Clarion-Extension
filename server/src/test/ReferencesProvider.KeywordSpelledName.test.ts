import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextEdit } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { RenameProvider } from '../providers/RenameProvider';
import { setServerInitialized } from '../serverState';

// Find All References on a name spelled like a keyword: `Code`, `Data`, `Window`, `Map`.
// The match loop accepted any token whose text was the name, whatever its type, so every
// CODE / DATA statement was listed as a reference to a variable named Code / Data, the
// WINDOW keyword of `Window WINDOW(...)` as a reference to the label Window, and a MAP
// block as a reference to a variable named Map. Rename goes through the same search, so
// renaming such a variable also rewrote the statements and keywords.
//
// A structure keyword is never a reference (the structure's name is its own Label token),
// and neither is a CODE or DATA statement standing alone on its line. `Code = 1` and
// `IF Code` are tokenized as the execution marker too, but they are references and stay.
suite('ReferencesProvider - a name spelled like a keyword', () => {
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
    });

    async function referenceLines(uri: string, lines: string[], line: number, character: number): Promise<string[]> {
        const doc = TextDocument.create(uri, 'clarion', 1, lines.join('\r\n'));
        TokenCache.getInstance().getTokens(doc);
        const refs = await new ReferencesProvider().provideReferences(doc, { line, character }, { includeDeclaration: true });
        return (refs ?? [])
            .sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.character - b.range.start.character)
            .map(r => `${r.range.start.line}:${r.range.start.character}`);
    }

    test('a GROUP,TYPE field named Code: no CODE statement is a reference', async () => {
        const src = [
            '  PROGRAM',                       // 0
            '  MAP',                           // 1
            '  END',                           // 2
            'ErrorInfoType  GROUP,TYPE',       // 3
            'Code             STRING(128)',    // 4  declaration
            '               END',              // 5
            'Err            LIKE(ErrorInfoType)', // 6
            '  CODE',                          // 7  statement
            "  Err.Code = 'x'",                // 8  reference
            '  RETURN',                        // 9
        ];
        const lines = await referenceLines('file:///far-keyword-type-field.clw', src, 4, 1);
        assert.deepStrictEqual(lines, ['4:0', '8:6']);
    });

    test('a local named Code: its uses are references, the CODE statements are not', async () => {
        const src = [
            '  MEMBER()',                      // 0
            'MyProc PROCEDURE()',              // 1
            'Code   LONG',                     // 2  declaration
            '  CODE',                          // 3  statement
            '  Code = 1',                      // 4  reference
            '  IF Code THEN RETURN.',          // 5  reference
            '  DO MyRoutine',                  // 6
            'MyRoutine ROUTINE',               // 7
            '  DATA',                          // 8  statement
            'Temp   LONG',                     // 9
            '  CODE ! routine body',           // 10 statement, comment after it
            '  Temp = Code',                   // 11 reference
        ];
        const lines = await referenceLines('file:///far-keyword-local-code.clw', src, 2, 1);
        assert.deepStrictEqual(lines, ['2:0', '4:2', '5:5', '11:9']);
    });

    test('a bare CODE statement at column 0 is not a reference either', async () => {
        const src = [
            '  MEMBER()',                      // 0
            'MyProc PROCEDURE()',              // 1
            'Code   LONG',                     // 2  declaration
            'CODE',                            // 3  statement at column 0
            '  Code = 1',                      // 4  reference
        ];
        const lines = await referenceLines('file:///far-keyword-column0-code.clw', src, 2, 1);
        assert.deepStrictEqual(lines, ['2:0', '4:2']);
    });

    test('Code alone on a line continued from the one above is a reference', async () => {
        const src = [
            '  MEMBER()',                      // 0
            'MyProc PROCEDURE()',              // 1
            'Code   LONG',                     // 2  declaration
            'Temp   LONG',                     // 3
            '  CODE',                          // 4  statement
            '  Temp = 1 + |  ! continued',     // 5
            '         Code',                   // 6  reference, alone on its line
            '  Temp = Code + 1',               // 7  reference
        ];
        const lines = await referenceLines('file:///far-keyword-continued-code.clw', src, 2, 1);
        assert.deepStrictEqual(lines, ['2:0', '6:9', '7:9']);
    });

    test('a local named Data: the DATA statement of a routine is not a reference', async () => {
        const src = [
            '  MEMBER()',                      // 0
            'MyProc PROCEDURE()',              // 1
            'Data   LONG',                     // 2  declaration
            '  CODE',                          // 3
            '  DO MyRoutine',                  // 4
            'MyRoutine ROUTINE',               // 5
            '  DATA',                          // 6  statement
            'Temp   LONG',                     // 7
            '  CODE',                          // 8
            '  Temp = Data',                   // 9  reference
        ];
        const lines = await referenceLines('file:///far-keyword-local-data.clw', src, 2, 1);
        assert.deepStrictEqual(lines, ['2:0', '9:9']);
    });

    test('a WINDOW labelled Window: its WINDOW keyword is not a reference', async () => {
        const src = [
            '  MEMBER()',                                  // 0
            'MyProc PROCEDURE()',                          // 1
            "Window WINDOW('Caption'),AT(,,100,100)",      // 2  declaration; WINDOW keyword at :7
            '       END',                                  // 3
            '  CODE',                                      // 4
            '  OPEN(Window)',                              // 5  reference
        ];
        const lines = await referenceLines('file:///far-keyword-window.clw', src, 2, 1);
        assert.deepStrictEqual(lines, ['2:0', '5:7']);
    });

    test('a global named Map: the MAP block is not a reference', async () => {
        const src = [
            '  PROGRAM',                       // 0
            'Map    LONG',                     // 1  declaration
            '  MAP',                           // 2  structure keyword
            '  END',                           // 3
            '  CODE',                          // 4
            '  Map += 1',                      // 5  reference
        ];
        const lines = await referenceLines('file:///far-keyword-map.clw', src, 1, 1);
        assert.deepStrictEqual(lines, ['1:0', '5:2']);
    });

    test('renaming a local named Code leaves the CODE statement alone', async () => {
        const src = [
            '  MEMBER()',                      // 0
            'MyProc PROCEDURE()',              // 1
            'Code   LONG',                     // 2
            '  CODE',                          // 3
            '  Code = 1',                      // 4
        ];
        const doc = TextDocument.create('file:///rename-keyword-local-code.clw', 'clarion', 1, src.join('\r\n'));
        TokenCache.getInstance().getTokens(doc);
        const edit = await new RenameProvider().provideRename(doc, { line: 2, character: 1 }, 'StatusCode');
        const edits = (edit?.documentChanges ?? []).flatMap(c => 'edits' in c ? c.edits as TextEdit[] : []);
        const positions = edits
            .map(e => `${e.range.start.line}:${e.range.start.character}`)
            .sort();
        assert.deepStrictEqual(positions, ['2:0', '4:2'], `rename edits: ${JSON.stringify(edits)}`);
    });
});
