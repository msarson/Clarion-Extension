import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import ClarionFoldingProvider from '../ClarionFoldingProvider';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

// #504: a JOIN inside a VIEW is a nested structure terminated by END (or a
// period) and JOINs may nest (Language Reference > 4 - Entity Declarations >
// View Structures > JOIN). The tokenizer never classified JOIN as a structure,
// so the JOIN's END was paired with the enclosing VIEW: the VIEW's fold ended
// one line early and the JOIN had no fold at all.

const FILES = `Customer  FILE,DRIVER('TOPSPEED'),PRE(CUS),CREATE,THREAD
CusKey      KEY(CUS:ID),NOCASE,OPT
Record        RECORD,PRE()
ID              LONG
Name            STRING(30)
              END
          END

Orders    FILE,DRIVER('TOPSPEED'),PRE(ORD),CREATE,THREAD
OrdKey      KEY(ORD:ID),NOCASE,OPT
Record        RECORD,PRE()
ID              LONG
CusID           LONG
              END
          END
`;

function tokenize(code: string) {
    return new ClarionTokenizer(code).tokenize();
}

function tokenAt(tokens: ReturnType<typeof tokenize>, line: number, value: string) {
    const t = tokens.find(x => x.line === line && x.value.toUpperCase() === value.toUpperCase());
    assert.ok(t, `expected a '${value}' token on line ${line}`);
    return t!;
}

suite('#504 JOIN inside a VIEW is a structure', () => {

    setup(() => setServerInitialized(true));

    test('JOIN ... END nests inside the VIEW: both finishesAt land on their own END', () => {
        const code = FILES + `
ViewPrefix           VIEW(Orders)
                       PROJECT(ORD:ID)
                       JOIN(CUS:CusKey, ORD:CusID)
                         PROJECT(CUS:Name)
                       END
                     END
`;
        const tokens = tokenize(code);
        const view = tokenAt(tokens, 16, 'VIEW');
        const join = tokenAt(tokens, 18, 'JOIN');
        assert.strictEqual(join.type, TokenType.Structure, 'JOIN should be a Structure token');
        assert.strictEqual(join.finishesAt, 20, 'JOIN closes at its own END');
        assert.strictEqual(view.finishesAt, 21, 'VIEW closes at its own END, not the JOIN\'s');
    });

    test('a period closes the JOIN', () => {
        const code = FILES + `
ViewShortEnd         VIEW(Orders)
                       PROJECT(ORD:ID)
                       JOIN(CUS:CusKey, ORD:CusID)
                         PROJECT(CUS:Name)
                       .
                     END
`;
        const tokens = tokenize(code);
        assert.strictEqual(tokenAt(tokens, 18, 'JOIN').finishesAt, 20);
        assert.strictEqual(tokenAt(tokens, 16, 'VIEW').finishesAt, 21);
    });

    test('nested JOINs and the ,INNER attribute', () => {
        const code = FILES + `
Lines     FILE,DRIVER('TOPSPEED'),PRE(LIN)
LinKey      KEY(LIN:CusID)
Record        RECORD,PRE()
CusID           LONG
              END
          END

ViewNested           VIEW(Orders)
                       JOIN(CUS:CusKey, ORD:CusID),INNER
                         PROJECT(CUS:Name)
                         JOIN(LIN:LinKey, CUS:ID)
                         END
                       END
                     END
`;
        const tokens = tokenize(code);
        assert.strictEqual(tokenAt(tokens, 26, 'JOIN').finishesAt, 27, 'inner JOIN');
        assert.strictEqual(tokenAt(tokens, 24, 'JOIN').finishesAt, 28, 'outer JOIN with ,INNER');
        assert.strictEqual(tokenAt(tokens, 23, 'VIEW').finishesAt, 29, 'VIEW');
    });

    test('folding: the JOIN folds and the VIEW fold reaches its own END', () => {
        const code = FILES + `
ViewPrefix           VIEW(Orders)
                       PROJECT(ORD:ID)
                       JOIN(CUS:CusKey, ORD:CusID)
                         PROJECT(CUS:Name)
                       END
                     END
`;
        const ranges = new ClarionFoldingProvider(tokenize(code)).computeFoldingRanges();
        const view = ranges.find(r => r.startLine === 16);
        const join = ranges.find(r => r.startLine === 18);
        assert.ok(join, 'JOIN should have a folding range');
        assert.strictEqual(join!.endLine, 20);
        assert.ok(view, 'VIEW should have a folding range');
        assert.strictEqual(view!.endLine, 21);
    });

    test('Structure view: one JOIN node under the VIEW, not two', () => {
        const code = FILES + `
ViewPrefix           VIEW(Orders)
                       PROJECT(ORD:ID)
                       JOIN(CUS:CusKey, ORD:CusID)
                         PROJECT(CUS:Name)
                       END
                     END
`;
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokenize(code), 'test://504.clw');
        const flat: ClarionDocumentSymbol[] = [];
        const walk = (list: ClarionDocumentSymbol[]) => { for (const s of list) { flat.push(s); if (s.children) walk(s.children); } };
        walk(symbols);
        const joins = flat.filter(s => s.name.toUpperCase().startsWith('JOIN'));
        assert.strictEqual(joins.length, 1, `expected one JOIN node, got: ${joins.map(j => j.name).join(' | ')}`);
        const view = flat.find(s => s.name.toUpperCase().includes('VIEW'));
        assert.ok(view && view.children?.some(c => c.name.toUpperCase().startsWith('JOIN')), 'JOIN node should be a child of the VIEW');
    });
});

suite('#504 JOIN is only a structure inside a VIEW', () => {

    test('a MAP prototype named Join does not open a structure', () => {
        const code = `  PROGRAM
  MAP
    Join(STRING a, STRING b),STRING
    Other()
  END
  CODE
`;
        const tokens = tokenize(code);
        const map = tokenAt(tokens, 1, 'MAP');
        assert.strictEqual(map.finishesAt, 4, 'MAP closes at its END');
        const join = tokenAt(tokens, 2, 'Join');
        assert.notStrictEqual(join.type, TokenType.Structure, 'Join prototype is not a structure');
    });

    test('a call to a procedure named Join in CODE does not open a structure', () => {
        const code = `MyProc PROCEDURE()
S  STRING(20)
  CODE
  S = Join('a', 'b')
  IF S
    S = ''
  END
  RETURN
`;
        const tokens = tokenize(code);
        assert.strictEqual(tokenAt(tokens, 4, 'IF').finishesAt, 6, 'IF closes at its END');
        assert.notStrictEqual(tokenAt(tokens, 3, 'Join').type, TokenType.Structure);
    });

    test('the JOIN attribute on a SHEET does not open a structure', () => {
        const code = `Win WINDOW('x'),AT(0,0,100,100)
      SHEET,AT(0,0,90,90),USE(?Sheet),JOIN
        TAB('One'),USE(?Tab1)
        END
      END
    END
`;
        const tokens = tokenize(code);
        assert.strictEqual(tokenAt(tokens, 1, 'SHEET').finishesAt, 4, 'SHEET closes at its END');
        assert.strictEqual(tokenAt(tokens, 0, 'WINDOW').finishesAt, 5, 'WINDOW closes at its END');
    });
});
