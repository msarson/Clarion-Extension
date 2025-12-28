import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';

suite('MapProcedureResolver - DocumentStructure-based Tests', () => {
    
    function tokenizeAndBuildStructure(code: string) {
        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();
        return tokens;
    }
    
    function createDocument(code: string): TextDocument {
        return TextDocument.create('test://test.clw', 'clarion', 1, code);
    }

    suite('Forward Navigation: MAP Declaration → PROCEDURE Implementation', () => {
        
        test('Should find implementation for simple MAP procedure', async () => {
            const code = `  MAP
    ProcessOrder(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            // Test from MAP declaration line (line 1, "ProcessOrder")
            const position: Position = { line: 1, character: 6 };
            const result = await resolver.findProcedureImplementation('ProcessOrder', tokens, document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to line 4 (PROCEDURE)');
        });

        test('Should find implementation for MAP procedure with PROCEDURE keyword', async () => {
            const code = `  MAP
    ProcessOrder PROCEDURE(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const position: Position = { line: 1, character: 6 };
            const result = await resolver.findProcedureImplementation('ProcessOrder', tokens, document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to implementation');
        });

        test('Should find implementation in multi-parameter procedure', async () => {
            const code = `  MAP
    SaveRecord(STRING fileName, LONG recordId, *STRING result)
  END

SaveRecord PROCEDURE(STRING fileName, LONG recordId, *STRING result)
  CODE
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const position: Position = { line: 1, character: 6 };
            const result = await resolver.findProcedureImplementation('SaveRecord', tokens, document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to implementation');
        });

        test('Should handle multiple MAP blocks correctly', async () => {
            const code = `  MAP
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
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            // Test second MAP block
            const position: Position = { line: 5, character: 6 };
            const result = await resolver.findProcedureImplementation('SecondProc', tokens, document, position);
            
            assert.ok(result, 'Should find SecondProc implementation');
            assert.strictEqual(result!.range.start.line, 12, 'Should jump to SecondProc');
        });

        test('Should handle MAP procedure with return type', async () => {
            const code = `  MAP
    GetValue(),LONG
  END

GetValue PROCEDURE(),LONG
  CODE
  RETURN 42
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const position: Position = { line: 1, character: 6 };
            const result = await resolver.findProcedureImplementation('GetValue', tokens, document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to implementation');
        });

        test('Should return null when not inside MAP block', async () => {
            const code = `ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            // Position outside MAP block
            const position: Position = { line: 0, character: 6 };
            const result = await resolver.findProcedureImplementation('ProcessOrder', tokens, document, position);
            
            assert.strictEqual(result, null, 'Should return null when not in MAP');
        });
    });

    suite('Reverse Navigation: PROCEDURE Implementation → MAP Declaration', () => {
        
        test('Should find MAP declaration from procedure implementation', async () => {
            const code = `  MAP
    ProcessOrder(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const result = resolver.findMapDeclaration('ProcessOrder', tokens, document);
            
            assert.ok(result, 'Should find MAP declaration');
            assert.strictEqual(result!.range.start.line, 1, 'Should jump to MAP line');
        });

        test('Should find MAP declaration with PROCEDURE keyword', async () => {
            const code = `  MAP
    ProcessOrder PROCEDURE(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const result = resolver.findMapDeclaration('ProcessOrder', tokens, document);
            
            assert.ok(result, 'Should find MAP declaration');
            assert.strictEqual(result!.range.start.line, 1, 'Should jump to MAP line');
        });

        test('Should handle procedure with return type', async () => {
            const code = `  MAP
    GetValue(),LONG
  END

GetValue PROCEDURE(),LONG
  CODE
  RETURN 42
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const result = resolver.findMapDeclaration('GetValue', tokens, document);
            
            assert.ok(result, 'Should find MAP declaration');
            assert.strictEqual(result!.range.start.line, 1, 'Should jump to MAP line');
        });

        test('Should return null when no MAP declaration exists', async () => {
            const code = `ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const result = resolver.findMapDeclaration('ProcessOrder', tokens, document);
            
            assert.strictEqual(result, null, 'Should return null when no MAP declaration');
        });

        test('Should handle MODULE inside MAP', async () => {
            const code = `  MAP
    MODULE('KERNEL32')
      GetTickCount(),ULONG
    END
    HelperProc()
  END

HelperProc PROCEDURE()
  CODE
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const result = resolver.findMapDeclaration('HelperProc', tokens, document);
            
            assert.ok(result, 'Should find MAP declaration outside MODULE');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to HelperProc in MAP');
        });
    });

    suite('Overload Resolution', () => {
        
        test('Should resolve overloaded MAP procedure by parameter types (STRING, STRING vs LONG)', async () => {
            const code = `  MAP
    AtSortReport(STRING StartConfigGrp, STRING StartReRunGrp)
    AtSortReport(LONG orderId)
  END

AtSortReport PROCEDURE(STRING StartConfigGrp, STRING StartReRunGrp)
  CODE
  RETURN

AtSortReport PROCEDURE(LONG orderId)
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            // From implementation with STRING, STRING - should match line 1
            const implSignature1 = 'AtSortReport PROCEDURE(STRING StartConfigGrp, STRING StartReRunGrp)';
            const result1 = resolver.findMapDeclaration('AtSortReport', tokens, document, implSignature1);
            
            assert.ok(result1, 'Should find declaration for STRING, STRING overload');
            assert.strictEqual(result1!.range.start.line, 1, 'Should match STRING, STRING overload at line 1');
            
            // From implementation with LONG - should match line 2
            const implSignature2 = 'AtSortReport PROCEDURE(LONG orderId)';
            const result2 = resolver.findMapDeclaration('AtSortReport', tokens, document, implSignature2);
            
            assert.ok(result2, 'Should find declaration for LONG overload');
            assert.strictEqual(result2!.range.start.line, 2, 'Should match LONG overload at line 2');
        });

        test('Should resolve overloaded implementation from MAP declaration', async () => {
            const code = `  MAP
    ProcessOrder(LONG orderId)
    ProcessOrder(STRING orderCode, LONG customerId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END

ProcessOrder PROCEDURE(STRING orderCode, LONG customerId)
  CODE
  RETURN
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            // From MAP declaration with LONG - should match line 5
            const position1: Position = { line: 1, character: 6 };
            const declSignature1 = 'ProcessOrder(LONG orderId)';
            const result1 = await resolver.findProcedureImplementation('ProcessOrder', tokens, document, position1, declSignature1);
            
            assert.ok(result1, 'Should find implementation for LONG overload');
            assert.strictEqual(result1!.range.start.line, 5, 'Should match LONG implementation at line 5');
            
            // From MAP declaration with STRING, LONG - should match line 10
            const position2: Position = { line: 2, character: 6 };
            const declSignature2 = 'ProcessOrder(STRING orderCode, LONG customerId)';
            const result2 = await resolver.findProcedureImplementation('ProcessOrder', tokens, document, position2, declSignature2);
            
            assert.ok(result2, 'Should find implementation for STRING, LONG overload');
            assert.strictEqual(result2!.range.start.line, 10, 'Should match STRING, LONG implementation at line 10');
        });

        test('Should handle pointer types in overloads', async () => {
            const code = `  MAP
    UpdateRecord(*CustomerType cust)
    UpdateRecord(&CustomerType cust)
  END

UpdateRecord PROCEDURE(*CustomerType cust)
  CODE
  RETURN

UpdateRecord PROCEDURE(&CustomerType cust)
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            // Test pointer type
            const implSignature1 = 'UpdateRecord PROCEDURE(*CustomerType cust)';
            const result1 = resolver.findMapDeclaration('UpdateRecord', tokens, document, implSignature1);
            
            assert.ok(result1, 'Should find declaration for pointer type');
            assert.strictEqual(result1!.range.start.line, 1, 'Should match pointer type at line 1');
            
            // Test reference type
            const implSignature2 = 'UpdateRecord PROCEDURE(&CustomerType cust)';
            const result2 = resolver.findMapDeclaration('UpdateRecord', tokens, document, implSignature2);
            
            assert.ok(result2, 'Should find declaration for reference type');
            assert.strictEqual(result2!.range.start.line, 2, 'Should match reference type at line 2');
        });
    });

    suite('Edge Cases', () => {
        
        test('Should not confuse MAP procedure with CLASS method', async () => {
            const code = `MyClass CLASS
  Process PROCEDURE()
  END

  MAP
    Process(LONG id)
  END

Process PROCEDURE(LONG id)
  CODE
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            // Should find MAP declaration, not CLASS method
            const result = resolver.findMapDeclaration('Process', tokens, document);
            
            assert.ok(result, 'Should find MAP declaration');
            assert.strictEqual(result!.range.start.line, 5, 'Should jump to MAP, not CLASS');
        });

        test('Should handle indented PROCEDURE implementation', async () => {
            const code = `  MAP
    HelperProc(STRING text)
  END

  HelperProc PROCEDURE(STRING text)
    CODE
    END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            const result = resolver.findMapDeclaration('HelperProc', tokens, document);
            
            assert.ok(result, 'Should handle indented implementation');
            assert.strictEqual(result!.range.start.line, 1, 'Should jump to MAP');
        });
    });
});

