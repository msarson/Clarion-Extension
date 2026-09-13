import * as assert from 'assert';
import { ClarionTokenizer, TokenType, Token } from '../ClarionTokenizer';
import { SymbolFinderService } from '../services/SymbolFinderService';

/**
 * Issue #476 — a prefixed reference to a FILE's KEY reported its type as `UNKNOWN`:
 *
 *     CUS:CusKey        **CusKey** — `UNKNOWN`
 *     Customer.CusKey   **Customer Field:** `CusKey` — `KEY`
 *
 * The dotted path already got it right, so the information was there; `extractTypeInfo`
 * simply had no branch that returned it. Its `Keyword` branch accepted only PROCEDURE /
 * ROUTINE / FUNCTION, so `KEY` fell through to the `UNKNOWN` default.
 *
 * INDEX was broken the same way and was NOT in the original report — worth finding,
 * because it fails for a different reason and a type-keyed fix would have repaired KEY
 * and left INDEX silently broken: `KEY` tokenizes as `Keyword`, while `INDEX` tokenizes
 * as `Function` on account of its trailing '('. Matching on the VALUE covers both.
 *
 * MEMO and BLOB are the control: they were already correct, arriving as `Type` and
 * `Variable`, and must stay that way.
 */

const SOURCE = [
    "  PROGRAM",
    "",
    "  MAP",
    "  END",
    "",
    "Customer             FILE,DRIVER('TOPSPEED'),PRE(CUS)",
    "CusKey                   KEY(CUS:ID),NOCASE,OPT",
    "NameIdx                  INDEX(CUS:Name),NOCASE,OPT",
    "Notes                    MEMO(2000)",
    "Photo                    BLOB",
    "Record                   RECORD,PRE()",
    "ID                          LONG",
    "Name                        STRING(30)",
    "                         END",
    "                     END",
    "",
    "  CODE",
    "  RETURN",
    ""
].join('\n');

function typeOf(label: string): string {
    const tokens: Token[] = new ClarionTokenizer(SOURCE).tokenize();
    const token = tokens.find(t =>
        t.type === TokenType.Label && t.start === 0 && t.value === label);
    assert.ok(token, `label '${label}' not found in the fixture`);
    return SymbolFinderService.extractTypeInfo(token!, tokens);
}

suite('Issue #476 — a FILE member whose keyword is its type', () => {

    test('a KEY declaration reports KEY, not UNKNOWN', () => {
        assert.strictEqual(typeOf('CusKey'), 'KEY');
    });

    test('an INDEX declaration reports INDEX, not UNKNOWN', () => {
        // Tokenized as Function, not Keyword — a type-keyed fix would miss this.
        assert.strictEqual(typeOf('NameIdx'), 'INDEX');
    });

    test('MEMO and BLOB are unchanged (regression guards)', () => {
        assert.strictEqual(typeOf('Notes'), 'MEMO');
        assert.strictEqual(typeOf('Photo'), 'BLOB');
    });

    test('ordinary field types are unchanged (regression guards)', () => {
        assert.strictEqual(typeOf('ID'), 'LONG');
        assert.strictEqual(typeOf('Name'), 'STRING');
        assert.strictEqual(typeOf('Record'), 'RECORD');
    });
});
