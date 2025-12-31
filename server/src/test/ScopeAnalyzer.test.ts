import * as assert from 'assert';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { TokenCache } from '../TokenCache';
import { TextDocument } from 'vscode-languageserver-textdocument';

function createTestDocument(content: string, uri: string = 'file:///test.clw'): TextDocument {
    return TextDocument.create(uri, 'clarion', 1, content);
}

suite('ScopeAnalyzer', () => {
    let analyzer: ScopeAnalyzer;
    let tokenCache: TokenCache;
    
    setup(() => {
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens(); // Clear cache between tests
        analyzer = new ScopeAnalyzer(tokenCache, null);
    });
    
    suite('getTokenScope', () => {
        test('should identify global scope in PROGRAM file', () => {
            const document = createTestDocument(`PROGRAM
MAP
END

GlobalVar LONG

CODE
`);
            
            const scope = analyzer.getTokenScope(document, { line: 4, character: 0 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'global');
            assert.strictEqual(scope?.isProgramFile, true);
            assert.strictEqual(scope?.memberModuleName, undefined);
        });

        test('should identify module scope in MEMBER file', () => {
            const document = createTestDocument(`MEMBER('Main')

ModuleVar LONG

MyProc PROCEDURE
`);
            
            const scope = analyzer.getTokenScope(document, { line: 2, character: 0 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'module');
            assert.strictEqual(scope?.isProgramFile, false);
            assert.strictEqual(scope?.memberModuleName, 'Main');
        });

        test('should identify procedure scope', () => {
            const document = createTestDocument(`MyProc PROCEDURE
LocalVar LONG
  CODE
  LocalVar = 5
`);
            
            const scope = analyzer.getTokenScope(document, { line: 3, character: 2 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'procedure');
            assert.ok(scope?.containingProcedure !== undefined, 'Should have containing procedure');
            assert.strictEqual(scope?.containingProcedure?.value, 'PROCEDURE');
        });

        test('should identify routine scope', () => {
            const document = createTestDocument(`MyProc PROCEDURE
  CODE
  DO MyRoutine
  
MyRoutine ROUTINE
  DATA
RoutineVar LONG
  CODE
  RoutineVar = 1
`);
            
            const scope = analyzer.getTokenScope(document, { line: 8, character: 2 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'routine');
            assert.ok(scope?.containingRoutine !== undefined, 'Should have containing routine');
            assert.ok(scope?.containingProcedure !== undefined, 'Should have containing procedure');
        });
    });

    suite('getSymbolScope', () => {
        test('should identify global data scope', () => {
            const document = createTestDocument(`PROGRAM
MAP
END

GlobalVar LONG

CODE
`);
            
            const tokens = tokenCache.getTokens(document);
            const globalVarToken = tokens.find(t => t.value === 'GlobalVar');
            
            assert.ok(globalVarToken, 'Should find GlobalVar token');
            const scope = analyzer.getSymbolScope(globalVarToken!, document);
            
            assert.strictEqual(scope, 'global');
        });

        test('should identify module-local data scope', () => {
            const document = createTestDocument(`MEMBER('Main')

ModuleVar LONG

MyProc PROCEDURE
`);
            
            const tokens = tokenCache.getTokens(document);
            const moduleVarToken = tokens.find(t => t.value === 'ModuleVar');
            
            assert.ok(moduleVarToken, 'Should find ModuleVar token');
            const scope = analyzer.getSymbolScope(moduleVarToken!, document);
            
            assert.strictEqual(scope, 'module-local');
        });

        test('should identify procedure-local data scope', () => {
            const document = createTestDocument(`MyProc PROCEDURE
LocalVar LONG
  CODE
`);
            
            const tokens = tokenCache.getTokens(document);
            const localVarToken = tokens.find(t => t.value === 'LocalVar');
            
            assert.ok(localVarToken, 'Should find LocalVar token');
            const scope = analyzer.getSymbolScope(localVarToken!, document);
            
            assert.strictEqual(scope, 'procedure-local');
        });

        test('should identify routine-local data scope', () => {
            const document = createTestDocument(`MyProc PROCEDURE
  CODE
  
MyRoutine ROUTINE
  DATA
RoutineVar LONG
  CODE
`);
            
            const tokens = tokenCache.getTokens(document);
            const routineVarToken = tokens.find(t => t.value === 'RoutineVar');
            
            assert.ok(routineVarToken, 'Should find RoutineVar token');
            const scope = analyzer.getSymbolScope(routineVarToken!, document);
            
            assert.strictEqual(scope, 'routine-local');
        });
    });

    suite('canAccess', () => {
        test('should allow access within same procedure', () => {
            const document = createTestDocument(`MyProc PROCEDURE
LocalVar LONG
  CODE
  LocalVar = 5
`);
            
            const canAccess = analyzer.canAccess(
                { line: 3, character: 2 },  // Reference
                { line: 1, character: 0 },  // Declaration
                document,
                document
            );
            
            assert.strictEqual(canAccess, true);
        });

        test('should deny access to procedure-local var from different procedure', () => {
            const document = createTestDocument(`Proc1 PROCEDURE
LocalVar LONG
  CODE

Proc2 PROCEDURE
  CODE
  LocalVar = 5
`);
            
            const canAccess = analyzer.canAccess(
                { line: 6, character: 2 },  // Reference in Proc2
                { line: 1, character: 0 },  // Declaration in Proc1
                document,
                document
            );
            
            assert.strictEqual(canAccess, false);
        });

        test('should allow procedure to access global data', () => {
            const document = createTestDocument(`PROGRAM
MAP
END

GlobalVar LONG

CODE

MyProc PROCEDURE
  CODE
  GlobalVar = 5
`);
            
            const canAccess = analyzer.canAccess(
                { line: 10, character: 2 },  // Reference in MyProc
                { line: 4, character: 0 },   // Global declaration
                document,
                document
            );
            
            assert.strictEqual(canAccess, true);
        });

        test('should allow routine to access procedure data', () => {
            const document = createTestDocument(`MyProc PROCEDURE
ProcVar LONG
  CODE
  DO MyRoutine
  
MyRoutine ROUTINE
  CODE
  ProcVar = 5
`);
            
            const canAccess = analyzer.canAccess(
                { line: 7, character: 2 },  // Reference in routine
                { line: 1, character: 0 },  // Declaration in procedure
                document,
                document
            );
            
            assert.strictEqual(canAccess, true);
        });

        test('should deny procedure access to routine-local data', () => {
            const document = createTestDocument(`MyProc PROCEDURE
  CODE
  DO MyRoutine
  RoutineVar = 5
  
MyRoutine ROUTINE
  DATA
RoutineVar LONG
  CODE
`);
            
            const canAccess = analyzer.canAccess(
                { line: 3, character: 2 },  // Reference in procedure
                { line: 7, character: 0 },  // Declaration in routine
                document,
                document
            );
            
            assert.strictEqual(canAccess, false);
        });
    });
});
