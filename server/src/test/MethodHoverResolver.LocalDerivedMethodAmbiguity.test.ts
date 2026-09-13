import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

/**
 * A procedure-local CLASS's method implementation must be resolved through the
 * Issue #233 Rule 4 link (`Token.declaringProcedureLine`, stamped by
 * DocumentStructure.linkLocalDerivedMethodsPass()), never by a name-only text search.
 *
 * The language fixes the placement: a local class's method is implemented immediately
 * after its declaring procedure, before the next PROCEDURE. Nothing stops the same
 * local class name being reused in another procedure in the same file, so a search
 * matching purely on `ClassName.MethodName` text cannot tell those apart — it returns
 * whichever it hits first.
 *
 * These fixtures live on REAL FILES on disk, deliberately: MethodHoverResolver's
 * fallback (findMethodImplementationCrossFile → searchFileForImplementation) reads the
 * document's path with `fs.readFileSync`, so an in-memory-only `test://` document makes
 * that fallback fail with ENOENT and every assertion below would pass vacuously,
 * proving nothing about which path produced the answer.
 */

// Two adjacent procedures, each declaring its OWN local class under the same name,
// each with its own implementation placed immediately after it (shape borrowed from
// ScopeResolver.LocalDerivedMethod.test.ts's TWO_SAME_NAME fixture).
//
//  4 ProcA PROCEDURE
//  5 SharedName CLASS
//  6 Run PROCEDURE
//  7   END
//  8 AVar LONG
//  9   CODE
// 10   AVar = 1
// 12 SharedName.Run PROCEDURE   <- ProcA's own
// 13   CODE
// 14   AVar = 2
// 16 ProcB PROCEDURE
// 17 SharedName CLASS
// 18 Run PROCEDURE
// 19   END
// 20 BVar LONG
// 21   CODE
// 22   BVar = 1
// 24 SharedName.Run PROCEDURE   <- ProcB's own
// 25   CODE
// 26   BVar = 2
const TWO_SAME_NAME = [
    'PROGRAM',
    '  MAP',
    '  END',
    '',
    'ProcA PROCEDURE',
    'SharedName CLASS',
    'Run PROCEDURE',
    '  END',
    'AVar LONG',
    '  CODE',
    '  AVar = 1',
    '',
    'SharedName.Run PROCEDURE',
    '  CODE',
    '  AVar = 2',
    '',
    'ProcB PROCEDURE',
    'SharedName CLASS',
    'Run PROCEDURE',
    '  END',
    'BVar LONG',
    '  CODE',
    '  BVar = 1',
    '',
    'SharedName.Run PROCEDURE',
    '  CODE',
    '  BVar = 2',
    ''
].join('\n');

// Same shape, except ProcA declares the method but never implements it, while ProcB's
// same-named local class does implement its own. ProcA's declaration hover must report
// the implementation as genuinely missing rather than borrowing ProcB's.
//
//  4 ProcA PROCEDURE
//  5 SharedName CLASS
//  6 Run PROCEDURE      <- declared, never implemented
//  7   END
//  8 AVar LONG
//  9   CODE
// 10   AVar = 1
// 12 ProcB PROCEDURE
// 13 SharedName CLASS
// 14 Run PROCEDURE
// 15   END
// 16 BVar LONG
// 17   CODE
// 18   BVar = 1
// 20 SharedName.Run PROCEDURE   <- ProcB's own, the tempting wrong answer
// 21   CODE
// 22   BVar = 2
const MISSING_IN_A = [
    'PROGRAM',
    '  MAP',
    '  END',
    '',
    'ProcA PROCEDURE',
    'SharedName CLASS',
    'Run PROCEDURE',
    '  END',
    'AVar LONG',
    '  CODE',
    '  AVar = 1',
    '',
    'ProcB PROCEDURE',
    'SharedName CLASS',
    'Run PROCEDURE',
    '  END',
    'BVar LONG',
    '  CODE',
    '  BVar = 1',
    '',
    'SharedName.Run PROCEDURE',
    '  CODE',
    '  BVar = 2',
    ''
].join('\n');

suite('MethodHoverResolver — local derived method declaration hover, same class name reused across procedures', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;
    let tmpRoot: string;

    suiteSetup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-derived-hover-'));
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

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

    /** Writes the fixture to a real file so the disk-reading fallback is genuinely reachable. */
    function diskDoc(name: string, content: string): TextDocument {
        const filePath = path.join(tmpRoot, name);
        fs.writeFileSync(filePath, content, 'utf8');
        const uri = `file:///${filePath.replace(/\\/g, '/')}`;
        const doc = TextDocument.create(uri, 'clarion', 1, content);
        tokenCache.getTokens(doc);
        return doc;
    }

    test('hovering the method declaration in ProcA\'s class resolves to ProcA\'s own implementation, not ProcB\'s', async () => {
        const doc = diskDoc('two-same-name-a.clw', TWO_SAME_NAME);

        const hover = await provider.provideHover(doc, Position.create(6, 0)); // "Run" inside ProcA's SharedName CLASS
        const content = hoverText(hover);

        assert.ok(!content.includes('Implementation not found'),
            `should resolve an implementation; got: ${content}`);
        assert.ok(content.includes(':13'),
            `should resolve to ProcA's own implementation at line 13 (1-based); got: ${content}`);
        assert.ok(!content.includes(':25'),
            `must NOT resolve to ProcB's implementation at line 25; got: ${content}`);
    });

    test('hovering the method declaration in ProcB\'s class resolves to ProcB\'s own implementation, not ProcA\'s', async () => {
        const doc = diskDoc('two-same-name-b.clw', TWO_SAME_NAME);

        const hover = await provider.provideHover(doc, Position.create(18, 0)); // "Run" inside ProcB's SharedName CLASS
        const content = hoverText(hover);

        assert.ok(!content.includes('Implementation not found'),
            `should resolve an implementation; got: ${content}`);
        assert.ok(content.includes(':25'),
            `should resolve to ProcB's own implementation at line 25 (1-based); got: ${content}`);
        assert.ok(!content.includes(':13'),
            `must NOT resolve to ProcA's implementation at line 13; got: ${content}`);
    });

    test('an unimplemented local class method reports a genuine miss, never borrowing another procedure\'s same-named implementation', async () => {
        const doc = diskDoc('missing-in-a.clw', MISSING_IN_A);

        const hover = await provider.provideHover(doc, Position.create(6, 0)); // "Run" inside ProcA's SharedName CLASS
        const content = hoverText(hover);

        assert.ok(!content.includes(':21'),
            `must NOT borrow ProcB's implementation at line 21; got: ${content}`);
        assert.ok(content.includes('Implementation not found'),
            `ProcA never implements Run — the miss is genuine and must be reported as such; got: ${content}`);
    });
});
