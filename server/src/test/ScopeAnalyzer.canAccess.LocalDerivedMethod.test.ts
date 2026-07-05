/**
 * Issue #233 Stage 2 — canAccess must honor Rule 4 (Local Derived Methods).
 *
 * A method of a CLASS declared in a procedure's LOCAL data shares that procedure's scope:
 * its local data is visible inside the method. canAccess previously denied this (it compared
 * the method's own line to the declaring procedure's line). These pins drive the fix onto
 * ScopeResolver.getVisibleScopeChain.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { TokenCache } from '../TokenCache';

function doc(content: string, uri = 'file:///canaccess.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

// 0 PROGRAM
// 4 Owner PROCEDURE
// 5 OwnerLocal LONG          <- declaration
// 6 Widget CLASS
// 7 Run PROCEDURE
// 8   END
// 9   CODE
// 12 Widget.Run PROCEDURE
// 14   OwnerLocal = 2        <- reference from inside the local derived method
// 17 Other PROCEDURE
// 18 OtherLocal LONG         <- unrelated procedure's local
// 20   CODE
const SRC = `PROGRAM
  MAP
  END

Owner PROCEDURE
OwnerLocal LONG
Widget CLASS
Run PROCEDURE
  END
  CODE
  OwnerLocal = 1

Widget.Run PROCEDURE
  CODE
  OwnerLocal = 2

Other PROCEDURE
OtherLocal LONG
  CODE
  OtherLocal = 1
`;

suite('#233 — ScopeAnalyzer.canAccess Local Derived Method visibility (Rule 4)', () => {
    let analyzer: ScopeAnalyzer;
    setup(() => {
        const cache = TokenCache.getInstance();
        cache.clearAllTokens();
        analyzer = new ScopeAnalyzer(cache, null);
    });

    test('a local derived method CAN access its declaring procedure local', () => {
        const d = doc(SRC);
        const refPos = { line: 14, character: 2 };  // OwnerLocal used in Widget.Run
        const declPos = { line: 5, character: 0 };   // OwnerLocal declaration in Owner
        assert.strictEqual(analyzer.canAccess(refPos, declPos, d, d), true,
            'Rule 4: Owner`s local data is visible inside its Local Derived Method Widget.Run');
    });

    test('the method CANNOT access an unrelated procedure local (anti-broadening)', () => {
        const d = doc(SRC);
        const refPos = { line: 14, character: 2 };  // inside Widget.Run
        const declPos = { line: 17, character: 0 };  // OtherLocal, in the unrelated Other proc
        assert.strictEqual(analyzer.canAccess(refPos, declPos, d, d), false,
            'a method must not see an unrelated procedure`s locals');
    });
});
