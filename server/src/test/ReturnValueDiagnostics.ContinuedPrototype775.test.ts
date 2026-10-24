import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateDiscardedReturnValuesForPlainCalls } from '../providers/diagnostics/ReturnValueDiagnostics';
import { Diagnostic } from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HoverProvider } from '../providers/HoverProvider';
import { setServerInitialized } from '../serverState';

/**
 * #775 — a MAP prototype whose parameter list continues onto the next line (`|`) was read as
 * returning a value: the closing `)` was looked for on the first line only, so the attributes
 * were read from the start of the declaration and the `LONG` of `LONG addr` became the return
 * type. Every call to it was warned as discarding that value.
 */
const uriOf = (p: string) => 'file:///' + p.replace(/\\/g, '/');
const doc = (p: string, code: string) => TextDocument.create(uriOf(p), 'clarion', 1, code);

const MAP = [
    '  MAP',
    "    MODULE('')",
    '      RegisterEXE (LONG addr, |',
    "                   *FRM_EXEInit dat),NAME('_RegisterEXE')",
    '      CountIt (LONG a, |',
    '               LONG b),LONG',
    '      CountLater (LONG a, |',
    '                  LONG b),|',
    '                  LONG',
    '      CountProc (LONG a, |',
    '                 LONG b),LONG,|',
    '                 PROC',
    '    END',
    '  END',
];
const CALLS = [
    '  RegisterEXE (ADDRESS (x), y)',
    '  CountIt (1, 2)',
    '  CountLater (1, 2)',
    '  CountProc (1, 2)',
];

function names(diags: Diagnostic[]): string[] {
    return diags.map(x => String(x.message).match(/^Return value of '(\w+)' is discarded/)?.[1])
        .filter((n): n is string => !!n).sort();
}

/** A procedure declared in another file: the asynchronous pass. */
async function discarded(d: TextDocument): Promise<string[]> {
    const tokens = TokenCache.getInstance().getTokens(d);
    return names(await DiagnosticProvider.validateDiscardedReturnValues(tokens, d, new MemberLocatorService()));
}

/** A procedure declared or implemented in this file: the synchronous pass. */
function discardedHere(d: TextDocument): string[] {
    return names(validateDiscardedReturnValuesForPlainCalls(TokenCache.getInstance().getTokens(d), d));
}

suite('Discarded return: a prototype continued onto the next line (#775)', () => {
    setup(() => {
        TokenCache.getInstance().clearAllTokens();
        FileRelationshipGraph.getInstance().reset();
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('a MAP in the same file: only the prototypes that return a value warn', async () => {
        const code = ['  PROGRAM', ...MAP, '  CODE', ...CALLS, ''].join('\r\n');
        assert.deepStrictEqual(discardedHere(doc('c:\\app775\\prog.clw', code)), ['CountIt', 'CountLater']);
    });

    test('a procedure implemented in the file, its header continued', async () => {
        const code = ['  MEMBER()', 'Main  PROCEDURE', '  CODE', '  Later (1, 2)', '  Quiet (1, 2)',
            'Later  PROCEDURE (LONG a, |', '                  LONG b),LONG', '  CODE', '  RETURN a',
            'Quiet  PROCEDURE (LONG a, |', '                  LONG b)', '  CODE', ''].join('\r\n');
        assert.deepStrictEqual(discardedHere(doc('c:\\app775\\prog.clw', code)), ['Later']);
    });

    test('a MAP in another file: the same', async () => {
        const prog = doc('c:\\app775\\prog.clw', ['  PROGRAM', ...MAP, '  CODE', ''].join('\r\n'));
        TokenCache.getInstance().getTokens(prog);
        const member = doc('c:\\app775\\member.clw',
            ["  MEMBER('prog.clw')", 'Caller  PROCEDURE()', '  CODE', ...CALLS, ''].join('\r\n'));
        assert.deepStrictEqual(await discarded(member), ['CountIt', 'CountLater']);
    });
});

suite('Hover card: a prototype continued onto the next line (#775)', () => {
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('the card on a call shows every line of the prototype', async () => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proto775-'));
        try {
            const code = ['  PROGRAM', ...MAP, '  CODE', ...CALLS, ''].join('\r\n');
            const file = path.join(dir, 'prog775.clw');
            fs.writeFileSync(file, code);
            const d = TextDocument.create('file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, l) => l + '%3A'), 'clarion', 1, code);
            const callLine = MAP.length + 2;
            const h = await new HoverProvider().provideHover(d, { line: callLine, character: 4 });
            const card = (h?.contents as { value?: string } | undefined)?.value ?? '';
            assert.ok(/RegisterEXE \(LONG addr, \|\r?\n\s*\*FRM_EXEInit dat\),NAME\('_RegisterEXE'\)/.test(card), card || '(no hover)');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
