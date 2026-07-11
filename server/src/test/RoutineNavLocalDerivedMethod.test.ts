import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { setServerInitialized } from '../serverState';

/**
 * #285 — F12 / Ctrl+F12 on a `DO routine` from inside a LOCAL DERIVED METHOD (its CLASS declared in
 * a procedure's local data — the ABC/NetTalk `ThisWindow` shape) must resolve a routine declared at
 * the enclosing procedure's level. A local derived method shares its declaring procedure's scope
 * (Rule 4), so the routine IS callable — hover already resolves it (via a broad fallback), but F12
 * and Ctrl+F12 returned nothing because the shared resolver only searched the immediate method scope.
 */

// Main declares ThisWindow locally; TestEnrollment is a Main-level routine; TakeEvent is a local
// derived method that DOes it.
const FIXTURE = [
    'Main PROCEDURE',                            // 0
    'ThisWindow CLASS(WindowManager)',           // 1
    'TakeEvent   PROCEDURE(),BYTE,PROC,DERIVED', // 2
    '            END',                            // 3
    '  CODE',                                     // 4
    '  GlobalResponse = ThisWindow.Run()',        // 5
    'TestEnrollment ROUTINE',                     // 6
    '  RETURN',                                   // 7
    'ThisWindow.TakeEvent PROCEDURE',             // 8
    '  CODE',                                     // 9
    '  DO TestEnrollment'                         // 10
].join('\n');

function createDocument(content: string, uri: string): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

function line(result: unknown): number {
    if (!result) return -1;
    const loc = Array.isArray(result) ? result[0] : result as Location;
    return loc?.range?.start?.line ?? -1;
}

suite('#285 routine nav from a local derived method', () => {
    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
    });

    test('F12 on DO TestEnrollment inside ThisWindow.TakeEvent lands on the Main-level routine (line 6)', async () => {
        const doc = createDocument(FIXTURE, 'file:///t285-f12.clw');
        TokenCache.getInstance().getTokens(doc);
        const result = await new DefinitionProvider().provideDefinition(doc, { line: 10, character: 6 });
        assert.strictEqual(line(result), 6, 'F12 must resolve the procedure-level routine visible to the method');
    });

    test('Ctrl+F12 on the same DO lands on line 6', async () => {
        const doc = createDocument(FIXTURE, 'file:///t285-impl.clw');
        TokenCache.getInstance().getTokens(doc);
        const result = await new ImplementationProvider().provideImplementation(doc, { line: 10, character: 6 });
        assert.strictEqual(line(result), 6);
    });

    test('hover on the same DO still resolves (regression guard for the path that already worked)', async () => {
        const doc = createDocument(FIXTURE, 'file:///t285-hover.clw');
        TokenCache.getInstance().getTokens(doc);
        const hover = await new HoverProvider().provideHover(doc, { line: 10, character: 6 });
        assert.ok(hover, 'hover should resolve the routine reference');
    });
});
