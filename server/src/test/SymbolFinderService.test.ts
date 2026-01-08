/**
 * Unit tests for SymbolFinderService
 * 
 * Tests the core symbol-finding logic extracted from HoverProvider and DefinitionProvider.
 * This service provides a single source of truth for symbol resolution.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { SymbolFinderService, SymbolInfo } from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SolutionManager } from '../solution/solutionManager';
import { TokenHelper } from '../utils/TokenHelper';

suite('SymbolFinderService Tests', () => {
    let service: SymbolFinderService;
    let tokenCache: TokenCache;
    let scopeAnalyzer: ScopeAnalyzer;

    setup(() => {
        tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        scopeAnalyzer = new ScopeAnalyzer(tokenCache, solutionManager);
        service = new SymbolFinderService(tokenCache, scopeAnalyzer);
    });

    teardown(() => {
        // Clear cached documents
        tokenCache.clearTokens('test://symbol1.clw');
        tokenCache.clearTokens('test://symbol2.clw');
        tokenCache.clearTokens('test://symbol3.clw');
        tokenCache.clearTokens('test://symbol4.clw');
        tokenCache.clearTokens('test://symbol5.clw');
    });

    function createDocument(code: string, uri: string = 'test://symbol1.clw'): TextDocument {
        return TextDocument.create(uri, 'clarion', 1, code);
    }

    suite('findParameter', () => {
        
        test('Should find simple parameter', () => {
            const code = `
MyProc PROCEDURE(LONG pId)
  CODE
  pId = 123
  END`.trim();
            
            const doc = createDocument(code);
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            assert.ok(scope, 'Should find scope');
            
            const result = service.findParameter('pId', doc, scope);
            
            assert.ok(result, 'Should find parameter');
            assert.strictEqual(result.searchWord, 'pId');
            assert.strictEqual(result.type, 'LONG');
            assert.strictEqual(result.scope.type, 'parameter');
            assert.strictEqual(result.location.line, 0);
        });

        test('Should find parameter with reference marker', () => {
            const code = `
MyProc PROCEDURE(*STRING pName)
  CODE
  END`.trim();
            
            const doc = createDocument(code, 'test://symbol2.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            const result = service.findParameter('pName', doc, scope!);
            
            assert.ok(result, 'Should find reference parameter');
            assert.strictEqual(result.type, '*STRING');
        });

        test('Should find parameter among multiple params', () => {
            const code = `
MyProc PROCEDURE(LONG pId, STRING pName, BYTE pStatus)
  CODE
  END`.trim();
            
            const doc = createDocument(code, 'test://symbol3.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            const result = service.findParameter('pName', doc, scope!);
            
            assert.ok(result, 'Should find middle parameter');
            assert.strictEqual(result.searchWord, 'pName');
            assert.strictEqual(result.type, 'STRING');
        });

        test('Should return null for non-existent parameter', () => {
            const code = `
MyProc PROCEDURE(LONG pId)
  CODE
  END`.trim();
            
            const doc = createDocument(code, 'test://symbol4.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            const result = service.findParameter('pNonExistent', doc, scope!);
            
            assert.strictEqual(result, null, 'Should return null for non-existent parameter');
        });

        test('Should return null for procedure with no parameters', () => {
            const code = `
MyProc PROCEDURE()
  CODE
  END`.trim();
            
            const doc = createDocument(code, 'test://symbol5.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            const result = service.findParameter('pAnything', doc, scope!);
            
            assert.strictEqual(result, null, 'Should return null when no parameters');
        });
    });

    suite('findLocalVariable', () => {
        
        test('Should find simple local variable', () => {
            const code = `
MyProc PROCEDURE()
Counter    LONG
  CODE
  Counter = 1
  END`.trim();
            
            const doc = createDocument(code, 'test://local1.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            const result = service.findLocalVariable('Counter', tokens, scope!, doc);
            
            assert.ok(result, 'Should find local variable');
            assert.strictEqual(result.searchWord, 'Counter');
            assert.strictEqual(result.type, 'LONG');
            assert.strictEqual(result.scope.type, 'local');
            assert.strictEqual(result.location.line, 1);
        });

        test('Should find prefixed local variable (LOC:Counter)', () => {
            const code = `
MyProc PROCEDURE()
LOC:Counter    LONG
  CODE
  LOC:Counter = 1
  END`.trim();
            
            const doc = createDocument(code, 'test://local2.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            const result = service.findLocalVariable('Counter', tokens, scope!, doc, 'LOC:Counter');
            
            assert.ok(result, 'Should find prefixed variable');
            assert.strictEqual(result.originalWord, 'LOC:Counter');
            assert.strictEqual(result.searchWord, 'Counter');
        });

        test('Should find variable in GROUP', () => {
            const code = `
MyProc PROCEDURE()
MyGroup    GROUP
Field1       STRING(20)
Field2       LONG
           END
  CODE
  MyGroup.Field1 = 'Test'
  END`.trim();
            
            const doc = createDocument(code, 'test://local3.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            // Should find the GROUP structure
            const result = service.findLocalVariable('MyGroup', tokens, scope!, doc);
            
            assert.ok(result, 'Should find GROUP structure');
            assert.strictEqual(result.searchWord, 'MyGroup');
        });

        test('Should return null for non-existent local variable', () => {
            const code = `
MyProc PROCEDURE()
Counter    LONG
  CODE
  END`.trim();
            
            const doc = createDocument(code, 'test://local4.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            const result = service.findLocalVariable('NonExistent', tokens, scope!, doc);
            
            assert.strictEqual(result, null, 'Should return null for non-existent variable');
        });
    });

    suite('findModuleVariable', () => {
        
        test('Should find module-level variable', () => {
            const code = `
PROGRAM

GlobalCounter    LONG

MyProc PROCEDURE()
  CODE
  GlobalCounter = 1
  END`.trim();
            
            const doc = createDocument(code, 'test://module1.clw');
            const tokens = tokenCache.getTokens(doc);
            
            const result = service.findModuleVariable('GlobalCounter', tokens, doc);
            
            assert.ok(result, 'Should find module variable');
            assert.strictEqual(result.searchWord, 'GlobalCounter');
            assert.strictEqual(result.type, 'LONG');
            assert.strictEqual(result.scope.type, 'module');
            assert.strictEqual(result.location.line, 2);
        });

        test('Should find module CLASS definition', () => {
            const code = `
PROGRAM

MyClass    CLASS
Init         PROCEDURE()
           END

MyProc PROCEDURE()
  CODE
  END`.trim();
            
            const doc = createDocument(code, 'test://module2.clw');
            const tokens = tokenCache.getTokens(doc);
            
            const result = service.findModuleVariable('MyClass', tokens, doc);
            
            assert.ok(result, 'Should find module CLASS');
            assert.strictEqual(result.searchWord, 'MyClass');
            assert.strictEqual(result.type, 'CLASS');
        });

        test('Should not find procedure-local variable in module scope', () => {
            const code = `
PROGRAM

MyProc PROCEDURE()
LocalVar    LONG
  CODE
  END`.trim();
            
            const doc = createDocument(code, 'test://module3.clw');
            const tokens = tokenCache.getTokens(doc);
            
            const result = service.findModuleVariable('LocalVar', tokens, doc);
            
            assert.strictEqual(result, null, 'Should not find procedure-local variable');
        });

        test('Should return null for non-existent module variable', () => {
            const code = `
PROGRAM

MyProc PROCEDURE()
  CODE
  END`.trim();
            
            const doc = createDocument(code, 'test://module4.clw');
            const tokens = tokenCache.getTokens(doc);
            
            const result = service.findModuleVariable('NonExistent', tokens, doc);
            
            assert.strictEqual(result, null, 'Should return null');
        });
    });

    suite('Integration: Full word search with fallback', () => {
        
        test('Should find full word label with multiple colons', () => {
            const code = `
PROGRAM
BRW1::View:Browse    VIEW(AABranchName)
                       PROJECT(BRA:CustId)
                     END
  CODE
  BRW1::View:Browse{PROP:SQL} = 'SELECT * FROM Branches'
  END`.trim();
            
            const doc = createDocument(code, 'test://fullword1.clw');
            const tokens = tokenCache.getTokens(doc);
            
            // Should find as module variable (it's at global scope)
            const result = service.findModuleVariable('BRW1::View:Browse', tokens, doc);
            
            assert.ok(result, 'Should find label with multiple colons');
            assert.strictEqual(result.searchWord, 'BRW1::View:Browse');
            assert.strictEqual(result.location.line, 1);
        });

        test('Should fallback to stripped word if full word not found', () => {
            const code = `
MyProc PROCEDURE()
MyGroup    GROUP,PRE(GRP)
Name         STRING(40)
           END
  CODE
  GRP:Name = 'Test'
  END`.trim();
            
            const doc = createDocument(code, 'test://fallback1.clw');
            const tokens = tokenCache.getTokens(doc);
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0);
            
            // Try finding with full prefix first
            let result = service.findLocalVariable('GRP:Name', tokens, scope!, doc);
            
            // If not found, fallback to just 'Name'
            if (!result) {
                result = service.findLocalVariable('Name', tokens, scope!, doc, 'GRP:Name');
            }
            
            assert.ok(result, 'Should find via fallback');
            assert.strictEqual(result.originalWord, 'GRP:Name');
        });
    });
});
