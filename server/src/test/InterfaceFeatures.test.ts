/**
 * Tests for Clarion INTERFACE language support
 * Covers: tokenization, subType assignment, IMPLEMENTS on CLASS,
 *         3-part method names, F12 navigation, and hover.
 */

import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';
import { DocumentStructure } from '../DocumentStructure';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { ClarionPatterns } from '../utils/ClarionPatterns';

function createDocument(content: string): TextDocument {
    return TextDocument.create('file:///test.clw', 'clarion', 1, content);
}

function seedCache(doc: TextDocument): void {
    TokenCache.getInstance().getTokens(doc);
}

// ---------------------------------------------------------------------------
// TokenType.Interface
// ---------------------------------------------------------------------------

suite('TokenType.Interface — subType assignment', () => {
    setup(() => {
        TokenCache.getInstance().clearAllTokens();
    });
    test('INTERFACE structure gets subType = Interface (not generic Structure)', () => {
        const code = [
            'IConnection  INTERFACE,TYPE',
            '  CloseSocket  PROCEDURE',
            '  Shutdown     PROCEDURE',
            'END',
        ].join('\n');

        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const ifaceToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'INTERFACE');
        assert.ok(ifaceToken, 'Expected an INTERFACE structure token');
        assert.strictEqual(ifaceToken!.subType, TokenType.Interface, 'INTERFACE subType should be TokenType.Interface');
    });

    test('INTERFACE token has label set from preceding Label token', () => {
        const code = [
            'IConnection  INTERFACE,TYPE',
            '  CloseSocket  PROCEDURE',
            'END',
        ].join('\n');

        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const ifaceToken = tokens.find(t => t.subType === TokenType.Interface);
        assert.ok(ifaceToken, 'Expected INTERFACE token');
        assert.ok(ifaceToken!.label?.toLowerCase() === 'iconnection', `Expected label "IConnection", got "${ifaceToken!.label}"`);
    });

    test('INTERFACE methods get subType = InterfaceMethod', () => {
        const code = [
            'IConnection  INTERFACE,TYPE',
            '  CloseSocket  PROCEDURE',
            '  Shutdown     PROCEDURE',
            'END',
        ].join('\n');

        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const methods = tokens.filter(t => t.subType === TokenType.InterfaceMethod);
        assert.ok(methods.length >= 1, `Expected InterfaceMethod tokens, got ${methods.length}`);
    });

    test('CLASS structure still gets subType = Class (not Interface)', () => {
        const code = 'MyClass CLASS\n  Init  PROCEDURE\nEND\n';
        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const classToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'CLASS');
        assert.ok(classToken, 'Expected CLASS token');
        assert.strictEqual(classToken!.subType, TokenType.Class, 'CLASS subType should remain TokenType.Class');
    });
});

// ---------------------------------------------------------------------------
// IMPLEMENTS on CLASS
// ---------------------------------------------------------------------------

suite('CLASS IMPLEMENTS — implementedInterfaces field', () => {
    setup(() => {
        TokenCache.getInstance().clearAllTokens();
    });
    test('CLASS with IMPLEMENTS stores interface name', () => {
        const code = [
            'IConnection  INTERFACE,TYPE',
            '  CloseSocket  PROCEDURE',
            'END',
            '',
            'MySocket  CLASS,IMPLEMENTS(IConnection),TYPE',
            '  CloseSocket  PROCEDURE,VIRTUAL',
            'END',
        ].join('\n');

        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const classToken = tokens.find(t => t.subType === TokenType.Class);
        assert.ok(classToken, 'Expected CLASS token');
        assert.ok(
            classToken!.implementedInterfaces && classToken!.implementedInterfaces.length > 0,
            'Expected implementedInterfaces to be populated'
        );
        assert.ok(
            classToken!.implementedInterfaces!.some(n => n.toLowerCase() === 'iconnection'),
            `Expected "IConnection" in implementedInterfaces, got: ${JSON.stringify(classToken!.implementedInterfaces)}`
        );
    });

    test('CLASS with multiple IMPLEMENTS stores all names', () => {
        const code = [
            'MyClass  CLASS,IMPLEMENTS(IFaceA),IMPLEMENTS(IFaceB),TYPE',
            '  DoA  PROCEDURE,VIRTUAL',
            '  DoB  PROCEDURE,VIRTUAL',
            'END',
        ].join('\n');

        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const classToken = tokens.find(t => t.subType === TokenType.Class);
        assert.ok(classToken?.implementedInterfaces, 'Expected implementedInterfaces');
        assert.ok(classToken!.implementedInterfaces!.some(n => n.toLowerCase() === 'ifacea'), 'Should contain IFaceA');
        assert.ok(classToken!.implementedInterfaces!.some(n => n.toLowerCase() === 'ifaceb'), 'Should contain IFaceB');
    });

    test('CLASS without IMPLEMENTS has no implementedInterfaces', () => {
        const code = 'PlainClass  CLASS,TYPE\n  Init  PROCEDURE\nEND\n';
        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const classToken = tokens.find(t => t.subType === TokenType.Class);
        assert.ok(classToken, 'Expected CLASS token');
        const ifaces = classToken!.implementedInterfaces;
        assert.ok(!ifaces || ifaces.length === 0, 'Should have no implementedInterfaces');
    });
});

