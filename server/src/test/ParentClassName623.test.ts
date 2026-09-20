/**
 * #623 (#609 phase 3, step B) — one implementation of "parent of this class".
 *
 * Eight independent `CLASS(Parent)` regex literals had drifted apart on two points, and each
 * disagreement is user-visible:
 *
 *  1. Whether a colon is legal in the parent's NAME. `SelfParentClassResolver` (hover on a bare
 *     SELF/PARENT, #606) and `ReferencesProvider`'s derivation sweep both accept `[\w:]`; the six
 *     in `ClassMemberResolver` and `MemberLocatorService` use `\w`, which stops at the colon. So
 *     for `Derived CLASS(MyOwn:Base)`, hovering `PARENT` names the class while `PARENT.Method`
 *     resolves to nothing — the same declaration read two ways.
 *
 *  2. Whether anything outside the open document is consulted. `CompletionProvider.resolveParentOf`
 *     and `MemberLocatorService.findClassInfoInDoc` are the same function in two files, both
 *     scanning only the current document's text. MemberLocatorService's caller falls back to the
 *     SDI; CompletionProvider has no fallback, so `PARENT.` offers nothing whenever the class is
 *     declared in an .inc — which is where generated and hand-written classes normally live.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { CompletionProvider } from '../providers/CompletionProvider';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';
import { setServerInitialized } from '../serverState';

suite('Parent class name — one reading of CLASS(Parent) (#623)', () => {
    let fx: DiskSolution | undefined;

    setup(() => setServerInitialized(true));
    teardown(() => { fx?.dispose(); fx = undefined; TokenCache.getInstance().clearAllTokens(); });

    suite('a colon in the parent name', () => {
        // `MyOwn:Base` is a perfectly ordinary Clarion label. Every site must read it whole.
        const INC = [
            "MyOwn:Base    CLASS,TYPE,MODULE('base.clw')",
            'BaseMethod      PROCEDURE()',
            'BaseField       LONG',
            '              END',
            '',
            "Derived       CLASS(MyOwn:Base),TYPE,MODULE('derived.clw')",
            'OwnMethod       PROCEDURE()',
            '              END',
        ];
        const CLW = [
            "  MEMBER('prog.clw')",
            "  INCLUDE('classes.inc'),ONCE",
            '  MAP',
            '  END',
            'Derived.OwnMethod PROCEDURE()',
            '  CODE',
            '  PARENT.BaseMethod()',
            '  RETURN',
        ];

        test('getParentClassInfo reads the whole colon-bearing parent name', async () => {
            fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
            const doc = fx.open('caller.clw');
            const tokens = TokenCache.getInstance().getTokens(doc);
            const info = await new ClassMemberResolver().getParentClassInfo(doc, 6, tokens);
            assert.strictEqual(info?.parentClassName, 'MyOwn:Base',
                `the parent of Derived is MyOwn:Base, not a fragment of it; got ${JSON.stringify(info)}`);
        });

        test('a PARENT.member lookup finds the inherited member', async () => {
            fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
            const doc = fx.open('caller.clw');
            const tokens = TokenCache.getInstance().getTokens(doc);
            const info = await new ClassMemberResolver().findParentClassMemberInfo('BaseMethod', doc, 6, tokens);
            assert.ok(info, 'PARENT.BaseMethod must resolve through a colon-named parent');
            assert.strictEqual(info!.className, 'MyOwn:Base');
        });

        test('the member locator walks the chain through a colon-named parent', async () => {
            fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
            const doc = fx.open('caller.clw');
            const found = await new MemberLocatorService().findMemberInClass('Derived', 'BaseField', doc);
            assert.ok(found, 'BaseField is inherited from MyOwn:Base and must be found on Derived');
            assert.strictEqual(found!.className, 'MyOwn:Base');
        });
    });

    suite('a parent declared outside the open document', () => {
        const INC = [
            "Base          CLASS,TYPE,MODULE('base.clw')",
            'BaseMethod      PROCEDURE()',
            '              END',
            '',
            "Derived       CLASS(Base),TYPE,MODULE('derived.clw')",
            'OwnMethod       PROCEDURE()',
            '              END',
        ];
        const CLW = [
            "  MEMBER('prog.clw')",
            "  INCLUDE('classes.inc'),ONCE",
            '  MAP',
            '  END',
            'Derived.OwnMethod PROCEDURE()',
            '  CODE',
            '  PARENT.BaseMethod()',
            '  RETURN',
        ];

        test('the parent is found although the CLASS line is in the .inc, not the .clw', async () => {
            fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
            const doc = fx.open('caller.clw');
            const tokens = TokenCache.getInstance().getTokens(doc);
            const info = await new ClassMemberResolver().getParentClassInfo(doc, 6, tokens);
            assert.strictEqual(info?.parentClassName, 'Base',
                `got ${JSON.stringify(info)} — the open document carries no CLASS line at all`);
        });

        test('PARENT. completion offers the inherited member', async () => {
            fx = createDiskSolution({ 'classes.inc': INC, 'caller.clw': CLW });
            const doc = fx.open('caller.clw');
            // Cursor immediately after "PARENT." on the call line.
            const line = CLW[6];
            const items = await new CompletionProvider().onCompletion(
                {
                    textDocument: { uri: doc.uri },
                    position: { line: 6, character: line.indexOf('PARENT.') + 'PARENT.'.length }
                } as never,
                doc
            );
            const labels = (items as { label: unknown }[]).map(i => String(i.label));
            assert.ok(labels.some(l => /^BaseMethod\b/i.test(l)),
                `PARENT. must offer the parent's members even though the CLASS line lives in the .inc; got ${JSON.stringify(labels)}`);
        });
    });
});
