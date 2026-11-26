/**
 * #865 — the tokenizer marks any word CODE or DATA as an ExecutionMarker. Only a CODE or DATA
 * standing alone on its line is one (#855, isBareExecutionMarker); `data = 1` is a statement and
 * `Code  LONG` a declaration. Three readers took the token as it is.
 */
import * as assert from 'assert';
import { SymbolKind } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { UnreachableCodeProvider } from '../providers/UnreachableCodeProvider';
import { setServerInitialized } from '../serverState';

let version = 0;

suite('A CODE or DATA word that is not a section marker (#865)', () => {
    setup(() => setServerInitialized(true));

    function unknownAttributeLines(lines: string[]): number[] {
        const text = lines.join('\n');
        const doc = TextDocument.create(`file:///c%3A/t865/a${++version}.clw`, 'clarion', 1, text);
        return validateAttributeApplicability(new ClarionTokenizer(text).tokenize(), doc)
            .filter(d => d.code === 'unknown-attribute')
            .map(d => d.range.start.line);
    }

    test('attribute checks: a local named Code does not end the data section', () => {
        assert.deepStrictEqual(unknownAttributeLines([
            '  PROGRAM',                   // 0
            '  MAP',                       // 1
            '  END',                       // 2
            'Code           LONG',         // 3
            'Note           STRING(20),BLAH', // 4 unknown attribute
            '  CODE',                      // 5
            '  RETURN',                    // 6
        ]), [4]);
    });

    test('attribute checks: a local named Data in a routine\'s data section does not end it', () => {
        assert.deepStrictEqual(unknownAttributeLines([
            "  MEMBER('x')",               // 0
            '  MAP',                       // 1
            '  END',                       // 2
            'Proc           PROCEDURE',    // 3
            '  CODE',                      // 4
            '  DO R',                      // 5
            'R              ROUTINE',      // 6
            '  DATA',                      // 7
            'Code           LONG',         // 8
            'Note           STRING(20),BLAH', // 9 unknown attribute
            '  CODE',                      // 10
            '  EXIT',                      // 11
        ]), [9]);
    });

    function flatten(symbols: ClarionDocumentSymbol[], out: ClarionDocumentSymbol[] = []): ClarionDocumentSymbol[] {
        for (const s of symbols) { out.push(s); if (s.children) flatten(s.children as ClarionDocumentSymbol[], out); }
        return out;
    }

    test('Structure view: `data = 1` in a routine\'s code does not reopen its declarations', () => {
        const lines = [
            "  MEMBER('x')",               // 0
            '  MAP',                       // 1
            'Proc           PROCEDURE()',  // 2
            '  END',                       // 3
            'Proc           PROCEDURE()',  // 4
            'Loc:Flag       BYTE',         // 5
            '  CODE',                      // 6
            '  DO R',                      // 7
            'R              ROUTINE',      // 8
            '  DATA',                      // 9
            'Tmp            LONG',         // 10 a routine local: listed
            '  CODE',                      // 11
            '  data = 1',                  // 12
            '  IF Loc:Flag AND Tmp <> 0',  // 13 a statement, not a declaration
            '  END',                       // 14
        ];
        const tokens = new ClarionTokenizer(lines.join('\r\n')).tokenize();
        const all = flatten(new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://r865.clw'));
        const bogus = all.filter(s => s.kind === SymbolKind.Variable && s.range.start.line > 11);
        assert.deepStrictEqual(bogus.map(s => `${s.name}@${s.range.start.line}`), []);
        assert.ok(all.some(s => s.range.start.line === 10), 'the routine local Tmp is listed');
    });

    test('Structure view: a parameter named code does not end a CLASS\'s method list', () => {
        const lines = [
            "  MEMBER('x')",                               // 0
            'Settings       CLASS,TYPE',                   // 1
            'SetCode          PROCEDURE(STRING code)',     // 2
            'GetName          PROCEDURE(),STRING',         // 3
            'SetName          PROCEDURE(STRING pName)',    // 4
            '               END',                          // 5
        ];
        const tokens = new ClarionTokenizer(lines.join('\r\n')).tokenize();
        const all = flatten(new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://c865.clw'));
        for (const line of [2, 3, 4]) {
            assert.ok(all.some(s => s.range.start.line === line),
                `method on line ${line} missing: ${JSON.stringify(all.map(s => `${s.name}@${s.range.start.line}`))}`);
        }
    });

    test('unreachable code: `data = 1` inside an IF in a routine does not reset the structure stack', () => {
        const code = [
            'Proc           PROCEDURE',    // 0
            '  CODE',                      // 1
            '  DO R',                      // 2
            'R              ROUTINE',      // 3
            '  IF Loc:Flag = 1',           // 4
            '    data = 1',                // 5
            '    EXIT',                    // 6
            '  END',                       // 7
            '  Loc:Flag = 2',              // 8 reachable
            '  EXIT',                      // 9
        ].join('\r\n');
        const doc = TextDocument.create(`file:///c%3A/t865/u${++version}.clw`, 'clarion', 1, code);
        assert.deepStrictEqual(UnreachableCodeProvider.provideUnreachableRanges(doc).map(r => r.start.line), []);
    });
});
