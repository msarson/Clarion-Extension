import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { TokenCache } from '../TokenCache';

suite('DefinitionProvider — DO Routine References (#211)', () => {
    let docCounter = 0;

    setup(() => {
        TokenCache.getInstance().clearAllTokens();
    });

    function createDocument(code: string, uri: string = `test://do-routine-${++docCounter}.clw`): TextDocument {
        return TextDocument.create(uri, 'clarion', 1, code);
    }

    function getLocationLine(result: any): number {
        if (!result) return -1;
        if (Array.isArray(result)) {
            return result.length > 0 ? result[0].range.start.line : -1;
        }
        return result.range.start.line;
    }

    test('resolves DO routine references to the matching ROUTINE label', async () => {
        const code = `MyProc PROCEDURE()
  CODE
  DO ProcessData
ProcessData ROUTINE
  RETURN
END`;
        const doc = createDocument(code);
        TokenCache.getInstance().getTokens(doc);

        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(doc, { line: 2, character: 8 });

        assert.strictEqual(getLocationLine(result), 3);
    });

    test('matches routine names case-insensitively', async () => {
        const code = `MyProc PROCEDURE()
  CODE
  DO processdata
ProcessData ROUTINE
  RETURN
END`;
        const doc = createDocument(code);
        TokenCache.getInstance().getTokens(doc);

        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(doc, { line: 2, character: 8 });

        assert.strictEqual(getLocationLine(result), 3);
    });

    test('keeps routine lookup inside the enclosing procedure', async () => {
        const code = `MyProc PROCEDURE()
  CODE
  DO MyRoutine
MyRoutine ROUTINE
  RETURN
END

OtherProc PROCEDURE()
  CODE
  DO MyRoutine
MyRoutine ROUTINE
  RETURN
END`;
        const doc = createDocument(code);
        TokenCache.getInstance().getTokens(doc);

        const provider = new DefinitionProvider();

        const first = await provider.provideDefinition(doc, { line: 2, character: 8 });
        assert.strictEqual(getLocationLine(first), 3);

        const second = await provider.provideDefinition(doc, { line: 9, character: 8 });
        assert.strictEqual(getLocationLine(second), 10);
    });

    test('returns null when the routine is not present in the procedure', async () => {
        const code = `MyProc PROCEDURE()
  CODE
  DO UndefinedRoutine
END`;
        const doc = createDocument(code);
        TokenCache.getInstance().getTokens(doc);

        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(doc, { line: 2, character: 8 });

        assert.strictEqual(result, null);
    });

    test('finds routines defined before the DO statement', async () => {
        const code = `MyProc PROCEDURE()
  CODE
ProcessData ROUTINE
  RETURN
  DO ProcessData
  RETURN
END`;
        const doc = createDocument(code);
        TokenCache.getInstance().getTokens(doc);

        const provider = new DefinitionProvider();
        const result = await provider.provideDefinition(doc, { line: 4, character: 8 });

        assert.strictEqual(getLocationLine(result), 2);
    });
});
