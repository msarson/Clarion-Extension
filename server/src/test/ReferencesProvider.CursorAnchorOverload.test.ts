import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { ClarionPatterns } from '../utils/ClarionPatterns';
import { setServerInitialized } from '../serverState';

/**
 * #249 — FAR's cursor-side overload anchor was ARITY-ONLY.
 *
 * `provideMemberReferences` anchored via findClassMemberInfo(paramCount): for
 * same-arity different-type overloads the FIRST-DECLARED overload always won,
 * the overloadFilter pinned to its decl line, and the type-aware per-call-site
 * filter then EXCLUDED every call site that classifies to the other overload —
 * including the very line FAR was invoked from.
 *
 * Empirical pre-fix probe (this exact fixture): cursor on `inst.SetValue(num)`
 * (LONG-typed arg) returned L3 L7 L20 — the complete WRONG overload family
 * (STRING decl+impl+call) with the cursor's own line missing. Rename from there
 * rewrites the wrong family and skips the renamed occurrence.
 *
 * Also pins the two supporting defects filed under #249:
 *   - ClarionPatterns.countDefaultParams ignored angle-bracket-only optionals
 *     (`<LONG x>` with no `=`), computing a wrong compatible-arity band.
 *   - ClassMemberResolver.countParametersInCall anchored by substring, so a
 *     longer identifier containing the name (SetValueEx) hijacked the count.
 */

const FIXTURE = [
    "  MEMBER('test')",                          // 0
    '',                                          // 1
    'MyClass    CLASS,TYPE',                     // 2
    'SetValue     PROCEDURE(STRING)',            // 3 — STRING decl (declared FIRST)
    'SetValue     PROCEDURE(LONG)',              // 4 — LONG decl
    '           END',                            // 5
    '',                                          // 6
    'MyClass.SetValue PROCEDURE(STRING s)',      // 7 — STRING impl
    '  CODE',                                    // 8
    '  RETURN',                                  // 9
    '',                                          // 10
    'MyClass.SetValue PROCEDURE(LONG n)',        // 11 — LONG impl
    '  CODE',                                    // 12
    '  RETURN',                                  // 13
    '',                                          // 14
    'MainProc PROCEDURE',                        // 15
    'inst       MyClass',                        // 16
    'num        LONG',                           // 17
    '  CODE',                                    // 18
    '  inst.SetValue(num)',                      // 19 — LONG-typed arg → LONG overload
    "  inst.SetValue('abc')",                    // 20 — STRING literal → STRING overload
    '  RETURN',                                  // 21
].join('\n');

const SETVALUE_COL = '  inst.SetValue(num)'.indexOf('SetValue') + 1;

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

suite('FAR cursor-side overload anchor (#249)', () => {

    let provider: ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new ReferencesProvider();
    });

    test('cursor on LONG-arg call anchors to the LONG overload (own call site + LONG decl/impl in; STRING family out)', async () => {
        const doc = createDocument(FIXTURE, 'file:///t249-long.clw');
        TokenCache.getInstance().getTokens(doc);

        const refs = await provider.provideReferences(doc,
            { line: 19, character: SETVALUE_COL }, { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        // Bidirectional pin (positive AND negative):
        assert.ok(lines.includes(19),
            `cursor's OWN call site (L19) must be in result; got [${lines.join(',')}]`);
        assert.ok(lines.includes(4),
            `LONG decl (L4) must be in result; got [${lines.join(',')}] — anchor stuck on first-declared overload`);
        assert.ok(lines.includes(11),
            `LONG impl (L11) must be in result; got [${lines.join(',')}]`);
        assert.ok(!lines.includes(3),
            `STRING decl (L3) must NOT be in result; got [${lines.join(',')}]`);
        assert.ok(!lines.includes(20),
            `STRING call site (L20) must NOT be in result; got [${lines.join(',')}]`);
    });

    test('regression guard: cursor on STRING-literal call keeps the STRING family', async () => {
        const doc = createDocument(FIXTURE, 'file:///t249-string.clw');
        TokenCache.getInstance().getTokens(doc);

        const col = "  inst.SetValue('abc')".indexOf('SetValue') + 1;
        const refs = await provider.provideReferences(doc,
            { line: 20, character: col }, { includeDeclaration: true });

        assert.ok(refs, 'FAR should return references');
        const lines = refs!.map(r => r.range.start.line).sort((a, b) => a - b);

        assert.ok(lines.includes(20), `own call site (L20) must be in result; got [${lines.join(',')}]`);
        assert.ok(lines.includes(3), `STRING decl (L3) must be in result; got [${lines.join(',')}]`);
        assert.ok(lines.includes(7), `STRING impl (L7) must be in result; got [${lines.join(',')}]`);
        assert.ok(!lines.includes(4), `LONG decl (L4) must NOT be in result; got [${lines.join(',')}]`);
        assert.ok(!lines.includes(19), `LONG call site (L19) must NOT be in result; got [${lines.join(',')}]`);
    });
});

suite('countDefaultParams — angle-bracket-only optionals (#249)', () => {

    test('<LONG x> optionals without = count as omittable', () => {
        assert.strictEqual(
            ClarionPatterns.countDefaultParams('Foo PROCEDURE(STRING s, <LONG x>, <LONG y>)'),
            2,
            'both angle-bracket optionals are omittable — the compatible-arity band must be [1,3], not [3,3]'
        );
    });

    test('= defaults still counted; mixed forms compose', () => {
        assert.strictEqual(
            ClarionPatterns.countDefaultParams('Foo PROCEDURE(STRING s, LONG n=10, <SHORT f>)'),
            2
        );
        assert.strictEqual(
            ClarionPatterns.countDefaultParams('Foo PROCEDURE(STRING s, LONG n)'),
            0
        );
    });
});

suite('countParametersInCall — word-boundary anchor (#249)', () => {

    test('a longer identifier containing the name does not hijack the count', () => {
        const resolver = new ClassMemberResolver();
        // Resolving "SetValue" on a line where SetValueEx appears FIRST: the old
        // substring indexOf anchored inside SetValueEx and counted ITS 2 args.
        assert.strictEqual(
            resolver.countParametersInCall("  obj.SetValueEx(1,2) ; obj.SetValue('x')", 'SetValue'),
            1,
            'must count SetValue(...)\'s args, not SetValueEx(...)\'s'
        );
    });

    test('name only present inside a longer identifier → no call found (0)', () => {
        const resolver = new ClassMemberResolver();
        assert.strictEqual(
            resolver.countParametersInCall('  obj.SetValueEx(1,2)', 'SetValue'),
            0
        );
    });
});
