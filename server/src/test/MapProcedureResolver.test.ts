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
        
        test('Should find implementation for simple MAP procedure', () => {
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
            const result = resolver.findProcedureImplementation('ProcessOrder', tokens, document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to line 4 (PROCEDURE)');
        });

        test('Should find implementation for MAP procedure with PROCEDURE keyword', () => {
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
            const result = resolver.findProcedureImplementation('ProcessOrder', tokens, document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to implementation');
        });

        test('Should find implementation in multi-parameter procedure', () => {
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
            const result = resolver.findProcedureImplementation('SaveRecord', tokens, document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to implementation');
        });

        test('Should handle multiple MAP blocks correctly', () => {
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
            const result = resolver.findProcedureImplementation('SecondProc', tokens, document, position);
            
            assert.ok(result, 'Should find SecondProc implementation');
            assert.strictEqual(result!.range.start.line, 12, 'Should jump to SecondProc');
        });

        test('Should handle MAP procedure with return type', () => {
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
            const result = resolver.findProcedureImplementation('GetValue', tokens, document, position);
            
            assert.ok(result, 'Should find implementation');
            assert.strictEqual(result!.range.start.line, 4, 'Should jump to implementation');
        });

        test('Should return null when not inside MAP block', () => {
            const code = `ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END`;
            
            const document = createDocument(code);
            const tokens = tokenizeAndBuildStructure(code);
            const resolver = new MapProcedureResolver();
            
            // Position outside MAP block
            const position: Position = { line: 0, character: 6 };
            const result = resolver.findProcedureImplementation('ProcessOrder', tokens, document, position);
            
            assert.strictEqual(result, null, 'Should return null when not in MAP');
        });
    });

    suite('Reverse Navigation: PROCEDURE Implementation → MAP Declaration', () => {
        
        test('Should find MAP declaration from procedure implementation', () => {
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

        test('Should find MAP declaration with PROCEDURE keyword', () => {
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

        test('Should handle procedure with return type', () => {
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

        test('Should return null when no MAP declaration exists', () => {
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

        test('Should handle MODULE inside MAP', () => {
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

    suite('Edge Cases', () => {
        
        test('Should not confuse MAP procedure with CLASS method', () => {
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

        test('Should handle indented PROCEDURE implementation', () => {
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
