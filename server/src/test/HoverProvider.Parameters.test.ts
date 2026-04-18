/**
 * Tests for hover and goto on procedure parameters and local variables.
 * Regression coverage for: parameter in CODE section returns no hover.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../ClarionTokenizer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { setServerInitialized } from '../serverState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHoverText(hover: { contents: unknown } | null): string {
    if (!hover) return '';
    const c = hover.contents;
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object' && 'value' in (c as object)) return (c as { value: string }).value;
    if (Array.isArray(c)) return c.map((x: unknown) => (typeof x === 'string' ? x : (x as { value: string }).value)).join('\n');
    return '';
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('HoverProvider – Parameters and Local Variables', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;
    const TEST_URI = 'test://hover-params.clw';

    setup(() => {
        setServerInitialized(true);
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
    });

    teardown(() => {
        tokenCache.clearTokens(TEST_URI);
    });

    // -----------------------------------------------------------------------
    // 1. Simple parameter in CODE section
    // -----------------------------------------------------------------------

    suite('procedure parameter', () => {
        const code = [
            'Main PROCEDURE(LONG isCloning)',
            '  CODE',
            '  IF isCloning',
            '    RETURN',
            '  END',
        ].join('\n');

        test('hover on parameter usage in CODE section returns hover', async () => {
            const doc = TextDocument.create(TEST_URI, 'clarion', 1, code);
            // Line 2: "  IF isCloning"
            // "isCloning" starts at col 5
            const position = Position.create(2, 7);
            const hover = await provider.provideHover(doc, position);
            assert.ok(hover, 'Should provide hover for parameter used in CODE section');
            const text = getHoverText(hover);
            assert.ok(text.includes('isCloning') || text.includes('LONG'), `Hover should mention parameter name or type, got: ${text}`);
        });
    });

    // -----------------------------------------------------------------------
    // 2. Local variable declared in procedure data section
    // -----------------------------------------------------------------------

    suite('local variable', () => {
        const code = [
            'MyProc PROCEDURE()',
            'Counter   LONG',
            '  CODE',
            '  Counter = 1',
            '  RETURN Counter',
        ].join('\n');

        test('hover on local variable declaration line returns hover', async () => {
            const doc = TextDocument.create(TEST_URI, 'clarion', 1, code);
            // Line 1: "Counter   LONG"  — Counter at col 0
            const position = Position.create(1, 2);
            const hover = await provider.provideHover(doc, position);
            assert.ok(hover, 'Should provide hover for local variable declaration');
            const text = getHoverText(hover);
            assert.ok(text.includes('Counter') || text.includes('LONG'), `Got: ${text}`);
        });

        test('hover on local variable usage in CODE section returns hover', async () => {
            const doc = TextDocument.create(TEST_URI, 'clarion', 1, code);
            // Line 3: "  Counter = 1"  — Counter at col 2
            const position = Position.create(3, 3);
            const hover = await provider.provideHover(doc, position);
            assert.ok(hover, 'Should provide hover for local variable in CODE section');
            const text = getHoverText(hover);
            assert.ok(text.includes('Counter') || text.includes('LONG'), `Got: ${text}`);
        });
    });

    // -----------------------------------------------------------------------
    // 3. Multiple parameters — hover on second parameter
    // -----------------------------------------------------------------------

    suite('multiple parameters', () => {
        const code = [
            'MyProc PROCEDURE(STRING pName, LONG pCount)',
            '  CODE',
            '  pCount += 1',
        ].join('\n');

        test('hover on second parameter usage returns hover', async () => {
            const doc = TextDocument.create(TEST_URI, 'clarion', 1, code);
            // Line 2: "  pCount += 1"  — pCount at col 2
            const position = Position.create(2, 4);
            const hover = await provider.provideHover(doc, position);
            assert.ok(hover, 'Should provide hover for second parameter');
            const text = getHoverText(hover);
            assert.ok(text.includes('pCount') || text.includes('LONG'), `Got: ${text}`);
        });
    });

    // -----------------------------------------------------------------------
    // 5. Local class method implementation can see outer procedure's parameters
    // -----------------------------------------------------------------------

    suite('outer procedure parameter visible inside local class method', () => {
        // In Clarion, ThisWindow.Init is a local method of Main PROCEDURE.
        // isCloning is Main's parameter, but should be resolvable inside ThisWindow.Init.
        const code = [
            'Main PROCEDURE(LONG isCloning)',
            'ThisWindow  CLASS(WindowManager)',
            'Init          PROCEDURE(),BYTE,PROC,DERIVED',
            '            END',
            '  CODE',
            '  ThisWindow.Run()',
            '',
            'ThisWindow.Init PROCEDURE',
            'ReturnValue  BYTE,AUTO',
            '  CODE',
            '  IF isCloning',
            '    RETURN',
            '  END',
        ].join('\n');

        test('hover on outer param inside local method body returns hover', async () => {
            const doc = TextDocument.create(TEST_URI, 'clarion', 1, code);
            // Line 10: "  IF isCloning"  — isCloning at col 5
            const position = Position.create(10, 7);
            const hover = await provider.provideHover(doc, position);
            assert.ok(hover, 'Should provide hover for outer procedure parameter used inside local class method');
            const text = getHoverText(hover);
            assert.ok(text.includes('isCloning') || text.includes('LONG'), `Got: ${text}`);
        });
    });



    suite('SymbolFinderService.findParameter', () => {
        const tc = TokenCache.getInstance();
        const finder = new SymbolFinderService(tc, new ScopeAnalyzer(tc, null));

        test('finds LONG parameter by name', () => {
            const code = 'Main PROCEDURE(LONG isCloning)\n  CODE\n  IF isCloning\n';
            const doc = TextDocument.create(TEST_URI, 'clarion', 1, code);
            const tokens = tc.getTokens(doc);
            // Scope token = the PROCEDURE token on line 0
            const scopeToken = tokens.find(t => t.value?.toUpperCase() === 'PROCEDURE' && t.line === 0)!;
            assert.ok(scopeToken, 'Should find PROCEDURE scope token');

            const result = finder.findParameter('isCloning', doc, scopeToken);
            assert.ok(result, 'findParameter should find isCloning');
            assert.strictEqual(result!.type.toUpperCase(), 'LONG');
        });

        test('finds STRING parameter by name', () => {
            const code = 'MyProc PROCEDURE(STRING pName, LONG pCount)\n  CODE\n';
            const doc = TextDocument.create('test://hover-params2.clw', 'clarion', 1, code);
            const tokens = tc.getTokens(doc);
            const scopeToken = tokens.find(t => t.value?.toUpperCase() === 'PROCEDURE' && t.line === 0)!;
            assert.ok(scopeToken, 'Should find PROCEDURE scope token');

            const result = finder.findParameter('pName', doc, scopeToken);
            assert.ok(result, 'findParameter should find pName');
            assert.ok(result!.type.toUpperCase().includes('STRING'));

            tc.clearTokens('test://hover-params2.clw');
        });
    });

    // -----------------------------------------------------------------------
    // 6. Token structure inspection — confirm what tokens exist on CLASS line
    // -----------------------------------------------------------------------
    suite('CLASS line token structure', () => {
        test('shows tokens on CLASS declaration line', () => {
            const code = [
                'Main PROCEDURE(LONG isCloning)',
                'ThisWindow           CLASS(WindowManager)',
                'Init                   PROCEDURE(),BYTE,PROC,DERIVED',
                '            END',
                '  CODE',
            ].join('\n');
            const doc = TextDocument.create(TEST_URI, 'clarion', 1, code);
            const tc = TokenCache.getInstance();
            const tokens = tc.getTokens(doc);
            const line1tokens = tokens.filter(t => t.line === 1);
            // Log what tokens exist — helps us understand whether a Label token is produced
            line1tokens.forEach(t => {
                console.log(`  line=1 type=${t.type} subType=${t.subType} value="${t.value}" label="${t.label}" start=${t.start}`);
            });
            // Verify the CLASS Structure token has label="ThisWindow"
            const classToken = line1tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'CLASS');
            assert.ok(classToken, 'Should have CLASS structure token on line 1');
            assert.strictEqual(classToken!.label?.toLowerCase(), 'thiswindow', `classToken.label should be "ThisWindow", got: "${classToken!.label}"`);
            // Check whether a separate Label token exists on the same line
            const labelToken = line1tokens.find(t => t.type === TokenType.Label && t.value.toLowerCase() === 'thiswindow');
            console.log(`  Separate Label token for "ThisWindow": ${labelToken ? `YES at col ${labelToken.start}` : 'NO'}`);
        });

        test('CLASS nested in procedure has Init as MethodDeclaration child', () => {
            const code = [
                'Main PROCEDURE(LONG isCloning)',
                'ThisWindow           CLASS(WindowManager)',
                'Init                   PROCEDURE(),BYTE,PROC,DERIVED',
                '            END',
                '  CODE',
            ].join('\n');
            const doc = TextDocument.create(TEST_URI, 'clarion', 1, code);
            const tc = TokenCache.getInstance();
            const tokens = tc.getTokens(doc);
            const classToken = tokens.find(t =>
                t.type === TokenType.Structure &&
                t.value.toUpperCase() === 'CLASS' &&
                t.label?.toLowerCase() === 'thiswindow'
            );
            assert.ok(classToken, 'Should find ThisWindow CLASS token');
            console.log(`  classToken.children count: ${classToken!.children?.length ?? 0}`);
            classToken!.children?.forEach(c => {
                console.log(`    child: type=${c.type} subType=${c.subType} value="${c.value}" label="${c.label}"`);
            });
            const initDecl = classToken!.children?.find(c =>
                c.subType === TokenType.MethodDeclaration &&
                c.label?.toLowerCase() === 'init'
            );
            assert.ok(initDecl, 'Init should be a MethodDeclaration child of ThisWindow CLASS');
        });
    });
});
