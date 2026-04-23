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
});
