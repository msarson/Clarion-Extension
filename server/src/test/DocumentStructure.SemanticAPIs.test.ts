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

    // ─── Index-backed APIs (Gap A) ────────────────────────────────────────────

    suite('findMethodImplementations()', () => {
        test('should return empty array when method not found', () => {
            const code = `MyClass.DoStuff PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const results = structure.findMethodImplementations('MyClass.NotThere');

            assert.ok(Array.isArray(results));
            assert.strictEqual(results.length, 0);
        });

        test('should find a single method implementation by qualified name', () => {
            const code = `MyClass.DoStuff PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const results = structure.findMethodImplementations('MyClass.DoStuff');

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].subType, TokenType.MethodImplementation);
            assert.strictEqual(results[0].label?.toUpperCase(), 'MYCLASS.DOSTUFF');
        });

        test('should find all overloaded method implementations', () => {
            const code = `MyClass.DoStuff PROCEDURE()
CODE
  RETURN
END

MyClass.DoStuff PROCEDURE(STRING s)
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const results = structure.findMethodImplementations('MyClass.DoStuff');

            assert.strictEqual(results.length, 2, 'Should find both overloads');
            assert.ok(results.every(t => t.subType === TokenType.MethodImplementation));
        });

        test('should be case-insensitive', () => {
            const code = `MyClass.DoStuff PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const results = structure.findMethodImplementations('myclass.dostuff');

            assert.strictEqual(results.length, 1);
        });
    });

    suite('findRoutines()', () => {
        test('should return all routines when no name supplied', () => {
            const code = `TestProc PROCEDURE()
CODE
DoOne ROUTINE
  RETURN
DoTwo ROUTINE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const all = structure.findRoutines();

            assert.strictEqual(all.length, 2, 'Should find both routines');
            assert.ok(all.every(t => t.subType === TokenType.Routine));
            const names = all.map(t => t.label?.toUpperCase()).sort();
            assert.deepStrictEqual(names, ['DOONE', 'DOTWO']);
        });

        test('should return only matching routines when a name is supplied', () => {
            const code = `TestProc PROCEDURE()
CODE
DoOne ROUTINE
  RETURN
DoTwo ROUTINE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const matches = structure.findRoutines('DoOne');

            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0].label?.toUpperCase(), 'DOONE');
        });

        test('should be case-insensitive on the name lookup', () => {
            const code = `TestProc PROCEDURE()
CODE
DoOne ROUTINE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const matches = structure.findRoutines('doONE');

            assert.strictEqual(matches.length, 1);
        });

        test('should return an empty array when no routines exist', () => {
            const code = `TestProc PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            assert.strictEqual(structure.findRoutines().length, 0);
            assert.strictEqual(structure.findRoutines('AnyName').length, 0);
        });
    });

    suite('getAllProcedures()', () => {
        test('should return every indexed procedure regardless of subtype', () => {
            const code = `MyMap MAP
  DeclProc PROCEDURE()
END

GlobalProc PROCEDURE()
CODE
  RETURN
END

MyClass.MethodOne PROCEDURE()
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const all = structure.getAllProcedures();
            const labels = all.map(t => t.label?.toUpperCase()).sort();

            // Expect at least the global procedure, the class method, and the MAP-declared proc.
            assert.ok(labels.includes('GLOBALPROC'),     `Should include GlobalProc, got: ${labels.join(',')}`);
            assert.ok(labels.includes('MYCLASS.METHODONE'), `Should include MyClass.MethodOne, got: ${labels.join(',')}`);
            assert.ok(labels.includes('DECLPROC'),       `Should include DeclProc (MAP declaration), got: ${labels.join(',')}`);

            // Every entry should have a procedure-style subType.
            const procedureSubtypes = new Set([
                TokenType.GlobalProcedure,
                TokenType.MethodImplementation,
                TokenType.MapProcedure,
                TokenType.MethodDeclaration,
                TokenType.InterfaceMethod,
            ]);
            assert.ok(
                all.every(t => t.subType !== undefined && procedureSubtypes.has(t.subType)),
                'Every entry should have a procedure-style subType'
            );
        });

        test('should return empty array on a routine-only document', () => {
            const code = `TestProc PROCEDURE()
CODE
DoOne ROUTINE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const labels = structure.getAllProcedures().map(t => t.label?.toUpperCase());
            // Only TestProc itself should appear; the ROUTINE goes into routineIndex, not procedureIndex.
            assert.ok(labels.includes('TESTPROC'));
            assert.ok(!labels.includes('DOONE'), 'Routines must not leak into getAllProcedures()');
        });
    });

    // ─── isFileRecord marker (Gap M) ──────────────────────────────────────────

    suite('isFileRecord marker', () => {
        function findStructure(tokens: any[], value: string, line?: number) {
            return tokens.find(t =>
                t.type === TokenType.Structure &&
                t.value.toUpperCase() === value.toUpperCase() &&
                (line === undefined || t.line === line)
            );
        }

        test('sets isFileRecord on a RECORD that is the direct child of a FILE', () => {
            const code = `Names FILE,DRIVER('TopSpeed'),PRE(NAM)
PrimaryKey  KEY(NAM:Id)
Record      RECORD,PRE()
Id            LONG
Name          STRING(40)
            END
          END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const recordTok = findStructure(tokens, 'RECORD');
            assert.ok(recordTok, 'Test setup: should have parsed a RECORD structure');
            assert.strictEqual(recordTok.isFileRecord, true, 'RECORD inside FILE should be flagged');
        });

        test('does NOT set isFileRecord on a standalone RECORD declaration', () => {
            // Top-level RECORD (rare but legal) — no FILE parent.
            const code = `MyRec RECORD,PRE(MR)
Id     LONG
Name   STRING(20)
       END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const recordTok = findStructure(tokens, 'RECORD');
            assert.ok(recordTok, 'Test setup: should have parsed a RECORD structure');
            assert.notStrictEqual(recordTok.isFileRecord, true,
                'Standalone RECORD must not be flagged as FILE-owned');
        });

        test('does NOT set isFileRecord on a RECORD nested in a QUEUE', () => {
            const code = `MyQueue QUEUE,PRE(MQ)
Inner    RECORD,PRE()
Id         LONG
Name       STRING(20)
         END
       END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const recordTok = findStructure(tokens, 'RECORD');
            assert.ok(recordTok, 'Test setup: should have parsed a RECORD structure');
            assert.notStrictEqual(recordTok.isFileRecord, true,
                'RECORD inside QUEUE must not be flagged as FILE-owned');
        });

        test('getFileRecord(fileToken) returns the FILE\'s RECORD child', () => {
            const code = `Names FILE,DRIVER('TopSpeed'),PRE(NAM)
PrimaryKey  KEY(NAM:Id)
Record      RECORD,PRE()
Id            LONG
            END
          END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const fileTok = findStructure(tokens, 'FILE');
            assert.ok(fileTok, 'Test setup: should have parsed a FILE structure');

            const recordTok = structure.getFileRecord(fileTok);
            assert.ok(recordTok, 'getFileRecord should return the RECORD child');
            assert.strictEqual(recordTok!.value.toUpperCase(), 'RECORD');
            assert.strictEqual(recordTok!.isFileRecord, true);
        });

        test('getFileRecord returns undefined for a FILE with no RECORD child', () => {
            // Malformed: FILE missing its RECORD section entirely.
            const code = `BadFile FILE,DRIVER('TopSpeed')
        END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();

            const fileTok = findStructure(tokens, 'FILE');
            assert.ok(fileTok, 'Test setup: should have parsed a FILE structure');
            assert.strictEqual(structure.getFileRecord(fileTok), undefined);
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

    suite('getStructureContextAt()', () => {
        function build(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return structure;
        }

        test('returns empty chain at file scope (before any structure)', () => {
            const code = [
                'MyProg PROGRAM',                  // 0
                '',                                 // 1
                'TestProc PROCEDURE()',             // 2
                'CODE',                             // 3
                'END',                              // 4
            ].join('\n');
            const structure = build(code);
            const ctx = structure.getStructureContextAt(0);
            assert.strictEqual(ctx.chain.length, 0, 'PROGRAM line has empty chain');
            assert.strictEqual(ctx.innermost, null);
            assert.strictEqual(ctx.inMap, false);
            assert.strictEqual(ctx.inClass, false);
        });

        test('cursor inside MAP body sets inMap=true', () => {
            const code = [
                'MyMap MAP',                        // 0
                "  MODULE('foo.clw')",              // 1
                '    Foo PROCEDURE()',              // 2
                '  END',                            // 3
                'END',                              // 4
            ].join('\n');
            const structure = build(code);
            const ctx = structure.getStructureContextAt(2);
            assert.strictEqual(ctx.inMap, true, 'Inside MAP');
            assert.strictEqual(ctx.inModule, true, 'Inside MODULE');
            assert.strictEqual(ctx.chain[0].value.toUpperCase(), 'MODULE', 'Innermost is MODULE');
            assert.strictEqual(ctx.chain[1].value.toUpperCase(), 'MAP', 'Outer is MAP');
        });

        test('cursor on structure-opening line returns OUTER chain (not the just-opened structure)', () => {
            // The case Bob asked to pin down: cursor on the `MyClass CLASS` line
            // is NOT inside MyClass. The outer scope (here a procedure data section)
            // is what should be reported via `scope`.
            const code = [
                'ProcA PROCEDURE',                  // 0
                'MyClass CLASS,TYPE',               // 1 — opening line of CLASS
                'M       PROCEDURE',                // 2
                '        END',                      // 3
                'CODE',                             // 4
                '        END',                      // 5
            ].join('\n');
            const structure = build(code);
            const ctx = structure.getStructureContextAt(1);
            assert.strictEqual(ctx.inClass, false, 'Opening CLASS line is NOT inside the just-opened CLASS');
            assert.ok(ctx.scope, 'Outer scope should still be resolvable');
            assert.strictEqual(ctx.scope!.label, 'ProcA', 'Outer scope is the enclosing procedure');
        });

        test('cursor on END line is NOT inside the just-closed structure', () => {
            const code = [
                'MyMap MAP',                        // 0
                "  MODULE('foo.clw')",              // 1
                '    Foo PROCEDURE()',              // 2
                '  END',                            // 3 — END of MODULE
                'END',                              // 4 — END of MAP
            ].join('\n');
            const structure = build(code);

            const atModuleEnd = structure.getStructureContextAt(3);
            assert.strictEqual(atModuleEnd.inModule, false, 'MODULE END line is not inside MODULE');
            assert.strictEqual(atModuleEnd.inMap, true, 'But still inside outer MAP');

            const atMapEnd = structure.getStructureContextAt(4);
            assert.strictEqual(atMapEnd.inMap, false, 'MAP END line is not inside MAP');
            assert.strictEqual(atMapEnd.chain.length, 0, 'Chain is empty at MAP END');
        });

        test('chain orders innermost first when nested', () => {
            const code = [
                'OuterProc PROCEDURE',              // 0
                'MyClass CLASS',                    // 1
                'Method1 PROCEDURE',                // 2
                '        END',                      // 3
                '        END',                      // 4 — close CLASS
                'CODE',                             // 5
                '        END',                      // 6
            ].join('\n');
            const structure = build(code);
            // Line 2 — inside CLASS, inside the procedure's data section
            const ctx = structure.getStructureContextAt(2);
            assert.ok(ctx.chain.length >= 1, `Expected non-empty chain, got ${ctx.chain.length}`);
            assert.strictEqual(ctx.chain[0].value.toUpperCase(), 'CLASS', 'Innermost should be CLASS');
        });

        test('inWindow is true for both WINDOW and APPLICATION', () => {
            const winCode = [
                'TestProc PROCEDURE',               // 0
                "MyWin WINDOW('T'),AT(0,0,200,100)",// 1
                "         BUTTON('OK'),AT(10,10),USE(?Btn)", // 2
                '         END',                     // 3 — END of WINDOW
                'CODE',                             // 4
                'END',                              // 5
            ].join('\n');
            const appCode = winCode.replace('WINDOW(', 'APPLICATION(');
            assert.strictEqual(build(winCode).getStructureContextAt(2).inWindow, true);
            assert.strictEqual(build(appCode).getStructureContextAt(2).inWindow, true);
        });

        test('blank line walks back to find context', () => {
            const code = [
                'MyMap MAP',                        // 0
                '',                                 // 1 — blank inside MAP
                '  Foo PROCEDURE()',                // 2
                'END',                              // 3
            ].join('\n');
            const structure = build(code);
            const ctx = structure.getStructureContextAt(1);
            assert.strictEqual(ctx.inMap, true, 'Blank line inside MAP still resolves to inMap');
        });

        test('isInsideStructure(line, ...keywords) matches any of the keywords', () => {
            const code = [
                'MyMap MAP',                        // 0
                "  MODULE('foo.clw')",              // 1
                '    Foo PROCEDURE()',              // 2
                '  END',                            // 3
                'END',                              // 4
            ].join('\n');
            const structure = build(code);
            assert.strictEqual(structure.isInsideStructure(2, 'MAP'), true);
            assert.strictEqual(structure.isInsideStructure(2, 'MODULE'), true);
            assert.strictEqual(structure.isInsideStructure(2, 'CLASS'), false);
            assert.strictEqual(structure.isInsideStructure(2, 'CLASS', 'MODULE'), true);
            assert.strictEqual(structure.isInsideStructure(2), false, 'No keywords → false');
        });

        test('deprecated shims still return correct results (backwards compat)', () => {
            const code = [
                'MyMap MAP',                        // 0
                "  MODULE('foo.clw')",              // 1
                '    Foo PROCEDURE()',              // 2
                '  END',                            // 3
                'END',                              // 4
            ].join('\n');
            const structure = build(code);
            assert.strictEqual(structure.isInMapBlock(2), true, 'isInMapBlock shim');
            assert.strictEqual(structure.isInModuleBlock(2), true, 'isInModuleBlock shim');
            assert.strictEqual(structure.isInMapBlock(0), false, 'Opening MAP line not inside MAP');
            assert.strictEqual(structure.isInClassBlock(2), false, 'isInClassBlock shim');
        });
    });

    suite('FieldEquate index + USE() relationships (Gap C)', () => {
        function buildC(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return { structure, tokens };
        }

        test('USE(?Ctrl) sets linkedTo on the USE token to the FieldEquateLabel', () => {
            const code = [
                'TestProc PROCEDURE',                                  // 0
                "Win  WINDOW('Test'),AT(0,0,200,100)",                  // 1
                "         BUTTON('OK'),AT(10,10,40,15),USE(?BtnOK)",    // 2
                '         END',                                          // 3
                'CODE',                                                  // 4
                'END',                                                   // 5
            ].join('\n');
            const { tokens } = buildC(code);
            const useToken = tokens.find(t => t.value.toUpperCase() === 'USE');
            assert.ok(useToken, 'Should find USE token');
            assert.ok(useToken!.linkedTo, 'USE token should be linked');
            assert.strictEqual(useToken!.linkedTo!.type, TokenType.FieldEquateLabel);
            assert.strictEqual(useToken!.linkedTo!.value, '?BtnOK');
            assert.strictEqual(useToken!.hasNoFieldEquate, undefined);
        });

        test('USE(?) bare-? idiom sets hasNoFieldEquate=true and leaves linkedTo undefined', () => {
            const code = [
                'TestProc PROCEDURE',                                  // 0
                "Win  WINDOW('Test')",                                  // 1
                "         ENTRY(@s30),AT(10,10,80,10),USE(?)",          // 2
                '         END',                                          // 3
                'CODE',                                                  // 4
                'END',                                                   // 5
            ].join('\n');
            const { tokens } = buildC(code);
            const useToken = tokens.find(t => t.value.toUpperCase() === 'USE');
            assert.ok(useToken, 'Should find USE token');
            assert.strictEqual(useToken!.hasNoFieldEquate, true);
            assert.strictEqual(useToken!.linkedTo, undefined);
        });

        test('USE(VarName) links to a Label declared in scope', () => {
            const code = [
                'TestProc PROCEDURE',                                  // 0
                'CustName  STRING(30)',                                 // 1
                "Win  WINDOW('Test')",                                  // 2
                "         ENTRY(@s30),AT(10,10,80,10),USE(CustName)",   // 3
                '         END',                                          // 4
                'CODE',                                                  // 5
                'END',                                                   // 6
            ].join('\n');
            const { tokens } = buildC(code);
            const useToken = tokens.find(t => t.value.toUpperCase() === 'USE');
            assert.ok(useToken, 'Should find USE token');
            assert.ok(useToken!.linkedTo, 'USE should link to a label');
            assert.strictEqual(useToken!.linkedTo!.value, 'CustName');
            assert.strictEqual(useToken!.linkedTo!.type, TokenType.Label);
        });

        test('duplicate ?name in one window: per-structure records first, findControlAll returns both', () => {
            const code = [
                'TestProc PROCEDURE',                                  // 0
                "Win  WINDOW('Test')",                                  // 1
                "         BUTTON('A'),AT(10,10,40,15),USE(?Btn)",       // 2
                "         BUTTON('B'),AT(60,10,40,15),USE(?Btn)",       // 3
                '         END',                                          // 4
                'CODE',                                                  // 5
                'END',                                                   // 6
            ].join('\n');
            const { structure, tokens } = buildC(code);
            const winToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'WINDOW');
            assert.ok(winToken);

            const scoped = structure.findControl('?Btn', winToken!);
            assert.ok(scoped, 'Per-structure lookup returns first occurrence');
            assert.strictEqual(scoped!.line, 2, 'First-occurrence-wins on duplicate');

            const all = structure.findControlAll('?Btn');
            assert.strictEqual(all.length, 2, 'findControlAll returns every occurrence');
            assert.deepStrictEqual(all.map(t => t.line), [2, 3]);

            const flat = structure.findControl('?Btn');
            assert.strictEqual(flat, null, 'Flat findControl returns null on ambiguity');
        });

        test('getControlsInStructure returns FieldEquateLabel tokens in declaration order', () => {
            const code = [
                'TestProc PROCEDURE',                                  // 0
                "Win  WINDOW('Test')",                                  // 1
                "         BUTTON('OK'),AT(10,10,40,15),USE(?BtnOK)",    // 2
                "         BUTTON('Cancel'),AT(60,10,40,15),USE(?BtnCancel)", // 3
                '         END',                                          // 4
                'CODE',                                                  // 5
                'END',                                                   // 6
            ].join('\n');
            const { structure, tokens } = buildC(code);
            const winToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'WINDOW');
            assert.ok(winToken);

            const controls = structure.getControlsInStructure(winToken!);
            const names = controls.map(c => c.value);
            assert.deepStrictEqual(names, ['?BtnOK', '?BtnCancel']);
        });

        test('anonymous control (no ?name) is NOT in the index', () => {
            const code = [
                'TestProc PROCEDURE',                                  // 0
                "Win  WINDOW('Test')",                                  // 1
                "         BUTTON('OK'),AT(10,10,40,15)",                // 2 — no USE clause
                '         END',                                          // 3
                'CODE',                                                  // 4
                'END',                                                   // 5
            ].join('\n');
            const { structure, tokens } = buildC(code);
            const winToken = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'WINDOW');
            assert.ok(winToken);
            assert.strictEqual(structure.getControlsInStructure(winToken!).length, 0);
        });

        test('findReferencesToControlInFile returns the USE token that links to a control', () => {
            const code = [
                'TestProc PROCEDURE',                                  // 0
                "Win  WINDOW('Test')",                                  // 1
                "         BUTTON('OK'),AT(10,10,40,15),USE(?BtnOK)",    // 2
                '         END',                                          // 3
                'CODE',                                                  // 4
                '  DISABLE(?BtnOK)',                                     // 5 — runtime ref, not a USE
                'END',                                                   // 6
            ].join('\n');
            const { structure, tokens } = buildC(code);
            const ctrl = tokens.find(t =>
                t.type === TokenType.FieldEquateLabel && t.value === '?BtnOK'
            );
            assert.ok(ctrl);
            const refs = structure.findReferencesToControlInFile(ctrl!);
            assert.strictEqual(refs.length, 1, 'Exactly one USE token links to ?BtnOK');
            assert.strictEqual(refs[0].value.toUpperCase(), 'USE');
            assert.strictEqual(refs[0].line, 2);
        });

        test('findControl with scope returns the right window when multiple windows share a name', () => {
            const code = [
                'ProcA PROCEDURE',                                     // 0
                "WinA WINDOW('A')",                                     // 1
                "         BUTTON('OK'),AT(10,10,40,15),USE(?Btn)",      // 2
                '         END',                                          // 3
                'CODE',                                                  // 4
                'END',                                                   // 5
                '',                                                      // 6
                'ProcB PROCEDURE',                                     // 7
                "WinB WINDOW('B')",                                     // 8
                "         BUTTON('Go'),AT(10,10,40,15),USE(?Btn)",      // 9
                '         END',                                          // 10
                'CODE',                                                  // 11
                'END',                                                   // 12
            ].join('\n');
            const { structure, tokens } = buildC(code);
            const wins = tokens.filter(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'WINDOW');
            assert.strictEqual(wins.length, 2);

            const inA = structure.findControl('?Btn', wins[0]);
            const inB = structure.findControl('?Btn', wins[1]);
            assert.ok(inA && inB);
            assert.notStrictEqual(inA, inB, "Per-structure lookup returns the right window's ?Btn");
            assert.strictEqual(inA!.line, 2);
            assert.strictEqual(inB!.line, 9);

            assert.strictEqual(structure.findControl('?Btn'), null, 'No-scope lookup is ambiguous → null');
            assert.strictEqual(structure.findControlAll('?Btn').length, 2);
        });
    });

    suite('EQUATE / ITEMIZE blocks (Gap B)', () => {
        function buildB(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return { structure, tokens };
        }

        test('plain EQUATE outside any structure is indexed by raw name', () => {
            const code = [
                'MyProg PROGRAM',                  // 0
                'MAX_ROWS EQUATE(100)',             // 1
                '',                                  // 2
                'TestProc PROCEDURE()',             // 3
                'CODE',                              // 4
                'END',                               // 5
            ].join('\n');
            const { structure } = buildB(code);
            const t = structure.findEquate('MAX_ROWS');
            assert.ok(t, 'findEquate should resolve the plain EQUATE');
            assert.strictEqual(t!.value, 'MAX_ROWS');
            assert.strictEqual(t!.prefixedEquateName, undefined, 'No PRE → no prefixedEquateName');
            assert.strictEqual(t!.dataValue, '100');
        });

        test('ITEMIZE,PRE(Clr) members get prefixedEquateName and are indexed under both forms', () => {
            const code = [
                'Color ITEMIZE,PRE(Clr)',           // 0
                'Red    EQUATE',                     // 1
                'Green  EQUATE',                     // 2
                'Blue   EQUATE',                     // 3
                '       END',                         // 4
            ].join('\n');
            const { structure } = buildB(code);
            const red = structure.findEquate('Clr:Red');
            assert.ok(red, 'PRE-expanded form should resolve');
            assert.strictEqual(red!.value, 'Red');
            assert.strictEqual(red!.prefixedEquateName, 'Clr:Red');
            // Raw-name lookup also works:
            assert.strictEqual(structure.findEquate('Red'), red, 'Raw name lookup should also resolve');
            // Case-insensitive:
            assert.strictEqual(structure.findEquate('CLR:RED'), red);
            assert.strictEqual(structure.findEquate('clr:red'), red);
        });

        test('ITEMIZE without PRE: members keep raw names, no prefixedEquateName', () => {
            const code = [
                'Color ITEMIZE',                    // 0
                'Red    EQUATE',                     // 1
                'Green  EQUATE',                     // 2
                '       END',                         // 3
            ].join('\n');
            const { structure } = buildB(code);
            const red = structure.findEquate('Red');
            assert.ok(red, 'Member should be indexed by bare name');
            assert.strictEqual(red!.prefixedEquateName, undefined);
        });

        test('nested ITEMIZE: inner PRE wins over outer PRE', () => {
            const code = [
                'OuterColor ITEMIZE,PRE(Out)',      // 0
                'Inner       ITEMIZE,PRE(In)',      // 1 — inner ITEMIZE with its own PRE
                'Red          EQUATE',              // 2 — should be In:Red, not Out:Red
                '             END',                  // 3
                '            END',                   // 4
            ].join('\n');
            const { structure } = buildB(code);
            const red = structure.findEquate('In:Red');
            assert.ok(red, 'Inner PRE should win');
            assert.strictEqual(red!.prefixedEquateName, 'In:Red');
            // The outer PRE should NOT resolve this same token.
            assert.strictEqual(structure.findEquate('Out:Red'), undefined, 'Outer PRE does not apply');
        });

        test('parent ITEMIZE without PRE, grandparent ITEMIZE with PRE: ancestor walk picks up the PRE', () => {
            const code = [
                'Outer ITEMIZE,PRE(Out)',           // 0
                'Inner  ITEMIZE',                    // 1 — no PRE
                'Red     EQUATE',                    // 2 — should inherit Out:
                '        END',                        // 3
                '       END',                         // 4
            ].join('\n');
            const { structure } = buildB(code);
            const red = structure.findEquate('Out:Red');
            assert.ok(red, 'Should inherit grandparent PRE');
            assert.strictEqual(red!.prefixedEquateName, 'Out:Red');
        });

        test('blank-label ITEMIZE: members PRE-expand normally', () => {
            const code = [
                '          ITEMIZE,PRE(CLType)',    // 0 — no top-level label
                'Byte_      EQUATE',                 // 1
                '           END',                     // 2
            ].join('\n');
            const { structure } = buildB(code);
            const byte = structure.findEquate('CLType:Byte_');
            assert.ok(byte, 'Member should PRE-expand even when ITEMIZE has no label');
            assert.strictEqual(byte!.prefixedEquateName, 'CLType:Byte_');
        });

        test('getItemizeBlocks returns ITEMIZE structure tokens; getItemizeMembers lists EQUATE labels', () => {
            const code = [
                'Color ITEMIZE,PRE(Clr)',           // 0
                'Red    EQUATE',                     // 1
                'Green  EQUATE',                     // 2
                '       END',                         // 3
            ].join('\n');
            const { structure } = buildB(code);
            const blocks = structure.getItemizeBlocks();
            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].value.toUpperCase(), 'ITEMIZE');

            const members = structure.getItemizeMembers(blocks[0]);
            assert.strictEqual(members.length, 2);
            assert.deepStrictEqual(members.map(m => m.value), ['Red', 'Green']);
            assert.strictEqual(members[0].prefixedEquateName, 'Clr:Red');
            assert.strictEqual(members[1].prefixedEquateName, 'Clr:Green');
        });

        test('getEquates returns plain + ITEMIZE-EQUATEs in declaration order, deduplicated', () => {
            const code = [
                'MAX_ROWS EQUATE(100)',             // 0
                'Color ITEMIZE,PRE(Clr)',           // 1
                'Red    EQUATE',                     // 2
                '       END',                         // 3
                'MIN_ROWS EQUATE(0)',               // 4
            ].join('\n');
            const { structure } = buildB(code);
            const all = structure.getEquates();
            const names = all.map(t => t.value);
            assert.deepStrictEqual(names, ['MAX_ROWS', 'Red', 'MIN_ROWS']);
        });

        test('non-EQUATE labels (STRING, LONG, GROUP, …) are NOT in the equate index', () => {
            const code = [
                'TestProc PROCEDURE',               // 0
                'Name      STRING(30)',              // 1
                'Counter   LONG',                    // 2
                'CODE',                              // 3
                'END',                               // 4
            ].join('\n');
            const { structure } = buildB(code);
            assert.strictEqual(structure.findEquate('Name'), undefined);
            assert.strictEqual(structure.findEquate('Counter'), undefined);
            assert.strictEqual(structure.getEquates().length, 0);
        });
    });
});
