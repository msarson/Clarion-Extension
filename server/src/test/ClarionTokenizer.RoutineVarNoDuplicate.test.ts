import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

/**
 * #267 — `tokenizeRoutineVariables` spliced a phantom DUPLICATE token for every
 * routine-local DATA variable: the normal tokenize pass had already produced a
 * col-0 Label for the identifier, and the routine pass unconditionally added a
 * second one (same line/col/value, but never processed by DocumentStructure —
 * no label/parent metadata). Raw-array consumers saw the variable twice, and
 * which twin a consumer found first changed the metadata it saw.
 *
 * The intent was to MARK the existing token with the Variable/ReferenceVariable
 * subType (HoverProvider's legacy fallback matches on that subType). These pin
 * both directions: exactly ONE token per declaration, and that one token
 * carries the subType the consumer needs.
 */

const FIXTURE = [
    "  MEMBER('test')",     // 0
    '',                     // 1
    'MyClass    CLASS,TYPE',// 2
    'DoIt         PROCEDURE()', // 3
    '           END',       // 4
    '',                     // 5
    'MainProc PROCEDURE',   // 6
    '  CODE',               // 7
    '  DO Sub',             // 8
    '  RETURN',             // 9
    '',                     // 10
    'Sub ROUTINE',          // 11
    '  DATA',               // 12
    'RtnVar  LONG',         // 13
    'RtnRef  &MyClass',     // 14
    '  CODE',               // 15
    '  RtnVar = 1',         // 16
].join('\n');

suite('ClarionTokenizer — routine DATA vars are marked, not duplicated (#267)', () => {

    test('exactly ONE col-0 token exists per routine-local declaration', () => {
        const tokens = new ClarionTokenizer(FIXTURE).tokenize();
        const rtnVarDecls = tokens.filter(t =>
            t.line === 13 && t.start === 0 && t.value.toLowerCase() === 'rtnvar');
        assert.strictEqual(rtnVarDecls.length, 1,
            `expected exactly 1 declaration token for RtnVar at (13,0), got ${rtnVarDecls.length} — ` +
            'a phantom duplicate was spliced into the raw array');
        const rtnRefDecls = tokens.filter(t =>
            t.line === 14 && t.start === 0 && t.value.toLowerCase() === 'rtnref');
        assert.strictEqual(rtnRefDecls.length, 1,
            `expected exactly 1 declaration token for RtnRef at (14,0), got ${rtnRefDecls.length}`);
    });

    test('the single token carries the Variable/ReferenceVariable subType consumers match on', () => {
        const tokens = new ClarionTokenizer(FIXTURE).tokenize();
        const rtnVar = tokens.find(t =>
            t.line === 13 && t.start === 0 && t.value.toLowerCase() === 'rtnvar');
        assert.ok(rtnVar, 'RtnVar declaration token must exist');
        assert.strictEqual(rtnVar!.type, TokenType.Label, 'declaration stays a Label token');
        assert.strictEqual(rtnVar!.subType, TokenType.Variable,
            "HoverProvider's legacy fallback matches subType === Variable — the mark must land on the real token");

        const rtnRef = tokens.find(t =>
            t.line === 14 && t.start === 0 && t.value.toLowerCase() === 'rtnref');
        assert.ok(rtnRef, 'RtnRef declaration token must exist');
        assert.strictEqual(rtnRef!.subType, TokenType.ReferenceVariable,
            'reference declarations (&Type) must be marked ReferenceVariable');
    });
});
