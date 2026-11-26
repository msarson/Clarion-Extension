import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../tokenizer/TokenTypes';

// A variable named Code used at the END of a statement (`Temp = Code`) is tokenized as the
// execution marker, and the #855 "stands alone on its line" test only looked at what came
// after it, so it passed. DocumentStructure then took that reference for the CODE statement
// and moved the procedure's or routine's executionMarker down to it, stretching the data
// section over the first lines of code. A CODE statement has nothing before it either.
suite('DocumentStructure - a variable named Code after the CODE statement', () => {
    setup(() => TokenCache.getInstance().clearAllTokens());
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('the executionMarker stays on the CODE statement of a procedure and a routine', () => {
        const src = [
            '  MEMBER()',              // 0
            'MyProc PROCEDURE()',      // 1
            'Code   LONG',             // 2
            '  CODE',                  // 3  MyProc's CODE
            '  Code = 1',              // 4
            '  DO MyRoutine',          // 5
            'MyRoutine ROUTINE',       // 6
            '  DATA',                  // 7
            'Temp   LONG',             // 8
            '  CODE',                  // 9  MyRoutine's CODE
            '  Temp = Code',           // 10 a reference, last on its line
            'Other  PROCEDURE()',      // 11
            'X      LONG',             // 12
            '  CODE',                  // 13 Other's CODE
            '  X = Code',              // 14 a reference, last on its line
        ];
        const doc = TextDocument.create('file:///code-variable-after-marker.clw', 'clarion', 1, src.join('\r\n'));
        const tokens = TokenCache.getInstance().getTokens(doc);

        const markerLine = (line: number) => tokens.find(t => t.line === line && t.executionMarker)?.executionMarker?.line;
        assert.ok(tokens.some(t => t.line === 6 && t.type === TokenType.Keyword && t.value.toUpperCase() === 'ROUTINE'),
            'fixture: MyRoutine is a ROUTINE');
        assert.strictEqual(markerLine(1), 3, 'MyProc code starts at its CODE statement');
        assert.strictEqual(markerLine(6), 9, 'MyRoutine code starts at its CODE statement, not at `Temp = Code`');
        assert.strictEqual(markerLine(11), 13, 'Other code starts at its CODE statement, not at `X = Code`');
    });

    test('Code alone on a continued line does not move the executionMarker', () => {
        const src = [
            '  MEMBER()',              // 0
            'MyProc PROCEDURE()',      // 1
            'Code   LONG',             // 2
            'Temp   LONG',             // 3
            '  CODE',                  // 4  MyProc's CODE
            '  Temp = 1 + |',          // 5
            '         Code',           // 6  a reference, alone on its line
        ];
        const doc = TextDocument.create('file:///code-variable-continued.clw', 'clarion', 1, src.join('\r\n'));
        const tokens = TokenCache.getInstance().getTokens(doc);

        const marker = tokens.find(t => t.line === 1 && t.executionMarker)?.executionMarker;
        assert.strictEqual(marker?.line, 4, 'MyProc code starts at its CODE statement, not at the continued `Code`');
    });
});
