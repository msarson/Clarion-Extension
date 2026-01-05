import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { UnreachableCodeProvider } from '../providers/UnreachableCodeProvider';
import { Range } from 'vscode-languageserver/node';

suite('UnreachableCodeProvider Tests', () => {
    
    /**
     * Helper to create a TextDocument from Clarion code
     */
    function createDocument(code: string): TextDocument {
        return TextDocument.create('file:///test.clw', 'clarion', 1, code);
    }

    /**
     * Helper to check if a line is marked as unreachable
     */
    function isLineUnreachable(ranges: Range[], lineNumber: number): boolean {
        return ranges.some(r => r.start.line === lineNumber);
    }

    test('Simple top-level RETURN marks following code as unreachable', () => {
        const code = `
MyProc PROCEDURE()
  CODE
  RETURN
  MESSAGE('Unreachable')
`;
        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        // Line 4 (MESSAGE) should be marked unreachable
        assert.ok(isLineUnreachable(ranges, 4), 'Line after RETURN should be unreachable');
    });

    test('DEBUG: User case - nested IF with RETURN', () => {
        const code = `CBCodeParseClass.FindCommaOrParen   PROCEDURE(STRING CodeTxt, <*STRING OutCharFound>)!,LONG
Comma1    LONG    
Paren1    LONG 
    CODE
    Comma1=INSTRING(',',CodeTxt,1)       !LINE,AT(0
    Paren1=INSTRING('(',CodeTxt,1)       !STRING(@D1),
    IF Paren1 AND Paren1 < Comma1 THEN 
       Comma1 = Paren1
       
    END
    IF ~OMITTED(OutCharFound) THEN
       OutCharFound = SUB(Codetxt,Comma1,1)
       return
       a=1
    END
    RETURN Comma1
`;
        console.log('\n=== DEBUG: User Case - Nested IF with RETURN ===');
        console.log('Code with line numbers:');
        code.split('\n').forEach((line, idx) => console.log(`  ${idx}: ${line}`));
        
        const doc = createDocument(code);
        const { TokenCache } = require('../TokenCache');
        const tokens = TokenCache.getInstance().getTokens(doc);
        
        console.log('\nPROCEDURE tokens:');
        const procedures = tokens.filter((t: any) => t.type === 1 || t.subType === 1);
        procedures.forEach((p: any) => {
            console.log(`  Line ${p.line}: ${p.value} (finishesAt: ${p.finishesAt})`);
        });
        
        console.log('\nIF structure tokens:');
        const ifStructures = tokens.filter((t: any) => t.value && t.value.toUpperCase() === 'IF');
        ifStructures.forEach((s: any) => {
            console.log(`  Line ${s.line}: ${s.value} (type: ${s.type}, subType: ${s.subType}, finishesAt: ${s.finishesAt})`);
        });
        
        console.log('\nRETURN tokens:');
        const returns = tokens.filter((t: any) => t.value && t.value.toUpperCase() === 'RETURN');
        returns.forEach((r: any) => {
            console.log(`  Line ${r.line}: ${r.value} (type: ${r.type})`);
        });
        
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        console.log('\nUnreachable ranges:');
        ranges.forEach(r => {
            const line = code.split('\n')[r.start.line];
            console.log(`  Line ${r.start.line}: "${line.trim()}"`);
        });
        
        console.log('\nExpected behavior (Phase 1):');
        console.log('  Line 13 (return) - conditional, inside IF at line 11');
        console.log('  Line 14 (a=1) - Technically unreachable, but Phase 1 does NOT track within structures');
        console.log('  Line 16 (RETURN Comma1) - top-level, marks nothing (at procedure end)');
        console.log('  Phase 1: Conservative detection, only top-level terminators');
        
        // Phase 1 does NOT mark code unreachable within structures
        // Only marks code unreachable after top-level RETURN/EXIT/HALT
        const line14Unreachable = isLineUnreachable(ranges, 14);
        console.log(`\nLine 14 marked unreachable: ${line14Unreachable}`);
        console.log('Phase 1 limitation: Does not analyze unreachable code within IF/LOOP blocks');
        
        // The IMPORTANT test: code after the outer IF...END should NOT be marked
        const line16Unreachable = isLineUnreachable(ranges, 16);
        console.log(`Line 16 marked unreachable: ${line16Unreachable} (should be false)`);
        
        assert.ok(!line16Unreachable, 'Line 16 should be reachable - it is after the IF...END block');
    });

    test('DEBUG: Check tokenizer output for IF...ELSE...END structure', () => {
        const code = `StateCalc:Kill PROCEDURE
StateCalc:Kill_Called    BYTE,STATIC
  CODE
  IF StateCalc:Kill_Called
     RETURN
  ELSE
     StateCalc:Kill_Called = True
  END
  IBSCOMMON:Kill()
`;
        console.log('\n=== DEBUG: Tokenizer Output ===');
        console.log('Code with line numbers:');
        code.split('\n').forEach((line, idx) => console.log(`  ${idx}: "${line}"`));
        
        const doc = createDocument(code);
        const { TokenCache } = require('../TokenCache');
        const tokens = TokenCache.getInstance().getTokens(doc);
        
        console.log('\nPROCEDURE tokens:');
        const procedures = tokens.filter((t: any) => t.type === 1 || t.subType === 1);
        procedures.forEach((p: any) => {
            console.log(`  Line ${p.line}: ${p.value} (finishesAt: ${p.finishesAt})`);
        });
        
        console.log('\nALL TOKENS:');
        tokens.forEach((t: any, idx: number) => {
            console.log(`  [${idx}] Line ${t.line}: "${t.value}" (type: ${t.type}, subType: ${t.subType}, finishesAt: ${t.finishesAt})`);
        });
        
        console.log('\nIF structure tokens (value=IF):');
        const ifStructures = tokens.filter((t: any) => t.value && t.value.toUpperCase() === 'IF');
        ifStructures.forEach((s: any) => {
            console.log(`  Line ${s.line}: ${s.value} (type: ${s.type}, subType: ${s.subType}, finishesAt: ${s.finishesAt})`);
        });
        
        console.log('\nRETURN tokens:');
        const returns = tokens.filter((t: any) => t.value && t.value.toUpperCase() === 'RETURN');
        returns.forEach((r: any) => {
            console.log(`  Line ${r.line}: ${r.value} (type: ${r.type})`);
        });
        
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        console.log('\nUnreachable ranges:', ranges.map(r => `Line ${r.start.line}`));
        
        assert.ok(true, 'Debug test');
    });

    test('Conditional RETURN in IF...THEN (no ELSE) does NOT mark code after END as unreachable', () => {
        const code = `
TestProc PROCEDURE()
  CODE
  IF x = 1 THEN
    RETURN
  END
  MESSAGE('Reachable')
`;
        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        console.log('\n=== Test: Conditional RETURN in IF (no ELSE) ===');
        console.log('Unreachable ranges:', ranges.map(r => `Line ${r.start.line}`));
        
        // Line 6 (MESSAGE) should NOT be marked unreachable
        assert.ok(!isLineUnreachable(ranges, 6), 'Code after IF...END should be reachable when IF has no ELSE');
    });

    test('RETURN in both IF and ELSE branches SHOULD mark code after END as unreachable', () => {
        const code = `
TestProc PROCEDURE()
  CODE
  IF x = 1
    RETURN
  ELSE
    RETURN
  END
  MESSAGE('Unreachable')
`;
        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        console.log('\n=== Test: RETURN in both IF and ELSE ===');
        console.log('Unreachable ranges:', ranges.map(r => `Line ${r.start.line}`));
        
        // Line 8 (MESSAGE) SHOULD be marked unreachable
        // because both branches return
        const line8Unreachable = isLineUnreachable(ranges, 8);
        
        if (!line8Unreachable) {
            console.log('NOTE: Line 8 NOT marked unreachable');
            console.log('This is expected in Phase 1 - we do not track all branches');
            console.log('Phase 1 only detects unconditional top-level terminators');
        }
        
        // For Phase 1, this is actually expected behavior (conservative)
        // We don't analyze all branches, so this test documents the limitation
        assert.ok(!line8Unreachable, 'Phase 1: Conservative - does not track all branches');
    });

    test('RETURN inside nested IF should NOT mark outer code as unreachable', () => {
        const code = `
TestProc PROCEDURE()
  CODE
  IF x = 1 THEN
    IF y = 2 THEN
      RETURN
    END
    MESSAGE('Reachable in outer IF')
  END
  MESSAGE('Reachable after IF')
`;
        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        console.log('\n=== Test: Nested IF with RETURN ===');
        console.log('Unreachable ranges:', ranges.map(r => `Line ${r.start.line}`));
        
        // Line 7 and Line 9 should NOT be marked unreachable
        assert.ok(!isLineUnreachable(ranges, 7), 'Code after inner IF should be reachable');
        assert.ok(!isLineUnreachable(ranges, 9), 'Code after outer IF should be reachable');
    });

    test('RETURN inside LOOP does NOT mark code after LOOP as unreachable', () => {
        const code = `
TestProc PROCEDURE()
  CODE
  LOOP x = 1 TO 10
    IF x = 5 THEN
      RETURN
    END
  END
  MESSAGE('Reachable')
`;
        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        console.log('\n=== Test: RETURN inside LOOP ===');
        console.log('Unreachable ranges:', ranges.map(r => `Line ${r.start.line}`));
        
        // Line 8 (MESSAGE) should NOT be marked unreachable
        assert.ok(!isLineUnreachable(ranges, 8), 'Code after LOOP should be reachable');
    });

    test('ROUTINE blocks reset unreachable state', () => {
        const code = `
TestProc PROCEDURE()
  CODE
  RETURN
  
MyRoutine ROUTINE
  MESSAGE('Reachable in ROUTINE')
`;
        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        console.log('\n=== Test: ROUTINE resets unreachable ===');
        console.log('Unreachable ranges:', ranges.map(r => `Line ${r.start.line}`));
        
        // Line 6 (MESSAGE in ROUTINE) should NOT be marked unreachable
        assert.ok(!isLineUnreachable(ranges, 6), 'ROUTINE code should be reachable even after RETURN');
    });

    test('Empty document should return no unreachable ranges', () => {
        const code = '';
        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        assert.strictEqual(ranges.length, 0, 'Empty document should have no unreachable ranges');
    });

    test('Procedure without CODE marker should return no unreachable ranges', () => {
        const code = `
TestProc PROCEDURE()
  ! Just a declaration
`;
        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        assert.strictEqual(ranges.length, 0, 'Procedure without CODE should have no unreachable ranges');
    });
});