// ---------------------------------------------------------------------------
// 3-Part method names: ClassName.InterfaceName.MethodName PROCEDURE
// ---------------------------------------------------------------------------

suite('3-Part method implementation names', () => {
    setup(() => {
        TokenCache.getInstance().clearAllTokens();
    });
    test('3-part name gets subType = MethodImplementation', () => {
        const code = [
            'MEMBER()',
            '',
            'CSocketConnection.IConnection.CloseSocket PROCEDURE',
            'CODE',
            'END',
        ].join('\n');

        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const impl = tokens.find(t => t.subType === TokenType.MethodImplementation);
        assert.ok(impl, 'Expected MethodImplementation token for 3-part name');
    });

    test('3-part method label is ClassName.InterfaceName.MethodName', () => {
        const code = [
            'MEMBER()',
            '',
            'CSocketConnection.IConnection.CloseSocket PROCEDURE',
            'CODE',
            'END',
        ].join('\n');

        const doc = createDocument(code);
        const tokens = TokenCache.getInstance().getTokens(doc);

        const impl = tokens.find(t => t.subType === TokenType.MethodImplementation);
        assert.ok(impl, 'Expected MethodImplementation token');
        assert.ok(
            impl!.label?.toLowerCase().includes('iconnection'),
            `Expected label to contain interface name, got: "${impl!.label}"`
        );
    });

    test('ClarionPatterns.getMethodImplParts extracts 3-part correctly', () => {
        const line = 'CSocketConnection.IConnection.CloseSocket PROCEDURE';
        const parts = ClarionPatterns.getMethodImplParts(line);
        assert.ok(parts, 'Expected parts to be non-null');
        assert.strictEqual(parts!.className, 'CSocketConnection');
        assert.strictEqual(parts!.interfaceName, 'IConnection');
        assert.strictEqual(parts!.methodName, 'CloseSocket');
    });

    test('ClarionPatterns.getMethodImplParts extracts 2-part correctly', () => {
        const line = 'ThisWindow.Init PROCEDURE(LONG x)';
        const parts = ClarionPatterns.getMethodImplParts(line);
        assert.ok(parts, 'Expected parts to be non-null');
        assert.strictEqual(parts!.className, 'ThisWindow');
        assert.strictEqual(parts!.interfaceName, undefined, 'Should have no interfaceName for 2-part');
        assert.strictEqual(parts!.methodName, 'Init');
        assert.strictEqual(parts!.params, 'LONG x');
    });

    test('IS_METHOD_IMPLEMENTATION matches 3-part lines', () => {
        const line = 'CSocketConnection.IConnection.CloseSocket PROCEDURE';
        assert.ok(
            ClarionPatterns.IS_METHOD_IMPLEMENTATION.test(line),
            '3-part should match IS_METHOD_IMPLEMENTATION'
        );
    });

    test('IS_METHOD_IMPLEMENTATION still matches 2-part lines', () => {
        const line = 'ThisWindow.Init PROCEDURE(LONG x)';
        assert.ok(
            ClarionPatterns.IS_METHOD_IMPLEMENTATION.test(line),
            '2-part should still match IS_METHOD_IMPLEMENTATION'
        );
    });
});

// ---------------------------------------------------------------------------
// F12: IMPLEMENTS navigation
// ---------------------------------------------------------------------------

