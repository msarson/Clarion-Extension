/**
 * CompletionProvider tests — dot-triggered member completion.
 *
 * Uses completion-test.clw which defines:
 *   BaseClass      CLASS  — PublicMethod, ProtectedMethod(PROTECTED), PrivateMethod(PRIVATE), PublicProp
 *   DerivedClass   CLASS(BaseClass) — OwnMethod, OwnProp
 *   StandaloneClass CLASS  — Alpha (method), Beta (property)
 *   myVar          DerivedClass   (global variable instance)
 *   myStandalone   StandaloneClass
 *
 * Method implementations:
 *   DerivedClass.OwnMethod  — SELF. should resolve to DerivedClass
 *   StandaloneClass.Alpha   — SELF. should resolve to StandaloneClass
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { scanClassBodyForAllMembers, detectMemberAccess } from '../utils/ClassMemberResolver';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { CompletionProvider } from '../providers/CompletionProvider';

const CLW_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'test-programs', 'completion-test.clw');

suite('CompletionProvider — dot-triggered member completion', function () {
    let doc: TextDocument;
    let provider: CompletionProvider;
    let memberLocator: MemberLocatorService;

    suiteSetup(function () {
        if (!fs.existsSync(CLW_PATH)) {
            this.skip();
        }
        setServerInitialized(true);
        const content = fs.readFileSync(CLW_PATH, 'utf8');
        const uri = 'file:///' + CLW_PATH.replace(/\\/g, '/');
        doc = TextDocument.create(uri, 'clarion', 1, content);
        TokenCache.getInstance().clearAllTokens();
        TokenCache.getInstance().getTokens(doc);
        provider = new CompletionProvider();
        memberLocator = new MemberLocatorService();
    });

    // -------------------------------------------------------------------------
    // scanClassBodyForAllMembers — unit tests
    // -------------------------------------------------------------------------

    suite('scanClassBodyForAllMembers', function () {
        test('returns all members of a standalone class', function () {
            const members = scanClassBodyForAllMembers(CLW_PATH, 'StandaloneClass');
            assert.ok(members.length >= 2, `Expected ≥2 members, got ${members.length}`);
            const names = members.map(m => m.name.toUpperCase());
            assert.ok(names.includes('ALPHA'), 'Should include Alpha');
            assert.ok(names.includes('BETA'), 'Should include Beta');
        });

        test('classifies methods and properties correctly', function () {
            const members = scanClassBodyForAllMembers(CLW_PATH, 'StandaloneClass');
            const alpha = members.find(m => m.name.toUpperCase() === 'ALPHA');
            const beta = members.find(m => m.name.toUpperCase() === 'BETA');
            assert.ok(alpha, 'Alpha not found');
            assert.ok(beta, 'Beta not found');
            assert.strictEqual(alpha!.kind, 'method', 'Alpha should be a method');
            assert.strictEqual(beta!.kind, 'property', 'Beta should be a property');
        });

        test('detects PROTECTED and PRIVATE access modifiers', function () {
            const members = scanClassBodyForAllMembers(CLW_PATH, 'BaseClass');
            const pub = members.find(m => m.name.toUpperCase() === 'PUBLICMETHOD');
            const prot = members.find(m => m.name.toUpperCase() === 'PROTECTEDMETHOD');
            const priv = members.find(m => m.name.toUpperCase() === 'PRIVATEMETHOD');
            assert.ok(pub, 'PublicMethod not found');
            assert.ok(prot, 'ProtectedMethod not found');
            assert.ok(priv, 'PrivateMethod not found');
            assert.strictEqual(pub!.access, 'public');
            assert.strictEqual(prot!.access, 'protected');
            assert.strictEqual(priv!.access, 'private');
        });

        test('returns empty array for unknown class', function () {
            const members = scanClassBodyForAllMembers(CLW_PATH, 'NonExistentClass');
            assert.strictEqual(members.length, 0);
        });
    });

    // -------------------------------------------------------------------------
    // detectMemberAccess — unit tests
    // -------------------------------------------------------------------------

    suite('detectMemberAccess', function () {
        test('detects public (no modifier)', function () {
            assert.strictEqual(detectMemberAccess('PublicMethod  PROCEDURE()'), 'public');
        });
        test('detects PROTECTED', function () {
            assert.strictEqual(detectMemberAccess('ProtectedMethod  PROCEDURE(),PROTECTED'), 'protected');
        });
        test('detects PRIVATE', function () {
            assert.strictEqual(detectMemberAccess('PrivateMethod  PROCEDURE(),PRIVATE'), 'private');
        });
        test('ignores comment text after !', function () {
            assert.strictEqual(detectMemberAccess('SomeMethod  PROCEDURE() ! PRIVATE comment'), 'public');
        });
    });

    // -------------------------------------------------------------------------
    // enumerateMembersInClass — inheritance + access filtering
    // -------------------------------------------------------------------------

    suite('enumerateMembersInClass', function () {
        test('returns own members of DerivedClass', async function () {
            this.timeout(10000);
            const members = await memberLocator.enumerateMembersInClass('DerivedClass', doc);
            const names = members.map(m => m.name.toUpperCase());
            assert.ok(names.includes('OWNMETHOD'), `Expected OwnMethod in [${names.join(', ')}]`);
            assert.ok(names.includes('OWNPROP'), `Expected OwnProp in [${names.join(', ')}]`);
        });

        test('inherited public members from BaseClass are included', async function () {
            this.timeout(10000);
            const members = await memberLocator.enumerateMembersInClass('DerivedClass', doc);
            const names = members.map(m => m.name.toUpperCase());
            assert.ok(names.includes('PUBLICMETHOD'), `Expected PublicMethod (inherited) in [${names.join(', ')}]`);
            assert.ok(names.includes('PUBLICPROP'), `Expected PublicProp (inherited) in [${names.join(', ')}]`);
        });

        test('external caller: PRIVATE and PROTECTED members are excluded', async function () {
            this.timeout(10000);
            // No callerClass → external → only public
            const members = await memberLocator.enumerateMembersInClass('DerivedClass', doc, undefined);
            const names = members.map(m => m.name.toUpperCase());
            assert.ok(!names.includes('PRIVATEMETHOD'), `PrivateMethod should be hidden externally`);
            assert.ok(!names.includes('PROTECTEDMETHOD'), `ProtectedMethod should be hidden externally`);
        });

        test('same-class caller: PRIVATE members are visible', async function () {
            this.timeout(10000);
            const members = await memberLocator.enumerateMembersInClass('BaseClass', doc, 'BaseClass');
            const names = members.map(m => m.name.toUpperCase());
            assert.ok(names.includes('PRIVATEMETHOD'), `PrivateMethod should be visible to same class`);
        });

        test('child member shadows parent member with same name', async function () {
            this.timeout(10000);
            // Both DerivedClass and BaseClass in the same test file don't share a name,
            // but the dedup logic: OwnMethod from Derived should appear once
            const members = await memberLocator.enumerateMembersInClass('DerivedClass', doc);
            const ownMethods = members.filter(m => m.name.toUpperCase() === 'OWNMETHOD');
            assert.strictEqual(ownMethods.length, 1, 'OwnMethod should appear exactly once');
        });

        test('returns empty array for unknown class', async function () {
            this.timeout(10000);
            const members = await memberLocator.enumerateMembersInClass('UnknownClass', doc);
            assert.strictEqual(members.length, 0);
        });
    });

    // -------------------------------------------------------------------------
    // CompletionProvider.onCompletion — integration tests
    // -------------------------------------------------------------------------

    suite('onCompletion', function () {
        /**
         * Helper: build a fake CompletionParams at a given 0-based line,
         * appending the trigger text at a virtual cursor position.
         */
        function makeParams(line: number, lineText: string) {
            return {
                textDocument: { uri: doc.uri },
                position: { line, character: lineText.length },
                context: { triggerKind: 2, triggerCharacter: '.' }
            } as any;
        }

        test('no completions when line does not end with dot', async function () {
            this.timeout(10000);
            const params = makeParams(0, '  SELF');
            const items = await provider.onCompletion(params, doc);
            assert.strictEqual(items.length, 0);
        });

        test('no completions inside a comment', async function () {
            this.timeout(10000);
            const params = makeParams(0, '  ! SELF.');
            const items = await provider.onCompletion(params, doc);
            assert.strictEqual(items.length, 0);
        });

        test('SELF. inside DerivedClass.OwnMethod returns class members', async function () {
            this.timeout(10000);
            const lines = doc.getText().split(/\r?\n/);
            // Find the actual "  SELF." trigger line added to the fixture
            const selfLine = lines.findIndex(l => l.trimEnd() === '  SELF.');
            assert.ok(selfLine >= 0, 'Could not find "  SELF." trigger line in fixture');

            const params = makeParams(selfLine, '  SELF.');
            const items = await provider.onCompletion(params, doc);
            const names = items.map(i => (i.label as string).toUpperCase());
            assert.ok(names.includes('OWNMETHOD'), `Expected OwnMethod in completions: [${names.join(', ')}]`);
        });

        test('direct class name completion returns its members', async function () {
            this.timeout(10000);
            const lines = doc.getText().split(/\r?\n/);
            // Find the actual "  StandaloneClass." trigger line added to the fixture
            const triggerLine = lines.findIndex(l => l.trimEnd() === '  StandaloneClass.');
            assert.ok(triggerLine >= 0, 'Could not find "  StandaloneClass." trigger line in fixture');

            const params = makeParams(triggerLine, '  StandaloneClass.');
            const items = await provider.onCompletion(params, doc);
            const names = items.map(i => (i.label as string).toUpperCase());
            assert.ok(names.includes('ALPHA'), `Expected Alpha in [${names.join(', ')}]`);
            assert.ok(names.includes('BETA'), `Expected Beta in [${names.join(', ')}]`);
        });

        test('inherited items show fromClass label', async function () {
            this.timeout(10000);
            const members = await memberLocator.enumerateMembersInClass('DerivedClass', doc, 'DerivedClass');
            const publicMethod = members.find(m => m.name.toUpperCase() === 'PUBLICMETHOD');
            assert.ok(publicMethod, 'PublicMethod not found');
            assert.strictEqual(publicMethod!.fromClass.toUpperCase(), 'BASECLASS',
                `Expected fromClass=BaseClass, got ${publicMethod!.fromClass}`);
        });
    });
});
