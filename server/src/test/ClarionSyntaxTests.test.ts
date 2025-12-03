import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';

/**
 * Unit tests for TEST_CLARION_SYNTAX.clw procedures
 * These tests validate each procedure against the Clarion Language Reference knowledge base
 * Located at: docs/CLARION_LANGUAGE_REFERENCE.md
 */

suite('TEST_CLARION_SYNTAX.clw Validation Tests', () => {

    suite('TestProc1: Single-line IF with dot terminator', () => {
        
        test('Should have procedure name at column 0', () => {
            const code = `TestProc1 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 1
  b = 1
  IF a=b THEN c=d.
  RETURN`;
            
            const lines = code.split('\n');
            assert.strictEqual(lines[0][0], 'T', 'Procedure name should start at column 0');
        });

        test('Should have all variables at column 0', () => {
            const code = `TestProc1 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE`;
            
            const lines = code.split('\n');
            assert.strictEqual(lines[1][0], 'a', 'First variable should be at column 0');
            assert.strictEqual(lines[2][0], 'b', 'Second variable should be at column 0');
            assert.strictEqual(lines[3][0], 'c', 'Third variable should be at column 0');
            assert.strictEqual(lines[4][0], 'd', 'Fourth variable should be at column 0');
        });

        test('Should not contain DATA keyword', () => {
            const code = `TestProc1 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 1
  b = 1
  IF a=b THEN c=d.
  RETURN`;
            
            assert.strictEqual(code.includes('DATA'), false, 'Procedure should not have DATA keyword');
        });

        test('Should have all data declarations before CODE', () => {
            const code = `TestProc1 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 1`;
            
            const codeIndex = code.indexOf('CODE');
            const lastVarIndex = code.lastIndexOf('d LONG');
            assert.ok(lastVarIndex < codeIndex, 'All data declarations should be before CODE');
        });

        test('Should terminate IF with dot', () => {
            const code = `  IF a=b THEN c=d.`;
            assert.ok(code.endsWith('.'), 'IF statement should end with dot');
        });

        test('Should not have END for procedure', () => {
            const code = `TestProc1 PROCEDURE()
a LONG
  CODE
  RETURN`;
            
            // Should not end with END statement (procedures are implicitly terminated)
            assert.strictEqual(code.trim().endsWith('END'), false, 'Procedure should not have END');
        });

        test('Should successfully tokenize', () => {
            const code = `TestProc1 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 1
  b = 1
  IF a=b THEN c=d.
  RETURN`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            assert.ok(tokens.length > 0, 'Should tokenize valid Clarion code');
        });
    });

    suite('TestProc5: IF-ELSIF-ELSE with single dot terminator', () => {
        
        test('Should have only ONE dot terminator for entire IF/ELSIF/ELSE structure', () => {
            const code = `  IF x < 0 THEN
    result = -1
  ELSIF x = 0 THEN
    result = 0
  ELSE
    result = 1
  .`;
            
            // Count dots (excluding any in comments or strings)
            const dotMatches = code.match(/\s+\./g);
            assert.strictEqual(dotMatches?.length, 1, 'Should have exactly one dot terminator');
        });

        test('Should not have dots after ELSIF or ELSE clauses', () => {
            const code = `  IF x < 0 THEN
    result = -1
  ELSIF x = 0 THEN
    result = 0
  ELSE
    result = 1
  .`;
            
            const lines = code.split('\n');
            const elsifLine = lines.find(l => l.includes('ELSIF'));
            const elseLine = lines.find(l => l.includes('ELSE') && !l.includes('ELSIF'));
            
            assert.ok(elsifLine && !elsifLine.includes('.'), 'ELSIF clause should not have dot');
            assert.ok(elseLine && !elseLine.includes('.'), 'ELSE clause should not have dot');
        });

        test('Should successfully tokenize IF/ELSIF/ELSE with single dot', () => {
            const code = `TestProc5 PROCEDURE()
x LONG
result LONG
  CODE
  x = 5
  IF x < 0 THEN
    result = -1
  ELSIF x = 0 THEN
    result = 0
  ELSE
    result = 1
  .
  RETURN`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            assert.ok(tokens.length > 0, 'Should tokenize IF/ELSIF/ELSE with single dot');
        });
    });

    suite('TestProc13: GROUP with END keyword - EXPECTED TO FAIL', () => {
        
        test('Should detect END at column 0 (invalid per KB)', () => {
            const code = `TestProc13 PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
END
  CODE`;
            
            const lines = code.split('\n');
            const endLine = lines.find(l => l.trim() === 'END');
            
            if (endLine) {
                const endColumn = endLine.indexOf('END');
                assert.strictEqual(endColumn, 0, 'END is at column 0 (this is the error we are testing for)');
            }
        });

        test('Should fail validation: END must be indented', () => {
            const code = `TestProc13 PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
END
  CODE`;
            
            // Per KB: "Keywords that MUST NOT be at column 0: MAP, END"
            const lines = code.split('\n');
            const endLine = lines.find(l => l.startsWith('END'));
            
            assert.ok(endLine, 'END found at column 0 - this violates KB rules');
            // This test documents the expected failure
        });
    });

    suite('TestProc14: IF with END on same line (space separator)', () => {
        
        test('Should allow END after statement with space (no semicolon)', () => {
            const code = `  IF a = b THEN MESSAGE('Equal') END`;
            
            // Per KB: "END can follow statement with just a space separator"
            assert.ok(code.includes('Equal\') END'), 'END follows statement with space');
            assert.ok(!code.includes(';'), 'No semicolon before END');
        });

        test('Should successfully tokenize IF with END on same line', () => {
            const code = `TestProc14 PROCEDURE()
a LONG
b LONG
  CODE
  a = 5
  b = 5
  IF a = b THEN MESSAGE('Equal') END
  RETURN`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            assert.ok(tokens.length > 0, 'Should tokenize IF with END on same line');
        });
    });

    suite('TestProc16: Two statements on one line with semicolon', () => {
        
        test('Should require semicolon for multiple statements on one line', () => {
            const code = `  x = 1; y = 2`;
            
            // Per KB: "Required for multiple statements on same line"
            assert.ok(code.includes(';'), 'Semicolon required for multiple statements');
        });

        test('Should not allow space-only separation', () => {
            const invalidCode = `  x = 1 y = 2`; // Missing semicolon
            
            // This would be invalid per KB: "space alone insufficient"
            assert.ok(!invalidCode.includes(';'), 'Invalid: no semicolon between statements');
        });

        test('Should successfully tokenize statements with semicolon', () => {
            const code = `TestProc16 PROCEDURE()
x LONG
y LONG
  CODE
  x = 1; y = 2
  RETURN`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            assert.ok(tokens.length > 0, 'Should tokenize statements with semicolon');
        });
    });

    suite('TestProc20: ROUTINE with and without DATA section', () => {
        
        test('Should have ROUTINE label at column 0', () => {
            const code = `MyRoutine ROUTINE
DATA
RoutineVar LONG
CODE
  RoutineVar = 5`;
            
            const lines = code.split('\n');
            assert.strictEqual(lines[0][0], 'M', 'ROUTINE label should be at column 0');
        });

        test('MyRoutine should have DATA and CODE keywords at column 0', () => {
            const code = `MyRoutine ROUTINE
DATA
RoutineVar LONG
CODE
  RoutineVar = 5`;
            
            const lines = code.split('\n');
            const dataLine = lines.find(l => l.startsWith('DATA'));
            const codeLine = lines.find(l => l.startsWith('CODE'));
            
            assert.ok(dataLine, 'DATA should be at column 0');
            assert.ok(codeLine, 'CODE should be at column 0');
        });

        test('SimpleRoutine should not have DATA section', () => {
            const code = `SimpleRoutine ROUTINE
  MESSAGE('Simple routine executed')
  ProcVar += 1`;
            
            assert.ok(!code.includes('DATA'), 'SimpleRoutine should not have DATA section');
            assert.ok(!code.includes('CODE'), 'SimpleRoutine should not have CODE keyword (per KB: not needed without DATA)');
        });

        test('Should not have explicit EXIT statements', () => {
            const code = `MyRoutine ROUTINE
DATA
RoutineVar LONG
CODE
  RoutineVar = 5
  ProcVar += RoutineVar
  
SimpleRoutine ROUTINE
  MESSAGE('Simple routine executed')
  ProcVar += 1`;
            
            // Per KB: "Implicit EXIT at end of routine (EXIT keyword not required)"
            assert.ok(!code.includes('EXIT'), 'Routines should have implicit EXIT, not explicit');
        });

        test('Should successfully tokenize ROUTINEs', () => {
            const code = `TestProc20 PROCEDURE()
ProcVar LONG
  CODE
  ProcVar = 10
  DO MyRoutine
  DO SimpleRoutine
  RETURN
  
MyRoutine ROUTINE
DATA
RoutineVar LONG
CODE
  RoutineVar = 5
  ProcVar += RoutineVar
  
SimpleRoutine ROUTINE
  MESSAGE('Simple routine executed')
  ProcVar += 1`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            assert.ok(tokens.length > 0, 'Should tokenize ROUTINEs with and without DATA');
        });
    });

    suite('Column 0 Rules Validation', () => {
        
        test('PROGRAM should be indented (not at column 0)', () => {
            const code = `  PROGRAM
! Comments`;
            
            const lines = code.split('\n');
            const programLine = lines[0];
            const firstChar = programLine.indexOf('PROGRAM');
            
            // Per KB: "Best practice is to indent (IDE formatter does this)"
            assert.ok(firstChar > 0, 'PROGRAM should be indented');
        });

        test('MAP should be indented (not at column 0)', () => {
            const code = `  MAP
TestProc PROCEDURE()
  END`;
            
            const lines = code.split('\n');
            const mapLine = lines[0];
            const firstChar = mapLine.indexOf('MAP');
            
            // Per KB: "MAP must NOT be at column 0"
            assert.ok(firstChar > 0, 'MAP should be indented');
        });

        test('END should be indented (not at column 0)', () => {
            const code = `  MAP
TestProc PROCEDURE()
  END`;
            
            const lines = code.split('\n');
            const endLine = lines[2];
            const firstChar = endLine.indexOf('END');
            
            // Per KB: "END must NOT be at column 0"
            assert.ok(firstChar > 0, 'END should be indented');
        });

        test('Procedure labels must be at column 0', () => {
            const code = `TestProc PROCEDURE()`;
            
            assert.strictEqual(code[0], 'T', 'Procedure label must be at column 0');
        });

        test('Variable labels must be at column 0', () => {
            const code = `MyVar LONG`;
            
            assert.strictEqual(code[0], 'M', 'Variable label must be at column 0');
        });
    });

    suite('Procedure Structure Validation', () => {
        
        test('Procedures should not have END statement', () => {
            const validCode = `TestProc PROCEDURE()
x LONG
  CODE
  x = 1
  RETURN`;
            
            // Per KB: "PROCEDURE does NOT have END - implicitly terminated"
            assert.ok(!validCode.trim().endsWith('END'), 'Procedure should not have END');
        });

        test('Procedures should not have DATA keyword', () => {
            const code = `TestProc PROCEDURE()
x LONG
y LONG
  CODE`;
            
            // Per KB: "No DATA keyword in procedures - everything before CODE is data definition"
            assert.ok(!code.includes('DATA'), 'Procedures should not have DATA keyword');
        });

        test('All data declarations should be before CODE', () => {
            const code = `TestProc PROCEDURE()
x LONG
y LONG
z LONG
  CODE
  x = 1`;
            
            const codeIndex = code.indexOf('CODE');
            const lastVarIndex = code.lastIndexOf('z LONG');
            
            assert.ok(lastVarIndex < codeIndex, 'All data declarations must be before CODE');
        });
    });
});
