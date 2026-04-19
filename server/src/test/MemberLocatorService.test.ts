/**
 * Tests for MemberLocatorService — the unified dot-access resolution service
 * that powers hover, F12, and Ctrl+F12.
 *
 * Coverage:
 *   - resolveVariableType: pure in-memory token analysis
 *   - findMemberInClass:   filesystem scan via INCLUDE chain (temp fixture files)
 *   - resolveDotAccess:    end-to-end (type resolution + member scan)
 *   - scanClassBodyForMember / selectBestMemberOverload: shared primitives
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import {
    scanClassBodyForMember,
    selectBestMemberOverload,
    OverloadCandidate,
} from '../utils/ClassMemberResolver';
import { setServerInitialized } from '../serverState';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeDoc(filename: string, content: string): TextDocument {
    const uri = `file:///${path.join(tmpDir, filename).replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', 1, content);
}

/** Simple param counter — same logic as MemberLocatorService.countParamsInDecl */
function countParams(line: string): number {
    const match = line.match(/PROCEDURE\s*\(([^)]*)\)/i);
    if (!match || !match[1].trim()) return 0;
    let depth = 0, count = 0;
    for (const char of match[1]) {
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (char === ',' && depth === 0) count++;
    }
    return count + 1;
}

// ---------------------------------------------------------------------------
// Suite setup / teardown
// ---------------------------------------------------------------------------