suite('DefinitionProvider — INTERFACE navigation', () => {
    let provider: DefinitionProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new DefinitionProvider();
    });

    test('F12 on INTERFACE keyword navigates to declaration', async () => {
        const code = [
            'IMyFace  INTERFACE,TYPE',   // line 0
            '  DoThing  PROCEDURE',       // line 1
            'END',                         // line 2
            '',                            // line 3
            'MyClass  CLASS,IMPLEMENTS(IMyFace),TYPE',  // line 4
            '  DoThing  PROCEDURE,VIRTUAL',// line 5
            'END',                         // line 6
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // F12 on "IMyFace" inside IMPLEMENTS(IMyFace) on line 4
        // col: CLASS,IMPLEMENTS( = 17, so "IMyFace" starts at col 27
        const line4 = 'MyClass  CLASS,IMPLEMENTS(IMyFace),TYPE';
        const ifaceStart = line4.indexOf('IMyFace');
        const result = await provider.provideDefinition(doc, { line: 4, character: ifaceStart + 2 });
        assert.ok(result !== null, 'Expected a definition result for IMPLEMENTS(IMyFace)');
        if (result && !Array.isArray(result)) {
            assert.strictEqual(result.range.start.line, 0, `Expected line 0 (INTERFACE declaration), got ${result.range.start.line}`);
        }
    });

    test('F12 on method-name segment of 3-part implementation navigates to interface method', async () => {
        const code = [
            'IConn  INTERFACE,TYPE',          // line 0
            '  CloseSocket  PROCEDURE',        // line 1
            'END',                              // line 2
            '',                                 // line 3
            'CSocketConn  CLASS,IMPLEMENTS(IConn),TYPE,MODULE(\'test.clw\')',  // line 4
            '  CloseSocket  PROCEDURE,VIRTUAL', // line 5
            'END',                              // line 6
            '',                                 // line 7
            'MEMBER()',                         // line 8
            '',                                 // line 9
            'CSocketConn.IConn.CloseSocket  PROCEDURE',  // line 10
            'CODE',                             // line 11
            'END',                              // line 12
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        // F12 on "CloseSocket" segment of line 10
        const implLine = 'CSocketConn.IConn.CloseSocket  PROCEDURE';
        const methodStart = implLine.indexOf('CloseSocket', implLine.indexOf('IConn') + 1);
        const result = await provider.provideDefinition(doc, { line: 10, character: methodStart + 3 });
        assert.ok(result !== null, 'Expected a definition result for method name in 3-part implementation');
        if (result && !Array.isArray(result)) {
            assert.strictEqual(result.range.start.line, 1, `Expected line 1 (InterfaceMethod declaration), got ${result.range.start.line}`);
        }
    });
});

// ---------------------------------------------------------------------------
// Hover: INTERFACE and IMPLEMENTS
// ---------------------------------------------------------------------------

suite('HoverProvider — INTERFACE hover', () => {
    let provider: HoverProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        provider = new HoverProvider();
    });

    test('Hover on interface name in IMPLEMENTS() returns interface method list', async () => {
        const code = [
            'IMyFace  INTERFACE,TYPE',           // line 0
            '  DoThing  PROCEDURE',               // line 1
            '  GetValue  PROCEDURE,LONG',         // line 2
            'END',                                 // line 3
            '',                                    // line 4
            'MyClass  CLASS,IMPLEMENTS(IMyFace),TYPE',  // line 5
            '  DoThing  PROCEDURE,VIRTUAL',        // line 6
            'END',                                 // line 7
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        const line5 = 'MyClass  CLASS,IMPLEMENTS(IMyFace),TYPE';
        const ifaceStart = line5.indexOf('IMyFace');
        const hover = await provider.provideHover(doc, { line: 5, character: ifaceStart + 2 });
        assert.ok(hover !== null, 'Expected hover for IMPLEMENTS(IMyFace)');

        const content = typeof hover!.contents === 'string'
            ? hover!.contents
            : (hover!.contents as any).value ?? JSON.stringify(hover!.contents);
        assert.ok(content.includes('INTERFACE'), `Hover should mention INTERFACE, got: ${content}`);
    });

    test('Hover on method-name segment of 3-part implementation shows method hover', async () => {
        const code = [
            'IConn  INTERFACE,TYPE',          // line 0
            '  CloseSocket  PROCEDURE',        // line 1
            'END',                              // line 2
            '',                                 // line 3
            'CSocketConn  CLASS,IMPLEMENTS(IConn),TYPE,MODULE(\'test.clw\')',  // line 4
            '  CloseSocket  PROCEDURE,VIRTUAL', // line 5
            'END',                              // line 6
            '',                                 // line 7
            'MEMBER()',                         // line 8
            '',                                 // line 9
            'CSocketConn.IConn.CloseSocket  PROCEDURE',  // line 10
            'CODE',                             // line 11
            'END',                              // line 12
        ].join('\n');

        const doc = createDocument(code);
        seedCache(doc);

        const implLine = 'CSocketConn.IConn.CloseSocket  PROCEDURE';
        const methodStart = implLine.indexOf('CloseSocket', implLine.indexOf('IConn') + 1);
        const hover = await provider.provideHover(doc, { line: 10, character: methodStart + 3 });
        assert.ok(hover !== null, 'Expected hover for method name in 3-part implementation');

        const content = typeof hover!.contents === 'string'
            ? hover!.contents
            : (hover!.contents as any).value ?? JSON.stringify(hover!.contents);
        assert.ok(
            content.toLowerCase().includes('closesocket'),
            `Hover should mention CloseSocket, got: ${content}`
        );
    });
});

// ---------------------------------------------------------------------------
// Find All References: INTERFACE scenarios
// ---------------------------------------------------------------------------

