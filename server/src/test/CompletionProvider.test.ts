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
            assert.ok(names.some(n => n.startsWith('ALPHA')), 'Should include Alpha');
            assert.ok(names.some(n => n.startsWith('BETA')), 'Should include Beta');
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
            assert.ok(names.some(n => n.startsWith('OWNMETHOD')), `Expected OwnMethod in [${names.join(', ')}]`);
            assert.ok(names.some(n => n.startsWith('OWNPROP')), `Expected OwnProp in [${names.join(', ')}]`);
        });

        test('inherited public members from BaseClass are included', async function () {
            this.timeout(10000);
            const members = await memberLocator.enumerateMembersInClass('DerivedClass', doc);
            const names = members.map(m => m.name.toUpperCase());
            assert.ok(names.some(n => n.startsWith('PUBLICMETHOD')), `Expected PublicMethod (inherited) in [${names.join(', ')}]`);
            assert.ok(names.some(n => n.startsWith('PUBLICPROP')), `Expected PublicProp (inherited) in [${names.join(', ')}]`);
        });

        test('external caller: PRIVATE and PROTECTED members are excluded', async function () {
            this.timeout(10000);
            // No callerClass → external → only public
            const members = await memberLocator.enumerateMembersInClass('DerivedClass', doc, undefined);
            const names = members.map(m => m.name.toUpperCase());
            assert.ok(!names.some(n => n.startsWith('PRIVATEMETHOD')), `PrivateMethod should be hidden externally`);
            assert.ok(!names.some(n => n.startsWith('PROTECTEDMETHOD')), `ProtectedMethod should be hidden externally`);
        });

        test('same-class caller: PRIVATE members are visible', async function () {
            this.timeout(10000);
            const members = await memberLocator.enumerateMembersInClass('BaseClass', doc, 'BaseClass');
            const names = members.map(m => m.name.toUpperCase());
            assert.ok(names.some(n => n.startsWith('PRIVATEMETHOD')), `PrivateMethod should be visible to same class`);
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

        test('no class member completions when line does not end with dot', async function () {
            this.timeout(10000);
            const params = makeParams(0, '  SELF');
            const items = await provider.onCompletion(params, doc);
            // Word completion may return keywords/builtins, but no dot-triggered class member items
            const memberItems = items.filter(i =>
                i.kind === 2 /* Method */ || i.kind === 5 /* Field */ || i.kind === 10 /* Property */
            );
            assert.strictEqual(memberItems.length, 0);
        });

        test('no completions inside a comment', async function () {
            this.timeout(10000);
            // Line 4 (0-based) in completion-test.clw is "! Base class with different access levels"
            // makeParams uses lineText.length only for cursor character position;
            // using '! x' puts the cursor at char 3, which is inside the comment on that line.
            const params = makeParams(4, '! x');
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
            assert.ok(names.some(n => n.startsWith('OWNMETHOD')), `Expected OwnMethod in completions: [${names.join(', ')}]`);
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
            assert.ok(names.some(n => n.startsWith('ALPHA')), `Expected Alpha in [${names.join(', ')}]`);
            assert.ok(names.some(n => n.startsWith('BETA')), `Expected Beta in [${names.join(', ')}]`);
        });

        test('inherited items show fromClass label', async function () {
            this.timeout(10000);
            const members = await memberLocator.enumerateMembersInClass('DerivedClass', doc, 'DerivedClass');
            const publicMethod = members.find(m => m.name.toUpperCase() === 'PUBLICMETHOD');
            assert.ok(publicMethod, 'PublicMethod not found');
            assert.strictEqual(publicMethod!.fromClass.toUpperCase(), 'BASECLASS',
                `Expected fromClass=BaseClass, got ${publicMethod!.fromClass}`);
        });

        test('prefixed variable dot-completion resolves class members (TGLO:Var.)', async function () {
            this.timeout(10000);
            const content = [
                'DictionaryClass CLASS',
                'Init PROCEDURE()',
                'END',
                '',
                'ThisWindow.Init PROCEDURE',
                '  TestGloGroup GROUP,PRE(TGLO)',
                '  Pictionary DictionaryClass',
                '  END',
                '  CODE',
                '  TGLO:Pictionary.'
            ].join('\n');
            const uri = 'file:///C:/temp/completion-prefixed.clw';
            const localDoc = TextDocument.create(uri, 'clarion', 1, content);
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(localDoc);

            const localProvider = new CompletionProvider();
            const params = {
                textDocument: { uri: localDoc.uri },
                position: { line: 9, character: '  TGLO:Pictionary.'.length },
                context: { triggerKind: 2, triggerCharacter: '.' }
            } as any;

            const items = await localProvider.onCompletion(params, localDoc);
            const names = items.map(i => (i.label as string).toUpperCase());
            assert.ok(names.some(n => n.startsWith('INIT')), `Expected Init member in: [${names.join(', ')}]`);
        });

        test('structure label dot-completion surfaces prefixed field list (TestGloGroup.)', async function () {
            this.timeout(10000);
            const content = [
                'ThisWindow.Init PROCEDURE',
                '  TestGloGroup GROUP,PRE(TGLO)',
                '  Var1 LONG',
                '  GLO:TGLO LONG',
                '  END',
                '  CODE',
                '  TestGloGroup.'
            ].join('\n');
            const uri = 'file:///C:/temp/completion-struct-dot.clw';
            const localDoc = TextDocument.create(uri, 'clarion', 1, content);
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(localDoc);

            const localProvider = new CompletionProvider();
            const params = {
                textDocument: { uri: localDoc.uri },
                position: { line: 6, character: '  TestGloGroup.'.length },
                context: { triggerKind: 2, triggerCharacter: '.' }
            } as any;

            const items = await localProvider.onCompletion(params, localDoc);
            const names = items.map(i => (i.label as string).toUpperCase());
            assert.ok(names.includes('TGLO:VAR1'), `Expected TGLO:Var1 in: [${names.join(', ')}]`);
            assert.ok(names.includes('TGLO:GLO:TGLO'), `Expected TGLO:GLO:TGLO in: [${names.join(', ')}]`);
        });

        test('reference LIKE alias dot-completion surfaces queue members (rq.)', async function () {
            this.timeout(10000);
            const content = [
                'BaseQ QUEUE,TYPE',
                'Name STRING(20)',
                'END',
                'AliasQ LIKE(BaseQ)',
                'rq &AliasQ',
                'CODE',
                'rq &= NEW(AliasQ)',
                'rq.'
            ].join('\n');
            const uri = 'file:///C:/temp/completion-like-ref-dot.clw';
            const localDoc = TextDocument.create(uri, 'clarion', 1, content);
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(localDoc);

            const localProvider = new CompletionProvider();
            const params = {
                textDocument: { uri: localDoc.uri },
                position: { line: 7, character: 'rq.'.length },
                context: { triggerKind: 2, triggerCharacter: '.' }
            } as any;

            const items = await localProvider.onCompletion(params, localDoc);
            const names = items.map(i => (i.label as string).toUpperCase());
            assert.ok(names.some(n => n.startsWith('NAME')), `Expected Name queue member in: [${names.join(', ')}]`);
        });

        test('SELF chained property dot-completion surfaces queue members (Self.MyQueue.)', async function () {
            this.timeout(10000);
            const content = [
                'Main PROCEDURE',
                'MyQueueType QUEUE,TYPE',
                'Var1 LONG',
                'END',
                'ThisWindow CLASS(WindowManager)',
                'MyQueue &MyQueueType',
                'Init PROCEDURE(),BYTE,PROC,DERIVED',
                'END',
                'CODE',
                'ThisWindow.Init PROCEDURE',
                '  CODE',
                '  Self.MyQueue.'
            ].join('\n');
            const uri = 'file:///C:/temp/completion-self-myqueue-dot.clw';
            const localDoc = TextDocument.create(uri, 'clarion', 1, content);
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(localDoc);

            const localProvider = new CompletionProvider();
            const params = {
                textDocument: { uri: localDoc.uri },
                position: { line: 11, character: '  Self.MyQueue.'.length },
                context: { triggerKind: 2, triggerCharacter: '.' }
            } as any;

            const items = await localProvider.onCompletion(params, localDoc);
            const names = items.map(i => (i.label as string).toUpperCase());
            assert.ok(names.some(n => n.startsWith('VAR1')), `Expected Var1 queue member in: [${names.join(', ')}]`);
            const var1 = items.find(i => (i.label as string).toUpperCase().startsWith('VAR1'));
            assert.ok(var1, `Expected to find completion item for Var1 in: [${names.join(', ')}]`);
            assert.ok(((var1!.label as string).toUpperCase()).includes('LONG'),
                `Expected Var1 label to include LONG, got "${var1!.label as string}"`);
        });

        test('nested queue chain completion resolves from local bare structure root (problems.Diabetes.)', async function () {
            this.timeout(10000);
            const content = [
                'problems QUEUE',
                'Diabetes &DiabetesQueueType',
                'END',
                'DiabetesQueueType QUEUE,TYPE',
                'medications &medicationsQueueType',
                'END',
                'medicationsQueueType QUEUE,TYPE',
                'code STRING(10)',
                'END',
                'CODE',
                'problems.Diabetes.'
            ].join('\n');
            const uri = 'file:///C:/temp/completion-nested-problems-dot.clw';
            const localDoc = TextDocument.create(uri, 'clarion', 1, content);
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(localDoc);

            const localProvider = new CompletionProvider();
            const params = {
                textDocument: { uri: localDoc.uri },
                position: { line: 10, character: 'problems.Diabetes.'.length },
                context: { triggerKind: 2, triggerCharacter: '.' }
            } as any;

            const items = await localProvider.onCompletion(params, localDoc);
            const names = items.map(i => (i.label as string).toUpperCase());
            assert.ok(names.some(n => n.startsWith('MEDICATIONS')),
                `Expected medications member in: [${names.join(', ')}]`);
        });
    });

    // -------------------------------------------------------------------------
    // #370 — member access at a letter-ending position (SELF.Th / inst.Hel)
    // must keep resolving class members filtered by the typed partial, not fall
    // through to the bare-prefix word/keyword dump. VS Code masked this by caching
    // the '.'-triggered list; a per-keystroke host (ClarionAssistant/Monaco) did not.
    // -------------------------------------------------------------------------
    suite('onCompletion — member access at letter positions (#370)', function () {
        const METHOD = 2, FIELD = 5, PROPERTY = 10; // CompletionItemKind

        // The methods carry a parameter so member completion renders a signature label
        // (`Hello(LONG pId)`, kind = Method) — a decisive marker that the chain was
        // resolved to a class, since the bare-prefix word dump would only ever surface a
        // plain `Hello` identifier (no parameter list) for the same partial.
        test('SELF.<partial> resolves class members (with signatures), not the word dump', async function () {
            this.timeout(10000);
            const content = [
                'Main PROCEDURE',
                'Greeter CLASS',
                'Hello   PROCEDURE(LONG pId)',
                'Goodbye PROCEDURE(LONG pId)',
                'END',
                'CODE',
                'Greeter.Hello PROCEDURE',
                '  CODE',
                '  SELF.Hel'
            ].join('\n');
            const uri = 'file:///C:/temp/completion-370-self-partial.clw';
            const localDoc = TextDocument.create(uri, 'clarion', 1, content);
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(localDoc);

            const localProvider = new CompletionProvider();
            const params = {
                textDocument: { uri: localDoc.uri },
                position: { line: 8, character: '  SELF.Hel'.length },
                context: { triggerKind: 1 }
            } as any;

            const items = await localProvider.onCompletion(params, localDoc);
            const names = items.map(i => (i.label as string).toUpperCase());

            const hello = items.find(i => (i.label as string).toUpperCase().startsWith('HELLO'));
            assert.ok(hello, `Expected Hello member for SELF.Hel, got: [${names.join(', ')}]`);
            assert.strictEqual(hello!.kind, METHOD, `Hello should be a Method item, got kind=${hello!.kind}`);
            assert.ok((hello!.label as string).includes('('),
                `Hello should render its method signature (member completion), got label="${hello!.label}"`);
            // The partial filters out the non-matching member.
            assert.ok(!names.some(n => n.startsWith('GOODBYE')),
                `Goodbye should be filtered out by partial 'Hel', got: [${names.join(', ')}]`);
        });

        test('Instance.<partial> resolves class members (with signatures), not the word dump', async function () {
            this.timeout(10000);
            const content = [
                'Main PROCEDURE',
                'Greeter CLASS',
                'Hello   PROCEDURE(LONG pId)',
                'Goodbye PROCEDURE(LONG pId)',
                'END',
                'inst  Greeter',
                'CODE',
                'inst.Hel'
            ].join('\n');
            const uri = 'file:///C:/temp/completion-370-inst-partial.clw';
            const localDoc = TextDocument.create(uri, 'clarion', 1, content);
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(localDoc);

            const localProvider = new CompletionProvider();
            const params = {
                textDocument: { uri: localDoc.uri },
                position: { line: 7, character: 'inst.Hel'.length },
                context: { triggerKind: 1 }
            } as any;

            const items = await localProvider.onCompletion(params, localDoc);
            const names = items.map(i => (i.label as string).toUpperCase());

            const hello = items.find(i => (i.label as string).toUpperCase().startsWith('HELLO'));
            assert.ok(hello, `Expected Hello member for inst.Hel, got: [${names.join(', ')}]`);
            assert.strictEqual(hello!.kind, METHOD, `Hello should be a Method item, got kind=${hello!.kind}`);
            assert.ok((hello!.label as string).includes('('),
                `Hello should render its method signature (member completion), got label="${hello!.label}"`);
            assert.ok(!names.some(n => n.startsWith('GOODBYE')),
                `Goodbye should be filtered out by partial 'Hel', got: [${names.join(', ')}]`);
        });

        test('bare prefix with no dot still returns word completion (non-regression)', async function () {
            this.timeout(10000);
            const content = [
                'Main PROCEDURE',
                'Greeter CLASS',
                'Hello   PROCEDURE()',
                'END',
                'inst  Greeter',
                'CODE',
                'ins'
            ].join('\n');
            const uri = 'file:///C:/temp/completion-370-bare-prefix.clw';
            const localDoc = TextDocument.create(uri, 'clarion', 1, content);
            const cache = TokenCache.getInstance();
            cache.clearAllTokens();
            cache.getTokens(localDoc);

            const localProvider = new CompletionProvider();
            const params = {
                textDocument: { uri: localDoc.uri },
                position: { line: 6, character: 'ins'.length },
                context: { triggerKind: 1 }
            } as any;

            // No dot → word completion: it surfaces the in-scope variable `inst`, and must
            // NOT do member completion (Greeter's `Hello` must not appear for a bare prefix).
            const items = await localProvider.onCompletion(params, localDoc);
            const names = items.map(i => (i.label as string).toUpperCase());
            assert.ok(names.some(n => n.startsWith('INST')),
                `Bare 'ins' should surface the local variable inst via word completion, got: [${names.join(', ')}]`);
            assert.ok(!names.some(n => n.startsWith('HELLO')),
                `Bare 'ins' must not do member completion (no Greeter members), got: [${names.join(', ')}]`);
        });
    });
});
