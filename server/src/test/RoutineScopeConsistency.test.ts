import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';

/**
 * #264 — ROUTINE labels are procedure-local and legally repeat across procedures.
 * DefinitionProvider.findRoutineDefinition was scoped to the enclosing procedure
 * under #211; hover (RoutineHoverResolver) and Ctrl+F12
 * (ImplementationProvider.findRoutineImplementation) never got the fix — both did
 * an unscoped whole-file first-match text scan, returning MyProc's routine when
 * the cursor is in OtherProc.
 *
 * Fixture is the exact #211 shape from DefinitionProvider.DoRoutine.test.ts
 * ("keeps routine lookup inside the enclosing procedure") — F12 is already green
 * on it; these tests extend the same guarantee to hover and Ctrl+F12.
 */

const FIXTURE = `MyProc PROCEDURE()
  CODE
  DO MyRoutine
MyRoutine ROUTINE
  RETURN
END

OtherProc PROCEDURE()
  CODE
  DO MyRoutine
MyRoutine ROUTINE
  RETURN
END`;
// lines:            0 MyProc / 2 DO (MyProc) / 3 routine (MyProc's)
//                   7 OtherProc / 9 DO (OtherProc) / 10 routine (OtherProc's)

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

suite('Routine scoping — hover + Ctrl+F12 agree with F12 (#264)', () => {

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    test('hover on DO MyRoutine in OtherProc reports OtherProc\'s routine (line 11), not MyProc\'s (line 4)', async () => {
        const doc = createDocument(FIXTURE, 'file:///t264-hover.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new HoverProvider();

        const hover = await provider.provideHover(doc, { line: 9, character: 8 });

        assert.ok(hover, 'hover should resolve the routine reference');
        const text = typeof hover!.contents === 'object' && 'value' in hover!.contents
            ? (hover!.contents as { value: string }).value
            : String(hover!.contents);
        assert.ok(
            text.includes('Line 11'),
            `hover should point at OtherProc's routine (display Line 11); got: ${text.replace(/\n/g, ' | ')}`
        );
        assert.ok(
            !text.includes('Line 4'),
            `hover must NOT point at MyProc's routine (display Line 4); got: ${text.replace(/\n/g, ' | ')}`
        );
    });

    test('Ctrl+F12 on DO MyRoutine in OtherProc lands on line 10, not line 3', async () => {
        const doc = createDocument(FIXTURE, 'file:///t264-impl.clw');
        TokenCache.getInstance().getTokens(doc);
        const provider = new ImplementationProvider();

        const result = await provider.provideImplementation(doc, { line: 9, character: 8 });

        assert.ok(result, 'Ctrl+F12 should resolve the routine reference');
        const loc = Array.isArray(result) ? result[0] : result as Location;
        assert.strictEqual(
            loc.range.start.line, 10,
            `Ctrl+F12 should land on OtherProc's routine (line 10), got line ${loc.range.start.line} — ` +
            'unscoped whole-file scan returns the FIRST matching routine label'
        );
    });

    test('regression guard: hover + Ctrl+F12 in the FIRST procedure still resolve its own routine', async () => {
        const doc = createDocument(FIXTURE, 'file:///t264-guard.clw');
        TokenCache.getInstance().getTokens(doc);

        const hover = await new HoverProvider().provideHover(doc, { line: 2, character: 8 });
        assert.ok(hover, 'hover in MyProc should resolve');
        const text = typeof hover!.contents === 'object' && 'value' in hover!.contents
            ? (hover!.contents as { value: string }).value
            : String(hover!.contents);
        assert.ok(text.includes('Line 4'), `MyProc's DO should show Line 4; got: ${text.replace(/\n/g, ' | ')}`);

        const impl = await new ImplementationProvider().provideImplementation(doc, { line: 2, character: 8 });
        assert.ok(impl, 'Ctrl+F12 in MyProc should resolve');
        const loc = Array.isArray(impl) ? impl[0] : impl as Location;
        assert.strictEqual(loc.range.start.line, 3, 'MyProc\'s DO should land on line 3');
    });
});
