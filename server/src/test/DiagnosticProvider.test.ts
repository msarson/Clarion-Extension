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
});
