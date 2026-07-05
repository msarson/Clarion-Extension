/**
 * Issue #233 Stage 2 — TokenHelper.getInnermostScopeAtLine unified behavior.
 *
 * Before Stage 2 the two overloads DISAGREED: the DocumentStructure path returned the
 * OUTERMOST procedure for a routine-body line (silently dropping routine scope) while the
 * legacy Token[] path returned the routine. Both now delegate to ScopeResolver and return
 * the INNERMOST scope. These tests pin that agreement so it can't silently regress.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from '../utils/TokenHelper';
import { TokenType } from '../tokenizer/TokenTypes';

function build(content: string) {
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    const doc = TextDocument.create('file:///thchar.clw', 'clarion', 1, content);
    const tokens = cache.getTokens(doc);
    const structure = cache.getStructure(doc);
    return { tokens, structure };
}

// 0 MyProc PROCEDURE
// 1 LocalA LONG
// 2   CODE
// 3   LocalA = 1
// 4   DO MyRtn
// 6 MyRtn ROUTINE
// 7   CODE
// 8   LocalA = 2   <-- routine body line
const SRC = `MyProc PROCEDURE
LocalA LONG
  CODE
  LocalA = 1
  DO MyRtn

MyRtn ROUTINE
  CODE
  LocalA = 2
`;

suite('#233 Stage 2 — TokenHelper.getInnermostScopeAtLine (unified innermost)', () => {
    test('routine-body line: BOTH overloads return the innermost ROUTINE', () => {
        const { tokens, structure } = build(SRC);
        const viaStructure = TokenHelper.getInnermostScopeAtLine(structure, 8);
        const viaLegacy = TokenHelper.getInnermostScopeAtLine(tokens, 8);
        assert.strictEqual(viaStructure?.subType, TokenType.Routine, 'structure path → routine');
        assert.strictEqual(viaLegacy?.subType, TokenType.Routine, 'legacy path → routine');
        assert.strictEqual(viaStructure?.line, 6);
        assert.strictEqual(viaLegacy?.line, 6);
    });

    test('procedure-data line: BOTH overloads return the procedure', () => {
        const { tokens, structure } = build(SRC);
        const viaStructure = TokenHelper.getInnermostScopeAtLine(structure, 1);
        const viaLegacy = TokenHelper.getInnermostScopeAtLine(tokens, 1);
        assert.strictEqual(viaStructure?.subType, TokenType.GlobalProcedure);
        assert.strictEqual(viaLegacy?.subType, TokenType.GlobalProcedure);
        assert.strictEqual(viaStructure?.line, 0);
        assert.strictEqual(viaLegacy?.line, 0);
    });
});
