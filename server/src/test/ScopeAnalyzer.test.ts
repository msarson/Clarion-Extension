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

    suite('getVisibleFiles', () => {
        test('should return declaring file for global symbol', async () => {
            const document = createTestDocument(`PROGRAM
MAP
END

GlobalVar LONG

CODE
`, 'file:///test/main.clw');
            
            const tokens = tokenCache.getTokens(document);
            const globalVarToken = tokens.find(t => t.value === 'GlobalVar');
            
            assert.ok(globalVarToken, 'Should find GlobalVar token');
            const files = await analyzer.getVisibleFiles(globalVarToken!, 'file:///test/main.clw');
            
            // For now, should at least include declaring file
            // Full cross-file visibility would require solution manager
            assert.ok(files.length > 0, 'Should return at least one file');
            assert.ok(files.includes('file:///test/main.clw'), 'Should include declaring file');
        });

        test('should return only declaring file for module-local symbol', async () => {
            const document = createTestDocument(`MEMBER('Main')

ModuleVar LONG
`, 'file:///test/utils.clw');
            
            const tokens = tokenCache.getTokens(document);
            const moduleVarToken = tokens.find(t => t.value === 'ModuleVar');
            
            assert.ok(moduleVarToken, 'Should find ModuleVar token');
            const files = await analyzer.getVisibleFiles(moduleVarToken!, 'file:///test/utils.clw');
            
            assert.strictEqual(files.length, 1, 'Module-local should only be visible in one file');
            assert.strictEqual(files[0], 'file:///test/utils.clw');
        });

        test('should return only declaring file for procedure-local symbol', async () => {
            const document = createTestDocument(`MyProc PROCEDURE
LocalVar LONG
  CODE
`, 'file:///test/proc.clw');
            
            const tokens = tokenCache.getTokens(document);
            const localVarToken = tokens.find(t => t.value === 'LocalVar');
            
            assert.ok(localVarToken, 'Should find LocalVar token');
            const files = await analyzer.getVisibleFiles(localVarToken!, 'file:///test/proc.clw');
            
            assert.strictEqual(files.length, 1, 'Procedure-local should only be visible in one file');
            assert.strictEqual(files[0], 'file:///test/proc.clw');
        });

        test('should return only declaring file for routine-local symbol', async () => {
            const document = createTestDocument(`MyProc PROCEDURE
  CODE
  
MyRoutine ROUTINE
  DATA
RoutineVar LONG
  CODE
`, 'file:///test/routine.clw');
            
            const tokens = tokenCache.getTokens(document);
            const routineVarToken = tokens.find(t => t.value === 'RoutineVar');
            
            assert.ok(routineVarToken, 'Should find RoutineVar token');
            const files = await analyzer.getVisibleFiles(routineVarToken!, 'file:///test/routine.clw');
            
            assert.strictEqual(files.length, 1, 'Routine-local should only be visible in one file');
            assert.strictEqual(files[0], 'file:///test/routine.clw');
        });
    });

    suite('Edge Cases', () => {
        test('should handle ROUTINE without DATA section', () => {
            const document = createTestDocument(`MyProc PROCEDURE
  CODE
  DO MyRoutine
  
MyRoutine ROUTINE
  CODE
  ! No DATA section
  ProcVar = 1
`);
            
            const scope = analyzer.getTokenScope(document, { line: 6, character: 2 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'routine', 'Should still be routine scope even without DATA');
        });

        test('should handle empty PROGRAM file', () => {
            const document = createTestDocument(`PROGRAM
CODE
`);
            
            const scope = analyzer.getTokenScope(document, { line: 1, character: 0 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'global');
            assert.strictEqual(scope?.isProgramFile, true);
        });

        test('should handle MEMBER without module name', () => {
            const document = createTestDocument(`MEMBER

SomeVar LONG
`);
            
            const scope = analyzer.getTokenScope(document, { line: 2, character: 0 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            // Without module name, should default to global
            assert.strictEqual(scope?.type, 'global');
        });

        test('should handle file with no PROGRAM or MEMBER', () => {
            const document = createTestDocument(`SomeVar LONG

MyProc PROCEDURE
  CODE
`);
            
            const scope = analyzer.getTokenScope(document, { line: 0, character: 0 });
            
            assert.ok(scope !== null, 'Scope should not be null');
            assert.strictEqual(scope?.type, 'global');
            assert.strictEqual(scope?.isProgramFile, false);
        });

        test('should handle nested procedure attempt (invalid Clarion)', () => {
            const document = createTestDocument(`Outer PROCEDURE
  CODE
  
Inner PROCEDURE
  CODE
`);
            
            const outerScope = analyzer.getTokenScope(document, { line: 1, character: 2 });
            const innerScope = analyzer.getTokenScope(document, { line: 4, character: 2 });
            
            // Both should be identified as procedures
            assert.strictEqual(outerScope?.type, 'procedure');
            assert.strictEqual(innerScope?.type, 'procedure');
            
            // They should be different procedures
            assert.notStrictEqual(outerScope?.containingProcedure?.line, 
                                innerScope?.containingProcedure?.line);
        });

        test('should handle ROUTINE at global level (invalid but should not crash)', () => {
            const document = createTestDocument(`PROGRAM
MAP
END

GlobalRoutine ROUTINE
  DATA
Var LONG
  CODE
`);
            
            const scope = analyzer.getTokenScope(document, { line: 6, character: 0 });
            
            assert.ok(scope !== null, 'Should not crash');
            // ROUTINE at global level without containing procedure is treated as global
            assert.strictEqual(scope?.type, 'global');
        });

        test('should handle multiple MEMBER statements (invalid but should handle first)', () => {
            const document = createTestDocument(`MEMBER('First')
MEMBER('Second')

Var LONG
`);
            
            const scope = analyzer.getTokenScope(document, { line: 3, character: 0 });
            
            assert.ok(scope !== null);
            // Should use first MEMBER
            assert.strictEqual(scope?.memberModuleName, 'First');
        });

        test('should handle very deep routine nesting in same procedure', () => {
            const document = createTestDocument(`MyProc PROCEDURE
ProcVar LONG
  CODE
  
Routine1 ROUTINE
  CODE
  DO Routine2
  
Routine2 ROUTINE
  DATA
Routine2Var LONG
  CODE
  Routine2Var = 1
`);
            
            const routine2Scope = analyzer.getTokenScope(document, { line: 11, character: 2 });
            
            assert.ok(routine2Scope !== null);
            assert.strictEqual(routine2Scope?.type, 'routine');
            assert.ok(routine2Scope?.containingProcedure !== undefined, 'Should have containing procedure');
            assert.ok(routine2Scope?.containingRoutine !== undefined, 'Should have containing routine');
        });

        test('should handle PROCEDURE with only CODE, no DATA', () => {
            const document = createTestDocument(`MyProc PROCEDURE
  CODE
  RETURN
`);
            
            const scope = analyzer.getTokenScope(document, { line: 1, character: 2 });
            
            assert.ok(scope !== null);
            assert.strictEqual(scope?.type, 'procedure');
        });

        test('should handle symbol at line 0', () => {
            const document = createTestDocument(`PROGRAM
GlobalVar LONG
`);
            
            const scope = analyzer.getTokenScope(document, { line: 0, character: 0 });
            
            assert.ok(scope !== null);
            // Line 0 should be PROGRAM line, which is global
            assert.strictEqual(scope?.type, 'global');
        });

        test('should handle access check with out-of-bounds line numbers', () => {
            const document = createTestDocument(`PROGRAM
GlobalVar LONG
CODE
`);
            
            // Check access where reference is way out of bounds
            // but declaration is valid
            const canAccess = analyzer.canAccess(
                { line: 999, character: 0 },  // Out of bounds reference
                { line: 1, character: 0 },    // Valid global declaration
                document,
                document
            );
            
            // Out of bounds reference is treated as global scope
            // and can access global declarations
            assert.strictEqual(canAccess, true);
        });

        test('should handle cross-file access check gracefully', () => {
            const doc1 = createTestDocument(`PROGRAM
GlobalVar LONG
CODE
`, 'file:///test/main.clw');
            
            const doc2 = createTestDocument(`MEMBER('Utils')
LocalVar LONG
`, 'file:///test/utils.clw');
            
            const canAccess = analyzer.canAccess(
                { line: 1, character: 0 },
                { line: 1, character: 0 },
                doc2,
                doc1
            );
            
            // Cross-file access returns false for now (not implemented)
            assert.strictEqual(canAccess, false);
        });
    });
});
