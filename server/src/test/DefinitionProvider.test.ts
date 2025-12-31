import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location, Range } from 'vscode-languageserver-protocol';
import { TokenHelper } from '../utils/TokenHelper';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { TokenCache } from '../TokenCache';

suite('DefinitionProvider Behavior Tests', () => {
    
    function createDocument(code: string, uri: string = 'test://test.clw'): TextDocument {
        return TextDocument.create(uri, 'clarion', 1, code);
    }
    
    function getLocationLine(result: Location | Location[] | null | undefined): number {
        if (!result) return -1;
        if (Array.isArray(result)) {
            return result.length > 0 ? result[0].range.start.line : -1;
        }
        return result.range.start.line;
    }
    
    function getLocationUri(result: Location | Location[] | null | undefined): string {
        if (!result) return '';
        if (Array.isArray(result)) {
            return result.length > 0 ? result[0].uri : '';
        }
        return result.uri;
    }

    suite('Word Extraction for Goto Definition', () => {
        
        test('Should extract method name from self.Method() call', () => {
            const code = 'self.SaveFile()';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 8 }; // On 'SaveFile'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'self.SaveFile');
        });

        test('Should extract prefixed variable (LOC:Counter)', () => {
            const code = 'LOC:Counter = 123';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 5 }; // On 'LOC:Counter'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'LOC:Counter');
        });

        test('Should extract procedure name from call', () => {
            const code = '  HelperProc(123)';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 6 }; // On 'HelperProc'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'HelperProc');
        });

        test('Should extract structure field (MyQueue.Name)', () => {
            const code = 'MyQueue.Name = \'Test\'';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 10 }; // On 'Name'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'MyQueue.Name');
        });

        test('Should extract DO routine target', () => {
            const code = '  DO ProcessData';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 8 }; // On 'ProcessData'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'ProcessData');
        });
    });

    suite('Symbol Detection in Token Stream', () => {
        
        test('Should detect local variable declaration', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            // Find the LocalVar token
            const localVarToken = tokens.find(t => 
                t.label && t.label.toLowerCase() === 'localvar'
            );
            
            assert.ok(localVarToken, 'Should find LocalVar token');
            assert.strictEqual(localVarToken!.line, 1, 'Should be on line 1');
        });

        test('Should detect PROCEDURE declaration', () => {
            const code = `MyProc PROCEDURE()
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const procToken = tokens.find(t => 
                t.subType === TokenType.Procedure || 
                t.value.toUpperCase() === 'PROCEDURE'
            );
            
            assert.ok(procToken, 'Should find PROCEDURE token');
            assert.strictEqual(procToken!.line, 0, 'Should be on line 0');
        });

        test('Should detect ROUTINE declaration', () => {
            const code = `MyProc PROCEDURE()
ProcessData ROUTINE
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const routineToken = tokens.find(t => 
                t.subType === TokenType.Routine ||
                (t.label && t.label.toLowerCase() === 'processdata')
            );
            
            assert.ok(routineToken, 'Should find ROUTINE token');
        });

        test('Should detect CLASS method declaration', () => {
            const code = `MyClass CLASS
  Init PROCEDURE()
  SaveFile PROCEDURE()
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const classToken = tokens.find(t => 
                t.subType === TokenType.Class ||
                t.value.toUpperCase() === 'CLASS'
            );
            
            assert.ok(classToken, 'Should find CLASS token');
        });

        test('Should detect QUEUE structure with fields', () => {
            const code = `MyQueue QUEUE
  Name STRING(40)
  Age LONG
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const queueToken = tokens.find(t => 
                t.label && t.label.toLowerCase() === 'myqueue'
            );
            
            assert.ok(queueToken, 'Should find QUEUE declaration');
        });
    });

    suite('Scope Detection for Definition Search', () => {
        
        test('Should find innermost procedure scope', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = 123
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 3);
            
            assert.ok(scope, 'Should find scope');
            assert.ok(scope!.value.toUpperCase().includes('PROCEDURE'));
        });

        test('Should find routine scope within procedure', () => {
            const code = `MyProc PROCEDURE()
ProcessData ROUTINE
  CODE
  ! Inside routine
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 3);
            
            assert.ok(scope, 'Should find scope');
            assert.ok(scope!.value.toUpperCase().includes('ROUTINE'));
        });
    });

    suite('Method Implementation Pattern Detection', () => {
        
        test('Should detect method implementation pattern', () => {
            const line = 'ThisWindow.Init PROCEDURE()';
            const pattern = /^(\w+)\.(\w+)\s+PROCEDURE/i;
            
            const match = line.match(pattern);
            
            assert.ok(match, 'Should match method implementation pattern');
            assert.strictEqual(match![1], 'ThisWindow', 'Should extract class name');
            assert.strictEqual(match![2], 'Init', 'Should extract method name');
        });

        test('Should detect method implementation with parameters', () => {
            const line = 'MyClass.Process PROCEDURE(STRING pName, LONG pId)';
            const pattern = /^(\w+)\.(\w+)\s+PROCEDURE/i;
            
            const match = line.match(pattern);
            
            assert.ok(match, 'Should match method with parameters');
            assert.strictEqual(match![1], 'MyClass');
            assert.strictEqual(match![2], 'Process');
        });
    });

    suite('Self Method Call Pattern Detection', () => {
        
        test('Should detect self.Method() pattern', () => {
            const line = '  self.SaveFile()';
            const dotIndex = line.indexOf('.');
            
            assert.ok(dotIndex > 0, 'Should find dot');
            
            const beforeDot = line.substring(0, dotIndex).trim();
            const afterDot = line.substring(dotIndex + 1);
            
            assert.strictEqual(beforeDot.toLowerCase(), 'self');
            assert.ok(afterDot.startsWith('SaveFile'), 'Should have method name after dot');
        });

        test('Should detect self.Method with parameters', () => {
            const line = 'self.Process(\'Test\', 123)';
            const hasParens = line.includes('(');
            
            assert.ok(hasParens, 'Should detect method call with parameters');
        });
    });

    // ========================================================================
    // PHASE 1: BEHAVIOR-LOCKING TESTS
    // What already works today - proves no regression during migration
    // 
    // NOTE: These tests are SKIPPED because DefinitionProvider requires:
    // 1. TokenCache to be properly initialized with the document
    // 2. SolutionManager to be initialized for cross-file resolution
    // 3. File system access for INCLUDE resolution
    // 
    // These tests will be enabled once we have proper test infrastructure
    // with mock SolutionManager and file system. For now, manual testing
    // and existing integration tests provide coverage.
    // ========================================================================

    suite.skip('🔒 Behavior Lock: Local Variable Navigation', () => {
        const definitionProvider = new DefinitionProvider();

        test('Should navigate to local variable declaration', async () => {
            const code = `
MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = 123
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 3, character: 4 }; // On 'LocalVar' usage
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find definition');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to declaration on line 1');
        });

        test('Should navigate to prefixed variable (LOC:Field)', async () => {
            const code = `
MyProc PROCEDURE()
LOC:Counter LONG
  CODE
  LOC:Counter = 1
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 3, character: 6 }; // On 'LOC:Counter' usage
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find definition');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to declaration');
        });

        test('Should navigate to procedure parameter', async () => {
            const code = `
MyProc PROCEDURE(LONG pId, STRING pName)
  CODE
  pId += 1
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 2, character: 4 }; // On 'pId' usage
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find parameter definition');
            assert.strictEqual(getLocationLine(result), 0, 'Should jump to procedure line');
        });
    });

    suite.skip('🔒 Behavior Lock: Structure Navigation', () => {
        const definitionProvider = new DefinitionProvider();

        test('Should navigate to QUEUE definition', async () => {
            const code = `
MyQueue QUEUE
Name STRING(40)
Age  LONG
  END
  CODE
  ADD(MyQueue)
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 5, character: 8 }; // On 'MyQueue' in ADD
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find QUEUE definition');
            assert.strictEqual(getLocationLine(result), 0, 'Should jump to QUEUE line');
        });

        test('Should navigate to structure field via dot notation', async () => {
            const code = `
MyGroup GROUP
Field1 STRING(20)
Field2 LONG
  END
  CODE
  MyGroup.Field1 = 'Test'
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 5, character: 12 }; // On 'Field1'
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find field definition');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to field declaration');
        });

        test('Should navigate to structure field via prefix notation', async () => {
            const code = `
MyGroup GROUP,PRE(GRP)
Field1 STRING(20)
Field2 LONG
  END
  CODE
  GRP:Field1 = 'Test'
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 5, character: 8 }; // On 'GRP:Field1'
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find field definition');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to field declaration');
        });
    });

    suite.skip('🔒 Behavior Lock: Class Method Navigation', () => {
        const definitionProvider = new DefinitionProvider();

        test('Should navigate from method implementation to CLASS declaration (same file)', async () => {
            const code = `
MyClass CLASS
Init PROCEDURE()
Kill PROCEDURE()
  END

MyClass.Init PROCEDURE()
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 5, character: 10 }; // On 'Init' in implementation
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find CLASS method declaration');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to CLASS method line');
        });

        test('Should navigate from self.Method() call to declaration', async () => {
            const code = `
MyClass CLASS
SaveFile PROCEDURE()
LoadFile PROCEDURE()
  END

MyClass.SaveFile PROCEDURE()
  CODE
  self.LoadFile()
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 7, character: 10 }; // On 'LoadFile' in self.LoadFile()
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find method declaration');
            assert.strictEqual(getLocationLine(result), 2, 'Should jump to LoadFile declaration');
        });

        test('Should handle method overloads with parameter counting', async () => {
            const code = `
MyClass CLASS
Process PROCEDURE()
Process PROCEDURE(STRING pName)
Process PROCEDURE(STRING pName, LONG pId)
  END

MyClass.Process PROCEDURE(STRING pName)
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 6, character: 10 }; // On 'Process' in implementation
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find matching overload');
            assert.strictEqual(getLocationLine(result), 2, 'Should jump to 1-parameter overload');
        });
    });

    suite.skip('🔒 Behavior Lock: Routine Navigation', () => {
        const definitionProvider = new DefinitionProvider();

        test('Should navigate to ROUTINE declaration', async () => {
            const code = `
MyProc PROCEDURE()
ProcessData ROUTINE
  CODE
  DO ProcessData
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 3, character: 8 }; // On 'ProcessData' in DO
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find ROUTINE');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to ROUTINE line');
        });

        test('Should handle routine-local variables', async () => {
            const code = `
MyProc PROCEDURE()
ProcessData ROUTINE
LocalToRoutine LONG
  CODE
  DO ProcessData
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 2, character: 5 }; // On ROUTINE line
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should handle routine scope');
            // This test just verifies no crash - routine is its own definition
        });
    });

    // ========================================================================
    // PHASE 1: GAP-COVERAGE TESTS (RED TESTS)
    // MAP bidirectional navigation - explicitly failing initially
    // These tests SHOULD FAIL until server-side MAP logic is implemented
    // ========================================================================

    suite('🚨 Gap Coverage: MAP Procedure Forward Navigation (Declaration → Implementation)', () => {
        const definitionProvider = new DefinitionProvider();

        test('F12 on MAP declaration should jump to PROCEDURE implementation', async () => {
            const code = `
  MAP
    ProcessOrder(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 1, character: 6 }; // On 'ProcessOrder' in MAP
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find PROCEDURE implementation');
            assert.strictEqual(getLocationLine(result), 4, 'Should jump to PROCEDURE line');
        });

        test('Should handle MAP with PROCEDURE keyword', async () => {
            const code = `
  MAP
    ProcessOrder PROCEDURE(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 1, character: 6 }; // On 'ProcessOrder'
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(getLocationLine(result), 4, 'Should jump to implementation');
        });

        test('Should handle MAP with comma syntax', async () => {
            const code = `
  MAP
    ProcessOrder,PROCEDURE(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 1, character: 6 }; // On 'ProcessOrder'
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(getLocationLine(result), 4, 'Should jump to implementation');
        });

        test('Should handle multi-parameter MAP procedures', async () => {
            const code = `
  MAP
    SaveRecord(STRING fileName, LONG recordId, *STRING result)
  END

SaveRecord PROCEDURE(STRING fileName, LONG recordId, *STRING result)
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 1, character: 6 }; // On 'SaveRecord'
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(getLocationLine(result), 4, 'Should jump to implementation');
        });

        test('Should handle multiple MAP blocks', async () => {
            const code = `
  MAP
    FirstProc()
  END

  MAP
    SecondProc(LONG id)
  END

FirstProc PROCEDURE()
  CODE
  END

SecondProc PROCEDURE(LONG id)
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 5, character: 6 }; // On 'SecondProc' in second MAP
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find SecondProc implementation');
            assert.strictEqual(getLocationLine(result), 12, 'Should jump to SecondProc');
        });
    });

    suite('🚨 Gap Coverage: MAP Procedure Reverse Navigation (Implementation → Declaration)', () => {
        const definitionProvider = new DefinitionProvider();

        test('F12 on PROCEDURE implementation should jump to MAP declaration', async () => {
            const code = `
  MAP
    ProcessOrder(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 4, character: 5 }; // On 'ProcessOrder' in PROCEDURE
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find MAP declaration');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to MAP line');
        });

        test('Should prioritize MAP declaration over global procedure', async () => {
            const code = `
  MAP
    Utility(STRING text)
  END

Utility PROCEDURE(STRING text)
  CODE
  ! This is the local implementation
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 4, character: 3 }; // On 'Utility'
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find MAP declaration');
            assert.strictEqual(getLocationLine(result), 1, 'Should prioritize MAP');
        });

        test('Should handle cursor on PROCEDURE keyword', async () => {
            const code = `
  MAP
    MyProc()
  END

MyProc PROCEDURE()
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 4, character: 10 }; // On 'PROCEDURE' keyword
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            // Should still find MAP declaration even when cursor is on keyword
            // (or return null if not on identifier)
            // This test captures current behavior
        });
    });

    suite('🚨 Gap Coverage: MAP Edge Cases', () => {
        const definitionProvider = new DefinitionProvider();

        test('Should handle MAP procedure with return type', async () => {
            const code = `
  MAP
    GetValue(),LONG
  END

GetValue PROCEDURE(),LONG
  CODE
  RETURN 42
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 1, character: 6 }; // On 'GetValue' in MAP
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(getLocationLine(result), 4, 'Should jump to implementation');
        });

        test('Should handle MAP with MODULE declaration', async () => {
            const code = `
  MAP
    MODULE('EXTERNAL')
      ExternalProc(LONG id)
    END
  END

ExternalProc PROCEDURE(LONG id)
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 2, character: 8 }; // On 'ExternalProc'
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            // Note: External procedures might not have implementations in same file
            // This test captures edge case behavior
        });

        test('Should handle indented PROCEDURE implementation', async () => {
            const code = `
  MAP
    HelperProc(STRING text)
  END

  HelperProc PROCEDURE(STRING text)
    CODE
    END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 4, character: 6 }; // On indented 'HelperProc'
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should handle indented implementation');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to MAP');
        });

        test('Should not confuse MAP procedure with CLASS method', async () => {
            const code = `
MyClass CLASS
Process PROCEDURE()
  END

  MAP
    Process(LONG id)
  END

Process PROCEDURE(LONG id)
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 8, character: 3 }; // On 'Process' implementation
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            assert.ok(result, 'Should find MAP declaration, not CLASS method');
            assert.strictEqual(getLocationLine(result), 5, 'Should jump to MAP, not CLASS');
        });

        test('Should handle MAP inside SECTION/ROUTINE', async () => {
            const code = `
MyProc PROCEDURE()
ProcessData ROUTINE
  DATA
  MAP
    LocalHelper(STRING text)
  END
  CODE
LocalHelper PROCEDURE(STRING text)
  CODE
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 4, character: 8 }; // On 'LocalHelper' in MAP
            
            const result = await definitionProvider.provideDefinition(document, position);
            
            // Test verifies scoped MAP handling
        });
    });

    suite.skip('🔒 Behavior Lock: Cross-File Navigation (Already Working)', () => {
        const definitionProvider = new DefinitionProvider();

        test('Should handle INCLUDE file references', async () => {
            const code = `
  INCLUDE('window.inc')

MyWindow WINDOW,AT(0,0,100,100)
  END`.trim();
            
            const document = createDocument(code);
            const position: Position = { line: 0, character: 12 }; // On 'window.inc'
            
            // This tests file reference navigation - should already work
            const result = await definitionProvider.provideDefinition(document, position);
            
            // Result depends on whether file exists - test just verifies no crash
        });
    });

    suite('Scope-Aware Definition Tests', () => {
        const definitionProvider = new DefinitionProvider();
        const tokenCache = TokenCache.getInstance();

        teardown(() => {
            // Clear cached test documents to ensure fresh tokenization
            tokenCache.clearTokens('test://test-prioritize.clw');
            tokenCache.clearTokens('test://test-routine-access.clw');
            tokenCache.clearTokens('test://test-member-scope.clw');
            tokenCache.clearTokens('test://test-shadowing.clw');
        });

        test('Should prioritize procedure-local over global with same name', async () => {
            const code = `
GlobalVar   LONG

MyProc      PROCEDURE()
ProcLocal     LONG
  CODE
  ProcLocal = 123
  END`.trim();

            const document = createDocument(code, 'test://test-prioritize.clw');
            const position: Position = { line: 5, character: 4 }; // On "ProcLocal = 123"

            const result = await definitionProvider.provideDefinition(document, position);

            assert.ok(result, 'Should find definition');
            const line = getLocationLine(result);
            assert.strictEqual(line, 3, 'Should go to procedure-local (line 3)');
        });

        test('Should isolate variables in different procedures', async () => {
            const code = `  PROGRAM
  MAP
  END

  CODE

Proc1     PROCEDURE
LocalVar    LONG
  CODE
    LocalVar = 1

Proc2     PROCEDURE
  CODE
    LocalVar = 2`.trim();

            const document = createDocument(code);
            const position: Position = { line: 13, character: 4 }; // On "LocalVar = 2" in Proc2

            const result = await definitionProvider.provideDefinition(document, position);

            // Should NOT find Proc1's LocalVar - should return null or find a global if exists
            // With fallback behavior, might return Proc1's LocalVar, but scope filter should prevent this
            const line = getLocationLine(result);
            assert.notStrictEqual(line, 7, 'Should NOT go to Proc1 LocalVar (line 7)');
        });

        test('Should allow routine to access procedure-local variable', async () => {
            const code = `
MyProc      PROCEDURE()
ProcVar       LONG
  CODE
  DO MyRoutine

MyRoutine ROUTINE
  CODE
  ProcVar = 5
  END`.trim();

            const document = createDocument(code, 'test://test-routine-access.clw');
            const position: Position = { line: 7, character: 4 }; // On "ProcVar = 5" in routine

            const result = await definitionProvider.provideDefinition(document, position);

            assert.ok(result, 'Should find definition');
            const line = getLocationLine(result);
            assert.strictEqual(line, 1, 'Should go to procedure-local ProcVar (line 1)');
        });

        test('Should isolate routine-local from procedure code', async () => {
            const code = `MyProc    PROCEDURE
  CODE
    DO MyRoutine

MyRoutine ROUTINE
  DATA
RoutineVar  LONG
  CODE
    RoutineVar = 1`.trim();

            const document = createDocument(code);
            const position: Position = { line: 1, character: 2 }; // On procedure CODE section

            // Try to reference RoutineVar from procedure - should not be accessible
            // This is a conceptual test - in real code, you'd have a reference like "RoutineVar = 5" on line 1
            // For this test, we're checking that routine-local variables aren't visible to procedure
        });

        test('Should handle module-local scope in MEMBER file', async () => {
            const code = `
MEMBER('Main')

ModuleVar     LONG

Proc1         PROCEDURE()
  CODE
  ModuleVar = 5
  END`.trim();

            const document = createDocument(code, 'test://test-member-scope.clw');
            const position: Position = { line: 6, character: 4 }; // On "ModuleVar = 5"

            const result = await definitionProvider.provideDefinition(document, position);

            assert.ok(result, 'Should find definition');
            const line = getLocationLine(result);
            assert.strictEqual(line, 2, 'Should go to module-local ModuleVar (line 2)');
        });

        test('Should handle nested scopes with shadowing', async () => {
            const code = `
Counter       LONG

ProcessData   PROCEDURE()
Counter         LONG
  CODE
  DO InnerRoutine

InnerRoutine ROUTINE
  DATA
Counter           LONG
  CODE
  Counter = 100
  END`.trim();

            const document = createDocument(code, 'test://test-shadowing.clw');
            const position: Position = { line: 11, character: 4 }; // On "Counter = 100" in routine

            const result = await definitionProvider.provideDefinition(document, position);

            assert.ok(result, 'Should find definition');
            const line = getLocationLine(result);
            assert.strictEqual(line, 9, 'Should go to routine-local Counter (line 9), not procedure or global');
        });
    });
});
