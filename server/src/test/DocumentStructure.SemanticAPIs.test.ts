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

    suite('getClassMethodImplementations()', () => {
        function buildO(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return { tokens, structure };
        }

        test('returns every MethodImplementation of a class with multiple methods', () => {
            const code = `MyClass.Init PROCEDURE()
CODE
  RETURN
END

MyClass.Run PROCEDURE()
CODE
  RETURN
END

MyClass.Kill PROCEDURE()
CODE
  RETURN
END`;
            const { structure } = buildO(code);
            const results = structure.getClassMethodImplementationsByName('MyClass');
            const labels = results.map(t => t.label?.toUpperCase()).sort();
            assert.deepStrictEqual(labels, ['MYCLASS.INIT', 'MYCLASS.KILL', 'MYCLASS.RUN']);
        });

        test('returns all overloads when methods are overloaded', () => {
            const code = `MyClass.DoStuff PROCEDURE()
CODE
  RETURN
END

MyClass.DoStuff PROCEDURE(LONG pId)
CODE
  RETURN
END

MyClass.DoStuff PROCEDURE(STRING pName, LONG pCount)
CODE
  RETURN
END`;
            const { structure } = buildO(code);
            const results = structure.getClassMethodImplementationsByName('MyClass');
            assert.strictEqual(results.length, 3, 'all three overloads should be returned');
            assert.ok(results.every(t => t.label === 'MyClass.DoStuff'));
        });

        test('returns empty array for a declaration-only class with no impls', () => {
            const code = `MyClass CLASS,TYPE
  Init PROCEDURE()
  Run  PROCEDURE()
END`;
            const { structure } = buildO(code);
            const results = structure.getClassMethodImplementationsByName('MyClass');
            assert.deepStrictEqual(results, []);
        });

        test('class name match is case-insensitive', () => {
            const code = `MyClass.Init PROCEDURE()
CODE
  RETURN
END`;
            const { structure } = buildO(code);
            const lower = structure.getClassMethodImplementationsByName('myclass');
            const upper = structure.getClassMethodImplementationsByName('MYCLASS');
            const mixed = structure.getClassMethodImplementationsByName('MyClass');
            assert.strictEqual(lower.length, 1);
            assert.strictEqual(upper.length, 1);
            assert.strictEqual(mixed.length, 1);
            assert.strictEqual(lower[0], upper[0]);
            assert.strictEqual(lower[0], mixed[0]);
        });

        test('does NOT return methods of a class with a similar prefix', () => {
            const code = `MyClass.Init PROCEDURE()
CODE
  RETURN
END

MyClassExtra.Foo PROCEDURE()
CODE
  RETURN
END`;
            const { structure } = buildO(code);
            const results = structure.getClassMethodImplementationsByName('MyClass');
            assert.strictEqual(results.length, 1, 'only the exact-match class should be returned');
            assert.strictEqual(results[0].label, 'MyClass.Init');
        });

        test('does NOT return 3-part interface impls (ClassName.IFace.Method)', () => {
            const code = `MyClass.Init PROCEDURE()
CODE
  RETURN
END

MyClass.IFoo.Bar PROCEDURE()
CODE
  RETURN
END`;
            const { structure } = buildO(code);
            const results = structure.getClassMethodImplementationsByName('MyClass');
            assert.strictEqual(results.length, 1,
                'only the 2-part class.method form should be returned');
            assert.strictEqual(results[0].label, 'MyClass.Init');
        });

        test('token-form and string-form return identical results', () => {
            const code = `MyClass CLASS,TYPE
  Init PROCEDURE()
  Run  PROCEDURE()
END

MyClass.Init PROCEDURE()
CODE
  RETURN
END

MyClass.Run PROCEDURE()
CODE
  RETURN
END`;
            const { tokens, structure } = buildO(code);
            const classToken = tokens.find(t =>
                t.type === TokenType.Structure && t.value.toUpperCase() === 'CLASS'
            );
            assert.ok(classToken, 'CLASS token must be present');
            // The CLASS token's label is set to "MyClass" by handleStructureToken.
            const tokenForm  = structure.getClassMethodImplementations(classToken!);
            const stringForm = structure.getClassMethodImplementationsByName('MyClass');
            assert.deepStrictEqual(tokenForm, stringForm,
                'token-form and string-form should yield the same array');
        });

        test('returns empty array for a class name not present in the document', () => {
            const code = `MyClass.Init PROCEDURE()
CODE
  RETURN
END`;
            const { structure } = buildO(code);
            assert.deepStrictEqual(
                structure.getClassMethodImplementationsByName('NoSuchClass'),
                []
            );
        });
    });

    suite('Window descriptors (Gap F)', () => {
        function buildF(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return { tokens, structure };
        }

        function findStructure(tokens: any[], keyword: string) {
            return tokens.find(t =>
                t.type === TokenType.Structure &&
                t.value.toUpperCase() === keyword.toUpperCase()
            );
        }

        test('WINDOW: TITLE + AT(numeric) + MDI parsed structurally', () => {
            const code = [
                'MyProc PROCEDURE()',
                'Win WINDOW(\'My App\'),AT(50,50,400,300),MDI,SYSTEM',
                '       END',
                'CODE',
                '  RETURN',
                'END',
            ].join('\n');
            const { tokens, structure } = buildF(code);
            const win = findStructure(tokens, 'WINDOW');
            assert.ok(win, 'WINDOW token must be present');
            const desc = structure.getWindowDescriptor(win);
            assert.ok(desc, 'descriptor must be populated for the WINDOW token');
            assert.strictEqual(desc!.title, 'My App');
            assert.deepStrictEqual(desc!.at, { x: 50, y: 50, w: 400, h: 300 });
            assert.strictEqual(desc!.mdi, true);
            assert.strictEqual(desc!.systemMenu, true);
        });

        test('WINDOW: AT with non-numeric expression falls back to raw text', () => {
            const code = [
                'MyProc PROCEDURE()',
                'Win WINDOW(\'X\'),AT(0,0,?Wnd:W,?Wnd:H)',
                '       END',
                'CODE',
                '  RETURN',
                'END',
            ].join('\n');
            const { tokens, structure } = buildF(code);
            const desc = structure.getWindowDescriptor(findStructure(tokens, 'WINDOW'));
            assert.strictEqual(desc!.at, '0,0,?Wnd:W,?Wnd:H');
        });

        test('APPLICATION container gets the same descriptor shape', () => {
            const code = [
                'App APPLICATION(\'Demo\'),AT(0,0,800,600),MDI',
                '       END',
            ].join('\n');
            const { tokens, structure } = buildF(code);
            const desc = structure.getWindowDescriptor(findStructure(tokens, 'APPLICATION'));
            assert.ok(desc, 'descriptor must be populated for APPLICATION');
            assert.strictEqual(desc!.title, 'Demo');
            assert.deepStrictEqual(desc!.at, { x: 0, y: 0, w: 800, h: 600 });
            assert.strictEqual(desc!.mdi, true);
        });

        test('REPORT container gets the same descriptor shape', () => {
            const code = [
                'Rpt REPORT,AT(1000,1000,7000,10000),THOUS',
                '       END',
            ].join('\n');
            const { tokens, structure } = buildF(code);
            const desc = structure.getWindowDescriptor(findStructure(tokens, 'REPORT'));
            assert.ok(desc, 'descriptor must be populated for REPORT');
            assert.deepStrictEqual(desc!.at, { x: 1000, y: 1000, w: 7000, h: 10000 });
            assert.deepStrictEqual(desc!.attributes, ['THOUS']);
        });

        test('WINDOW with only a residual attribute (no title/at/mdi) returns mostly-empty descriptor', () => {
            // Bare `Win WINDOW` (no parens, no comma) is a Clarion-source edge case
            // that the tokenizer treats specially; a minimal-attribute form like
            // `Win WINDOW,RESIZE` is the canonical "no metadata to speak of" shape.
            const code = [
                'Win WINDOW,RESIZE',
                '       END',
            ].join('\n');
            const { tokens, structure } = buildF(code);
            const desc = structure.getWindowDescriptor(findStructure(tokens, 'WINDOW'));
            assert.ok(desc);
            assert.strictEqual(desc!.title, undefined);
            assert.strictEqual(desc!.at, undefined);
            assert.strictEqual(desc!.mdi, false);
            assert.strictEqual(desc!.mdiChild, false);
            assert.strictEqual(desc!.icon, undefined);
            assert.strictEqual(desc!.systemMenu, false);
            assert.strictEqual(desc!.statusBar, false);
            assert.deepStrictEqual(desc!.attributes, ['RESIZE']);
        });

        test('getActiveWindowDescriptor: cursor inside a control returns parent WINDOW descriptor', () => {
            const code = [
                'MyProc PROCEDURE()',                       // 0
                'Win WINDOW(\'Outer\'),AT(0,0,400,300)',    // 1
                '  BUTTON(\'OK\'),AT(120,160),USE(?BtnOk)', // 2  — cursor here
                '       END',                                // 3
                'CODE',                                      // 4
                '  RETURN',                                  // 5
                'END',                                       // 6
            ].join('\n');
            const { structure } = buildF(code);
            const desc = structure.getActiveWindowDescriptor(2);
            assert.ok(desc, 'getActiveWindowDescriptor should resolve a parent container');
            assert.strictEqual(desc!.title, 'Outer');
        });

        test('getActiveWindowDescriptor outside any container returns undefined', () => {
            const code = [
                'MyProc PROCEDURE()',
                'CODE',
                '  RETURN',
                'END',
            ].join('\n');
            const { structure } = buildF(code);
            assert.strictEqual(structure.getActiveWindowDescriptor(2), undefined);
        });

        test('Multi-line WINDOW header with | continuation joins via getLogicalLine', () => {
            // Real Clarion code wraps long headers with the `|` continuation marker.
            // The descriptor parser should see the joined logical line.
            const code = [
                'Win WINDOW(\'Wrapped Title\'),AT(0,0,640,480), |',  // 0 — continues
                '       MDI,SYSTEM,RESIZE',                            // 1
                '       END',                                           // 2
            ].join('\n');
            const { tokens, structure } = buildF(code);
            const desc = structure.getWindowDescriptor(findStructure(tokens, 'WINDOW'));
            assert.ok(desc, 'descriptor must be populated even when header wraps');
            assert.strictEqual(desc!.title, 'Wrapped Title');
            assert.deepStrictEqual(desc!.at, { x: 0, y: 0, w: 640, h: 480 });
            assert.strictEqual(desc!.mdi, true,
                'MDI on the continued segment must be captured via the joined logical line');
            assert.strictEqual(desc!.systemMenu, true);
            assert.deepStrictEqual(desc!.attributes, ['RESIZE']);
        });

        test('Non-container Structure tokens (CLASS / GROUP / FILE) get no descriptor', () => {
            const code = [
                'MyClass CLASS,TYPE',
                '  Foo PROCEDURE()',
                'END',
            ].join('\n');
            const { tokens, structure } = buildF(code);
            const cls = findStructure(tokens, 'CLASS');
            assert.ok(cls);
            assert.strictEqual(structure.getWindowDescriptor(cls), undefined);
        });
    });

    suite('Branches on CASE/IF (Gap G)', () => {
        function buildG(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return { tokens, structure };
        }

        function findStructureAt(tokens: any[], keyword: string, line?: number) {
            return tokens.find(t =>
                t.type === TokenType.Structure &&
                t.value.toUpperCase() === keyword.toUpperCase() &&
                (line === undefined || t.line === line)
            );
        }

        test('CASE with three OF branches and an ELSE: branches[] reflects all four', () => {
            const code = [
                'TestProc PROCEDURE()',           // 0
                'CODE',                            // 1
                '  CASE x',                        // 2
                '  OF 1',                          // 3
                '    y = 1',                       // 4
                '  OF 2',                          // 5
                '    y = 2',                       // 6
                '  OF 3',                          // 7
                '    y = 3',                       // 8
                '  ELSE',                          // 9
                '    y = 0',                       // 10
                '  END',                           // 11
                '  RETURN',                        // 12
            ].join('\n');
            const { tokens, structure } = buildG(code);
            const caseTok = findStructureAt(tokens, 'CASE');
            assert.ok(caseTok, 'CASE token must be present');
            const branches = structure.getBranches(caseTok);
            assert.strictEqual(branches.length, 4, `expected 4 branches; got ${branches.length}`);
            assert.deepStrictEqual(branches.map(b => b.kind), ['OF', 'OF', 'OF', 'ELSE']);
            // start lines correspond to the keyword lines
            assert.deepStrictEqual(branches.map(b => b.startLine), [3, 5, 7, 9]);
            // end lines: last body line of each branch
            assert.strictEqual(branches[0].endLine, 4, 'OF 1 body ends at line 4');
            assert.strictEqual(branches[1].endLine, 6, 'OF 2 body ends at line 6');
            assert.strictEqual(branches[2].endLine, 8, 'OF 3 body ends at line 8');
            assert.strictEqual(branches[3].endLine, 10, 'ELSE body ends at line 10 (END is line 11)');
            // OF branches carry the value expression; ELSE does not
            assert.strictEqual(branches[0].valueExpr, '1');
            assert.strictEqual(branches[1].valueExpr, '2');
            assert.strictEqual(branches[2].valueExpr, '3');
            assert.strictEqual(branches[3].valueExpr, undefined);
            // keywordToken refers to the actual ConditionalContinuation token
            assert.ok(branches.every(b => b.keywordToken.type === TokenType.ConditionalContinuation));
        });

        test('IF / ELSIF / ELSE: kinds reflect the keyword, ELSE has no expression', () => {
            const code = [
                'TestProc PROCEDURE()',         // 0
                'CODE',                          // 1
                '  IF x = 1',                    // 2
                '    y = 1',                     // 3
                '  ELSIF x = 2',                 // 4
                '    y = 2',                     // 5
                '  ELSE',                        // 6
                '    y = 0',                     // 7
                '  END',                         // 8
                '  RETURN',                      // 9
            ].join('\n');
            const { tokens, structure } = buildG(code);
            const ifTok = findStructureAt(tokens, 'IF');
            assert.ok(ifTok, 'IF token must be present');
            const branches = structure.getBranches(ifTok);
            assert.deepStrictEqual(branches.map(b => b.kind), ['ELSIF', 'ELSE']);
            assert.strictEqual(branches[0].valueExpr, 'x = 2');
            assert.strictEqual(branches[1].valueExpr, undefined);
        });

        test('OROF is recorded as its own branch entry with kind=OROF', () => {
            const code = [
                'TestProc PROCEDURE()',         // 0
                'CODE',                          // 1
                '  CASE x',                      // 2
                '  OF 1',                        // 3
                '    y = 1',                     // 4
                '  OROF 2',                      // 5
                '    y = 2',                     // 6
                '  OF 3',                        // 7
                '    y = 3',                     // 8
                '  END',                         // 9
                '  RETURN',                      // 10
            ].join('\n');
            const { tokens, structure } = buildG(code);
            const caseTok = findStructureAt(tokens, 'CASE');
            const branches = structure.getBranches(caseTok);
            assert.deepStrictEqual(branches.map(b => b.kind), ['OF', 'OROF', 'OF']);
            assert.strictEqual(branches[1].valueExpr, '2', 'OROF expression captured');
        });

        test('OF expression spanning a `|` continuation joins via getLogicalLine', () => {
            const code = [
                'TestProc PROCEDURE()',                     // 0
                'CODE',                                      // 1
                '  CASE x',                                  // 2
                '  OF Customer:State = \'NY\' |',            // 3 (continues)
                '       OR Customer:State = \'NJ\'',         // 4
                '    y = 1',                                 // 5
                '  END',                                     // 6
                '  RETURN',                                  // 7
            ].join('\n');
            const { tokens, structure } = buildG(code);
            const caseTok = findStructureAt(tokens, 'CASE');
            const branches = structure.getBranches(caseTok);
            assert.strictEqual(branches.length, 1);
            assert.strictEqual(branches[0].kind, 'OF');
            assert.ok(
                branches[0].valueExpr?.includes("Customer:State = 'NY'") &&
                branches[0].valueExpr?.includes("Customer:State = 'NJ'"),
                `valueExpr should join both segments; got: "${branches[0].valueExpr}"`
            );
        });

        test('CASE with no branches (just statements) yields an empty branches array', () => {
            const code = [
                'TestProc PROCEDURE()',         // 0
                'CODE',                          // 1
                '  CASE x',                      // 2
                '  END',                         // 3
                '  RETURN',                      // 4
            ].join('\n');
            const { tokens, structure } = buildG(code);
            const caseTok = findStructureAt(tokens, 'CASE');
            assert.ok(caseTok);
            assert.deepStrictEqual(structure.getBranches(caseTok), []);
        });

        test('Nested IF inside a CASE OF: inner branches do not bleed into outer', () => {
            const code = [
                'TestProc PROCEDURE()',         // 0
                'CODE',                          // 1
                '  CASE x',                      // 2
                '  OF 1',                        // 3
                '    IF y = 1',                  // 4
                '      z = 1',                   // 5
                '    ELSIF y = 2',               // 6  ← inner ELSIF, must NOT show on outer CASE
                '      z = 2',                   // 7
                '    ELSE',                      // 8  ← inner ELSE, must NOT show on outer CASE
                '      z = 0',                   // 9
                '    END',                       // 10
                '  OF 2',                        // 11
                '    z = 99',                    // 12
                '  END',                         // 13
                '  RETURN',                      // 14
            ].join('\n');
            const { tokens, structure } = buildG(code);
            const caseTok = findStructureAt(tokens, 'CASE');
            const ifTok = findStructureAt(tokens, 'IF');
            assert.ok(caseTok && ifTok);

            const outerBranches = structure.getBranches(caseTok);
            assert.deepStrictEqual(outerBranches.map(b => b.kind), ['OF', 'OF'],
                'outer CASE should see only its two OF branches, not the inner IF/ELSIF/ELSE');

            const innerBranches = structure.getBranches(ifTok);
            assert.deepStrictEqual(innerBranches.map(b => b.kind), ['ELSIF', 'ELSE'],
                'inner IF should see its own ELSIF + ELSE');
        });

        test('non-CASE/non-IF token returns empty branches', () => {
            const code = [
                'MyClass CLASS,TYPE',
                '  Foo PROCEDURE()',
                'END',
            ].join('\n');
            const { tokens, structure } = buildG(code);
            const cls = findStructureAt(tokens, 'CLASS');
            assert.ok(cls);
            assert.deepStrictEqual(structure.getBranches(cls), []);
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

    suite('Reverse IMPLEMENTS index (Gap H)', () => {
        function buildH(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return { structure, tokens };
        }

        test('single class implementing one interface: getImplementors returns it', () => {
            const code = [
                'IConnection INTERFACE,TYPE',                    // 0
                '  Open       PROCEDURE()',                       // 1
                '            END',                                 // 2
                '',                                                // 3
                'TcpClient   CLASS,TYPE,IMPLEMENTS(IConnection)', // 4
                '            END',                                 // 5
            ].join('\n');
            const { structure } = buildH(code);
            const impls = structure.getImplementors('IConnection');
            assert.strictEqual(impls.length, 1);
            assert.strictEqual(impls[0].label, 'TcpClient');
        });

        test('multiple classes implementing one interface: all returned in source order', () => {
            const code = [
                'ILogger INTERFACE,TYPE',                              // 0
                '  Log     PROCEDURE(STRING msg)',                      // 1
                '         END',                                          // 2
                '',                                                      // 3
                'FileLogger     CLASS,TYPE,IMPLEMENTS(ILogger)',         // 4
                '              END',                                     // 5
                '',                                                      // 6
                'ConsoleLogger  CLASS,TYPE,IMPLEMENTS(ILogger)',         // 7
                '              END',                                     // 8
            ].join('\n');
            const { structure } = buildH(code);
            const impls = structure.getImplementors('ILogger');
            assert.strictEqual(impls.length, 2);
            assert.deepStrictEqual(impls.map(c => c.label), ['FileLogger', 'ConsoleLogger']);
        });

        test('class implementing multiple interfaces: appears in each bucket', () => {
            const code = [
                'IConnection INTERFACE,TYPE',                                   // 0
                '            END',                                               // 1
                'ICloseable  INTERFACE,TYPE',                                   // 2
                '            END',                                               // 3
                '',                                                              // 4
                'TcpClient CLASS,TYPE,IMPLEMENTS(IConnection),IMPLEMENTS(ICloseable)', // 5
                '          END',                                                  // 6
            ].join('\n');
            const { structure } = buildH(code);
            assert.strictEqual(structure.getImplementors('IConnection')[0].label, 'TcpClient');
            assert.strictEqual(structure.getImplementors('ICloseable')[0].label, 'TcpClient');
        });

        test('interface with no implementors: empty array', () => {
            const code = [
                'IUnused INTERFACE,TYPE',                          // 0
                '       END',                                       // 1
            ].join('\n');
            const { structure } = buildH(code);
            assert.deepStrictEqual(structure.getImplementors('IUnused'), []);
        });

        test('case-insensitive interface name lookup', () => {
            const code = [
                'IConnection INTERFACE,TYPE',                       // 0
                '           END',                                    // 1
                'TcpClient CLASS,TYPE,IMPLEMENTS(IConnection)',     // 2
                '          END',                                     // 3
            ].join('\n');
            const { structure } = buildH(code);
            assert.strictEqual(structure.getImplementors('iconnection').length, 1);
            assert.strictEqual(structure.getImplementors('ICONNECTION').length, 1);
            assert.strictEqual(structure.getImplementors('IcOnNeCtIoN').length, 1);
        });

        test('findInterfaceReferences returns the IMPLEMENTS-clause name tokens', () => {
            const code = [
                'IConnection INTERFACE,TYPE',                               // 0
                '           END',                                            // 1
                'TcpClient   CLASS,TYPE,IMPLEMENTS(IConnection)',           // 2
                '           END',                                            // 3
                'TlsClient   CLASS,TYPE,IMPLEMENTS(IConnection)',           // 4
                '           END',                                            // 5
            ].join('\n');
            const { structure } = buildH(code);
            const refs = structure.findInterfaceReferences('IConnection');
            assert.strictEqual(refs.length, 2);
            assert.deepStrictEqual(refs.map(t => t.line), [2, 4]);
            // First identifier inside the parens — the interface name itself.
            assert.strictEqual(refs[0].value, 'IConnection');
        });

        test('getImplementors does not include classes that do not declare IMPLEMENTS', () => {
            const code = [
                'IConnection INTERFACE,TYPE',                       // 0
                '           END',                                    // 1
                'PlainClass  CLASS,TYPE',                           // 2 — no IMPLEMENTS
                '           END',                                    // 3
                'TcpClient   CLASS,TYPE,IMPLEMENTS(IConnection)',   // 4
                '           END',                                    // 5
            ].join('\n');
            const { structure } = buildH(code);
            const impls = structure.getImplementors('IConnection');
            assert.strictEqual(impls.length, 1);
            assert.strictEqual(impls[0].label, 'TcpClient');
            assert.ok(!impls.some(c => c.label === 'PlainClass'));
        });
    });

    suite('PROGRAM / MEMBER document helpers (Gap N)', () => {
        function buildN(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens);
            structure.process();
            return structure;
        }

        test('PROGRAM document: getDocumentKind=PROGRAM, getProgramName returns the label', () => {
            const code = [
                'MyProg PROGRAM',                   // 0
                '',                                  // 1
                'MAP',                               // 2
                '  Foo PROCEDURE()',                 // 3
                'END',                               // 4
                '',                                  // 5
                'CODE',                              // 6
                'END',                               // 7
            ].join('\n');
            const s = buildN(code);
            assert.strictEqual(s.getDocumentKind(), 'PROGRAM');
            assert.strictEqual(s.getProgramName(), 'MyProg');
            assert.strictEqual(s.getMemberParent(), undefined);
        });

        test("MEMBER('parent.clw') document: getDocumentKind=MEMBER, getMemberParent returns the unquoted filename", () => {
            const code = [
                "  MEMBER('Parent.clw')",            // 0
                '',                                  // 1
                'TestProc PROCEDURE',                // 2
                'CODE',                              // 3
                'END',                               // 4
            ].join('\n');
            const s = buildN(code);
            assert.strictEqual(s.getDocumentKind(), 'MEMBER');
            assert.strictEqual(s.getMemberParent(), 'Parent.clw');
            assert.strictEqual(s.getProgramName(), undefined);
        });

        test('bare MEMBER without parens: kind=MEMBER but getMemberParent is undefined', () => {
            const code = [
                '  MEMBER',                          // 0
                '',                                  // 1
                'TestProc PROCEDURE',                // 2
                'CODE',                              // 3
                'END',                               // 4
            ].join('\n');
            const s = buildN(code);
            assert.strictEqual(s.getDocumentKind(), 'MEMBER');
            assert.strictEqual(s.getMemberParent(), undefined);
        });

        test('document with neither PROGRAM nor MEMBER: all helpers return undefined', () => {
            const code = [
                'MyClass CLASS,TYPE',                // 0
                '       END',                         // 1
            ].join('\n');
            const s = buildN(code);
            assert.strictEqual(s.getDocumentKind(), undefined);
            assert.strictEqual(s.getProgramName(), undefined);
            assert.strictEqual(s.getMemberParent(), undefined);
        });

        test('PROGRAM without a label returns getProgramName=undefined but kind=PROGRAM', () => {
            // The Clarion spec strongly prefers a label, but defensively cover the case.
            const code = [
                '  PROGRAM',                         // 0
                'CODE',                              // 1
                'END',                               // 2
            ].join('\n');
            const s = buildN(code);
            assert.strictEqual(s.getDocumentKind(), 'PROGRAM');
            assert.strictEqual(s.getProgramName(), undefined);
        });
    });

    suite('Logical-line joiner (Gap P)', () => {
        function buildP(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens, code.split('\n'));
            structure.process();
            return structure;
        }

        test('single line with no continuation: startLine === endLine, joined is the line', () => {
            const code = 'TestProc PROCEDURE(LONG pId)';
            const s = buildP(code);
            const logical = s.getLogicalLine(0);
            assert.ok(logical);
            assert.strictEqual(logical!.startLine, 0);
            assert.strictEqual(logical!.endLine, 0);
            assert.ok(logical!.joinedText.includes('PROCEDURE(LONG pId)'));
        });

        test('two-line `|` continuation joins into one logical line', () => {
            const code = [
                'TestProc PROCEDURE(LONG pId,    |',  // 0
                '                  STRING pName)',     // 1
            ].join('\n');
            const s = buildP(code);
            const logical = s.getLogicalLine(0);
            assert.ok(logical);
            assert.strictEqual(logical!.startLine, 0);
            assert.strictEqual(logical!.endLine, 1);
            // The `|` is stripped and replaced with a separator space.
            assert.ok(!logical!.joinedText.includes('|'), 'pipe should be stripped');
            assert.ok(logical!.joinedText.includes('LONG pId'), 'first segment included');
            assert.ok(logical!.joinedText.includes('STRING pName'), 'second segment included');
        });

        test('querying any physical line in a chain returns the SAME LogicalLine', () => {
            const code = [
                'TestProc PROCEDURE(LONG a,  |',     // 0
                '                  LONG b,  |',      // 1
                '                  LONG c)',          // 2
            ].join('\n');
            const s = buildP(code);
            const a = s.getLogicalLine(0);
            const b = s.getLogicalLine(1);
            const c = s.getLogicalLine(2);
            assert.strictEqual(a, b, 'mid-chain query returns the start chain');
            assert.strictEqual(b, c, 'end-chain query returns the same object');
            assert.strictEqual(a!.startLine, 0);
            assert.strictEqual(a!.endLine, 2);
        });

        test('comment-only line in middle of chain BREAKS the continuation (edge case 7)', () => {
            const code = [
                'TestProc PROCEDURE(LONG a,    |',   // 0 — ends with |
                '! a comment-only line',              // 1 — no |, just a comment
                '                  LONG b)',          // 2 — should NOT be in chain
            ].join('\n');
            const s = buildP(code);
            const logical = s.getLogicalLine(0);
            assert.ok(logical);
            // Chain spans lines 0 and 1, NOT line 2.
            assert.strictEqual(logical!.endLine, 1, 'chain should end at the comment-only line');
            // LONG b should NOT appear in joinedText.
            assert.ok(!logical!.joinedText.includes('LONG b'), 'line 2 must not be joined');
            // The comment text itself is stripped.
            assert.ok(!logical!.joinedText.includes('comment-only'), 'comment content stripped from joined view');
        });

        test('inline `!`-comment AFTER `|` on a continued line is stripped from joinedText', () => {
            // Clarion treats `|` as the continuation marker only when it comes
            // BEFORE the comment on a line. `! ... |` would consume the pipe
            // as comment text — that's a separate case (no continuation).
            const code = [
                'TestProc PROCEDURE(LONG a, | ! cont',   // 0 — | first, then !
                '                  LONG b)',              // 1
            ].join('\n');
            const s = buildP(code);
            const logical = s.getLogicalLine(0);
            assert.ok(logical);
            assert.strictEqual(logical!.endLine, 1);
            assert.ok(!logical!.joinedText.includes('cont'), 'comment text stripped');
            assert.ok(logical!.joinedText.includes('LONG b'), 'continuation applies because | precedes !');
        });

        test('`!`-comment SWALLOWING the `|` does NOT continue the chain', () => {
            // When `!` comes first, the `|` is consumed as comment text and
            // the line does not have a LineContinuation token at the end.
            const code = [
                'TestProc PROCEDURE(LONG a, ! note |',  // 0 — comment swallows the |
                '                  LONG b)',             // 1 — should NOT join
            ].join('\n');
            const s = buildP(code);
            const logical = s.getLogicalLine(0);
            assert.ok(logical);
            assert.strictEqual(logical!.endLine, 0, 'no continuation: chain ends at line 0');
            assert.ok(!logical!.joinedText.includes('LONG b'));
        });

        test('LogicalLine.tokens excludes LineContinuation and Comment tokens', () => {
            const code = [
                'TestProc PROCEDURE(LONG a, ! comment   |',  // 0
                '                  LONG b)',                   // 1
            ].join('\n');
            const s = buildP(code);
            const logical = s.getLogicalLine(0);
            assert.ok(logical);
            for (const t of logical!.tokens) {
                assert.notStrictEqual(t.type, TokenType.LineContinuation, 'no LineContinuation tokens');
                assert.notStrictEqual(t.type, TokenType.Comment, 'no Comment tokens');
            }
            // Sanity: must have included real tokens from both lines.
            const valuesUpper = logical!.tokens.map(t => t.value.toUpperCase());
            assert.ok(valuesUpper.includes('PROCEDURE'));
            assert.ok(valuesUpper.includes('LONG'));
        });

        test('map() back-translates a joined-text column to (line, col) on the right physical line', () => {
            const code = [
                'TestProc PROCEDURE(LONG a,  |',     // 0
                '                  LONG b)',          // 1
            ].join('\n');
            const s = buildP(code);
            const logical = s.getLogicalLine(0);
            assert.ok(logical);
            // Column 0 of joinedText is column 0 of the first line.
            assert.deepStrictEqual(logical!.map(0), { line: 0, column: 0 });
            // Find "LONG b" — it's on line 1.
            const idx = logical!.joinedText.indexOf('LONG b');
            assert.ok(idx > 0, 'found LONG b in joined text');
            const pos = logical!.map(idx);
            assert.strictEqual(pos.line, 1, 'maps back to line 1');
            assert.ok(pos.column > 0, 'column non-zero (LONG b is indented)');
        });

        test('string literal containing `|` is NOT a continuation', () => {
            const code = [
                "MyVar STRING('hello | world')",   // 0
                'NextLine STRING(20)',              // 1
            ].join('\n');
            const s = buildP(code);
            const logical = s.getLogicalLine(0);
            assert.ok(logical);
            assert.strictEqual(logical!.endLine, 0, 'string-literal pipe does not extend the chain');
        });

        test('blank line returns a LogicalLine with empty joinedText (no chain)', () => {
            const code = [
                'TestProc PROCEDURE',  // 0
                '',                     // 1 — blank
                'CODE',                 // 2
                'END',                  // 3
            ].join('\n');
            const s = buildP(code);
            const logical = s.getLogicalLine(1);
            assert.ok(logical, 'blank line still resolves');
            assert.strictEqual(logical!.startLine, 1);
            assert.strictEqual(logical!.endLine, 1, 'blank line is a single logical line');
        });
    });

    suite('VIEW block helpers (Gap L)', () => {
        function buildL(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens, code.split('\n'));
            structure.process();
            return { structure, tokens };
        }

        test('VIEW with FROM(File) + PROJECT(F1, F2) populates descriptor', () => {
            const code = [
                'MyView VIEW(Customer)',         // 0
                '       PROJECT(Cus:Id, Cus:Name)', // 1
                '       END',                     // 2
            ].join('\n');
            const { structure, tokens } = buildL(code);
            const view = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'VIEW');
            assert.ok(view);
            const desc = structure.getViewDescriptor(view!);
            assert.ok(desc);
            assert.strictEqual(desc!.from, 'Customer');
            assert.deepStrictEqual(desc!.projectedFields, ['Cus:Id', 'Cus:Name']);
            assert.strictEqual(desc!.joins.length, 0);
        });

        test('VIEW with INNER JOIN(Other) populates joins[0]', () => {
            const code = [
                'MyView VIEW(Customer)',                     // 0
                '       PROJECT(Cus:Id)',                     // 1
                '       INNER JOIN(Orders, Cus:Id, Ord:CId)', // 2
                '       END',                                 // 3
            ].join('\n');
            const { structure, tokens } = buildL(code);
            const view = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'VIEW');
            assert.ok(view);
            const desc = structure.getViewDescriptor(view!);
            assert.ok(desc);
            assert.strictEqual(desc!.joins.length, 1);
            assert.strictEqual(desc!.joins[0].side, 'INNER');
            assert.strictEqual(desc!.joins[0].joinedFile, 'Orders');
        });

        test('VIEW with multi-line header via `|` continuation parses all clauses', () => {
            // Header spans physical lines 0-1 via `|`. Body still parses normally.
            const code = [
                'MyView VIEW(Customer),    |',           // 0
                '       THREAD',                          // 1 (continuation of VIEW header)
                '       PROJECT(Cus:Name, Cus:Id)',       // 2
                '       JOIN(Orders, Cus:Id)',            // 3
                '       END',                              // 4
            ].join('\n');
            const { structure, tokens } = buildL(code);
            const view = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'VIEW');
            assert.ok(view);
            const desc = structure.getViewDescriptor(view!);
            assert.ok(desc);
            // FROM still recovered from the joined header
            assert.strictEqual(desc!.from, 'Customer');
            // Body clauses parsed correctly even though the header was multi-line
            assert.deepStrictEqual(desc!.projectedFields, ['Cus:Name', 'Cus:Id']);
            assert.strictEqual(desc!.joins.length, 1);
            assert.strictEqual(desc!.joins[0].side, undefined, 'plain JOIN has no side');
            assert.strictEqual(desc!.joins[0].joinedFile, 'Orders');
        });

        test('isInViewBlock returns true inside VIEW, false in adjacent code', () => {
            const code = [
                'MyView VIEW(Customer)',         // 0
                '       PROJECT(Cus:Id)',         // 1
                '       END',                     // 2
                '',                                // 3
                'TestProc PROCEDURE',             // 4
                'CODE',                            // 5
                'END',                             // 6
            ].join('\n');
            const { structure } = buildL(code);
            assert.strictEqual(structure.isInViewBlock(1), true, 'inside VIEW body');
            assert.strictEqual(structure.isInViewBlock(0), false, 'opening line not inside');
            assert.strictEqual(structure.isInViewBlock(2), false, 'END line not inside');
            assert.strictEqual(structure.isInViewBlock(5), false, 'unrelated code is not inside');
        });

        test('VIEW with no PROJECT/JOIN: descriptor has empty arrays, only FROM populated', () => {
            const code = [
                'MyView VIEW(Customer)',         // 0
                '       END',                     // 1
            ].join('\n');
            const { structure, tokens } = buildL(code);
            const view = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'VIEW');
            assert.ok(view);
            const desc = structure.getViewDescriptor(view!);
            assert.ok(desc);
            assert.strictEqual(desc!.from, 'Customer');
            assert.deepStrictEqual(desc!.projectedFields, []);
            assert.deepStrictEqual(desc!.joins, []);
        });

        test('getViews() returns all VIEW structure tokens', () => {
            const code = [
                'ViewA VIEW(FileA)',     // 0
                '      END',              // 1
                'ViewB VIEW(FileB)',     // 2
                '      END',              // 3
            ].join('\n');
            const { structure } = buildL(code);
            const views = structure.getViews();
            assert.strictEqual(views.length, 2);
            assert.deepStrictEqual(views.map(v => v.label), ['ViewA', 'ViewB']);
        });

        test('OUTER JOIN side is captured', () => {
            const code = [
                'MyView VIEW(Customer)',                  // 0
                '       OUTER JOIN(Orders, Cus:Id)',       // 1
                '       END',                              // 2
            ].join('\n');
            const { structure, tokens } = buildL(code);
            const view = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'VIEW');
            assert.ok(view);
            const desc = structure.getViewDescriptor(view!);
            assert.ok(desc);
            assert.strictEqual(desc!.joins[0].side, 'OUTER');
        });
    });

    suite('Control keyword recognition (Gap J)', () => {
        function buildJ(code: string) {
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const structure = new DocumentStructure(tokens, code.split('\n'));
            structure.process();
            return structure;
        }

        // Regression: every keyword that the old hard-coded list recognised
        // must continue to classify as a control after the ControlService
        // refactor. The five most commonly-used window controls are pinned.
        for (const keyword of ['BUTTON', 'ENTRY', 'LIST', 'IMAGE', 'REGION']) {
            test(`existing window control \`${keyword}\` still classifies via getControlContextAt`, () => {
                const code = [
                    "TestProc PROCEDURE",                                  // 0
                    "Win  WINDOW('Test')",                                  // 1
                    `         ${keyword}('OK'),AT(10,10,40,15),USE(?Ctl)`,  // 2
                    '         END',                                          // 3
                    'CODE',                                                  // 4
                    'END',                                                   // 5
                ].join('\n');
                const s = buildJ(code);
                // Cursor mid-keyword on line 2.
                const ctx = s.getControlContextAt(2, 12);
                assert.ok(ctx.controlType, `expected control context for ${keyword}`);
                assert.strictEqual(ctx.controlType, keyword, `controlType matches keyword`);
            });
        }

        // Single source of truth — confirm that the ControlService recognises
        // every report-only control listed in clarion-controls.json. Tokenizer
        // whitelist for DETAIL / HEADER / FOOTER / FORM is aligned by task
        // 9c3c9c20 (mirroring the ITEMIZE alignment in Gap B), so these
        // classifications now surface through getControlContextAt — covered by
        // the next test loop.
        for (const reportControl of ['DETAIL', 'HEADER', 'FOOTER', 'FORM']) {
            test(`ControlService recognises report control \`${reportControl}\``, () => {
                const ControlService = require('../utils/ControlService').ControlService;
                assert.strictEqual(
                    ControlService.getInstance().isControl(reportControl),
                    true,
                    `${reportControl} must resolve via ControlService`
                );
            });
        }

        // Task 9c3c9c20 — tokenizer whitelist alignment for the report-only
        // controls. Each must (a) tokenize as TokenType.Structure when used
        // inside a REPORT body, and (b) surface as the controlType through
        // getControlContextAt at child positions.
        for (const reportControl of ['DETAIL', 'HEADER', 'FOOTER', 'FORM']) {
            test(`report-only control \`${reportControl}\` tokenizes as Structure inside REPORT body`, () => {
                const code = [
                    'TestProc PROCEDURE',                // 0
                    "MyRpt REPORT('Title')",             // 1
                    `       ${reportControl}`,           // 2 — bare report band keyword
                    "         STRING('hi')",             // 3
                    '       END',                        // 4
                    'CODE',                              // 5
                    'END',                               // 6
                ].join('\n');
                const tokenizer = new ClarionTokenizer(code);
                const tokens = tokenizer.tokenize();

                const struct = tokens.find(t =>
                    t.type === TokenType.Structure &&
                    t.value.toUpperCase() === reportControl
                );
                assert.ok(struct, `expected ${reportControl} to tokenize as TokenType.Structure`);
            });

            test(`report-only control \`${reportControl}\` surfaces via getControlContextAt`, () => {
                const code = [
                    'TestProc PROCEDURE',                // 0
                    "MyRpt REPORT('Title')",             // 1
                    `       ${reportControl},AT(0,0,400,30)`, // 2
                    "         STRING('hi')",             // 3
                    '       END',                        // 4
                    'CODE',                              // 5
                    'END',                               // 6
                ].join('\n');
                const s = buildJ(code);

                // Cursor mid-keyword on line 2 (after the 7-space indent).
                const ctx = s.getControlContextAt(2, 9);
                assert.ok(ctx.controlType, `expected control context for ${reportControl}`);
                assert.strictEqual(ctx.controlType, reportControl, `controlType matches keyword`);
            });
        }

        test('non-control keyword (PROCEDURE) does NOT classify as a control', () => {
            const ControlService = require('../utils/ControlService').ControlService;
            // PROCEDURE/FUNCTION are not in clarion-controls.json — must not
            // be misclassified as controls.
            assert.strictEqual(
                ControlService.getInstance().isControl('PROCEDURE'),
                false
            );
            assert.strictEqual(
                ControlService.getInstance().isControl('FUNCTION'),
                false
            );
        });
    });
});
