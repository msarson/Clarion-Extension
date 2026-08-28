import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

/**
 * #382 — the MAP/MODULE shorthand-procedure lookahead accepted an EndStatement as
 * the structure's true end only if no Structure token had been seen since. A
 * MODULE nested inside a MAP is itself a Structure token, so once one appeared the
 * condition could never become true again and the scan ran unbounded through the
 * rest of the file: any later identifier immediately followed by `(` — e.g. WINDOW
 * attributes like FONT(...), VALUE(...), FROM(...) — was misclassified as a
 * MAP/MODULE procedure and surfaced as a stray outline entry.
 *
 * The fix bounds the scan with the structure's own `finishesAt` (computed by the
 * tokenizer with correct nesting depth). These tests pin exactly the trigger
 * shape: a MAP containing a nested MODULE, followed by non-procedure tokens.
 */
suite('DocumentSymbols — MAP/MODULE lookahead is bounded (#382)', () => {

    suiteSetup(() => {
        setServerInitialized(true); // provideDocumentSymbols returns [] otherwise
    });

    function collectNames(symbols: ClarionDocumentSymbol[], out: string[] = []): string[] {
        for (const s of symbols) {
            out.push(s.name);
            if (s.children?.length) collectNames(s.children, out);
        }
        return out;
    }

    function getSymbols(code: string): ClarionDocumentSymbol[] {
        const tokens = new ClarionTokenizer(code).tokenize();
        return new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://mapmodule382.clw');
    }

    test('WINDOW attributes after a MAP with a nested MODULE are not misclassified as MAP procedures', () => {
        const code = `
  PROGRAM
  MAP
    MODULE('winapi')
GetTickCount(),LONG,PASCAL
    END
Proc1(),LONG
  END

Main PROCEDURE
Win WINDOW('Test'),AT(,,200,100),FONT('Segoe UI',9),GRAY
      STRING('Hi'),AT(10,10),USE(?Str1),FONT('Arial',10)
      LIST,AT(10,30),USE(?List1),FROM(SomeQueue)
    END
  CODE
  RETURN
`;
        const symbols = getSymbols(code);
        const names = collectNames(symbols);

        // The old unbounded scan surfaced these attribute keywords as stray
        // MAP-procedure outline entries once the nested MODULE poisoned the
        // END-detection condition. Match the exact procedure-symbol shapes
        // (`FONT`, `FONT(...)`, `FONT (...)`) — a WINDOW control's own symbol
        // name can legitimately CONTAIN an attribute keyword (`GRAY STRING(...)`).
        for (const stray of ['FONT', 'AT', 'USE', 'FROM']) {
            assert.ok(!names.some(n => n === stray || n.startsWith(`${stray}(`) || n.startsWith(`${stray} (`)),
                `WINDOW attribute "${stray}" must not appear as an outline symbol; got: ${JSON.stringify(names)}`);
        }
    });

    test('real prototypes inside the MAP and nested MODULE still index', () => {
        const code = `
  PROGRAM
  MAP
    MODULE('winapi')
GetTickCount(),LONG,PASCAL
    END
Proc1(),LONG
  END

Main PROCEDURE
Win WINDOW('Test'),AT(,,200,100),FONT('Segoe UI',9),GRAY
    END
  CODE
  RETURN
`;
        const symbols = getSymbols(code);
        const names = collectNames(symbols);

        assert.ok(names.some(n => n === 'GetTickCount' || n.startsWith('GetTickCount')),
            `the nested MODULE's prototype must still be in the outline; got: ${JSON.stringify(names)}`);
        assert.ok(names.some(n => n === 'Proc1' || n.startsWith('Proc1')),
            `the MAP's own prototype must still be in the outline; got: ${JSON.stringify(names)}`);
    });
});
