import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

// A local `CLASS` declared inside a procedure's DATA section (no ,TYPE, single
// self-instance) is closed by an indented END — never at column 0. Both
// `ImplementationProvider.findClassTokenForMethod` and
// `MethodHoverResolver.findClassTokenForMethodDeclaration` used to determine a
// CLASS token's extent by hand-scanning forward for the next END token sitting
// at column 0. Against an indented END, that scan skips straight past it and
// either finds some unrelated LATER column-0 END far down the file, or finds
// none at all (classEndLine === -1) — and the old check
// `classEndLine === -1 || methodLine < classEndLine` treats BOTH outcomes as
// "still inside the class". Any bare `Label PROCEDURE()` declaration textually
// following the class — including a genuinely standalone procedure with zero
// relation to it — was then mis-attributed as one of that class's own methods.
//
// Fix: use the tokenizer's own nesting-aware `finishesAt` (stack-based, driven
// by the real END that closed this CLASS) instead of the hand-scan.
//
// Real-world shape this was found in: a helper procedure with no MAP entry
// (so ProcedureHoverResolver.resolveProcedureImplementation's MAP-declaration
// lookup can't claim it first) declared right after a local CLASS.
suite('HoverProvider — standalone procedure declared after an indented-END local CLASS', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        if (!hover) return '';
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    // Owner.Method's own implementation MUST appear here, before the next PROCEDURE —
    // that's not just realism, it's a real Clarion placement rule: a procedure-local
    // class's method implementations belong to the declaring procedure and have to be
    // written before the next PROCEDURE begins. Omitting it (an earlier draft of this
    // test did) is invalid Clarion and no longer proves anything about the real bug.
    const code = [
        'HasLocalClass PROCEDURE()',
        '',
        'Owner CLASS',
        'Method  PROCEDURE(), LONG',
        '      END',
        '',
        '  CODE',
        '  RETURN',
        '',
        'Owner.Method PROCEDURE()',
        '  CODE',
        '  RETURN(1)',
        '',
        'StandaloneProc PROCEDURE()',
        '  CODE',
        '  RETURN',
    ].join('\n');

    test('hovering the standalone procedure\'s own declaration is not mis-attributed to the earlier local CLASS', async () => {
        const doc = TextDocument.create('test://standalone-after-local-class.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(13, 2)); // "StandaloneProc"
        const content = hoverText(hover);

        assert.ok(!content.includes('Owner'),
            `StandaloneProc must not be attributed to the unrelated local CLASS "Owner"; got: ${content}`);
    });

    test('hovering the method declaration INSIDE the local CLASS still resolves to that CLASS (no regression)', async () => {
        const doc = TextDocument.create('test://method-inside-local-class.clw', 'clarion', 1, code);
        tokenCache.getTokens(doc);

        const hover = await provider.provideHover(doc, Position.create(3, 2)); // "Method" inside Owner CLASS
        const content = hoverText(hover);

        assert.ok(content.includes('Owner'),
            `Method declared inside Owner must still resolve as Owner's own member; got: ${content}`);
    });
});
