/**
 * Tests for equates.clw global implicit scope resolution.
 *
 * Covers:
 * 1. FILE:Xxx colon-qualified labels tokenize as Label at column 0
 * 2. Equates tokens can be searched by name (full and stripped)
 * 3. findGlobalVariable reaches equates after MEMBER file search fails
 */

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { setServerInitialized } from '../serverState';
import { Token } from '../ClarionTokenizer';

const TEST_SLN = path.resolve(__dirname, '..', '..', '..', '..', 'test-programs', 'RealWorldTestSuite', 'RealWorldTestSuite.sln');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenize(src: string) {
    return new ClarionTokenizer(src).tokenize();
}

function createDoc(src: string, uri = 'test://eq1.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, src);
}

/** Minimal equates.clw-like content with colon-qualified equates */
const EQUATES_SRC = `
FILE:Queue              EQUATE(1)
FILE:Create             EQUATE(2)
FILE:Read               EQUATE(3)
True                    EQUATE(1)
False                   EQUATE(0)
`.trim();

// ---------------------------------------------------------------------------
// Suite 1: Tokenizer — colon-qualified labels
// ---------------------------------------------------------------------------

suite('EquatesScope - Tokenizer colon-qualified labels', () => {

    test('FILE:Queue at column 0 tokenizes as Label', () => {
        const tokens = tokenize('FILE:Queue              EQUATE(1)');
        const label = tokens.find(t => t.value.toUpperCase() === 'FILE:QUEUE');
        assert.ok(label, 'FILE:Queue should produce a token');
        assert.strictEqual(label!.type, TokenType.Label, `Expected Label(${TokenType.Label}), got ${label!.type}`);
        assert.strictEqual(label!.start, 0, 'Label must start at column 0');
    });

    test('FILE:Create at column 0 tokenizes as Label', () => {
        const tokens = tokenize('FILE:Create             EQUATE(2)');
        const label = tokens.find(t => t.value.toUpperCase() === 'FILE:CREATE');
        assert.ok(label, 'FILE:Create should produce a token');
        assert.strictEqual(label!.type, TokenType.Label);
        assert.strictEqual(label!.start, 0);
    });

    test('True and False equates tokenize as Label', () => {
        const tokens = tokenize(EQUATES_SRC);
        const trueLabel = tokens.find(t => t.value.toLowerCase() === 'true' && t.start === 0);
        const falseLabel = tokens.find(t => t.value.toLowerCase() === 'false' && t.start === 0);
        assert.ok(trueLabel, 'True should tokenize as Label at col 0');
        assert.ok(falseLabel, 'False should tokenize as Label at col 0');
    });

    test('Multiple equates all produce Label tokens at col 0', () => {
        const tokens = tokenize(EQUATES_SRC);
        const equateLabels = tokens.filter(t =>
            (t.type === TokenType.Label || t.type === TokenType.Variable) &&
            t.start === 0
        );
        // Should have at least FILE:Queue, FILE:Create, FILE:Read, True, False
        assert.ok(equateLabels.length >= 5, `Expected >= 5 equate labels, got ${equateLabels.length}: ${equateLabels.map(t => t.value).join(', ')}`);
    });
});

// ---------------------------------------------------------------------------
// Suite 2: Equate token search logic (mirrors findGlobalVariable step 3)
// ---------------------------------------------------------------------------

function findInEquates(equatesTokens: Token[], word: string): Token | undefined {
    return equatesTokens.find(t =>
        (t.type === TokenType.Label || t.type === TokenType.Variable) &&
        t.start === 0 &&
        t.value.toLowerCase() === word.toLowerCase()
    );
}

suite('EquatesScope - Token search logic', () => {
    let equatesTokens: Token[];

    setup(() => {
        equatesTokens = tokenize(EQUATES_SRC);
    });

    test('Finds FILE:Queue by exact name', () => {
        const t = findInEquates(equatesTokens, 'FILE:Queue');
        assert.ok(t, 'Should find FILE:Queue');
        assert.strictEqual(t!.value.toUpperCase(), 'FILE:QUEUE');
    });

    test('Finds FILE:Queue case-insensitively', () => {
        const t = findInEquates(equatesTokens, 'file:queue');
        assert.ok(t, 'Case-insensitive search should find FILE:Queue');
    });

    test('Finds True by name', () => {
        const t = findInEquates(equatesTokens, 'True');
        assert.ok(t, 'Should find True');
    });

    test('Finds False by name', () => {
        const t = findInEquates(equatesTokens, 'False');
        assert.ok(t, 'Should find False');
    });

    test('Returns undefined for unknown name', () => {
        const t = findInEquates(equatesTokens, 'BOGUS:Value');
        assert.strictEqual(t, undefined);
    });

    test('Stripped search: finds Queue from FILE:Queue', () => {
        // Simulate colon-strip fallback: strip "FILE:" prefix
        const word = 'FILE:Queue';
        const colonIdx = word.lastIndexOf(':');
        const stripped = word.substring(colonIdx + 1); // "Queue"
        // Queue itself is NOT in equates, so this should return undefined
        const t = findInEquates(equatesTokens, stripped);
        assert.strictEqual(t, undefined, 'Stripped "Queue" should not match a FILE:Queue equate');
    });
});

