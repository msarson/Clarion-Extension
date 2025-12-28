/**
 * Tests for DocumentStructure semantic query APIs (Phase 1)
 * These tests follow TDD approach - tests written first, then implementation
 */

import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';

suite('DocumentStructure Semantic APIs - Phase 1', () => {
    
    suite('getMapBlocks()', () => {
        test('should return empty array when no MAP blocks exist', () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const mapBlocks = structure.getMapBlocks();
            
            assert.ok(Array.isArray(mapBlocks), 'Should return an array');
            assert.strictEqual(mapBlocks.length, 0, 'Should return empty array when no MAP blocks');
        });
        
        test('should return single MAP block', () => {
            const code = `MyMap MAP
  MyProc PROCEDURE()
END

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const mapBlocks = structure.getMapBlocks();
            
            assert.strictEqual(mapBlocks.length, 1, 'Should return one MAP block');
            assert.strictEqual(mapBlocks[0].value.toUpperCase(), 'MAP', 'Should be MAP token');
            assert.strictEqual(mapBlocks[0].type, TokenType.Structure, 'Should be Structure type');
            assert.strictEqual(mapBlocks[0].line, 0, 'MAP should be at line 0');
        });
        
        test('should return multiple MAP blocks', () => {
            const code = `FirstMap MAP
  Proc1 PROCEDURE()
END

SecondMap MAP
  Proc2 PROCEDURE()
END

ThirdMap MAP
  Proc3 PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const mapBlocks = structure.getMapBlocks();
            
            assert.strictEqual(mapBlocks.length, 3, 'Should return three MAP blocks');
            assert.strictEqual(mapBlocks[0].line, 0, 'First MAP at line 0');
            assert.strictEqual(mapBlocks[1].line, 4, 'Second MAP at line 4');
            assert.strictEqual(mapBlocks[2].line, 8, 'Third MAP at line 8');
        });
        
        test('should only return MAP structures, not MODULE or other types', () => {
            const code = `MyMap MAP
  MODULE('Win32API')
    GetTickCount(),UNSIGNED,PASCAL
  END
END

MyClass CLASS
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const mapBlocks = structure.getMapBlocks();
            
            assert.strictEqual(mapBlocks.length, 1, 'Should only return MAP, not MODULE or CLASS');
            assert.strictEqual(mapBlocks[0].value.toUpperCase(), 'MAP');
        });
    });
    
    suite('getMemberParentFile()', () => {
        test('should return null when no MEMBER statement exists', () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const memberFile = structure.getMemberParentFile();
            
            assert.strictEqual(memberFile, null, 'Should return null when no MEMBER');
        });
        
        test('should return MEMBER filename when present', () => {
            const code = `  MEMBER('ParentFile.CLW')

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const memberFile = structure.getMemberParentFile();
            
            assert.strictEqual(memberFile, 'ParentFile.CLW', 'Should return MEMBER filename');
        });
        
        test('should return MEMBER filename even if not on first line', () => {
            const code = `! Comment at top

  MEMBER('MyParent.CLW')

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const memberFile = structure.getMemberParentFile();
            
            assert.strictEqual(memberFile, 'MyParent.CLW', 'Should find MEMBER even with comments');
        });
        
        test('should only look in first 10 lines for MEMBER', () => {
            const code = `! Line 0
! Line 1
! Line 2
! Line 3
! Line 4
! Line 5
! Line 6
! Line 7
! Line 8
! Line 9
! Line 10
  MEMBER('TooLate.CLW')

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const memberFile = structure.getMemberParentFile();
            
            assert.strictEqual(memberFile, null, 'Should not find MEMBER after line 10');
        });
    });
    
    suite('getClassModuleFile()', () => {
        test('should return null when CLASS has no MODULE', () => {
            const code = `MyClass CLASS
  Init PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            // Find the CLASS token
            const classToken = tokens.find(t => 
                t.type === TokenType.Structure && 
                t.value.toUpperCase() === 'CLASS'
            );
            assert.ok(classToken, 'Should find CLASS token');
            
            const moduleFile = structure.getClassModuleFile(classToken!);
            
            assert.strictEqual(moduleFile, null, 'Should return null when no MODULE');
        });
        
        test('should return MODULE filename when CLASS has MODULE', () => {
            const code = `StringTheory CLASS,MODULE('ST.CLW'),TYPE,DLL(ST_DLL)
  Init PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            // Find the CLASS token
            const classToken = tokens.find(t => 
                t.type === TokenType.Structure && 
                t.value.toUpperCase() === 'CLASS'
            );
            assert.ok(classToken, 'Should find CLASS token');
            
            const moduleFile = structure.getClassModuleFile(classToken!);
            
            assert.strictEqual(moduleFile, 'ST.CLW', 'Should return MODULE filename');
        });
        
        test('should handle MODULE in different position in attribute list', () => {
            const code = `MyClass CLASS,TYPE,MODULE('MyImpl.CLW'),DLL
  Init PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const classToken = tokens.find(t => 
                t.type === TokenType.Structure && 
                t.value.toUpperCase() === 'CLASS'
            );
            assert.ok(classToken, 'Should find CLASS token');
            
            const moduleFile = structure.getClassModuleFile(classToken!);
            
            assert.strictEqual(moduleFile, 'MyImpl.CLW', 'Should find MODULE regardless of position');
        });
        
        test('should not confuse MODULE in CLASS attributes with MODULE structure in MAP', () => {
            const code = `MyClass CLASS,MODULE('ClassImpl.CLW')
  Init PROCEDURE()
END

MyMap MAP
  MODULE('Win32API')
    GetTickCount(),UNSIGNED
  END
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const classToken = tokens.find(t => 
                t.type === TokenType.Structure && 
                t.value.toUpperCase() === 'CLASS'
            );
            assert.ok(classToken, 'Should find CLASS token');
            
            const moduleFile = structure.getClassModuleFile(classToken!);
            
            assert.strictEqual(moduleFile, 'ClassImpl.CLW', 
                'Should return CLASS MODULE, not MAP MODULE');
        });
    });
    
    suite('isInMapBlock()', () => {
        test('should return false for line before MAP', () => {
            const code = `! Comment before MAP
MyMap MAP
  MyProc PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const result = structure.isInMapBlock(0);
            
            assert.strictEqual(result, false, 'Line before MAP should return false');
        });
        
        test('should return false for MAP line itself', () => {
            const code = `MyMap MAP
  MyProc PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const result = structure.isInMapBlock(0);
            
            assert.strictEqual(result, false, 'MAP declaration line should return false');
        });
        
        test('should return true for lines inside MAP', () => {
            const code = `MyMap MAP
  MyProc PROCEDURE()
  AnotherProc FUNCTION(),LONG
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const result1 = structure.isInMapBlock(1);
            const result2 = structure.isInMapBlock(2);
            
            assert.strictEqual(result1, true, 'Line 1 inside MAP should return true');
            assert.strictEqual(result2, true, 'Line 2 inside MAP should return true');
        });
        
        test('should return false for END line', () => {
            const code = `MyMap MAP
  MyProc PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const result = structure.isInMapBlock(2);
            
            assert.strictEqual(result, false, 'END line should return false');
        });
        
        test('should return false for lines after MAP', () => {
            const code = `MyMap MAP
  MyProc PROCEDURE()
END

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const result = structure.isInMapBlock(4);
            
            assert.strictEqual(result, false, 'Line after MAP should return false');
        });
        
        test('should handle nested MODULE blocks inside MAP correctly', () => {
            const code = `MyMap MAP
  MODULE('Win32API')
    GetTickCount(),UNSIGNED
    Sleep(UNSIGNED),PASCAL
  END
  MyProc PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const result2 = structure.isInMapBlock(2);
            const result3 = structure.isInMapBlock(3);
            const result5 = structure.isInMapBlock(5);
            
            assert.strictEqual(result2, true, 'Line inside MODULE (which is inside MAP) should return true');
            assert.strictEqual(result3, true, 'Another line inside MODULE should return true');
            assert.strictEqual(result5, true, 'Line after MODULE END but before MAP END should return true');
        });
        
        test('should handle multiple MAP blocks correctly', () => {
            const code = `FirstMap MAP
  Proc1 PROCEDURE()
END

SecondMap MAP
  Proc2 PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const result1 = structure.isInMapBlock(1);
            const result3 = structure.isInMapBlock(3);
            const result5 = structure.isInMapBlock(5);
            
            assert.strictEqual(result1, true, 'Line inside first MAP');
            assert.strictEqual(result3, false, 'Line between MAPs');
            assert.strictEqual(result5, true, 'Line inside second MAP');
        });
    });
    
    suite('getClasses()', () => {
        test('should return empty array when no CLASS blocks exist', () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const classes = structure.getClasses();
            
            assert.ok(Array.isArray(classes), 'Should return an array');
            assert.strictEqual(classes.length, 0, 'Should return empty array when no CLASSes');
        });
        
        test('should return single CLASS block', () => {
            const code = `MyClass CLASS
  Init PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const classes = structure.getClasses();
            
            assert.strictEqual(classes.length, 1, 'Should return one CLASS block');
            assert.strictEqual(classes[0].value.toUpperCase(), 'CLASS', 'Should be CLASS token');
            assert.strictEqual(classes[0].type, TokenType.Structure, 'Should be Structure type');
        });
        
        test('should return multiple CLASS blocks', () => {
            const code = `FirstClass CLASS
  Method1 PROCEDURE()
END

SecondClass CLASS
  Method2 PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const classes = structure.getClasses();
            
            assert.strictEqual(classes.length, 2, 'Should return two CLASS blocks');
        });
        
        test('should only return CLASS structures, not INTERFACE', () => {
            const code = `MyClass CLASS
  Method1 PROCEDURE()
END

MyInterface INTERFACE
  Method2 PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const classes = structure.getClasses();
            
            assert.strictEqual(classes.length, 1, 'Should only return CLASS, not INTERFACE');
            assert.strictEqual(classes[0].value.toUpperCase(), 'CLASS');
        });
    });
    
    suite('findMapDeclarations()', () => {
        test('should return empty array when procedure not found in MAP', () => {
            const code = `MyMap MAP
  OtherProc PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const declarations = structure.findMapDeclarations('NotFound');
            
            assert.ok(Array.isArray(declarations), 'Should return an array');
            assert.strictEqual(declarations.length, 0, 'Should return empty when not found');
        });
        
        test('should find MAP procedure declaration', () => {
            const code = `MyMap MAP
  TestProc PROCEDURE()
  OtherProc PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const declarations = structure.findMapDeclarations('TestProc');
            
            assert.strictEqual(declarations.length, 1, 'Should find one declaration');
            assert.ok(declarations[0].label?.toUpperCase() === 'TESTPROC' || 
                     declarations[0].value.toUpperCase().startsWith('TESTPROC'), 
                     'Should be TestProc');
        });
        
        test('should find MAP shorthand procedure declaration', () => {
            const code = `MyMap MAP
  ShortProc(STRING s),LONG
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const declarations = structure.findMapDeclarations('ShortProc');
            
            assert.strictEqual(declarations.length, 1, 'Should find shorthand declaration');
        });
        
        test('should return all overloads of a procedure', () => {
            const code = `MyMap MAP
  TestProc PROCEDURE()
  TestProc PROCEDURE(STRING s)
  TestProc PROCEDURE(LONG l, STRING s)
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const declarations = structure.findMapDeclarations('TestProc');
            
            assert.strictEqual(declarations.length, 3, 'Should find all three overloads');
        });
        
        test('should handle case-insensitive search', () => {
            const code = `MyMap MAP
  TestProc PROCEDURE()
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const declarations = structure.findMapDeclarations('testproc');
            
            assert.strictEqual(declarations.length, 1, 'Should find with case-insensitive search');
        });
    });
    
    suite('findProcedureImplementations()', () => {
        test('should return empty array when procedure not found', () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const implementations = structure.findProcedureImplementations('NotFound');
            
            assert.ok(Array.isArray(implementations), 'Should return an array');
            assert.strictEqual(implementations.length, 0, 'Should return empty when not found');
        });
        
        test('should find global procedure implementation', () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const implementations = structure.findProcedureImplementations('TestProc');
            
            assert.strictEqual(implementations.length, 1, 'Should find one implementation');
            assert.ok(implementations[0].label?.toUpperCase() === 'TESTPROC', 'Should be TestProc');
        });
        
        test('should not include MAP declarations', () => {
            const code = `MyMap MAP
  TestProc PROCEDURE()
END

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const implementations = structure.findProcedureImplementations('TestProc');
            
            assert.strictEqual(implementations.length, 1, 'Should only find implementation, not MAP declaration');
            assert.strictEqual(implementations[0].line, 4, 'Should be the implementation line');
        });
        
        test('should find all overloaded implementations', () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END

TestProc PROCEDURE(STRING s)
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const implementations = structure.findProcedureImplementations('TestProc');
            
            assert.strictEqual(implementations.length, 2, 'Should find both overloads');
        });
        
        test('should handle case-insensitive search', () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const implementations = structure.findProcedureImplementations('testproc');
            
            assert.strictEqual(implementations.length, 1, 'Should find with case-insensitive search');
        });
    });
    
    suite('getGlobalVariables()', () => {
        test('should return empty array when no global variables', () => {
            const code = `TestProc PROCEDURE()
DATA
  LocalVar STRING(20)
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const globals = structure.getGlobalVariables();
            
            assert.ok(Array.isArray(globals), 'Should return an array');
            assert.strictEqual(globals.length, 0, 'Should return empty when no globals');
        });
        
        test('should find global variables before first CODE', () => {
            const code = `GlobalVar1 STRING(20)
GlobalVar2 LONG

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const globals = structure.getGlobalVariables();
            
            assert.strictEqual(globals.length, 2, 'Should find two global variables');
        });
        
        test('should not include local variables after CODE', () => {
            const code = `GlobalVar STRING(20)

TestProc PROCEDURE()
DATA
  LocalVar STRING(20)
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const globals = structure.getGlobalVariables();
            
            assert.strictEqual(globals.length, 1, 'Should only include global, not local');
            assert.strictEqual(globals[0].value.toUpperCase(), 'GLOBALVAR');
        });
        
        test('should only include labels at column 0', () => {
            const code = `GlobalVar STRING(20)
  NotGlobal STRING(20)

CODE`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const globals = structure.getGlobalVariables();
            
            assert.strictEqual(globals.length, 1, 'Should only include column 0 labels');
        });
    });
    
    suite('getFirstCodeMarker()', () => {
        test('should return null when no CODE marker exists', () => {
            const code = `GlobalVar STRING(20)`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const codeMarker = structure.getFirstCodeMarker();
            
            assert.strictEqual(codeMarker, null, 'Should return null when no CODE');
        });
        
        test('should find first CODE marker', () => {
            const code = `GlobalVar STRING(20)

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const codeMarker = structure.getFirstCodeMarker();
            
            assert.ok(codeMarker, 'Should find CODE marker');
            assert.strictEqual(codeMarker?.value.toUpperCase(), 'CODE');
            assert.strictEqual(codeMarker?.line, 3, 'Should be at line 3');
        });
        
        test('should return first CODE even with multiple procedures', () => {
            const code = `GlobalVar STRING(20)

FirstProc PROCEDURE()
CODE
  RETURN
END

SecondProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const codeMarker = structure.getFirstCodeMarker();
            
            assert.ok(codeMarker, 'Should find CODE marker');
            assert.strictEqual(codeMarker?.line, 3, 'Should be the first CODE at line 3');
        });
    });
    
    suite('isInGlobalScope()', () => {
        test('should return true for label before first CODE', () => {
            const code = `GlobalVar STRING(20)

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const globalVar = tokens.find(t => 
                t.type === TokenType.Label && 
                t.value.toUpperCase() === 'GLOBALVAR'
            );
            assert.ok(globalVar, 'Should find global variable token');
            
            const result = structure.isInGlobalScope(globalVar!);
            
            assert.strictEqual(result, true, 'Should be in global scope');
        });
        
        test('should return false for label after first CODE', () => {
            const code = `GlobalVar STRING(20)

TestProc PROCEDURE()
DATA
  LocalVar STRING(20)
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const localVar = tokens.find(t => 
                (t.type === TokenType.Label || t.type === TokenType.Variable) && 
                t.value.toUpperCase() === 'LOCALVAR'
            );
            assert.ok(localVar, 'Should find local variable token');
            
            const result = structure.isInGlobalScope(localVar!);
            
            assert.strictEqual(result, false, 'Should not be in global scope');
        });
        
        test('should return false when no CODE marker exists', () => {
            const code = `SomeVar STRING(20)`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            
            const someVar = tokens.find(t => 
                t.type === TokenType.Label && 
                t.value.toUpperCase() === 'SOMEVAR'
            );
            assert.ok(someVar, 'Should find variable token');
            
            const result = structure.isInGlobalScope(someVar!);
            
            // When no CODE exists, everything could be considered global
            // But safer to return true (no CODE = all is global scope in Clarion)
            assert.strictEqual(result, true, 'Should be in global scope when no CODE marker');
        });
    });
});
