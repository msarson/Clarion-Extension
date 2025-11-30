import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Test-Driven Development for Clarion Diagnostic Provider
 * 
 * These tests are written FIRST, before implementation.
 * They define the expected behavior for unterminated structure detection.
 * 
 * Based on: docs/CLARION_LANGUAGE_REFERENCE.md
 */

/**
 * Helper function to create a TextDocument from code string
 */
function createDocument(code: string): TextDocument {
    return TextDocument.create(
        'file:///test.clw',
        'clarion',
        1,
        code
    );
}

suite('DiagnosticProvider - TDD Tests', () => {

    suite('Unterminated IF Statements', () => {
        
        test('Should detect IF without any terminator', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    y = 1
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('IF'), 'Message should mention IF');
            assert.ok(diagnostics[0].message.toLowerCase().includes('unterminated') || 
                     diagnostics[0].message.toLowerCase().includes('not terminated'), 
                     'Message should indicate unterminated structure');
        });

        test('Should NOT flag IF with dot terminator', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    y = 1
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should NOT flag IF with END terminator', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    y = 1
  END
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should NOT flag single-line IF with dot', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN y = 1.
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should detect unterminated IF before RETURN', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    MESSAGE('Test')
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.strictEqual(diagnostics[0].range.start.line, 3, 'Should point to IF line');
        });
    });

    suite('IF/ELSIF/ELSE Structure', () => {
        
        test('Should NOT flag IF/ELSIF/ELSE with single terminator', () => {
            const code = `TestProc PROCEDURE()
x LONG
result LONG
  CODE
  IF x < 0 THEN
    result = -1
  ELSIF x = 0 THEN
    result = 0
  ELSE
    result = 1
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should detect unterminated IF/ELSIF/ELSE', () => {
            const code = `TestProc PROCEDURE()
x LONG
result LONG
  CODE
  IF x < 0 THEN
    result = -1
  ELSIF x = 0 THEN
    result = 0
  ELSE
    result = 1
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic for IF');
        });
    });

    suite('Unterminated LOOP Statements', () => {
        
        test('Should detect LOOP without terminator', () => {
            const code = `TestProc PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
    IF i > 5 THEN BREAK.
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('LOOP'), 'Message should mention LOOP');
        });

        test('Should NOT flag LOOP with dot terminator', () => {
            const code = `TestProc PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
    IF i > 5 THEN BREAK.
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should NOT flag LOOP with END terminator', () => {
            const code = `TestProc PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
    IF i > 5 THEN BREAK.
  END
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });
    });

    suite('Unterminated CASE Statements', () => {
        
        test('Should detect CASE without terminator', () => {
            const code = `TestProc PROCEDURE()
choice LONG
result LONG
  CODE
  CASE choice
  OF 1
    result = 10
  OF 2
    result = 20
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('CASE'), 'Message should mention CASE');
        });

        test('Should NOT flag CASE with dot terminator', () => {
            const code = `TestProc PROCEDURE()
choice LONG
result LONG
  CODE
  CASE choice
  OF 1
    result = 10
  OF 2
    result = 20
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should NOT flag CASE with END terminator', () => {
            const code = `TestProc PROCEDURE()
choice LONG
result LONG
  CODE
  CASE choice
  OF 1
    result = 10
  OF 2
    result = 20
  END
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });
    });

    suite('Unterminated Data Structures', () => {
        
        test('Should detect unterminated GROUP', () => {
            const code = `TestProc PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('GROUP'), 'Message should mention GROUP');
        });

        test('Should NOT flag GROUP with END terminator', () => {
            const code = `TestProc PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
  END
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should NOT flag GROUP with dot terminator', () => {
            const code = `TestProc PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
  .
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should detect unterminated QUEUE', () => {
            const code = `TestProc PROCEDURE()
MyQueue QUEUE
Field1 LONG
Field2 STRING(20)
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('QUEUE'), 'Message should mention QUEUE');
        });

        test('Should detect unterminated RECORD', () => {
            const code = `TestProc PROCEDURE()
MyRecord RECORD
Field1 LONG
Field2 STRING(20)
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('RECORD'), 'Message should mention RECORD');
        });
    });

    suite('Nested Structures', () => {
        
        test('Should detect unterminated inner IF in nested structure', () => {
            const code = `TestProc PROCEDURE()
x LONG
y LONG
  CODE
  IF x > 0 THEN
    IF y > 0 THEN
      MESSAGE('Positive')
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic for inner IF');
        });

        test('Should NOT flag properly nested structures', () => {
            const code = `TestProc PROCEDURE()
x LONG
y LONG
  CODE
  IF x > 0 THEN
    IF y > 0 THEN
      MESSAGE('Positive')
    .
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should detect unterminated LOOP inside IF', () => {
            const code = `TestProc PROCEDURE()
x LONG
i LONG
  CODE
  IF x > 0 THEN
    LOOP
      i += 1
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic for LOOP');
        });
    });

    suite('Structures That Should NOT Require Terminators', () => {
        
        test('Should NOT flag PROCEDURE without END', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  x = 1
  RETURN

AnotherProc PROCEDURE()
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Procedures do not need END');
        });

        test('Should NOT flag ROUTINE without END', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  DO MyRoutine
  RETURN
  
MyRoutine ROUTINE
  x += 1

AnotherRoutine ROUTINE
  x += 2`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Routines do not need END');
        });

        test('Should NOT flag ELSIF without separate terminator', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x < 0 THEN
    MESSAGE('Negative')
  ELSIF x = 0 THEN
    MESSAGE('Zero')
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'ELSIF does not need separate terminator');
        });
    });

    suite('Multiple Errors', () => {
        
        test('Should detect multiple unterminated structures', () => {
            const code = `TestProc PROCEDURE()
x LONG
MyGroup GROUP
Field1 LONG
  CODE
  IF x > 0 THEN
    LOOP
      x += 1
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.ok(diagnostics.length >= 2, 'Should have at least 2 diagnostics (GROUP, IF/LOOP)');
        });

        test('Should detect all errors in complex nested code', () => {
            const code = `TestProc PROCEDURE()
MyGroup GROUP
Field1 LONG
x LONG
  CODE
  IF x > 0 THEN
    CASE x
    OF 1
      MESSAGE('One')
    LOOP
      x += 1
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            // Should detect: GROUP, IF, CASE, LOOP (4 errors)
            assert.ok(diagnostics.length >= 3, 'Should detect multiple errors');
        });
    });

    suite('Edge Cases', () => {
        
        test('Should handle empty procedure', () => {
            const code = `TestProc PROCEDURE()
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Empty procedure should not error');
        });

        test('Should handle procedure with only data declarations', () => {
            const code = `TestProc PROCEDURE()
x LONG
y LONG
z LONG
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Data-only procedure should not error');
        });

        test('Should handle IF at end of file', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    y = 1`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should detect unterminated IF at EOF');
        });
    });

    suite('Real-World Examples', () => {
        
        test('Should NOT flag StringTheory method with nested IF/ELSE', () => {
            const code = `StringTheory._EqualsUnicode        Procedure(*String otherValue, Long pOptions = st:UnicodeCompare)
str StringTheory
  code
  if band(pOptions,st:Clip)
    str.SetValue(otherValue,st:clip)
    return self._EqualsUnicode(str,pOptions-st:clip-st:UnicodeCompare)
  else
    str.SetValue(otherValue)
    return self._EqualsUnicode(str,pOptions-st:UnicodeCompare)
  end`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics for valid IF/ELSE with END');
        });
    });
});