suite('ReferencesProvider — INTERFACE references', () => {
    let provider: import('../providers/ReferencesProvider').ReferencesProvider;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        const { ReferencesProvider } = require('../providers/ReferencesProvider');
        provider = new ReferencesProvider();
    });

    const code = [
        'IConn  INTERFACE,TYPE',             // line 0
        '  CloseSocket  PROCEDURE',           // line 1
        '  Shutdown     PROCEDURE',           // line 2
        'END',                                // line 3
        '',                                   // line 4
        'CSocketConn  CLASS,IMPLEMENTS(IConn),TYPE,MODULE(\'test.clw\')',  // line 5
        '  CloseSocket  PROCEDURE,VIRTUAL',   // line 6
        'END',                                // line 7
        '',                                   // line 8
        'MEMBER()',                           // line 9
        '',                                   // line 10
        'CSocketConn.IConn.CloseSocket  PROCEDURE',  // line 11
        'CODE',                               // line 12
        'END',                                // line 13
    ].join('\n');

    function makeDoc() {
        const doc = TextDocument.create('file:///test.clw', 'clarion', 1, code);
        TokenCache.getInstance().getTokens(doc);
        return doc;
    }

    test('Shift+F12 on method inside INTERFACE body finds implementations + declarations', async () => {
        const doc = makeDoc();
        // Cursor on "CloseSocket" inside the INTERFACE body (line 1)
        const line1 = '  CloseSocket  PROCEDURE';
        const col = line1.indexOf('CloseSocket');
        const refs = await provider.provideReferences(doc, { line: 1, character: col + 2 }, { includeDeclaration: true });
        assert.ok(refs && refs.length > 0, 'Expected references for interface method declaration');
        // Should include line 11 (3-part implementation)
        const hasImpl = refs!.some(r => r.range.start.line === 11);
        assert.ok(hasImpl, `Expected reference at line 11 (3-part impl), got lines: ${refs!.map(r => r.range.start.line).join(', ')}`);
    });

    test('Shift+F12 on method-name in 3-part impl finds interface method declaration', async () => {
        const doc = makeDoc();
        // Cursor on "CloseSocket" in "CSocketConn.IConn.CloseSocket  PROCEDURE" (line 11)
        const implLine = 'CSocketConn.IConn.CloseSocket  PROCEDURE';
        const methStart = implLine.indexOf('CloseSocket', implLine.indexOf('IConn') + 1);
        const refs = await provider.provideReferences(doc, { line: 11, character: methStart + 2 }, { includeDeclaration: true });
        assert.ok(refs && refs.length > 0, 'Expected references from 3-part implementation method name');
        // Should include line 1 (InterfaceMethod declaration)
        const hasDecl = refs!.some(r => r.range.start.line === 1);
        assert.ok(hasDecl, `Expected reference at line 1 (interface method decl), got lines: ${refs!.map(r => r.range.start.line).join(', ')}`);
    });

    test('Shift+F12 on IMPLEMENTS(IConn) finds interface declaration and implementing classes', async () => {
        const doc = makeDoc();
        // Cursor on "IConn" inside IMPLEMENTS(IConn) on line 5
        const classLine = "CSocketConn  CLASS,IMPLEMENTS(IConn),TYPE,MODULE('test.clw')";
        const nameStart = classLine.indexOf('IConn', classLine.indexOf('IMPLEMENTS'));
        const refs = await provider.provideReferences(doc, { line: 5, character: nameStart + 2 }, { includeDeclaration: true });
        assert.ok(refs && refs.length > 0, 'Expected references for IMPLEMENTS(IConn)');
        // Should include line 0 (INTERFACE declaration)
        const hasIfaceDecl = refs!.some(r => r.range.start.line === 0);
        assert.ok(hasIfaceDecl, `Expected reference at line 0 (INTERFACE decl), got lines: ${refs!.map(r => r.range.start.line).join(', ')}`);
        // Should include line 5 (IMPLEMENTS)
        const hasImpl = refs!.some(r => r.range.start.line === 5);
        assert.ok(hasImpl, `Expected reference at line 5 (IMPLEMENTS), got lines: ${refs!.map(r => r.range.start.line).join(', ')}`);
    });

    test('Shift+F12 on INTERFACE name in declaration line finds all IMPLEMENTS references', async () => {
        const doc = makeDoc();
        // Cursor on "IConn" in "IConn  INTERFACE,TYPE" (line 0)
        const refs = await provider.provideReferences(doc, { line: 0, character: 2 }, { includeDeclaration: true });
        assert.ok(refs && refs.length > 0, 'Expected references for INTERFACE declaration name');
        // Should include line 5 (IMPLEMENTS)
        const hasImpl = refs!.some(r => r.range.start.line === 5);
        assert.ok(hasImpl, `Expected reference at line 5 (IMPLEMENTS), got lines: ${refs!.map(r => r.range.start.line).join(', ')}`);
    });
});
