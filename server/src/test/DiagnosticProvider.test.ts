import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { validateCycleBreakOutsideLoop } from '../providers/diagnostics/ControlFlowDiagnostics';
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
y LONG
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
y LONG
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
y LONG
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

        test('Should NOT flag IF-ELSE with single-line ELSE statements', () => {
            const code = `TestProc PROCEDURE()
  CODE
  if GlobalResponse=RequestCancelled
                                     nts:record      = hold:nts:record
                                     nts:notes       = hold:nts:notes
                                else hold:nts:record = nts:record
                                     hold:nts:notes  = nts:notes
                                     lcl:Preset_NTS  = TRUE
                                     lcl:Empty_Notes = CHOOSE( LEN(CLIP(NTS:Notes)) = 0 )
                                end`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics - ELSE can have single-line statement');
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

        test('Should NOT flag LOOP with WHILE terminator', () => {
            const code = `TestProc PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
  WHILE i < 10
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should NOT flag LOOP with UNTIL terminator', () => {
            const code = `TestProc PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
  UNTIL i > 10
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should NOT flag FOR-style LOOP with WHILE terminator', () => {
            const code = `TestProc PROCEDURE()
x LONG
pAdr LONG
last LONG
  CODE
  pAdr = 1000h
  last = 2000h
  LOOP
    x = pAdr
  UNTIL pAdr > last
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics');
        });

        test('Should NOT flag nested LOOP with WHILE in outer loop', () => {
            const code = `TestProc PROCEDURE()
x LONG
oldLen LONG
y LONG
  CODE
  LOOP x = oldLen TO 1 BY -1
    y -= 1
  WHILE x < y
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
y LONG
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

        // TODO: This test reveals a tokenizer bug where dots after array subscripts (]).
        // are not recognized as separate END tokens. Fix tokenizer first.
        // test('Should NOT flag complex nested IF/ELSE structure', () => { ... });
    });

    suite('MODULE Termination Rules', () => {
        
        test('Should detect unterminated MODULE inside MAP', () => {
            const code = `TestProc PROCEDURE()
        MAP
            MODULE('KERNEL32')
                GetTickCount PROCEDURE(),ULONG
            ! Missing END for MODULE (and MAP)`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            // With no ENDs, MODULE will be on stack when we hit EOF
            assert.ok(diagnostics.length >= 1, 'Should have at least 1 diagnostic');
            const hasModuleDiag = diagnostics.some(d => d.message.includes('MODULE'));
            assert.ok(hasModuleDiag, 'Should report unterminated MODULE');
        });

        test('Should NOT flag MODULE with END inside MAP', () => {
            const code = `TestProc PROCEDURE()
        MAP
            MODULE('KERNEL32')
                GetTickCount PROCEDURE(),ULONG
            END
        END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            if (diagnostics.length > 0) {
                console.log('Unexpected diagnostics:');
                diagnostics.forEach(d => console.log(`  - ${d.message} (line ${d.range.start.line})`));
            }
            
            assert.strictEqual(diagnostics.length, 0, 'MODULE with END inside MAP is valid');
        });

        test('Should handle nested MAP with MODULE', () => {
            const code = `TestProc PROCEDURE()
        MAP
            INCLUDE('prototypes.inc')
            MODULE('USER32')
                MessageBoxA PROCEDURE(),LONG
            END
            MyLocalProc PROCEDURE()
        END`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'Complex MAP with MODULE should validate correctly');
        });
    });

    suite('CLASS Definitions', () => {
        
        test('Should NOT flag CLASS with END terminator', () => {
            const code = `  PROGRAM
  MAP
  END
MyClass                  Class(),type
Field1                     LONG
Method1                    PROCEDURE()
                         End
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'CLASS with END should validate correctly');
        });

        test('Should detect CLASS without terminator', () => {
            const code = `  PROGRAM
  MAP
  END
MyClass                  Class(),type
Field1                     LONG
Method1                    PROCEDURE()
  CODE
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('CLASS'), 'Message should mention CLASS');
        });

        test('Should handle CLASS with MODULE attribute', () => {
            const code = `StringTheory        Class(), type, Module('StringTheory.clw')
value                     &string,PRIVATE
Method1                    PROCEDURE()
                         End`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'CLASS with MODULE attribute should validate correctly');
        });
    });

    suite('OMIT/COMPILE Blocks', () => {

        test('Should detect OMIT without terminator', () => {
            const code = `  PROGRAM
OMIT('**END**')
StringTheory.Flush Procedure(StringTheory pStr)
  code
  return self.flush(pStr.GetValuePtr())
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('OMIT'), 'Message should mention OMIT');
            assert.ok(diagnostics[0].message.includes("'**END**'"), 'Message should mention the terminator string');
        });

        test('Should NOT flag OMIT with terminator on its own line', () => {
            const code = `  PROGRAM
OMIT('**END**')
StringTheory.Flush Procedure(StringTheory pStr)
  code
  return self.flush(pStr.GetValuePtr())
**END**
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'OMIT with terminator should validate correctly');
        });

        test('Should NOT flag OMIT with terminator in comment', () => {
            const code = `  PROGRAM
OMIT('**END**')
StringTheory.Flush Procedure(StringTheory pStr)
  code
  return self.flush(pStr.GetValuePtr())
! **END**
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'OMIT with terminator in comment should validate correctly');
        });

        test('Should NOT flag OMIT with terminator after code on same line', () => {
            const code = `  PROGRAM
OMIT('**END**')
StringTheory.Flush Procedure(StringTheory pStr)
  code
  return self.flush(pStr.GetValuePtr())
  SomeCode() **END**
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'OMIT with terminator after code should validate correctly');
        });

        test('Should detect OMIT with wrong case terminator', () => {
            const code = `  PROGRAM
OMIT('**END**')
StringTheory.Flush Procedure(StringTheory pStr)
  code
  return self.flush(pStr.GetValuePtr())
**end**
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic for case mismatch');
            assert.ok(diagnostics[0].message.includes('OMIT'), 'Message should mention OMIT');
        });

        test('Should detect COMPILE without terminator', () => {
            const code = `  PROGRAM
COMPILE('***',_WIDTH32_)
SIGNED   EQUATE(LONG)
UNSIGNED  EQUATE(ULONG)
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 1, 'Should have 1 diagnostic');
            assert.ok(diagnostics[0].message.includes('COMPILE'), 'Message should mention COMPILE');
        });

        test('Should NOT flag COMPILE with terminator', () => {
            const code = `  PROGRAM
COMPILE('***',_WIDTH32_)
SIGNED   EQUATE(LONG)
UNSIGNED  EQUATE(ULONG)
***
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'COMPILE with terminator should validate correctly');
        });

        test('Should handle nested OMIT/COMPILE blocks', () => {
            const code = `  PROGRAM
COMPILE('**32bit**',_width32_)
  COMPILE('*debug*',_debug_)
    DEBUGGER::BUTTONLIST Equate('&Continue|&Halt|&Debug')
  !*debug*
  OMIT('*debug*',_debug_)
    DEBUGGER::BUTTONLIST Equate('&Continue|&Halt')
  !*debug*
!**32bit**
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'Nested OMIT/COMPILE should validate correctly');
        });

        test('Should handle COMPILE with terminator on same line', () => {
            const code = `  PROGRAM
COMPILE('!** EndWndPrv **',_CbWndPreview_) ; WndPrvCls.Init()  !** EndWndPrv **
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'COMPILE with same-line terminator should validate correctly');
        });

        test('Should handle OMIT with terminator on same line', () => {
            const code = `  PROGRAM
OMIT('***') x = 1 ***
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'OMIT with same-line terminator should validate correctly');
        });

        test('Should detect multiple unterminated OMIT blocks', () => {
            const code = `  PROGRAM
OMIT('**END1**')
  code1
OMIT('**END2**')
  code2
  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 2, 'Should have 2 diagnostics for 2 unterminated blocks');
        });

        test('Should handle FILE declaration with OMIT/COMPILE blocks', () => {
            const code = `  PROGRAM
MAP
END

            COMPILE('***',UseIPDrv)
PrEquip                 FILE,PRE(PRE),BINDABLE,THREAD   ,DRIVER('IPDRV'),OWNER(IPDRV::OWNER)
            !***
            OMIT('***',UseIPDrv)
PrEquip                 FILE,PRE(PRE),BINDABLE,THREAD   ,DRIVER('TOPSPEED','/TCF=.\\Topspeed.TCF')
            !***
KPrEquip_ID              KEY(PRE:Project_ID,PRE:Equip_ID),NOCASE
Record                   RECORD,PRE()
Equip_ID                    STRING(15)
Project_ID                  LONG
Descr                       STRING(40)
Daily_Rate                  REAL
PC_Code                     STRING(10)
Flag                        BYTE
CreateDate                  DATE
CreateTime                  TIME
UpdateDate                  DATE
UpdateTime                  TIME
                         END
                       END

  CODE
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'FILE with OMIT/COMPILE should validate correctly');
        });
    });

    suite('RETURN Statement Validation', () => {
        test('Should flag method with return type but no RETURN statement', () => {
            const code = `  PROGRAM
MyClass CLASS
MyProc  PROCEDURE(STRING param), LONG
        END

MyClass.MyProc PROCEDURE(STRING param)
CODE
  x = 1
  ! Missing RETURN
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            const returnDiagnostics = diagnostics.filter(d => d.message.includes('RETURN'));
            assert.strictEqual(returnDiagnostics.length, 1, 'Should have 1 diagnostic for missing RETURN value');
            assert.ok(returnDiagnostics[0].message.includes('MyClass.MyProc'), 'Diagnostic should mention method name');
        });

        test('Should flag method with return type but only empty RETURN', () => {
            const code = `  PROGRAM
MyClass CLASS
GetValue PROCEDURE(), LONG
         END

MyClass.GetValue PROCEDURE()
CODE
  x = 1
  RETURN
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            const returnDiagnostics = diagnostics.filter(d => d.message.includes('all RETURN statements are empty'));
            assert.strictEqual(returnDiagnostics.length, 1, 'Should have 1 diagnostic for empty RETURN');
        });

        test('Should NOT flag method with return type and RETURN with value', () => {
            const code = `  PROGRAM
MyClass CLASS
GetValue PROCEDURE(), LONG
         END

MyClass.GetValue PROCEDURE()
CODE
  x = 1
  RETURN x`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            const returnDiagnostics = diagnostics.filter(d => d.message.includes('RETURN'));
            assert.strictEqual(returnDiagnostics.length, 0, 'Should have no diagnostics for valid RETURN');
        });

        test('Should NOT flag method without return type', () => {
            const code = `  PROGRAM
MyClass CLASS
DoStuff PROCEDURE(STRING param)
        END

MyClass.DoStuff PROCEDURE(STRING param)
CODE
  x = 1
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            const returnDiagnostics = diagnostics.filter(d => d.message.includes('RETURN'));
            assert.strictEqual(returnDiagnostics.length, 0, 'Should not flag procedure without return type');
        });

        test('Should handle RETURN with expression', () => {
            const code = `  PROGRAM
MyClass CLASS
Calculate PROCEDURE(LONG a, LONG b), LONG
          END

MyClass.Calculate PROCEDURE(LONG a, LONG b)
CODE
  RETURN a + b`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            const returnDiagnostics = diagnostics.filter(d => d.message.includes('RETURN'));
            assert.strictEqual(returnDiagnostics.length, 0, 'Should not flag RETURN with expression');
        });

        test('Should validate MAP procedures with return types', () => {
            const code = `  PROGRAM
                    MAP
MyProcedure PROCEDURE(),LONG
                    END

MyProcedure  PROCEDURE()
    CODE`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            const returnDiagnostics = diagnostics.filter(d => d.message.includes('RETURN'));
            assert.strictEqual(returnDiagnostics.length, 1, 'Should flag MAP procedure missing RETURN');
            assert.ok(returnDiagnostics[0].message.includes('MyProcedure'), 'Should mention procedure name');
        });

        test('Should NOT flag overloaded MAP procedure without return type (issue #44)', () => {
            // FileSignature(STRING, StringTheory) has no return type
            // FileSignature(STRING) has STRING return type
            // Only the second overload's implementation should be checked for RETURN
            const code = `  PROGRAM
                    MAP
FileSignature PROCEDURE(STRING pFilename,STRING pSt)
FileSignature PROCEDURE(STRING pFilename),STRING
                    END

FileSignature  PROCEDURE(STRING pFilename,STRING pSt)
    CODE
    RETURN

FileSignature  PROCEDURE(STRING pFilename)
x STRING(255)
    CODE
    RETURN x`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            const returnDiagnostics = diagnostics.filter(d => d.message.includes('RETURN'));
            assert.strictEqual(returnDiagnostics.length, 0, 'Should NOT flag the non-returning overload for missing RETURN value');
        });

        test('Should still flag the overload WITH return type if it has no RETURN value (issue #44)', () => {
            const code = `  PROGRAM
                    MAP
FileSignature PROCEDURE(STRING pFilename,STRING pSt)
FileSignature PROCEDURE(STRING pFilename),STRING
                    END

FileSignature  PROCEDURE(STRING pFilename,STRING pSt)
    CODE
    RETURN

FileSignature  PROCEDURE(STRING pFilename)
x STRING(255)
    CODE
    RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            const returnDiagnostics = diagnostics.filter(d => d.message.includes('RETURN'));
            assert.strictEqual(returnDiagnostics.length, 1, 'Should flag the overload with STRING return but empty RETURN');
            assert.ok(returnDiagnostics[0].message.includes('FileSignature'), 'Diagnostic should mention FileSignature');
        });
    });

    suite('IF-ELSE with Multiple Statements', () => {
        
        test('Should NOT flag ELSE with single statement', () => {
            const code = `TestProc PROCEDURE()
x LONG
y LONG
  CODE
  if x > 0
    y = 1
  else y = 2
  end
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics for single statement ELSE');
        });

        test('Should NOT flag ELSE with multiple statements using dot terminators', () => {
            const code = `TestProc PROCEDURE()
x LONG
y LONG
z LONG
  CODE
  if x > 0
    y = 1
  else y = 2. z = 3.
  end
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            assert.strictEqual(diagnostics.length, 0, 'Should have no diagnostics when dot terminators are used');
        });
    });

    suite('RECORD Keyword as Field Name', () => {
        
        test('Should NOT flag RECORD keyword when used as field name with prefix', () => {
            const code = `TestProc PROCEDURE()
nts:record      LONG
hold:nts:record LONG
nts:notes       STRING(100)
hold:nts:notes  STRING(100)
lcl:Preset_NTS  BYTE
lcl:Empty_Notes BYTE
  CODE
  if GlobalResponse=RequestCancelled
    nts:record      = hold:nts:record
    nts:notes       = hold:nts:notes
  else hold:nts:record = nts:record
    hold:nts:notes  = nts:notes
    lcl:Preset_NTS  = TRUE
    lcl:Empty_Notes = CHOOSE( LEN(CLIP(NTS:Notes)) = 0 )
  end
  RETURN`;

            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);

            // Should NOT flag 'record' as a keyword when it's a field name with prefix
            const recordErrors = diagnostics.filter(d => d.message.toLowerCase().includes('record') && 
                                                         d.message.toLowerCase().includes('not terminated'));
            assert.strictEqual(recordErrors.length, 0, 'Should not flag RECORD keyword when used as prefixed field name');
        });
    });

    suite('CLASS Property Validation', () => {
        
        test('Should flag QUEUE structure as direct CLASS property', () => {
            const code = `MyClass CLASS
MyQueue QUEUE
Field1  LONG
        END
        END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            const queueErrors = diagnostics.filter(d => 
                d.message.toLowerCase().includes('queue') && 
                d.message.toLowerCase().includes('class'));
            assert.strictEqual(queueErrors.length, 1, 'Should have 1 diagnostic for QUEUE in CLASS');
            assert.ok(queueErrors[0].message.toLowerCase().includes('reference'), 
                     'Message should mention using a reference (&QUEUE)');
        });

        test('Should NOT flag QUEUE reference (&QUEUE) as CLASS property', () => {
            const code = `MyClass CLASS
MyQueueRef &QUEUE
           END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            const queueErrors = diagnostics.filter(d => 
                d.message.toLowerCase().includes('queue') && 
                d.message.toLowerCase().includes('class'));
            assert.strictEqual(queueErrors.length, 0, 'Should NOT flag QUEUE reference in CLASS');
        });

        test('Should NOT flag GROUP structure as CLASS property', () => {
            const code = `MyClass CLASS
MyGroup GROUP
Field1  LONG
Field2  LONG
        END
        END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            const groupErrors = diagnostics.filter(d => 
                d.message.toLowerCase().includes('group') && 
                d.message.toLowerCase().includes('class'));
            assert.strictEqual(groupErrors.length, 0, 'GROUP is valid as CLASS property');
        });

        test('Should flag multiple QUEUE structures in CLASS', () => {
            const code = `MyClass CLASS
Queue1  QUEUE
Field1  LONG
        END
Queue2  QUEUE
Field2  STRING(20)
        END
        END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            const queueErrors = diagnostics.filter(d => 
                d.message.toLowerCase().includes('queue') && 
                d.message.toLowerCase().includes('class'));
            assert.strictEqual(queueErrors.length, 2, 'Should flag both QUEUEs in CLASS');
        });
    });

    suite('QUEUE Structure Nesting Validation', () => {
        
        test('Should flag QUEUE structure nested inside QUEUE', () => {
            const code = `MyQueue QUEUE
InnerQueue  QUEUE
Field1      LONG
            END
            END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            const nestedQueueErrors = diagnostics.filter(d => 
                d.message.toLowerCase().includes('queue') && 
                d.message.toLowerCase().includes('nested'));
            assert.strictEqual(nestedQueueErrors.length, 1, 'Should have 1 diagnostic for nested QUEUE');
            assert.ok(nestedQueueErrors[0].message.toLowerCase().includes('reference'), 
                     'Message should mention using a reference (&QUEUE)');
        });

        test('Should NOT flag QUEUE reference (&QUEUE) inside QUEUE', () => {
            const code = `MyQueue QUEUE
InnerQueueRef &QUEUE
              END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            const nestedQueueErrors = diagnostics.filter(d => 
                d.message.toLowerCase().includes('queue') && 
                d.message.toLowerCase().includes('nested'));
            assert.strictEqual(nestedQueueErrors.length, 0, 'Should NOT flag QUEUE reference in QUEUE');
        });

        test('Should NOT flag GROUP structure inside QUEUE', () => {
            const code = `MyQueue QUEUE
MyGroup GROUP
Field1  LONG
Field2  LONG
        END
        END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            const groupErrors = diagnostics.filter(d => 
                d.message.toLowerCase().includes('group') && 
                d.message.toLowerCase().includes('queue'));
            assert.strictEqual(groupErrors.length, 0, 'GROUP is valid inside QUEUE');
        });

        test('Should flag multiple nested QUEUEs', () => {
            const code = `MyQueue QUEUE
Queue1  QUEUE
Field1  LONG
        END
Queue2  QUEUE
Field2  STRING(20)
        END
        END`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            const nestedQueueErrors = diagnostics.filter(d => 
                d.message.toLowerCase().includes('queue') && 
                d.message.toLowerCase().includes('nested'));
            assert.strictEqual(nestedQueueErrors.length, 2, 'Should flag both nested QUEUEs');
        });
    });

    // ── Discard-return-value warnings for plain MAP procedure calls (Issue #51) ─────────────

    suite('validateDiscardedReturnValuesForPlainCalls', () => {

        function discardDiags(code: string) {
            const doc = createDocument(code);
            // Match only plain (non-dot-access) call diagnostics: "Return value of 'ProcName'"
            // where ProcName has no dot (dot-access is handled by validateDiscardedReturnValues).
            return DiagnosticProvider.validateDocument(doc).filter(d =>
                /^Return value of '[A-Za-z_][A-Za-z0-9_]*' is discarded/.test(d.message)
            );
        }

        test('bare call to returning MAP procedure warns', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(),LONG
  END

MainProc    PROCEDURE()
  CODE
  GetStatus()
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 1, 'should warn once');
            assert.ok(diags[0].message.includes("'GetStatus'"), 'message names the procedure');
        });

        test('no-paren bare call warns', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(),LONG
  END

MainProc    PROCEDURE()
  CODE
  GetStatus
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 1, 'should warn for no-paren call');
        });

        test('assignment suppresses warning', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(),LONG
  END

MainProc    PROCEDURE()
result      LONG
  CODE
  result = GetStatus()
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 0, 'assignment captures the return value');
        });

        test('PROC attribute on declaration suppresses warning', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(),PROC,LONG
  END

MainProc    PROCEDURE()
  CODE
  GetStatus()
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 0, 'PROC attribute suppresses warning');
        });

        test('procedure with no return type does not warn', () => {
            const code = `
  MAP
DoSomething PROCEDURE()
  END

MainProc    PROCEDURE()
  CODE
  DoSomething()
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 0, 'void procedure should not warn');
        });

        test('void procedure followed by returning procedure: void must not inherit return type', () => {
            // Regression: when DoNothing() has nothing after its closing ')' on the same
            // line, startIdx pointed to the NEXT line's first token. extractReturnType then
            // used that next line as its anchor and falsely picked up LONG from GetValue,
            // causing DoNothing() calls to be warned.
            const code = `
  MAP
DoNothing   PROCEDURE(STRING pText)
GetValue    PROCEDURE(),LONG
  END

MainProc    PROCEDURE()
  CODE
  DoNothing('hello')
  DoNothing('world')
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 0, 'void procedure before a returning one must not generate warnings');
        });

        test('any overload with PROC suppresses warning for that name', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(LONG),LONG
GetStatus   PROCEDURE(),PROC,LONG
  END

MainProc    PROCEDURE()
  CODE
  GetStatus()
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 0, 'PROC overload suppresses all overloads of that name');
        });

        test('dot-access call is not flagged (handled by validateDiscardedReturnValues)', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(),LONG
  END

MainProc    PROCEDURE()
  CODE
  Self.GetStatus()
`;
            // dot-access calls are filtered out by the dot-prefix check
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 0, 'dot-access should not be flagged by plain-call validator');
        });

        test('MODULE-inside-MAP procedure warns', () => {
            const code = `
  MAP
    MODULE('helper.clw')
GetHelper   PROCEDURE(),LONG
    END
  END

MainProc    PROCEDURE()
  CODE
  GetHelper()
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 1, 'MODULE declaration should be included');
        });

        test('MAP with MODULE blocks plus returning proc outside MODULE warns', () => {
            // Mirrors real-world files where MODULE blocks are inside the MAP alongside
            // plain procedure declarations (like Trace PROCEDURE(...),LONG).
            const code = `
  MAP
    MODULE('kernel32')
      cz_LoadLibrary(*CSTRING lpFileName),LONG,PASCAL,RAW
      cz_FreeLibrary(LONG hModule),BOOL,PROC,PASCAL,RAW
    END
    MODULE('user32')
      ShowWindow(LONG hWnd, LONG nCmdShow),BOOL,PASCAL,RAW
    END
Trace       PROCEDURE(STRING p_LogText),LONG
VoidHelper  PROCEDURE(STRING pText)
  END

MainProc    PROCEDURE()
  CODE
  Trace('hello')
  Trace('world')
  VoidHelper('no warn')
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 2, 'Trace() calls should each warn; VoidHelper should not');
            assert.ok(diags.every(d => d.message.includes("'Trace'")), 'warnings are for Trace only');
        });

        test('multiple returning procedures - warns for each bare call', () => {
            const code = `
  MAP
FuncA   PROCEDURE(),LONG
FuncB   PROCEDURE(),STRING
  END

MainProc    PROCEDURE()
  CODE
  FuncA()
  FuncB()
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 2, 'should warn for both bare calls');
        });

        test('call only in first procedure, not second', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(),LONG
  END

ProcA       PROCEDURE()
  CODE
  GetStatus()

ProcB       PROCEDURE()
  CODE
  x = 1
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 1, 'should warn only in ProcA');
        });

        test('comparison expression using return value does not warn', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(),LONG
  END

MainProc    PROCEDURE()
  CODE
  IF GetStatus() = 1
  END
`;
            const diags = discardDiags(code);
            assert.strictEqual(diags.length, 0, 'used in IF condition — return value is consumed');
        });
    });

    // ── Same tests via the production code path (DocumentStructure pre-processed) ───────────
    // In production, TokenCache runs DocumentStructure before validateDocument, which sets
    // MapProcedure subtypes — activating the hasSubType branch. The tests above use the raw
    // tokenizer path (no DocumentStructure), exercising only the !hasSubType branch.

    suite('validateDiscardedReturnValuesForPlainCalls (with DocumentStructure — production path)', () => {

        function discardDiagsWithDS(code: string) {
            const doc = createDocument(code);
            const tokens = new ClarionTokenizer(code).tokenize();
            new DocumentStructure(tokens).process();
            return DiagnosticProvider.validateDocument(doc, tokens).filter(d =>
                /^Return value of '[A-Za-z_][A-Za-z0-9_]*' is discarded/.test(d.message)
            );
        }

        test('bare call to returning MAP procedure warns (DS path)', () => {
            const code = `
  MAP
GetStatus   PROCEDURE(),LONG
  END

MainProc    PROCEDURE()
  CODE
  GetStatus()
`;
            const diags = discardDiagsWithDS(code);
            assert.strictEqual(diags.length, 1, 'should warn once');
        });

        test('void procedure followed by returning procedure: void must not inherit return type (DS path)', () => {
            const code = `
  MAP
VoidProc    PROCEDURE(STRING pText)
Returning   PROCEDURE(),LONG
  END

MainProc    PROCEDURE()
  CODE
  VoidProc('test')
  Returning()
`;
            const diags = discardDiagsWithDS(code);
            assert.ok(diags.every(d => d.message.includes("'Returning'")), 'VoidProc must not warn');
            assert.strictEqual(diags.length, 1, 'only Returning() should warn');
        });

        test('MAP with MODULE blocks plus returning proc outside MODULE warns (DS path)', () => {
            const code = `
  MAP
    MODULE('kernel32')
      cz_LoadLibrary(*CSTRING lpFileName),LONG,PASCAL,RAW
      cz_FreeLibrary(LONG hModule),BOOL,PROC,PASCAL,RAW
    END
    MODULE('user32')
      ShowWindow(LONG hWnd, LONG nCmdShow),BOOL,PASCAL,RAW
    END
Trace       PROCEDURE(STRING p_LogText),LONG
VoidHelper  PROCEDURE(STRING pText)
  END

MainProc    PROCEDURE()
  CODE
  Trace('hello')
  Trace('world')
  VoidHelper('no warn')
`;
            const diags = discardDiagsWithDS(code);
            assert.strictEqual(diags.length, 2, 'Trace() calls should each warn; VoidHelper should not');
            assert.ok(diags.every(d => d.message.includes("'Trace'")), 'warnings are for Trace only');
        });

        test('shorthand MAP MODULE proc with param types but no return type must not warn (DS path)', () => {
            // PQClear(Long pResult),Raw,C,Name('PQClear'),dll(1) — the parameter type Long
            // must not be mistaken for a return type.
            const code = `
  MAP
    MODULE('libpq.dll')
      PQClear(Long pResult),Raw,C,Name('PQClear'),dll(1)
    END
  END

MainProc    PROCEDURE()
  CODE
  PQClear(0)
`;
            const diags = discardDiagsWithDS(code);
            assert.strictEqual(diags.length, 0, 'PQClear has no return type — no warning expected');
        });

        test('shorthand MAP MODULE proc with param types AND return type does warn (DS path)', () => {
            // PQExec(Long conn, *CSTRING cmd),Long,Raw,C — return type Long after params.
            const code = `
  MAP
    MODULE('libpq.dll')
      PQExec(Long conn, *CSTRING cmd),Long,Raw,C,Name('PQExec'),dll(1)
    END
  END

MainProc    PROCEDURE()
  CODE
  PQExec(0,'SELECT 1')
`;
            const diags = discardDiagsWithDS(code);
            assert.strictEqual(diags.length, 1, 'PQExec returns Long — discarded call should warn');
            assert.ok(diags[0].message.includes("'PQExec'"), 'warning is for PQExec');
        });

        test('GlobalProcedure with return type warns when return value discarded (no MAP)', () => {
            // Trace is a standalone procedure (GlobalProcedure subtype) — no MAP declaration.
            // Calls that discard its return value should be flagged.
            const code = `
Trace       PROCEDURE(STRING p_LogText),LONG
  CODE
  RETURN 0

MainProc    PROCEDURE()
  CODE
  Trace('hello')
  Trace('world')
`;
            const diags = discardDiagsWithDS(code);
            assert.strictEqual(diags.length, 2, 'each Trace() call should warn');
            assert.ok(diags.every(d => d.message.includes("'Trace'")), 'warnings name Trace');
        });

        test('GlobalProcedure with PROC attribute does not warn', () => {
            const code = `
Trace       PROCEDURE(STRING p_LogText),PROC,LONG
  CODE
  RETURN 0

MainProc    PROCEDURE()
  CODE
  Trace('hello')
`;
            const diags = discardDiagsWithDS(code);
            assert.strictEqual(diags.length, 0, 'PROC attribute suppresses warning');
        });

        test('GlobalProcedure with no return type does not warn', () => {
            const code = `
Trace       PROCEDURE(STRING p_LogText)
  CODE
  RETURN

MainProc    PROCEDURE()
  CODE
  Trace('hello')
`;
            const diags = discardDiagsWithDS(code);
            assert.strictEqual(diags.length, 0, 'void GlobalProcedure should not warn');
        });
    });

    suite('validateCrossFilePlainCalls (async cross-file)', () => {
        // These tests pre-populate TokenCache with a "program file" that declares a
        // global MAP procedure, then validate a "member file" that calls it.
        // validateDiscardedReturnValues (async) performs the cross-file scan.

        const { TokenCache } = require('../TokenCache');
        const { MemberLocatorService } = require('../services/MemberLocatorService');

        function createDoc(uri: string, code: string): TextDocument {
            return TextDocument.create(uri, 'clarion', 1, code);
        }

        function populateCache(doc: TextDocument): void {
            TokenCache.getInstance().getTokens(doc);
        }

        teardown(() => {
            TokenCache.getInstance().clearAllTokens();
        });

        test('cross-file: bare call to global MAP procedure warns', async () => {
            const programCode = `
  PROGRAM
  MAP
TestProc  PROCEDURE(),LONG
  END
  CODE
`;
            const memberCode = `
  MEMBER('prog.clw')
CallerProc  PROCEDURE()
  CODE
  TestProc()
`;
            const progDoc = createDoc('file:///prog.clw', programCode);
            const memberDoc = createDoc('file:///member.clw', memberCode);
            populateCache(progDoc);

            const tokens = TokenCache.getInstance().getTokens(memberDoc);
            const locator = new MemberLocatorService();
            const diags = await DiagnosticProvider.validateDiscardedReturnValues(tokens, memberDoc, locator);

            const plain = diags.filter((d: { message: string }) =>
                /^Return value of '[A-Za-z_][A-Za-z0-9_]*' is discarded/.test(d.message)
            );
            assert.strictEqual(plain.length, 1, 'should warn for bare TestProc() call');
            assert.ok(plain[0].message.includes("'TestProc'"));
        });

        test('cross-file: assignment suppresses warning', async () => {
            const programCode = `
  PROGRAM
  MAP
TestProc  PROCEDURE(),LONG
  END
  CODE
`;
            const memberCode = `
  MEMBER('prog.clw')
CallerProc  PROCEDURE()
Result  LONG
  CODE
  Result = TestProc()
`;
            const progDoc = createDoc('file:///prog.clw', programCode);
            const memberDoc = createDoc('file:///member.clw', memberCode);
            populateCache(progDoc);

            const tokens = TokenCache.getInstance().getTokens(memberDoc);
            const locator = new MemberLocatorService();
            const diags = await DiagnosticProvider.validateDiscardedReturnValues(tokens, memberDoc, locator);

            const plain = diags.filter((d: { message: string }) =>
                /^Return value of '[A-Za-z_][A-Za-z0-9_]*' is discarded/.test(d.message)
            );
            assert.strictEqual(plain.length, 0, 'assignment captures return value — no warning');
        });

        test('cross-file: PROC attribute on declaration suppresses warning', async () => {
            const programCode = `
  PROGRAM
  MAP
TestProc  PROCEDURE(),LONG,PROC
  END
  CODE
`;
            const memberCode = `
  MEMBER('prog.clw')
CallerProc  PROCEDURE()
  CODE
  TestProc()
`;
            const progDoc = createDoc('file:///prog.clw', programCode);
            const memberDoc = createDoc('file:///member.clw', memberCode);
            populateCache(progDoc);

            const tokens = TokenCache.getInstance().getTokens(memberDoc);
            const locator = new MemberLocatorService();
            const diags = await DiagnosticProvider.validateDiscardedReturnValues(tokens, memberDoc, locator);

            const plain = diags.filter((d: { message: string }) =>
                /^Return value of '[A-Za-z_][A-Za-z0-9_]*' is discarded/.test(d.message)
            );
            assert.strictEqual(plain.length, 0, 'PROC attribute — no warning');
        });

        test('cross-file: no return type — no warning', async () => {
            const programCode = `
  PROGRAM
  MAP
VoidProc  PROCEDURE()
  END
  CODE
`;
            const memberCode = `
  MEMBER('prog.clw')
CallerProc  PROCEDURE()
  CODE
  VoidProc()
`;
            const progDoc = createDoc('file:///prog.clw', programCode);
            const memberDoc = createDoc('file:///member.clw', memberCode);
            populateCache(progDoc);

            const tokens = TokenCache.getInstance().getTokens(memberDoc);
            const locator = new MemberLocatorService();
            const diags = await DiagnosticProvider.validateDiscardedReturnValues(tokens, memberDoc, locator);

            const plain = diags.filter((d: { message: string }) =>
                /^Return value of '[A-Za-z_][A-Za-z0-9_]*' is discarded/.test(d.message)
            );
            assert.strictEqual(plain.length, 0, 'void procedure — no warning');
        });
    });

    // ─── CYCLE / BREAK outside LOOP or ACCEPT (issue #64) ───────────────────

    suite('validateCycleBreakOutsideLoop', () => {

        function cycleBreakDiags(code: string) {
            const doc = createDocument(code);
            const tokens = new ClarionTokenizer(code).tokenize();
            return validateCycleBreakOutsideLoop(tokens, doc);
        }

        test('BREAK inside LOOP — no warning', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  LOOP
    IF SomeCondition
      BREAK
    END
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('CYCLE inside LOOP — no warning', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  LOOP
    IF SomeCondition
      CYCLE
    END
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('BREAK inside ACCEPT — no warning', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  OPEN(Window)
  ACCEPT
    IF ACCEPTED() = ?Ok
      BREAK
    END
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('CYCLE inside ACCEPT — no warning', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  OPEN(Window)
  ACCEPT
    CASE EVENT()
    OF EVENT:Move
      CYCLE
    END
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('BREAK outside any loop — warns', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  BREAK
`;
            const diags = cycleBreakDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes('BREAK'));
        });

        test('CYCLE outside any loop — warns', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  CYCLE
`;
            const diags = cycleBreakDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes('CYCLE'));
        });

        test('nested LOOP/ACCEPT — inner BREAK valid', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  LOOP
    ACCEPT
      IF x
        BREAK
      END
    END
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('BREAK after LOOP ends — warns', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  LOOP
    x = 1
  END
  BREAK
`;
            const diags = cycleBreakDiags(code);
            assert.strictEqual(diags.length, 1);
        });

        test('BREAK inside LOOP with CASE containing token:function equate — no warning (#86)', () => {
            // token:function is an equate identifier; the word "function" must not reset inCodeSection
            const code = `
MyProc  PROCEDURE()
  CODE
  LOOP
    CASE nexttoken
    of token:function
      x = 1
    end
    If x >= 10 then break.
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('validateDocument includes CYCLE/BREAK diagnostic', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  CYCLE
`;
            const doc = createDocument(code);
            const diags = DiagnosticProvider.validateDocument(doc);
            const cfDiags = diags.filter(d => d.message.includes('CYCLE') || d.message.includes('BREAK'));
            assert.ok(cfDiags.length >= 1, 'validateDocument should include CYCLE/BREAK diagnostics');
        });

        // ─────────────────────────────────────────────────────────────────────
        // #65 follow-up: labelled BREAK/CYCLE target validation
        // ─────────────────────────────────────────────────────────────────────

        test('BREAK Label inside matching labelled LOOP — no warning', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
Loop1 LOOP
    BREAK Loop1
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('CYCLE Label inside matching labelled ACCEPT — no warning', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
Outer ACCEPT
    CYCLE Outer
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('case-mismatched label — case-insensitive match — no warning', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
Loop1 LOOP
    BREAK loop1
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('BREAK Outer from inside nested Inner labelled LOOP — no warning', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
Outer LOOP
  Inner LOOP
      BREAK Outer
    END
  END
`;
            assert.strictEqual(cycleBreakDiags(code).length, 0);
        });

        test('BREAK NoSuchLabel inside an unlabelled loop — warns (label not enclosing)', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  LOOP
    BREAK NoSuchLabel
  END
`;
            const diags = cycleBreakDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'NoSuchLabel'"));
            assert.ok(diags[0].message.includes('does not refer to'));
        });

        test('BREAK Label outside any loop at all — warns (label not enclosing)', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
  BREAK Loop1
`;
            const diags = cycleBreakDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'Loop1'"));
        });

        test('BREAK Inner from outer scope but past inner loop end — warns', () => {
            const code = `
MyProc  PROCEDURE()
  CODE
Outer LOOP
  Inner LOOP
      x = 1
    END
    BREAK Inner
  END
`;
            const diags = cycleBreakDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'Inner'"));
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue #69 — Reserved keyword label diagnostics
// ─────────────────────────────────────────────────────────────────────────────
suite('DiagnosticProvider - Reserved Keyword Labels (#69)', () => {

    function labelDiags(code: string) {
        return DiagnosticProvider.validateDocument(createDocument(code))
            .filter(d => d.message.includes('reserved') || d.message.includes('cannot be used as a label') || d.message.includes('cannot be the label of a PROCEDURE'));
    }

    // ── Case 1: fully reserved keywords used as labels ───────────────────────

    test('RETURN at col 0 as variable label → error', () => {
        const code = `TestProc  PROCEDURE()
RETURN  BYTE,AUTO
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'Should flag RETURN as reserved label');
        assert.ok(diags[0].message.toUpperCase().includes('RETURN'));
    });

    test('WHILE at col 0 as variable label → error', () => {
        const code = `TestProc  PROCEDURE()
WHILE   LONG
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'Should flag WHILE as reserved label');
    });

    test('CYCLE at col 0 as variable label → error', () => {
        const code = `TestProc  PROCEDURE()
CYCLE   BYTE
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'Should flag CYCLE as reserved label');
    });

    test('GOTO at col 0 as variable label → error', () => {
        const code = `TestProc  PROCEDURE()
GOTO    LONG
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'Should flag GOTO as reserved label');
    });

    test('Keyword matching is case-insensitive', () => {
        const code = `TestProc  PROCEDURE()
return  BYTE,AUTO
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'Case-insensitive: return should be flagged');
    });

    test('Normal label (non-reserved) at col 0 → no error', () => {
        const code = `TestProc  PROCEDURE()
MyVar   LONG
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 0, 'Normal label should not be flagged');
    });

    test('RETURN keyword in code body (not col 0) → no error', () => {
        const code = `TestProc  PROCEDURE()
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 0, 'Keyword in code section should not be flagged');
    });

    // ── Case 2: structure-only keywords as PROCEDURE labels ──────────────────

    test('WINDOW as PROCEDURE label → error', () => {
        const code = `WINDOW  PROCEDURE()
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'Should flag WINDOW as PROCEDURE label');
        assert.ok(diags[0].message.toUpperCase().includes('WINDOW'));
    });

    test('CLASS as PROCEDURE label → error', () => {
        const code = `CLASS   PROCEDURE()
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'Should flag CLASS as PROCEDURE label');
    });

    test('QUEUE as PROCEDURE label → error', () => {
        const code = `QUEUE   PROCEDURE()
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'Should flag QUEUE as PROCEDURE label');
    });

    test('WINDOW as structure label (valid) → no error', () => {
        const code = `TestProc  PROCEDURE()
WINDOW  WINDOW('Caption'),AT(,,300,200)
          BUTTON('OK'),AT(10,10,50,14),USE(?OK)
        END
  CODE
  OPEN(WINDOW)
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 0, 'WINDOW as data structure label should not be flagged');
    });

    test('CLASS as structure label (valid) → no error', () => {
        const code = `TestProc  PROCEDURE()
CLASS   CLASS(BaseClass)
Init      PROCEDURE()
        END
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 0, 'CLASS as CLASS structure label should not be flagged');
    });

    // ── Case 3: reserved keywords as field/method names inside structures ─────

    test('CODE as field label inside GROUP → no error', () => {
        const code = `MyGroup GROUP
Code      LONG
End`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 0, 'CODE is valid as a field name inside GROUP');
    });

    test('CODE as method name inside CLASS → no error', () => {
        const code = `MyClass CLASS
Code      PROCEDURE()
End`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 0, 'CODE is valid as a method name inside CLASS');
    });

    test('JOIN as method name inside CLASS → no error', () => {
        const code = `MyClass CLASS
Join      PROCEDURE()
End`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 0, 'JOIN is valid as a method name inside CLASS');
    });

    test('DATA as field label inside QUEUE → no error', () => {
        const code = `MyQueue QUEUE
Data      STRING(20)
End`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 0, 'DATA is valid as a field name inside QUEUE');
    });

    test('CODE as standalone procedure label (outside structure) → error', () => {
        const code = `CODE    PROCEDURE()
  CODE
  RETURN`;
        const diags = labelDiags(code);
        assert.strictEqual(diags.length, 1, 'CODE as standalone procedure label should still be flagged');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap L follow-up — VIEW PROJECT(field) validation against FROM file
// ─────────────────────────────────────────────────────────────────────────────
import { validateViewProjectFields } from '../providers/diagnostics/StructureDiagnostics';
import { validateUndeclaredVariables } from '../providers/diagnostics/UndeclaredVariableDiagnostics';
import { serverSettings } from '../serverSettings';
import { TokenCache } from '../TokenCache';

suite('DiagnosticProvider - VIEW PROJECT field validation (Gap L follow-up)', () => {

    function viewProjectDiags(code: string) {
        const doc = createDocument(code);
        const tokens = new ClarionTokenizer(code).tokenize();
        return validateViewProjectFields(tokens, doc);
    }

    test('PROJECT with all fields present on FROM file — no warning', () => {
        const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
Name STRING(40)
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Id, Cus:Name)
       END
`;
        assert.strictEqual(viewProjectDiags(code).length, 0);
    });

    test('PROJECT with one missing field — warns on the offending name only', () => {
        const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
Name STRING(40)
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Id, Cus:Bogus)
       END
`;
        const diags = viewProjectDiags(code);
        assert.strictEqual(diags.length, 1);
        assert.ok(diags[0].message.includes("'Cus:Bogus'"));
        assert.ok(diags[0].message.includes("'Customer'"));
    });

    test('PROJECT with bare (unprefixed) field name matches RECORD field — no warning', () => {
        const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Id)
       END
`;
        assert.strictEqual(viewProjectDiags(code).length, 0);
    });

    test('case-insensitive name match — no warning', () => {
        const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(CUS:id)
       END
`;
        assert.strictEqual(viewProjectDiags(code).length, 0);
    });

    test('FROM file declared in another doc — skipped silently (no false positive)', () => {
        // No FILE structure in this document — simulates the cross-file case.
        const code = `MyView VIEW(Customer)
       PROJECT(Cus:Id)
       END
`;
        assert.strictEqual(viewProjectDiags(code).length, 0);
    });

    test('VIEW with no PROJECT clause — skipped silently', () => {
        const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

MyView VIEW(Customer)
       END
`;
        assert.strictEqual(viewProjectDiags(code).length, 0);
    });

    test('JOIN field name is NOT validated as a PROJECT target', () => {
        // Bogus field appears inside JOIN(...) — only PROJECT clauses are validated.
        const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Id)
       JOIN(SomeFile, Bogus, Cus:Id)
       END
`;
        assert.strictEqual(viewProjectDiags(code).length, 0);
    });

    test('multiple missing fields — one warning per offending name', () => {
        const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Bogus1, Cus:Id, Cus:Bogus2)
       END
`;
        const diags = viewProjectDiags(code);
        assert.strictEqual(diags.length, 2);
        assert.ok(diags[0].message.includes('Bogus1'));
        assert.ok(diags[1].message.includes('Bogus2'));
    });

    test('validateDocument includes the VIEW PROJECT diagnostic', () => {
        const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Bogus)
       END
`;
        const doc = createDocument(code);
        const diags = DiagnosticProvider.validateDocument(doc);
        const viewDiags = diags.filter(d => d.message.includes('Cus:Bogus'));
        assert.ok(viewDiags.length >= 1, 'validateDocument should surface VIEW PROJECT diagnostic');
    });

    // d4fe847b — two extensions over v1.
    suite('JOIN field validation (d4fe847b)', () => {
        test('JOIN with all fields present on joined file — no warning', () => {
            const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

Orders FILE,DRIVER('TopSpeed'),PRE(Ord)
Record RECORD
Id    LONG
CusId LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Id)
       JOIN(Orders, Ord:CusId, Ord:Id)
       END
`;
            assert.strictEqual(viewProjectDiags(code).length, 0);
        });

        test('JOIN with bogus field on joined file — warns on the offending field', () => {
            const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

Orders FILE,DRIVER('TopSpeed'),PRE(Ord)
Record RECORD
Id    LONG
CusId LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Id)
       JOIN(Orders, Ord:Bogus)
       END
`;
            const diags = viewProjectDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'Ord:Bogus'"));
            assert.ok(diags[0].message.includes("'Orders'"));
        });

        test('JOIN with unresolved file — skipped silently (no false positive)', () => {
            // Mirror of the v1 FROM-not-found case. Joined file isn't declared
            // anywhere reachable, so the validator can't tell whether the
            // following names are valid fields. Silent skip.
            const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Id)
       JOIN(SomeOtherFile, BogusField)
       END
`;
            assert.strictEqual(viewProjectDiags(code).length, 0);
        });

        test('INNER JOIN / OUTER JOIN — same field validation applied', () => {
            const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

Orders FILE,DRIVER('TopSpeed'),PRE(Ord)
Record RECORD
Id    LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Id)
       INNER JOIN(Orders, Ord:Bogus)
       END
`;
            const diags = viewProjectDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'Ord:Bogus'"));
        });

        test('Multiple JOIN clauses — each validated independently', () => {
            const code = `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

Orders FILE,DRIVER('TopSpeed'),PRE(Ord)
Record RECORD
Id    LONG
     END
     END

Items FILE,DRIVER('TopSpeed'),PRE(Itm)
Record RECORD
Id    LONG
     END
     END

MyView VIEW(Customer)
       PROJECT(Cus:Id)
       JOIN(Orders, Ord:Id)
       JOIN(Items, Itm:Bogus)
       END
`;
            const diags = viewProjectDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'Itm:Bogus'"));
            assert.ok(diags[0].message.includes("'Items'"));
        });
    });

    suite('Cross-file FROM resolution (d4fe847b)', () => {
        // Cross-file resolution depends on the FileResolver finding INCLUDEs
        // in the current document and walking them. The simplest test path
        // is to write the include target to a temp file and reference it
        // via INCLUDE('...'). The tokenizer parses INCLUDE directives and
        // sets `referencedFile`, which the resolver consumes.
        const fs = require('fs');
        const os = require('os');
        const path = require('path');

        let tempDir: string;

        suiteSetup(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clarion-d4fe847b-'));
        });

        suiteTeardown(() => {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch { /* best-effort cleanup */ }
        });

        function writeIncFile(name: string, content: string): string {
            const incPath = path.join(tempDir, name);
            fs.writeFileSync(incPath, content, 'utf8');
            return incPath;
        }

        function viewProjectDiagsAtPath(clwBaseName: string, code: string) {
            const clwPath = path.join(tempDir, clwBaseName);
            const uri = 'file:///' + clwPath.replace(/\\/g, '/');
            const doc = TextDocument.create(uri, 'clarion', 1, code);
            const tokens = new ClarionTokenizer(code).tokenize();
            return validateViewProjectFields(tokens, doc);
        }

        test('FROM file declared in INCLUDEd .inc — resolves cross-file', () => {
            writeIncFile('files.inc',
                `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
Name STRING(40)
     END
     END
`);
            const code = `  MEMBER('parent.clw')
  INCLUDE('files.inc')

MyView VIEW(Customer)
       PROJECT(Cus:Id, Cus:Name)
       END
`;
            assert.strictEqual(viewProjectDiagsAtPath('childA.clw', code).length, 0);
        });

        test('FROM file declared in INCLUDEd .inc — bogus field warns cross-file', () => {
            writeIncFile('files2.inc',
                `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END
`);
            const code = `  MEMBER('parent.clw')
  INCLUDE('files2.inc')

MyView VIEW(Customer)
       PROJECT(Cus:Bogus)
       END
`;
            const diags = viewProjectDiagsAtPath('childB.clw', code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'Cus:Bogus'"));
        });

        test('JOIN file declared in INCLUDEd .inc — bogus field warns cross-file', () => {
            writeIncFile('files3.inc',
                `Customer FILE,DRIVER('TopSpeed'),PRE(Cus)
Record RECORD
Id   LONG
     END
     END

Orders FILE,DRIVER('TopSpeed'),PRE(Ord)
Record RECORD
Id    LONG
     END
     END
`);
            const code = `  MEMBER('parent.clw')
  INCLUDE('files3.inc')

MyView VIEW(Customer)
       PROJECT(Cus:Id)
       JOIN(Orders, Ord:Bogus)
       END
`;
            const diags = viewProjectDiagsAtPath('childC.clw', code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'Ord:Bogus'"));
        });

        test('FROM file unreachable (no INCLUDE) — silent skip preserved', () => {
            // No INCLUDE directive, no local FILE — should still be the v1
            // silent-skip path, not a false positive.
            const code = `  MEMBER('parent.clw')

MyView VIEW(SomeFile)
       PROJECT(Smt:Id)
       END
`;
            assert.strictEqual(viewProjectDiagsAtPath('childD.clw', code).length, 0);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Issue #62 — Undeclared LHS-of-assignment diagnostic (opt-in v1)
// ─────────────────────────────────────────────────────────────────────────────

suite('DiagnosticProvider - Undeclared variables (#62, opt-in v1)', () => {

    function undeclaredDiags(code: string) {
        const doc = createDocument(code);
        const tokens = new ClarionTokenizer(code).tokenize();
        return validateUndeclaredVariables(tokens, doc);
    }

    suite('Gate behaviour', () => {
        test('default state — validator runs but only fires on real undeclared LHS', () => {
            // Direct validator call ignores the gate; the gate is enforced by
            // DiagnosticProvider.validateDocument (covered separately below).
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('validateDocument fires the diagnostic at the default-on gate state', () => {
            const code = `MyProc PROCEDURE()
  CODE
  TyposVar = 1
  RETURN`;
            const doc = createDocument(code);
            const wasEnabled = serverSettings.undeclaredVariablesEnabled;
            try {
                serverSettings.undeclaredVariablesEnabled = true;
                const diags = DiagnosticProvider.validateDocument(doc);
                const undecl = diags.filter(d => d.code === 'undeclared-variable');
                assert.strictEqual(undecl.length, 1);
                assert.ok(undecl[0].message.includes("'TyposVar'"));
            } finally {
                serverSettings.undeclaredVariablesEnabled = wasEnabled;
            }
        });

        test('explicit gate=false silences the diagnostic', () => {
            const code = `MyProc PROCEDURE()
  CODE
  TyposVar = 1
  RETURN`;
            const doc = createDocument(code);
            const wasEnabled = serverSettings.undeclaredVariablesEnabled;
            try {
                serverSettings.undeclaredVariablesEnabled = false;
                const diags = DiagnosticProvider.validateDocument(doc);
                const undecl = diags.filter(d => d.code === 'undeclared-variable');
                assert.strictEqual(undecl.length, 0, 'gate off → no diagnostic, even with undeclared LHS');
            } finally {
                serverSettings.undeclaredVariablesEnabled = wasEnabled;
            }
        });

        // Regression: clarion/updatePaths handler used to clobber the
        // serverSettings constructor default with `false` whenever the
        // notification arrived without the field (legacy client). Verifies
        // the defensive "undefined → preserve default" pattern.
        test('clarion/updatePaths shape: undefined field preserves constructor default', () => {
            const wasEnabled = serverSettings.undeclaredVariablesEnabled;
            try {
                serverSettings.undeclaredVariablesEnabled = true;

                const params: { undeclaredVariablesEnabled?: boolean } = {}; // legacy client
                if (params.undeclaredVariablesEnabled !== undefined) {
                    serverSettings.undeclaredVariablesEnabled = params.undeclaredVariablesEnabled === true;
                }

                assert.strictEqual(
                    serverSettings.undeclaredVariablesEnabled,
                    true,
                    'undefined field on the notification must NOT clobber the default'
                );
            } finally {
                serverSettings.undeclaredVariablesEnabled = wasEnabled;
            }
        });

        test('clarion/updatePaths shape: explicit false from client is honoured', () => {
            const wasEnabled = serverSettings.undeclaredVariablesEnabled;
            try {
                serverSettings.undeclaredVariablesEnabled = true;

                const params: { undeclaredVariablesEnabled?: boolean } = { undeclaredVariablesEnabled: false };
                if (params.undeclaredVariablesEnabled !== undefined) {
                    serverSettings.undeclaredVariablesEnabled = params.undeclaredVariablesEnabled === true;
                }

                assert.strictEqual(serverSettings.undeclaredVariablesEnabled, false);
            } finally {
                serverSettings.undeclaredVariablesEnabled = wasEnabled;
            }
        });
    });

    suite('Positive cases — fires on truly undeclared LHS', () => {
        test('bare undeclared identifier on LHS warns', () => {
            const code = `MyProc PROCEDURE()
  CODE
  Foo = 1
  RETURN`;
            const diags = undeclaredDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'Foo'"));
        });

        test('augmented assignment += also flagged', () => {
            const code = `MyProc PROCEDURE()
  CODE
  TypoVar += 1
  RETURN`;
            const diags = undeclaredDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'TypoVar'"));
        });

        test('reference assignment &= also flagged', () => {
            const code = `MyProc PROCEDURE()
  CODE
  TypoRef &= ANY
  RETURN`;
            const diags = undeclaredDiags(code);
            assert.strictEqual(diags.length, 1);
        });
    });

    suite('Negative cases — declared identifiers not flagged', () => {
        test('local variable declared in data section', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('procedure parameter on LHS', () => {
            const code = `MyProc PROCEDURE(LONG pCounter)
  CODE
  pCounter = 5
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('module-level variable declared above first procedure', () => {
            const code = `ModVar LONG

MyProc PROCEDURE()
  CODE
  ModVar = 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('EQUATE label is treated as declared', () => {
            const code = `MAX_ROWS EQUATE(100)

MyProc PROCEDURE()
  CODE
  MAX_ROWS = 1
  RETURN`;
            // (Assigning to an equate is semantically wrong, but it IS declared
            // so the LHS-existence check shouldn't warn — that's a separate
            // diagnostic's job.)
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('SELF and PARENT — built-ins, never warned', () => {
            const code = `MyClass.Init PROCEDURE()
  CODE
  SELF = 1
  PARENT = 2
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('RECORDS / ERRORCODE — built-in identifiers', () => {
            const code = `MyProc PROCEDURE()
  CODE
  RECORDS = 1
  ERRORCODE = 0
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });
    });

    suite('Out-of-scope shapes — intentionally NOT flagged in v1', () => {
        test('prefixed Cus:Field LHS — skipped (has colon)', () => {
            const code = `MyProc PROCEDURE()
  CODE
  Cus:UnknownField = 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('dotted member access LHS — skipped (has dot)', () => {
            const code = `MyProc PROCEDURE()
  CODE
  obj.UnknownMember = 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('indexed array LHS — skipped (has bracket)', () => {
            const code = `MyProc PROCEDURE()
  CODE
  arr[1] = 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('field-equate ?Ctrl LHS — skipped (has question mark)', () => {
            const code = `MyProc PROCEDURE()
  CODE
  ?MyButton{PROP:Hide} = 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });
    });

    // 4a2ddc24 sub-feature 1 — RHS expressions on assignment lines.
    suite('RHS expression validation (4a2ddc24, sub-feature 1)', () => {
        test('RHS bare-identifier undeclared — flagged', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = BogusVar + 1
  RETURN`;
            const diags = undeclaredDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'BogusVar'"));
        });

        test('RHS bare-identifier declared — no warning', () => {
            const code = `MyProc PROCEDURE()
LocalA LONG
LocalB LONG
  CODE
  LocalA = LocalB + 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('LHS undeclared AND RHS undeclared — both flagged independently', () => {
            const code = `MyProc PROCEDURE()
  CODE
  BogusLhs = BogusRhs
  RETURN`;
            const diags = undeclaredDiags(code);
            assert.strictEqual(diags.length, 2);
            const messages = diags.map(d => d.message).sort();
            assert.ok(messages[0].includes("'BogusLhs'") || messages[0].includes("'BogusRhs'"));
            assert.ok(messages[1].includes("'BogusLhs'") || messages[1].includes("'BogusRhs'"));
        });

        test('Compound assignment += — RHS still walked', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar += BogusVar
  RETURN`;
            const diags = undeclaredDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'BogusVar'"));
        });

        test('RHS prefixed identifier — still skipped (containsSpecialChars)', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = Cus:UnknownField
  RETURN`;
            // Prefixed forms are intentionally skipped — same shape contract
            // as the LHS check.
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('RHS dotted member — still skipped (sub-feature 3 will handle)', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = obj.member
  RETURN`;
            // Dotted forms are deferred to sub-feature 3 which will narrow
            // the check to the leading scope name. v1 RHS still skips them.
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('RHS built-in identifier — never flagged', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = TRUE
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('RHS multiple undeclared — one diagnostic per name', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = BogusA + BogusB - BogusC
  RETURN`;
            const diags = undeclaredDiags(code);
            assert.strictEqual(diags.length, 3);
            const names = diags.map(d => d.message).join(' ');
            assert.ok(names.includes('BogusA'));
            assert.ok(names.includes('BogusB'));
            assert.ok(names.includes('BogusC'));
        });

        test('RHS function-call argument undeclared — flagged on the bare arg', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = ABS(BogusArg)
  RETURN`;
            // ABS is a built-in function (TokenType.Function in the tokenizer's
            // builtins list); the RHS walk skips non-Variable tokens. BogusArg
            // is a Variable token — flagged.
            const diags = undeclaredDiags(code);
            assert.strictEqual(diags.length, 1);
            assert.ok(diags[0].message.includes("'BogusArg'"));
        });

        test('Self-reference on RHS — declared name, no warning', () => {
            const code = `MyProc PROCEDURE()
Counter LONG
  CODE
  Counter = Counter + 1
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('RHS literal-only — no diagnostic', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = 42
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });
    });

    suite('Non-LHS contexts — never flagged', () => {
        test('IF / THEN expressions on the same line', () => {
            const code = `MyProc PROCEDURE()
  CODE
  IF Bogus > 1 THEN x = 1.
  RETURN`;
            // Bogus is in the RHS / condition — not first non-trivia token;
            // the line starts with IF, which is a Keyword, not Variable.
            // (Sub-feature 2 will start flagging IF/WHILE/CASE conditions —
            // when that ships, this test moves to a "flagged" assertion.)
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('BREAK Loop1 — first token is Keyword, not LHS', () => {
            const code = `MyProc PROCEDURE()
  CODE
Loop1 LOOP
    BREAK Loop1
  END
  RETURN`;
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });

        test('procedure-call statement (not assignment) — never flagged', () => {
            const code = `MyProc PROCEDURE()
  CODE
  SomeFunc(1, 2)
  RETURN`;
            // First token is SomeFunc but next is '(' not '=' — skipped.
            assert.strictEqual(undeclaredDiags(code).length, 0);
        });
    });

    test('outside any procedure (no CODE marker) — no diagnostics', () => {
        const code = `GlobalVar LONG
ModVar STRING(10)
`;
        assert.strictEqual(undeclaredDiags(code).length, 0);
    });

    // Regression baseline: edit-add then edit-remove should give symmetric
    // diagnostic behaviour (1 → 0 → 1). Real-world bug report (Mark, 2026-05-04
    // SimpleNewSln.clw) — diagnostic clears when MyVar LONG is added but
    // doesn't return when the declaration is removed. Cause not reproduced
    // in isolation; this suite pins the working baseline so future drift on
    // the validator + TokenCache pipeline is caught early.
    suite('Edit cycle regression — declaration add/remove symmetry', () => {

        const undeclared = `MyProc PROCEDURE()
  CODE
  MyVar = 5
  RETURN`;
        const declared = `MyProc PROCEDURE()
MyVar LONG
  CODE
  MyVar = 5
  RETURN`;

        test('pure direct calls — fresh tokenizer + validator each step', () => {
            assert.strictEqual(undeclaredDiags(undeclared).length, 1, 'step 1: undeclared');
            assert.strictEqual(undeclaredDiags(declared).length, 0,   'step 2: declared');
            assert.strictEqual(undeclaredDiags(undeclared).length, 1, 'step 3: removed');
        });

        test('TokenCache singleton with fresh TextDocument per step', () => {
            // Fresh URI to avoid interference with other suites running in the
            // same process; TokenCache keys on URI.
            const uri = `file:///regression-fresh-doc-${Date.now()}.clw`;
            const cache = TokenCache.getInstance();
            const run = (text: string, version: number) => {
                const doc = TextDocument.create(uri, 'clarion', version, text);
                const tokens = cache.getTokens(doc);
                return validateUndeclaredVariables(tokens, doc);
            };
            assert.strictEqual(run(undeclared, 1).length, 1, 'step 1: undeclared');
            assert.strictEqual(run(declared, 2).length, 0,   'step 2: declared');
            assert.strictEqual(run(undeclared, 3).length, 1, 'step 3: removed');
            cache.clearTokens(uri);
        });

        test('TokenCache singleton, same TextDocument mutated via TextDocument.update', () => {
            // Mimics the LSP flow: VSCode bumps version + applies incremental
            // edits to a single TextDocument instance. This is the closest
            // simulation of the real-world repro path that did NOT reproduce
            // the bug — pinning it as the baseline.
            const uri = `file:///regression-evolving-doc-${Date.now()}.clw`;
            const cache = TokenCache.getInstance();
            const doc = TextDocument.create(uri, 'clarion', 1, undeclared);
            const validate = () => validateUndeclaredVariables(cache.getTokens(doc), doc);

            assert.strictEqual(validate().length, 1, 'step 1: undeclared');

            // Insert "MyVar LONG\n" between proc declaration (line 0) and CODE
            // (line 1) — the data-section position.
            TextDocument.update(doc, [{
                range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
                text: 'MyVar LONG\n'
            }], 2);
            assert.strictEqual(validate().length, 0, 'step 2: declared');

            // Remove the declaration line entirely.
            TextDocument.update(doc, [{
                range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } },
                text: ''
            }], 3);
            assert.strictEqual(validate().length, 1, 'step 3: declaration removed → diagnostic returns');

            cache.clearTokens(uri);
        });

        test('TokenCache singleton, large file — incremental path actually fires', () => {
            // The three tests above all use ~60-char files. For those,
            // canUseIncrementalUpdate's 20% length-diff gate and the 30%
            // line-count fallback inside incrementalTokenize both bail out
            // to FULL retokenization on every edit — so the incremental
            // merge code path (TokenCache.ts:431-559) is never exercised.
            //
            // This test pads the document with 80 lines of unchanged content
            // so a single-line insert/remove near the bottom triggers the
            // incremental path. With TokenCache logger temporarily at info,
            // both step 2 (insert) and step 3 (remove) report "✅ Incremental
            // tokenization successful" and produce the symmetric token
            // counts (89 → 91 → 89) and diagnostic counts (1 → 0 → 1).
            //
            // Pinned baseline for the #62 stale-diagnostic investigation
            // (Alice, 2026-05-04, task 1850456f): the cache path under test
            // here is correct end-to-end. If a future change breaks the
            // incremental merge so step 3 fails to revert declaredNames,
            // this test catches it before it ships.
            const filler = Array.from({ length: 80 },
                (_, i) => `! filler line ${i + 1}`).join('\n');
            const undeclaredLarge = `${filler}\nMyProc PROCEDURE()\n  CODE\n  MyVar = 5\n  RETURN\n`;

            const uri = `file:///regression-large-doc-${Date.now()}.clw`;
            const cache = TokenCache.getInstance();
            const doc = TextDocument.create(uri, 'clarion', 1, undeclaredLarge);
            const validate = () => validateUndeclaredVariables(cache.getTokens(doc), doc);

            assert.strictEqual(validate().length, 1, 'step 1: undeclared');

            // Insert the declaration on the line right after PROCEDURE().
            // Line 80 in the original = "MyProc PROCEDURE()", so insert at line 81.
            TextDocument.update(doc, [{
                range: { start: { line: 81, character: 0 }, end: { line: 81, character: 0 } },
                text: 'MyVar LONG\n'
            }], 2);
            assert.strictEqual(validate().length, 0, 'step 2: declared');

            // Remove the declaration line entirely.
            TextDocument.update(doc, [{
                range: { start: { line: 81, character: 0 }, end: { line: 82, character: 0 } },
                text: ''
            }], 3);
            assert.strictEqual(validate().length, 1, 'step 3: declaration removed → diagnostic returns');

            cache.clearTokens(uri);
        });

        // Mark's hypothesis (2026-05-04): the prior tests cover line-count-changing
        // edits (insert / delete). They do NOT cover an in-place line-content
        // rewrite where the line count stays constant — e.g. uncommenting a
        // declaration and recommenting it. If incrementalTokenize handles
        // "lines added/removed" correctly but mishandles "same line, new
        // content", that fits the time-dependent symptom on SimpleNewSln.clw.
        //
        // This variant rewrites the contents of a single filler line at
        // module scope (not inside the procedure) and rewrites it back, so
        // step 2 makes MyVar a module-level Label and step 3 reverts it to
        // a comment. The PROCEDURE token spans lines 80–84 and finishesAt is
        // unaffected, so expandToDependencies leaves the changed line at
        // file scope and incrementalTokenize fires for both step 2 and 3.
        test('TokenCache singleton, large file — in-place line content rewrite', () => {
            const lineCount = 80;
            const fillerLine = (i: number) => `! filler line ${i + 1}`;
            const filler = Array.from({ length: lineCount }, (_, i) => fillerLine(i)).join('\n');
            const original = `${filler}\nMyProc PROCEDURE()\n  CODE\n  MyVar = 5\n  RETURN\n`;

            const uri = `file:///regression-inplace-doc-${Date.now()}.clw`;
            const cache = TokenCache.getInstance();
            const doc = TextDocument.create(uri, 'clarion', 1, original);
            const validate = () => validateUndeclaredVariables(cache.getTokens(doc), doc);

            assert.strictEqual(validate().length, 1, 'step 1: undeclared');

            // In-place rewrite of line index 40 (mid-filler): replace its
            // content with the declaration. Line count stays at 85.
            const targetLineIdx = 40;
            const oldLine = fillerLine(targetLineIdx);
            const newLine = 'MyVar LONG';
            TextDocument.update(doc, [{
                range: {
                    start: { line: targetLineIdx, character: 0 },
                    end:   { line: targetLineIdx, character: oldLine.length }
                },
                text: newLine
            }], 2);
            assert.strictEqual(validate().length, 0, 'step 2: declared (in-place rewrite)');

            // In-place rewrite back to the original filler content.
            TextDocument.update(doc, [{
                range: {
                    start: { line: targetLineIdx, character: 0 },
                    end:   { line: targetLineIdx, character: newLine.length }
                },
                text: oldLine
            }], 3);
            assert.strictEqual(validate().length, 1, 'step 3: in-place revert → diagnostic returns');

            cache.clearTokens(uri);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // #62 stale-diagnostic — all-in-one PROGRAM shape repro
    //
    // Mark's repro file (f:\Playground\SimpleNewSln\SimpleNewSln.clw) has the
    // unusual shape where PROGRAM declarations + main CODE are followed by
    // multiple inline procedure definitions in the SAME file:
    //
    //     PROGRAM
    //     INCLUDE('StringTheory.inc'),ONCE
    //     MAP / ... / END
    //     ... structure declarations ...
    //     CODE                    ← PROGRAM main code
    //     ... PROGRAM body ...
    //     SomeProcedure   PROCEDURE()
    //                            ← data section (empty in v14)
    //       CODE
    //       MyVar = 1            ← undeclared LHS — should fire 1 diagnostic
    //     ... more procedures ...
    //
    // Live LSP log capture (2026-05-04) showed validator running for every
    // edit but returning 0 diagnostics for v14 (189 tokens) where MyVar is
    // unambiguously undeclared anywhere in the file. This pins the bug as
    // either H1 (stale Variable token .line outside any codeRange) or H2
    // (isInsideCode wrong via wrong executionMarker / finishesAt for the
    // inline procedures).
    //
    // Test only — does NOT fix. Pinning the cause for dispatcher routing.
    // ─────────────────────────────────────────────────────────────────────────
    suite('All-in-one PROGRAM shape — #62 stale-diagnostic repro', () => {

        // Mark's exact v14 file content (51 lines), MyVar undeclared on line 37.
        const programWithInlineProcedures =
            '  PROGRAM\n' +
            "  INCLUDE('StringTheory.inc'),ONCE\n" +
            '\n' +
            '  MAP\n' +
            'SomeProcedure   PROCEDURE()  \n' +
            "    MODULE('MyNewModule.clw')\n" +
            'TestProc1 PROCEDURE()\n' +
            '    END\n' +
            '\n' +
            "    MODULE('MyNextProcedure.clw')\n" +
            'MyNextProcedure PROCEDURE(STRING param1, STRING param2)\n' +
            '    END\n' +
            '\n' +
            "    MODULE('MyNextProcedure2.clw')\n" +
            'MyNextProcedure2  PROCEDURE(long param1, long param2, string param3, string param4)\n' +
            'MyProc            PROCEDURE(string param1, string param2)\n' +
            '    END\n' +
            '    \n' +
            '    \n' +
            '    TestingNewStyleRename()\n' +
            '    TestNewStyle2()\n' +
            '    TestSaving()\n' +
            '\n' +
            '  END\n' +
            'st  StringTheory \n' +
            'sf  StringFormat \n' +
            "  TestWin WINDOW('Test'),AT(0,0,200,100),MDI,RESIZE\n" +
            "    BUTTON('OK'),AT(10,10,50,15),USE(?Ok),DEFAULT,HIDE\n" +
            "    BUTTON('Bad'),AT(10,30,50,15)\n" +
            '  END\n' +
            '  CODE\n' +
            "  st.SetValue('Hello World!')\n" +
            '  SomeProcedure()\n' +
            'SomeProcedure   PROCEDURE()\n' +
            '\n' +
            '  CODE\n' +
            '  MyVar = 1\n' +
            "  MyNextProcedure2(1,2,'test','test2')\n" +
            "  st.SetValue('Hello World 2!')\n" +
            '\n' +
            '  MESSAGE(st.GetValue())\n' +
            '\n' +
            'TestingNewStyleRename   PROCEDURE()\n' +
            '  CODE\n' +
            '\n' +
            'TestNewStyle2   PROCEDURE()\n' +
            '  CODE\n' +
            '\n' +
            'TestSaving      PROCEDURE()\n' +
            '    CODE\n';

        test('validator fires 1 diagnostic for MyVar undeclared in SomeProcedure body (v14 repro)', () => {
            const doc = createDocument(programWithInlineProcedures);
            const tokens = new ClarionTokenizer(programWithInlineProcedures).tokenize();

            // Live LSP capture had v14 = 189 tokens. Print our token count so
            // we can tell whether the embedded source is reproducing v14
            // exactly or is one edit behind.
            // eslint-disable-next-line no-console
            console.log(`[#62 fingerprint] embedded source tokenized to ${tokens.length} tokens (live v14 had 189)`);

            const diags = validateUndeclaredVariables(tokens, doc);

            // The bug: Mark's live LSP log shows 0 diagnostics for this exact
            // file content at v14. Live capture excerpt:
            //   [#62] scanned 189 tokens, 4 code ranges, 0 diagnostics
            // Token count here will differ slightly from the live LSP path
            // because the live cache has fed through edits while this test
            // runs the tokenizer fresh — but the validator's logic only
            // depends on the final token shape, so the diagnostic count
            // must match.
            //
            // Asserting the EXPECTED behaviour (1 diag): the test goes RED
            // when the bug is present. When the underlying cause is fixed,
            // this assertion turns GREEN. Per Bob's dispatcher direction —
            // this is a regression test pinning the bug, not a workaround.
            assert.strictEqual(
                diags.length,
                1,
                `Expected 1 diagnostic for undeclared MyVar at line 37, got ${diags.length}. ` +
                `Diagnostics: ${JSON.stringify(diags.map(d => ({ msg: d.message, line: d.range.start.line })))}`
            );
        });

        // H1 vs H2 fingerprint probes. These run independently of the main
        // assertion so a failure in any one tells us where the bug lives,
        // without the test bailing early on the first failed assert.
        test('[fingerprint] SomeProcedure (line 34) executionMarker is the CODE on line 36', () => {
            const tokens = new ClarionTokenizer(programWithInlineProcedures).tokenize();
            // Find SomeProcedure-the-implementation (line 34, 0-indexed = 33).
            const someProcImpl = tokens.find(t =>
                t.label === 'SomeProcedure' &&
                t.line === 33 &&
                t.value.toUpperCase() === 'PROCEDURE'
            );
            assert.ok(someProcImpl, 'SomeProcedure implementation token (line 34) must be present');
            assert.ok(
                someProcImpl!.executionMarker !== undefined,
                'SomeProcedure must have executionMarker set (else it is missing from codeRanges)'
            );
            assert.strictEqual(
                someProcImpl!.executionMarker!.line,
                35,
                `SomeProcedure.executionMarker.line should be 35 (CODE marker), got ${someProcImpl!.executionMarker!.line}`
            );
        });

        test('[fingerprint] SomeProcedure (line 34) finishesAt covers MyVar use on line 37', () => {
            const tokens = new ClarionTokenizer(programWithInlineProcedures).tokenize();
            const someProcImpl = tokens.find(t =>
                t.label === 'SomeProcedure' &&
                t.line === 33 &&
                t.value.toUpperCase() === 'PROCEDURE'
            );
            assert.ok(someProcImpl, 'SomeProcedure implementation token must be present');
            assert.ok(
                someProcImpl!.finishesAt !== undefined,
                'SomeProcedure must have finishesAt set (else it is missing from codeRanges)'
            );
            // Line 37 in source is 0-indexed 36. finishesAt must be >= 36 for
            // codeRanges' isInsideCode(36) → true (line > codeStart && line <= end).
            assert.ok(
                someProcImpl!.finishesAt! >= 36,
                `SomeProcedure.finishesAt should be >= 36 (covers MyVar use), got ${someProcImpl!.finishesAt}`
            );
        });

        test('[fingerprint] every Variable token named "MyVar" lives on line 37', () => {
            const tokens = new ClarionTokenizer(programWithInlineProcedures).tokenize();
            const myVarTokens = tokens.filter(t => t.value === 'MyVar');
            assert.ok(myVarTokens.length > 0, 'expected at least one MyVar token in the file');
            for (const t of myVarTokens) {
                assert.strictEqual(
                    t.line,
                    36,
                    `MyVar token at unexpected line: ${t.line} (expected 36 = source line 37). ` +
                    `Stale .line from incremental tokenize would show up here as a non-36 value.`
                );
            }
        });

        // Cache-based edit cycle. Above tests proved fresh-tokenize of v14
        // content gives 1 diagnostic correctly. Live LSP capture shows v14
        // returning 0. The difference is the path: TokenCache + incremental
        // retokenize across many edits. This test simulates that path: open
        // the file with `myvar long` declaration on line 35, edit to remove
        // it, run validator on the cached tokens. If incremental tokenize
        // diverges from fresh tokenize on this all-in-one PROGRAM shape, we
        // see 0 diagnostics here too — confirming H1 (cache-state stale).
        test('[fingerprint] TokenCache edit cycle: declared → declaration removed → diagnostic must return', () => {
            // v0 source: line 35 has `myvar long` (declared form).
            const v0Source = programWithInlineProcedures.replace(
                'SomeProcedure   PROCEDURE()\n\n  CODE\n',
                'SomeProcedure   PROCEDURE()\nmyvar long\n  CODE\n'
            );
            // Sanity: replacement actually fired.
            assert.notStrictEqual(v0Source, programWithInlineProcedures, 'replace seed must change the source');

            const uri = `file:///fingerprint-allinone-${Date.now()}.clw`;
            const cache = TokenCache.getInstance();
            const doc = TextDocument.create(uri, 'clarion', 1, v0Source);

            // Step 1: file as-loaded with declaration → expect 0 diagnostics.
            const v0Tokens = cache.getTokens(doc);
            const v0Diags = validateUndeclaredVariables(v0Tokens, doc);
            assert.strictEqual(v0Diags.length, 0,
                `step 1 (declared): expected 0 diagnostics, got ${v0Diags.length}`);

            // Step 2: remove the `myvar long\n` line (in-place line delete).
            // Find the line index from v0Source by counting newlines before
            // the literal text.
            const myvarLineIdx = v0Source.split('\n').findIndex(l => l === 'myvar long');
            assert.ok(myvarLineIdx > 0, 'expected myvar declaration line in v0 source');

            TextDocument.update(doc, [{
                range: {
                    start: { line: myvarLineIdx, character: 0 },
                    end:   { line: myvarLineIdx + 1, character: 0 }
                },
                text: ''
            }], 2);

            const v1Tokens = cache.getTokens(doc);
            const v1Diags = validateUndeclaredVariables(v1Tokens, doc);

            // eslint-disable-next-line no-console
            console.log(`[#62 fingerprint] cache cycle v1: ${v1Tokens.length} tokens, ${v1Diags.length} diagnostics`);

            // Compare against fresh tokenize of the same final text.
            const freshTokens = new ClarionTokenizer(doc.getText()).tokenize();
            const freshDiags = validateUndeclaredVariables(freshTokens, doc);
            // eslint-disable-next-line no-console
            console.log(`[#62 fingerprint] fresh tokenize same text: ${freshTokens.length} tokens, ${freshDiags.length} diagnostics`);

            // If cache-path and fresh-path diverge here, we have proven H1.
            assert.strictEqual(
                v1Diags.length,
                freshDiags.length,
                `Cache-path and fresh-path diverge: cache=${v1Diags.length} diags, fresh=${freshDiags.length} diags. ` +
                `If cache=0 and fresh=1, the incremental retokenize for this file shape leaves stale tokens that ` +
                `pollute declaredNames. Hands H1 to Alice (TokenCache surface).`
            );

            // And both must produce 1 diagnostic for MyVar.
            assert.strictEqual(v1Diags.length, 1,
                `step 2 (declaration removed): expected 1 diagnostic, got ${v1Diags.length}`);

            cache.clearTokens(uri);
        });

        // Simulates Mark's actual editing: typing keystrokes one at a time
        // (each character is a separate `TextDocument.update` with its own
        // incremental tokenize pass through TokenCache). The live LSP
        // capture went v0 → v14 across 13 small edits. Single-edit tests
        // above pass; this one tests whether accumulated incremental-tokenize
        // state diverges from fresh-tokenize after many small edits on the
        // all-in-one PROGRAM shape.
        test('[fingerprint] TokenCache char-by-char delete of "myvar long" — expect symmetric end state', () => {
            const v0Source = programWithInlineProcedures.replace(
                'SomeProcedure   PROCEDURE()\n\n  CODE\n',
                'SomeProcedure   PROCEDURE()\nmyvar long\n  CODE\n'
            );
            const myvarLineIdx = v0Source.split('\n').findIndex(l => l === 'myvar long');
            assert.ok(myvarLineIdx > 0, 'expected myvar declaration line in v0 source');

            const uri = `file:///fingerprint-allinone-charcycle-${Date.now()}.clw`;
            const cache = TokenCache.getInstance();
            const doc = TextDocument.create(uri, 'clarion', 1, v0Source);

            // Prime the cache at v0.
            cache.getTokens(doc);

            // Delete characters one at a time from `myvar long` line, ending
            // with the line itself empty. 10 chars in "myvar long" + 1 newline.
            // After each backspace, run validator and record token+diag count.
            const trace: { v: number; tokens: number; diags: number }[] = [];
            let version = 1;
            const lineText = 'myvar long';

            // For each backspace step we check: cache result must match fresh
            // tokenize result of the SAME final text. Any divergence proves
            // H1 — incremental tokenize leaves stale state that pollutes
            // declaredNames.
            const divergences: { v: number; cacheDiags: number; freshDiags: number; text: string }[] = [];

            for (let charsRemaining = lineText.length; charsRemaining > 0; charsRemaining--) {
                version++;
                // Delete the LAST character of the line.
                TextDocument.update(doc, [{
                    range: {
                        start: { line: myvarLineIdx, character: charsRemaining - 1 },
                        end:   { line: myvarLineIdx, character: charsRemaining }
                    },
                    text: ''
                }], version);
                const t = cache.getTokens(doc);
                const d = validateUndeclaredVariables(t, doc);
                trace.push({ v: version, tokens: t.length, diags: d.length });

                // Cross-check this version against fresh tokenize of identical text.
                const freshT = new ClarionTokenizer(doc.getText()).tokenize();
                const freshD = validateUndeclaredVariables(freshT, doc);
                if (freshD.length !== d.length) {
                    divergences.push({
                        v: version,
                        cacheDiags: d.length,
                        freshDiags: freshD.length,
                        text: doc.getText().split('\n')[myvarLineIdx] ?? '<line gone>'
                    });
                }
            }

            // Final edit: delete the now-empty line + its newline (line-merge).
            version++;
            TextDocument.update(doc, [{
                range: {
                    start: { line: myvarLineIdx, character: 0 },
                    end:   { line: myvarLineIdx + 1, character: 0 }
                },
                text: ''
            }], version);
            const finalCacheTokens = cache.getTokens(doc);
            const finalCacheDiags = validateUndeclaredVariables(finalCacheTokens, doc);
            trace.push({ v: version, tokens: finalCacheTokens.length, diags: finalCacheDiags.length });

            // eslint-disable-next-line no-console
            console.log(`[#62 fingerprint] char-by-char trace:\n` + trace.map(s =>
                `  v${s.v}: ${s.tokens} tokens, ${s.diags} diagnostics`
            ).join('\n'));

            // Compare against fresh tokenize of the same final text.
            const freshTokens = new ClarionTokenizer(doc.getText()).tokenize();
            const freshDiags = validateUndeclaredVariables(freshTokens, doc);
            // eslint-disable-next-line no-console
            console.log(`[#62 fingerprint] fresh tokenize of final text: ${freshTokens.length} tokens, ${freshDiags.length} diagnostics`);

            // Killer assertion 1: at the end of the edit cycle, cache and
            // fresh-tokenize must agree.
            assert.strictEqual(
                finalCacheDiags.length,
                freshDiags.length,
                `Cache vs fresh-tokenize diverge at end of char-by-char edit cycle. ` +
                `cache=${finalCacheDiags.length} diags, fresh=${freshDiags.length} diags. ` +
                `Char-by-char trace: ${JSON.stringify(trace)}`
            );

            // Killer assertion 2: NO intermediate version can diverge either.
            // This is what catches Mark's bug — he stopped editing at an
            // intermediate state where cache disagreed with fresh-tokenize.
            // eslint-disable-next-line no-console
            if (divergences.length > 0) console.log(`[#62 fingerprint] divergences:\n` +
                divergences.map(d => `  v${d.v}: cache=${d.cacheDiags}, fresh=${d.freshDiags}, line=${JSON.stringify(d.text)}`).join('\n'));
            assert.strictEqual(
                divergences.length, 0,
                `Cache and fresh-tokenize diverge at ${divergences.length} intermediate version(s). ` +
                `H1 confirmed: TokenCache.incrementalTokenize for the all-in-one PROGRAM shape ` +
                `produces stale state that pollutes the validator's declaredNames set. ` +
                `Hands the fix to Alice (TokenCache surface). ` +
                `Divergence list: ${JSON.stringify(divergences)}`
            );

            cache.clearTokens(uri);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// d2fadc09 — bare-filename URI in MapDeclarationDiagnostics.validateMissingImplementations
//
// MODULE token.referencedFile stores the unresolved filename from the source
// (DocumentStructure.resolveFileReferences:1915). Before this fix, the
// validator constructed cache URIs by string-prefixing `file:///` directly
// onto the bare name, producing entries like `file:///OtherModule.clw` that
// duplicate the canonical `file:///c:/tmp/OtherModule.clw` cache key. This
// caused redundant tokenization on every validate pass and stale diagnostics
// when only one of the two cache entries was refreshed.
//
// The fix mirrors the INCLUDE pattern (validateMissingMapDeclarations:128-148):
// resolve via same-dir join first, fall back to redirection, skip if neither
// finds the file on disk. Test confirms the cache only contains the full-path
// URI after a validate pass.
// ─────────────────────────────────────────────────────────────────────────────
import * as nodeFs from 'fs';
import * as nodeOs from 'os';
import * as nodePathTest from 'path';
import { validateMissingImplementations } from '../providers/diagnostics/MapDeclarationDiagnostics';

suite('MapDeclarationDiagnostics — MODULE filename URI resolution (d2fadc09)', () => {

    let tmpDir: string;
    let parentClwPath: string;
    let moduleClwPath: string;

    suiteSetup(() => {
        tmpDir = nodeFs.mkdtempSync(nodePathTest.join(nodeOs.tmpdir(), 'd2fadc09-'));
        parentClwPath = nodePathTest.join(tmpDir, 'Parent.clw');
        moduleClwPath = nodePathTest.join(tmpDir, 'OtherModule.clw');

        nodeFs.writeFileSync(parentClwPath,
            '  PROGRAM\n' +
            '\n' +
            '  MAP\n' +
            "    MODULE('OtherModule.clw')\n" +
            'OtherProc PROCEDURE()\n' +
            '    END\n' +
            '  END\n' +
            '  CODE\n' +
            '  OtherProc()\n',
            'utf8'
        );

        nodeFs.writeFileSync(moduleClwPath,
            "  MEMBER('Parent.clw')\n" +
            '\n' +
            '  MAP\n' +
            '  END\n' +
            'OtherProc PROCEDURE()\n' +
            '  CODE\n' +
            '  RETURN\n',
            'utf8'
        );
    });

    suiteTeardown(() => {
        try {
            nodeFs.unlinkSync(parentClwPath);
            nodeFs.unlinkSync(moduleClwPath);
            nodeFs.rmdirSync(tmpDir);
        } catch { /* best-effort cleanup */ }
    });

    test('validateMissingImplementations caches OtherModule.clw under full-path URI, never bare-filename URI', async () => {
        // Construct the parent doc with the canonical full-path URI shape that
        // VS Code uses (lower-case drive letter, percent-encoded colon).
        const parentContent = nodeFs.readFileSync(parentClwPath, 'utf8');
        const driveAndPath = parentClwPath.replace(/\\/g, '/');
        const colonIdx = driveAndPath.indexOf(':');
        const encodedDrive = driveAndPath.slice(0, colonIdx).toLowerCase() + '%3A';
        const parentUri = 'file:///' + encodedDrive + driveAndPath.slice(colonIdx + 1);
        const parentDoc = TextDocument.create(parentUri, 'clarion', 1, parentContent);

        const parentTokens = new ClarionTokenizer(parentContent).tokenize();

        // Snapshot cache state before. Tolerant of unrelated entries already
        // present (other tests in the same process); we only check that OUR
        // test's new URIs land in the right shape.
        const cacheBefore = new Set(TokenCache.getInstance().getAllCachedUris());

        // The call that previously created a bare-filename URI cache entry.
        await validateMissingImplementations(parentTokens, parentDoc);

        const cacheAfter = TokenCache.getInstance().getAllCachedUris();
        const newEntries = cacheAfter.filter(u => !cacheBefore.has(u));

        const moduleEntry = newEntries.find(u =>
            u.toLowerCase().endsWith('/othermodule.clw')
        );

        assert.ok(moduleEntry,
            `Expected a cache entry for OtherModule.clw after validateMissingImplementations. ` +
            `New entries: ${JSON.stringify(newEntries)}`);

        // The bug: a bare `file:///OtherModule.clw` URI ends up in the cache.
        // The fix: only the full-path form ends up in the cache.
        assert.notStrictEqual(moduleEntry, 'file:///OtherModule.clw',
            'Cache should NOT contain bare-filename URI for OtherModule.clw — that is the d2fadc09 bug.');

        // Positive assertion: the cached URI must contain the path (not just
        // the bare basename).
        assert.ok(
            moduleEntry!.length > 'file:///OtherModule.clw'.length,
            `Expected full-path URI, got bare or short URI: ${moduleEntry}`
        );

        // Encoding-shape assertion (5b42b29b follow-up): on Windows the cached
        // URI must use VS Code's canonical form — lowercase drive letter +
        // percent-encoded colon. This catches the `f:` (uppercase, unencoded)
        // vs `f%3A` (canonical) divergence that would otherwise leave the
        // cache with two entries for the same physical file. POSIX systems
        // skip this check (no drive letter to canonicalise).
        if (process.platform === 'win32') {
            assert.ok(
                /^file:\/\/\/[a-z]%3A\//.test(moduleEntry!),
                `Cached URI must be in VS Code's canonical form (lowercase drive + %3A): ${moduleEntry}`
            );
            assert.ok(
                !/^file:\/\/\/[A-Z]:\//.test(moduleEntry!),
                `Cached URI must NOT use uppercase unencoded drive form: ${moduleEntry}`
            );
        }

        // Cleanup so this test doesn't leak state into later test files
        // sharing the mocha process.
        for (const u of newEntries) {
            TokenCache.getInstance().clearTokens(u);
        }
    });

    // Open→first-edit window regression test (5b42b29b). Even after the
    // post-edit dedupe sweep at server.ts:728-739 (commit f347767), URIs
    // constructed during synchronous validation that runs from onDidOpen
    // can leave duplicate cache entries until the user makes their first
    // edit. The fix in 5b42b29b canonicalises URIs at construction time
    // (no `file:///C:/...` ever lands in the cache to begin with), so the
    // dedupe sweep is now defence-in-depth rather than load-bearing.
    test('no duplicate cache entries normalise to the same physical path after validation', async () => {
        const parentContent = nodeFs.readFileSync(parentClwPath, 'utf8');
        const driveAndPath = parentClwPath.replace(/\\/g, '/');
        const colonIdx = driveAndPath.indexOf(':');
        const encodedDrive = driveAndPath.slice(0, colonIdx).toLowerCase() + '%3A';
        const parentUri = 'file:///' + encodedDrive + driveAndPath.slice(colonIdx + 1);
        const parentDoc = TextDocument.create(parentUri, 'clarion', 1, parentContent);
        const parentTokens = new ClarionTokenizer(parentContent).tokenize();

        const cacheBefore = new Set(TokenCache.getInstance().getAllCachedUris());

        await validateMissingImplementations(parentTokens, parentDoc);

        const cacheAfter = TokenCache.getInstance().getAllCachedUris();
        const newEntries = cacheAfter.filter(u => !cacheBefore.has(u));

        // Group new entries by their normalised physical path. Any group with
        // more than one URI is a duplicate that wastes cache state.
        const byNormalisedPath = new Map<string, string[]>();
        for (const u of newEntries) {
            const normalised = decodeURIComponent(u.replace(/^file:\/\/\//i, ''))
                .toLowerCase()
                .replace(/\\/g, '/');
            const existing = byNormalisedPath.get(normalised) ?? [];
            existing.push(u);
            byNormalisedPath.set(normalised, existing);
        }

        const duplicates = Array.from(byNormalisedPath.entries())
            .filter(([, uris]) => uris.length > 1);

        assert.strictEqual(
            duplicates.length, 0,
            `Cache contains duplicate entries for the same physical path: ` +
            `${JSON.stringify(duplicates)}. The 5b42b29b fix should canonicalise ` +
            `URIs at construction so no two entries normalise to the same path.`
        );

        for (const u of newEntries) {
            TokenCache.getInstance().clearTokens(u);
        }
    });
});