// ---------------------------------------------------------------------------
// Suite 4: findModuleVariable false positive for "Queue" 
// The stripped search for FILE:Queue tries "Queue" — findModuleVariable must
// NOT match it if there's a QUEUE structure keyword in the file.
// ---------------------------------------------------------------------------

suite('EquatesScope - findModuleVariable must not false-positive on QUEUE keyword', () => {
    let service: SymbolFinderService;
    let tokenCache: TokenCache;

    setup(() => {
        setServerInitialized(true);
        tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, solutionManager);
        service = new SymbolFinderService(tokenCache, scopeAnalyzer);
    });

    teardown(() => {
        tokenCache.clearTokens('test://queuetest.clw');
    });

    test('findModuleVariable does NOT match QUEUE keyword as a variable named Queue', () => {
        // This simulates a .clw that declares a QUEUE-typed variable
        // The stripped search "Queue" must not match the QUEUE structure keyword
        const src = [
            'MyProc  PROCEDURE()',
            '  QDir    QUEUE(FILE:Queue)',
            '  END',
            'CODE',
            'END'
        ].join('\n');

        const doc = TextDocument.create('test://queuetest.clw', 'clarion', 1, src);
        const tokens = tokenCache.getTokens(doc);

        const result = (service as any).findModuleVariable('Queue', tokens, doc);
        assert.strictEqual(result, null, `findModuleVariable("Queue") must return null — QUEUE is a keyword, not a label named "Queue". Got: ${JSON.stringify(result?.token?.value)}`);
    });

    test('findModuleVariable does NOT match FILE:Queue when searching for "Queue"', () => {
        // Even if FILE:Queue tokenizes as Label, searching for stripped "Queue" should not match it
        const src = [
            'FILE:Queue              EQUATE(1)',
            'MyProc  PROCEDURE()',
            'CODE',
            'END'
        ].join('\n');

        const doc = TextDocument.create('test://queuetest.clw', 'clarion', 1, src);
        const tokens = tokenCache.getTokens(doc);

        const result = (service as any).findModuleVariable('Queue', tokens, doc);
        assert.strictEqual(result, null, `Searching for "Queue" must not match "FILE:Queue" label`);
    });
});

suite('EquatesScope - findGlobalVariable reaches equates', () => {
    let service: SymbolFinderService;
    let tokenCache: TokenCache;
    let equatesTokens: Token[];

    suiteSetup(async function () {
        // Ensure SolutionManager singleton is initialized so the equates patch below applies
        if (fs.existsSync(TEST_SLN) && !SolutionManager.getInstance()) {
            await SolutionManager.create(TEST_SLN);
        }
    });

    setup(() => {
        setServerInitialized(true);
        tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        const scopeAnalyzer = new ScopeAnalyzer(tokenCache, solutionManager);
        service = new SymbolFinderService(tokenCache, scopeAnalyzer);
        equatesTokens = tokenize(EQUATES_SRC);
    });

    teardown(() => {
        tokenCache.clearTokens('test://member.clw');
    });

    test('findGlobalVariable returns equates result when not in current file or parent', async () => {
        // A .clw with no global declarations (only a procedure)
        const src = [
            'MyProc  PROCEDURE()',
            'CODE',
            'END'
        ].join('\n');

        const doc = createDoc(src, 'test://member.clw');

        // Patch SolutionManager to return our equates tokens
        const sm = SolutionManager.getInstance();
        const origGet = sm?.getEquatesTokens.bind(sm);
        const origPath = sm?.getEquatesPath.bind(sm);
        if (sm) {
            (sm as any).getEquatesTokens = () => equatesTokens;
            (sm as any).getEquatesPath = () => 'C:/test/equates.clw';
        }

        try {
            const result = await (service as any).findGlobalVariable('FILE:Queue', tokenCache.getTokens(doc), doc);
            assert.ok(result, 'findGlobalVariable should return a result for FILE:Queue from equates');
            assert.ok(result.location.uri.includes('equates'), `Expected equates URI, got: ${result.location.uri}`);
            assert.strictEqual(result.token.value.toUpperCase(), 'FILE:QUEUE');
        } finally {
            if (sm && origGet) (sm as any).getEquatesTokens = origGet;
            if (sm && origPath) (sm as any).getEquatesPath = origPath;
        }
    });

    test('findGlobalVariable finds True in equates', async () => {
        const src = 'MyProc  PROCEDURE()\nCODE\nEND';
        const doc = createDoc(src, 'test://member.clw');
        const sm = SolutionManager.getInstance();
        const origGet = sm?.getEquatesTokens.bind(sm);
        const origPath = sm?.getEquatesPath.bind(sm);
        if (sm) {
            (sm as any).getEquatesTokens = () => equatesTokens;
            (sm as any).getEquatesPath = () => 'C:/test/equates.clw';
        }
        try {
            const result = await (service as any).findGlobalVariable('True', tokenCache.getTokens(doc), doc);
            assert.ok(result, 'Should find True in equates');
            assert.strictEqual(result.token.value.toLowerCase(), 'true');
        } finally {
            if (sm && origGet) (sm as any).getEquatesTokens = origGet;
            if (sm && origPath) (sm as any).getEquatesPath = origPath;
        }
    });
});