suite('MemberLocatorService', () => {
    let service: MemberLocatorService;
    const tokenCache = TokenCache.getInstance();

    suiteSetup(() => {
        setServerInitialized(true);

        // Create isolated temp directory with fixture INC files
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mls_test_'));

        // WidgetClass.inc — simple class used for basic member lookup
        fs.writeFileSync(path.join(tmpDir, 'WidgetClass.inc'), [
            'WidgetClass    CLASS',
            '  GetName        PROCEDURE(),STRING',
            '  SetName        PROCEDURE(STRING pName)',
            '  Width          LONG',
            '               END',
        ].join('\n'));

        // NestedGroups.inc — class with nested GROUP that has its own END
        fs.writeFileSync(path.join(tmpDir, 'NestedGroups.inc'), [
            'ContainerClass CLASS',
            '  Inner          GROUP',
            '  InnerField     LONG',
            '               END',
            '  OuterMethod    PROCEDURE()',
            '               END',
        ].join('\n'));

        // OverloadedClass.inc — two overloads of the same method
        fs.writeFileSync(path.join(tmpDir, 'OverloadedClass.inc'), [
            'OverloadedClass CLASS',
            '  DoWork          PROCEDURE()',
            '  DoWork          PROCEDURE(STRING pArg)',
            '  DoWork          PROCEDURE(STRING pArg, LONG pCount)',
            '               END',
        ].join('\n'));
    });

    suiteTeardown(() => {
        tokenCache.clearAllTokens();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    teardown(() => {
        // Clear any tokens cached during the test to avoid cross-test pollution
        tokenCache.clearAllTokens();
    });

    setup(() => {
        service = new MemberLocatorService();
    });

    // =========================================================================
    // resolveVariableType — pure in-memory token analysis
    // =========================================================================
    suite('resolveVariableType', () => {

        test('CLASS(ParentName) → isClass=true, typeName=ParentName', async () => {
            const doc = makeDoc('rv1.clw', 'myVar    CLASS(WidgetClass)\n         END\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('myVar', tokens, doc);

            assert.ok(result, 'Should resolve CLASS(WidgetClass)');
            assert.strictEqual(result!.typeName, 'WidgetClass');
            assert.strictEqual(result!.isClass, true);
        });

        test('QUEUE(TypeName) → isClass=false, typeName=TypeName', async () => {
            const doc = makeDoc('rv2.clw', 'myQ    QUEUE(ItemQueue)\n       END\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('myQ', tokens, doc);

            assert.ok(result, 'Should resolve QUEUE(ItemQueue)');
            assert.strictEqual(result!.typeName, 'ItemQueue');
            assert.strictEqual(result!.isClass, false);
        });

        test('LIKE(TypeName) → isClass=false, typeName=TypeName', async () => {
            const doc = makeDoc('rv3.clw', 'myVar    LIKE(SomeType)\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('myVar', tokens, doc);

            assert.ok(result, 'Should resolve LIKE(SomeType)');
            assert.strictEqual(result!.typeName, 'SomeType');
            assert.strictEqual(result!.isClass, false);
        });

        test('plain user-defined type name → isClass=true', async () => {
            const doc = makeDoc('rv4.clw', 'myVar    WidgetClass\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('myVar', tokens, doc);

            assert.ok(result, 'Should resolve plain type WidgetClass');
            assert.strictEqual(result!.typeName, 'WidgetClass');
            assert.strictEqual(result!.isClass, true);
        });

        test('bare CLASS keyword → null (no named type arg)', async () => {
            const doc = makeDoc('rv5.clw', 'LocalCls  CLASS\n  Foo PROCEDURE()\nEND\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('LocalCls', tokens, doc);

            assert.strictEqual(result, null, 'Bare CLASS should return null');
        });

        test('PROCEDURE type → null (not a class member target)', async () => {
            const doc = makeDoc('rv6.clw', 'myProc  PROCEDURE(LONG pId)\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('myProc', tokens, doc);

            assert.strictEqual(result, null, 'PROCEDURE type should return null');
        });

        test('unknown variable → null', async () => {
            const doc = makeDoc('rv7.clw', 'someOtherVar  LONG\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('notThere', tokens, doc);

            assert.strictEqual(result, null, 'Unknown variable should return null');
        });

        test('lookup is case-insensitive', async () => {
            const doc = makeDoc('rv8.clw', 'MyWidget    WidgetClass\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('MYWIDGET', tokens, doc);

            assert.ok(result, 'Variable lookup should be case-insensitive');
            assert.strictEqual(result!.typeName, 'WidgetClass');
        });

        test('GROUP(TypeName) → isClass=false', async () => {
            const doc = makeDoc('rv9.clw', 'myGroup  GROUP(GroupType)\n         END\n');
            const tokens = tokenCache.getTokens(doc);
            const result = await service.resolveVariableType('myGroup', tokens, doc);

            assert.ok(result, 'Should resolve GROUP(GroupType)');
            assert.strictEqual(result!.isClass, false);
        });
    });

    // =========================================================================
    // findMemberInClass — reads from filesystem via INCLUDE chain
    // =========================================================================
    suite('findMemberInClass', () => {

        test('finds a PROCEDURE method in an INC file CLASS', async () => {
            const doc = makeDoc('fmic1.clw', `  INCLUDE('WidgetClass.inc'),ONCE\n`);
            const result = await service.findMemberInClass('WidgetClass', 'GetName', doc);

            assert.ok(result, 'Should find GetName in WidgetClass');
            assert.strictEqual(result!.className, 'WidgetClass');
            assert.ok(result!.type.toUpperCase().includes('PROCEDURE'),
                `Expected type containing PROCEDURE, got "${result!.type}"`);
            assert.ok(result!.file.toLowerCase().includes('widgetclass.inc'),
                `Expected file to include WidgetClass.inc, got "${result!.file}"`);
        });

        test('finds a property (non-procedure) in a CLASS', async () => {
            const doc = makeDoc('fmic2.clw', `  INCLUDE('WidgetClass.inc'),ONCE\n`);
            const result = await service.findMemberInClass('WidgetClass', 'Width', doc);

            assert.ok(result, 'Should find Width property');
            assert.ok(result!.type.toUpperCase().includes('LONG'),
                `Expected LONG, got "${result!.type}"`);
        });

        test('returns null for non-existent member', async () => {
            const doc = makeDoc('fmic3.clw', `  INCLUDE('WidgetClass.inc'),ONCE\n`);
            const result = await service.findMemberInClass('WidgetClass', 'NoSuchMethod', doc);

            assert.strictEqual(result, null, 'Non-existent member should return null');
        });

        test('returns null for non-existent class', async () => {
            const doc = makeDoc('fmic4.clw', `  INCLUDE('WidgetClass.inc'),ONCE\n`);
            const result = await service.findMemberInClass('NoSuchClass', 'GetName', doc);

            assert.strictEqual(result, null, 'Non-existent class should return null');
        });

        test('finds OuterMethod past nested GROUP END (nestDepth tracking)', async () => {
            const doc = makeDoc('fmic5.clw', `  INCLUDE('NestedGroups.inc'),ONCE\n`);
            const result = await service.findMemberInClass('ContainerClass', 'OuterMethod', doc);

            assert.ok(result, 'Should find OuterMethod after nested GROUP END');
            assert.ok(result!.type.toUpperCase().includes('PROCEDURE'));
        });

        test('does not return field inside nested GROUP as a direct CLASS member', async () => {
            const doc = makeDoc('fmic6.clw', `  INCLUDE('NestedGroups.inc'),ONCE\n`);
            // InnerField lives inside a GROUP — the nesting-depth logic skips it
            const result = await service.findMemberInClass('ContainerClass', 'InnerField', doc);

            assert.strictEqual(result, null,
                'InnerField inside nested GROUP should not be found at CLASS body level');
        });

        test('class and member lookup is case-insensitive', async () => {
            const doc = makeDoc('fmic7.clw', `  INCLUDE('WidgetClass.inc'),ONCE\n`);
            const result = await service.findMemberInClass('WIDGETCLASS', 'GETNAME', doc);

            assert.ok(result, 'Class and member lookup should be case-insensitive');
        });

        test('result contains line number and file URI', async () => {
            const doc = makeDoc('fmic8.clw', `  INCLUDE('WidgetClass.inc'),ONCE\n`);
            const result = await service.findMemberInClass('WidgetClass', 'SetName', doc);

            assert.ok(result, 'Should find SetName');
            assert.ok(typeof result!.line === 'number', 'Should have a numeric line');
            assert.ok(result!.line >= 0, 'Line should be non-negative');
            assert.ok(result!.file.startsWith('file:///'), 'file should be a URI');
        });

        test('finds member of a CLASS defined in the same document (no INCLUDE)', async () => {
            const src = [
                'LocalClass  CLASS',
                '  DoSomething  PROCEDURE(LONG pVal)',
                '  Count        LONG',
                '             END',
                '',
                'MyProc  PROCEDURE',
                'obj  LocalClass',
                'CODE',
                '  obj.DoSomething(1)',
            ].join('\n');
            const doc = makeDoc('fmic9.clw', src);
            const result = await service.findMemberInClass('LocalClass', 'DoSomething', doc);

            assert.ok(result, 'Should find DoSomething in same-document CLASS');
            assert.strictEqual(result!.className, 'LocalClass');
            assert.ok(result!.type.toUpperCase().includes('PROCEDURE'));
        });

        test('finds property of a CLASS defined in the same document', async () => {
            const src = [
                'LocalClass  CLASS',
                '  DoSomething  PROCEDURE(LONG pVal)',
                '  Count        LONG',
                '             END',
            ].join('\n');
            const doc = makeDoc('fmic10.clw', src);
            const result = await service.findMemberInClass('LocalClass', 'Count', doc);

            assert.ok(result, 'Should find Count property in same-document CLASS');
            assert.ok(result!.type.toUpperCase().includes('LONG'));
        });
    });

    // =========================================================================
    // resolveDotAccess — end-to-end (variable type resolution + member scan)
    // =========================================================================
    suite('resolveDotAccess', () => {

        test('resolves plain-typed variable → member in INCLUDE file', async () => {
            const docContent = [
                `  INCLUDE('WidgetClass.inc'),ONCE`,
                'myWidget    WidgetClass',
            ].join('\n');
            const doc = makeDoc('da1.clw', docContent);
            const result = await service.resolveDotAccess('myWidget', 'GetName', doc);

            assert.ok(result, 'Should resolve myWidget.GetName');
            assert.strictEqual(result!.className, 'WidgetClass');
            assert.ok(result!.type.toUpperCase().includes('PROCEDURE'));
        });

        test('resolves CLASS(TypeName) variable → member in INCLUDE file', async () => {
            const docContent = [
                `  INCLUDE('WidgetClass.inc'),ONCE`,
                'myWidget    CLASS(WidgetClass)',
                '            END',
            ].join('\n');
            const doc = makeDoc('da2.clw', docContent);
            const result = await service.resolveDotAccess('myWidget', 'Width', doc);

            assert.ok(result, 'Should resolve myWidget.Width when declared as CLASS(WidgetClass)');
            assert.ok(result!.type.toUpperCase().includes('LONG'));
        });

        test('returns null when variable is not declared', async () => {
            const doc = makeDoc('da3.clw', `  INCLUDE('WidgetClass.inc'),ONCE\n`);
            const result = await service.resolveDotAccess('undeclared', 'SomeMethod', doc);

            assert.strictEqual(result, null, 'Should return null when variable not found');
        });

        test('returns null when member does not exist in the class', async () => {
            const docContent = [
                `  INCLUDE('WidgetClass.inc'),ONCE`,
                'myWidget    WidgetClass',
            ].join('\n');
            const doc = makeDoc('da4.clw', docContent);
            const result = await service.resolveDotAccess('myWidget', 'NoSuchMethod', doc);

            assert.strictEqual(result, null, 'Should return null when member not found');
        });

        test('returns null when variable type is a primitive (LONG)', async () => {
            const doc = makeDoc('da5.clw', 'counter    LONG\n');
            const result = await service.resolveDotAccess('counter', 'SomeMethod', doc);

            assert.strictEqual(result, null, 'LONG has no class members');
        });

        test('dot-access lookup is case-insensitive end-to-end', async () => {
            const docContent = [
                `  INCLUDE('WidgetClass.inc'),ONCE`,
                'MYWIDGET    WidgetClass',
            ].join('\n');
            const doc = makeDoc('da6.clw', docContent);
            const result = await service.resolveDotAccess('mywidget', 'getname', doc);

            assert.ok(result, 'Should resolve case-insensitively end-to-end');
        });
    });

    // =========================================================================
    // scanClassBodyForMember — canonical shared primitive
    // =========================================================================
    suite('scanClassBodyForMember (shared primitive)', () => {

        test('finds a PROCEDURE member at nesting depth 0', () => {
            const result = scanClassBodyForMember(
                path.join(tmpDir, 'WidgetClass.inc'),
                'WidgetClass', 'GetName', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.ok(result, 'Should find GetName');
            assert.ok(result!.file.toLowerCase().includes('widgetclass.inc'));
        });

        test('finds a property member', () => {
            const result = scanClassBodyForMember(
                path.join(tmpDir, 'WidgetClass.inc'),
                'WidgetClass', 'Width', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.ok(result, 'Should find Width');
            assert.ok(result!.type.toUpperCase().includes('LONG'));
        });

        test('returns null for non-existent member', () => {
            const result = scanClassBodyForMember(
                path.join(tmpDir, 'WidgetClass.inc'),
                'WidgetClass', 'Missing', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.strictEqual(result, null, 'Should return null for missing member');
        });

        test('returns null for non-existent class', () => {
            const result = scanClassBodyForMember(
                path.join(tmpDir, 'WidgetClass.inc'),
                'NoSuchClass', 'GetName', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.strictEqual(result, null, 'Should return null for missing class');
        });

        test('finds OuterMethod past nested GROUP END', () => {
            const result = scanClassBodyForMember(
                path.join(tmpDir, 'NestedGroups.inc'),
                'ContainerClass', 'OuterMethod', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.ok(result, 'Should find OuterMethod after nested GROUP END');
        });

        test('does NOT find InnerField when nestDepth > 0', () => {
            const result = scanClassBodyForMember(
                path.join(tmpDir, 'NestedGroups.inc'),
                'ContainerClass', 'InnerField', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.strictEqual(result, null, 'InnerField inside GROUP should be skipped');
        });

        test('result.signature is populated', () => {
            const result = scanClassBodyForMember(
                path.join(tmpDir, 'WidgetClass.inc'),
                'WidgetClass', 'SetName', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.ok(result, 'Should find SetName');
            assert.ok(result!.signature, 'signature should be populated');
            assert.ok(result!.signature!.includes('SetName'), 'signature should include the member name');
        });

        test('returns null for missing file', () => {
            const result = scanClassBodyForMember(
                path.join(tmpDir, 'DoesNotExist.inc'),
                'AnyClass', 'AnyMethod', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.strictEqual(result, null, 'Should return null gracefully for missing file');
        });
    });

    // =========================================================================
    // selectBestMemberOverload — overload selection logic
    // =========================================================================
    suite('selectBestMemberOverload', () => {

        function candidates(paramCounts: number[]): OverloadCandidate[] {
            return paramCounts.map((pc, i) => ({
                type: 'PROCEDURE',
                line: i * 10,
                paramCount: pc,
                signature: `DoWork PROCEDURE(${Array(pc).fill('LONG p').join(', ')})`,
            }));
        }

        test('returns null for empty candidates list', () => {
            assert.strictEqual(selectBestMemberOverload([], 1), null);
        });

        test('returns first candidate when paramCount is undefined', () => {
            const c = candidates([2, 0, 3]);
            const result = selectBestMemberOverload(c, undefined);
            assert.strictEqual(result?.paramCount, 2, 'Should return first when no paramCount');
        });

        test('returns exact match', () => {
            const c = candidates([0, 1, 2]);
            const result = selectBestMemberOverload(c, 1);
            assert.strictEqual(result?.paramCount, 1, 'Should return exact 1-param overload');
        });

        test('returns single candidate regardless of paramCount', () => {
            const c = candidates([3]);
            const result = selectBestMemberOverload(c, 0);
            assert.strictEqual(result?.paramCount, 3, 'Only candidate should always be returned');
        });

        test('prefers closer overload when no exact match', () => {
            const c = candidates([0, 3]);
            const result = selectBestMemberOverload(c, 1);
            // 0 is 1 away, 3 is 2 away — should prefer 0
            assert.strictEqual(result?.paramCount, 0, 'Should prefer overload with paramCount=0 (1 away vs 2 away)');
        });

        test('overload with all-default params is compatible with 0-arg call', () => {
            // signature has defaults so even a 0-arg call matches a 2-param declaration
            const c: OverloadCandidate[] = [{
                type: 'PROCEDURE',
                line: 0,
                paramCount: 2,
                signature: 'DoWork PROCEDURE(STRING pA=\'x\', LONG pB=0)',
            }];
            // With defaults, paramCount=0 should still find this as compatible
            const result = selectBestMemberOverload(c, 0);
            assert.ok(result, 'Should return candidate when defaults cover all params');
        });
    });
});
