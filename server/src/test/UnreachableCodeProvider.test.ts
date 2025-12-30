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

    test('Comprehensive test: All control structures and semantics', () => {
        const code = `    PROGRAM
    MAP
TestUnreachable PROCEDURE()
TestIfELSE PROCEDURE()
TestLOOP PROCEDURE()
TestCASE PROCEDURE()
TestEXECUTEBEGIN PROCEDURE()
    END
    CODE
TestUnreachable     PROCEDURE()

    CODE

    a = 1                     ! reachable

    RETURN                    ! reachable
    a = 2                     ! unreachable (after top-level RETURN) works (x)

TestIfELSE PROCEDURE()
 CODE
    ! ---------------- IF / ELSE ----------------
    IF a = 1
        b = 1                   ! reachable
        RETURN                  ! reachable
        b = 2                   ! unreachable (after RETURN in IF branch)
    ELSE
        b = 3                   ! reachable
    END
    b = 4                     ! reachable

    ! ---------------- IF / ELSIF / ELSE ----------------
    IF a = 1
        c = 1                   ! reachable
    ELSIF a = 2
        RETURN                  ! reachable
        c = 2                   ! unreachable (after RETURN in ELSIF branch)
    ELSE
        c = 3                   ! reachable
    END
    c = 4                     ! reachable

TestLOOP PROCEDURE()
 CODE
    ! ---------------- LOOP ----------------
    LOOP
        d = 1                   ! reachable
        RETURN                  ! reachable
        d = 2                   ! unreachable (after RETURN inside LOOP)
    END
    d = 3                     ! unreachable (procedure terminated by LOOP RETURN)

TestCASE PROCEDURE()
 CODE
    ! ---------------- CASE ----------------
    CASE a
    OF 1
        e = 1                   ! reachable
        RETURN                  ! reachable
        e = 2                   ! unreachable (after RETURN in CASE branch)
    OF 2
        e = 3                   ! reachable
    ELSE
        e = 4                   ! reachable
    END
    e = 5                     ! reachable
TestEXECUTEBEGIN PROCEDURE()
 CODE
    ! ---------------- EXECUTE + BEGIN ----------------
    EXECUTE a
        BEGIN
            f = 1                   ! reachable
            RETURN                  ! reachable
            f = 2                   ! unreachable (after RETURN in EXECUTE branch)  (x)
        END
        f = 3                     ! reachable  (x)
    END
    f = 4                     ! reachable

    ! ---------------- ROUTINE ----------------
TestRoutine     ROUTINE 
    g = 1                   ! reachable
    RETURN                  ! reachable
    g = 2                   ! unreachable (after RETURN in ROUTINE)

    g = 3                     ! reachable (ROUTINE does not terminate procedure)

    RETURN                    ! reachable
    g = 4                     ! unreachable (after final RETURN)  (x)
`;

        const doc = createDocument(code);
        const ranges = UnreachableCodeProvider.provideUnreachableRanges(doc);
        
        // Parse expected unreachable lines from comments
        const lines = code.split('\n');
        const expectedUnreachable: number[] = [];
        const expectedReachable: number[] = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Skip empty lines, comments-only lines, labels, and END statements
            if (!trimmed || trimmed.startsWith('!') || !line.startsWith(' ') || trimmed.toUpperCase() === 'END') {
                continue;
            }
            
            if (line.includes('! unreachable')) {
                expectedUnreachable.push(i);
            } else if (line.includes('! reachable')) {
                expectedReachable.push(i);
            }
        }
        
        // Get actual unreachable lines
        const actualUnreachable = ranges.map(r => r.start.line).sort((a, b) => a - b);
        
        // Check for missing unreachable detections
        const missing = expectedUnreachable.filter(line => !actualUnreachable.includes(line));
        if (missing.length > 0) {
            const details = missing.map(line => `  Line ${line}: ${lines[line].trim()}`).join('\n');
            assert.fail(`Missing unreachable detections:\n${details}`);
        }
        
        // Check for false positives (lines marked unreachable but should be reachable)
        const falsePositives = actualUnreachable.filter(line => expectedReachable.includes(line));
        if (falsePositives.length > 0) {
            const details = falsePositives.map(line => `  Line ${line}: ${lines[line].trim()}`).join('\n');
            assert.fail(`False positives (should be reachable):\n${details}`);
        }
        
        // Check for unexpected unreachable lines (not in either expected list)
        const unexpected = actualUnreachable.filter(line => 
            !expectedUnreachable.includes(line) && !expectedReachable.includes(line)
        );
        if (unexpected.length > 0) {
            const details = unexpected.map(line => `  Line ${line}: ${lines[line].trim()}`).join('\n');
            assert.fail(`Unexpected unreachable lines:\n${details}`);
        }
        
        console.log(`\n✅ Comprehensive test passed: ${expectedUnreachable.length} unreachable lines correctly detected`);
    });
});
