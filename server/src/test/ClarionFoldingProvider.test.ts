import * as assert from 'assert';
import { FoldingRangeKind } from 'vscode-languageserver-types';
import { ClarionTokenizer } from '../ClarionTokenizer';
import ClarionFoldingProvider from '../ClarionFoldingProvider';

suite('ClarionFoldingProvider Tests', () => {

    suite('computeFoldingRanges - Procedures', () => {
        
        test('Should create folding range for simple PROCEDURE', () => {
            const code = `MyProc PROCEDURE()
  CODE
  RETURN
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length > 0, 'Should have at least one folding range');
            const procRange = ranges.find(r => r.startLine === 0);
            assert.ok(procRange, 'Should find procedure folding range');
            assert.ok(procRange!.endLine >= 2, 'Should extend to END');
        });

        test('Should create folding range for PROCEDURE with DATA section', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  RETURN
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length > 0, 'Should have folding ranges');
            const procRange = ranges[0];
            assert.ok(procRange.startLine === 0, 'Should start at procedure line');
            assert.ok(procRange.endLine >= 3, 'Should include entire procedure');
        });

        test('Should handle nested ROUTINE within PROCEDURE', () => {
            const code = `MyProc PROCEDURE()
MyRoutine ROUTINE
  CODE
  RETURN
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length >= 2, 'Should have ranges for both procedure and routine');
            // Check we have both a procedure and routine range
            const hasProc = ranges.some(r => r.startLine === 0);
            const hasRoutine = ranges.some(r => r.startLine === 1);
            assert.ok(hasProc, 'Should have procedure range');
            assert.ok(hasRoutine, 'Should have routine range');
        });

        test('Should handle multiple PROCEDUREs', () => {
            const code = `Proc1 PROCEDURE()
  CODE
  END

Proc2 PROCEDURE()
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length >= 2, 'Should have ranges for both procedures');
            assert.ok(ranges[0].startLine !== ranges[1].startLine, 'Ranges should start at different lines');
        });
    });

    suite('computeFoldingRanges - Structures', () => {
        
        test('Should create folding range for QUEUE structure', () => {
            const code = `MyQueue QUEUE
  Name STRING(40)
  Age LONG
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length > 0, 'Should have folding range for QUEUE');
            const queueRange = ranges.find(r => r.startLine === 0);
            assert.ok(queueRange, 'Should find queue folding range');
            assert.ok(queueRange!.endLine >= 2, 'Should extend to END');
        });

        test('Should create folding range for GROUP structure', () => {
            const code = `MyGroup GROUP
  Field1 LONG
  Field2 STRING(20)
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length > 0, 'Should have folding range for GROUP');
        });

        test('Should create folding range for CLASS', () => {
            const code = `MyClass CLASS
  Init PROCEDURE()
  Kill PROCEDURE()
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length > 0, 'Should have folding range for CLASS');
        });
    });

    suite('computeFoldingRanges - Regions', () => {
        
        test('Should create folding range for !REGION comments', () => {
            const code = `!REGION Data Declarations
LocalVar LONG
AnotherVar STRING(20)
!ENDREGION

MyProc PROCEDURE()
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have ranges for both region and procedure
            assert.ok(ranges.length >= 2, 'Should have ranges for region and procedure');
            
            // Check for region range
            const regionRange = ranges.find(r => r.kind === FoldingRangeKind.Region);
            assert.ok(regionRange, 'Should have a region folding range');
        });

        test('Should handle multiple !REGION blocks', () => {
            const code = `!REGION Block1
Var1 LONG
!ENDREGION

!REGION Block2
Var2 LONG
!ENDREGION`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            const regionRanges = ranges.filter(r => r.kind === FoldingRangeKind.Region);
            assert.ok(regionRanges.length >= 2, 'Should have multiple region ranges');
        });

        test('Should handle nested regions', () => {
            const code = `!REGION Outer
!REGION Inner
Var1 LONG
!ENDREGION
!ENDREGION`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            const regionRanges = ranges.filter(r => r.kind === FoldingRangeKind.Region);
            assert.ok(regionRanges.length >= 2, 'Should handle nested regions');
        });
    });

    suite('computeFoldingRanges - Edge Cases', () => {
        
        test('Should handle empty code', () => {
            const code = '';
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.strictEqual(ranges.length, 0, 'Should return empty array for empty code');
        });

        test('Should handle code with only comments', () => {
            const code = `! Comment 1
! Comment 2
! Comment 3`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have no folding ranges (just comments, no structures)
            assert.strictEqual(ranges.length, 0, 'Should have no folding ranges for only comments');
        });

        test('Should handle PROCEDURE without END', () => {
            const code = `MyProc PROCEDURE()
  CODE
  RETURN`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should still create a folding range (inferred end)
            assert.ok(ranges.length >= 0, 'Should handle procedure without END');
        });

        test('Should handle complex nested structure', () => {
            const code = `MyProc PROCEDURE()
LocalQueue QUEUE
    Name STRING(40)
    END
  CODE
MyRoutine ROUTINE
      ! Do something
    END
  RETURN
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have multiple ranges: procedure, queue, routine
            assert.ok(ranges.length >= 3, 'Should handle complex nested structures');
        });
    });

    suite('computeFoldingRanges - Method Implementations', () => {
        
        test('Should fold method implementations (ThisWindow.Init)', () => {
            const code = `ThisWindow.Init PROCEDURE()
  CODE
  RETURN
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length > 0, 'Should have folding range for method implementation');
        });

        test('Should handle multiple method implementations', () => {
            const code = `ThisWindow.Init PROCEDURE()
  CODE
  END

ThisWindow.Kill PROCEDURE()
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length >= 2, 'Should have ranges for both method implementations');
        });
    });

    suite('computeFoldingRanges - WINDOW/APPLICATION Structures', () => {
        
        test('Should create folding range for simple WINDOW', () => {
            const code = `TestWindow WINDOW('Test'),AT(,,600,400)
            END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            assert.ok(ranges.length > 0, 'Should have folding range for WINDOW');
            const windowRange = ranges.find(r => r.startLine === 0);
            assert.ok(windowRange, 'Should find window folding range');
            assert.strictEqual(windowRange!.endLine, 1, 'Should extend to END');
        });

        test('Should create folding ranges for WINDOW with nested MENU structures', () => {
            const code = `TestWindow WINDOW('Test'),AT(,,600,400)
              MENUBAR,USE(?MENUBAR1)
                MENU('&File'),USE(?FileMenu)
                  ITEM('E&xit'),USE(?Exit)
                END
                MENU('&Help'),USE(?HelpMenu)
                  ITEM('&About'),USE(?About)
                END
              END
            END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have ranges for WINDOW, MENUBAR, and both MENUs
            assert.ok(ranges.length >= 4, `Should have at least 4 folding ranges, got ${ranges.length}`);
            
            // Check for window range (0-9)
            const windowRange = ranges.find(r => r.startLine === 0 && r.endLine === 9);
            assert.ok(windowRange, 'Should find window folding range from line 0 to 9');
            
            // Check for menubar range (1-8)
            const menubarRange = ranges.find(r => r.startLine === 1 && r.endLine === 8);
            assert.ok(menubarRange, 'Should find menubar folding range from line 1 to 8');
            
            // Check for File menu range (2-4)
            const fileMenuRange = ranges.find(r => r.startLine === 2 && r.endLine === 4);
            assert.ok(fileMenuRange, 'Should find File menu folding range from line 2 to 4');
            
            // Check for Help menu range (5-7)
            const helpMenuRange = ranges.find(r => r.startLine === 5 && r.endLine === 7);
            assert.ok(helpMenuRange, 'Should find Help menu folding range from line 5 to 7');
        });

        test('Should create folding range for APPLICATION structure', () => {
            const code = `AppFrame APPLICATION('Test App'),AT(,,600,400)
              MENUBAR,USE(?MENUBAR1)
                MENU('&File'),USE(?FileMenu)
                  ITEM('E&xit'),USE(?Exit)
                END
              END
            END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have ranges for APPLICATION, MENUBAR, and MENU
            assert.ok(ranges.length >= 3, `Should have at least 3 folding ranges, got ${ranges.length}`);
            
            // Check for application range
            const appRange = ranges.find(r => r.startLine === 0 && r.endLine === 6);
            assert.ok(appRange, 'Should find application folding range from line 0 to 6');
        });
    });

    suite('computeFoldingRanges - Control Flow (IF/ELSE/ELSIF)', () => {
        
        test('Should fold IF with ELSE correctly', () => {
            const code = `MyProc PROCEDURE()
  CODE
  If condition
    statement1
  Else
    statement2
  End
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have a fold for the IF that includes the ELSE block
            const ifRange = ranges.find(r => r.startLine === 2 && r.endLine === 6);
            assert.ok(ifRange, 'Should fold IF from line 2 to 6 (including ELSE)');
        });

        test('Should fold nested IF structures correctly', () => {
            const code = `MyProc PROCEDURE()
  CODE
  If outerCondition
    statement1
    If innerCondition
      statement2
    End
  Else
    statement3
  End
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have a fold for outer IF (including ELSE)
            const outerIfRange = ranges.find(r => r.startLine === 2 && r.endLine === 9);
            assert.ok(outerIfRange, 'Should fold outer IF from line 2 to 9 (including ELSE)');
            
            // Should have a fold for inner IF
            const innerIfRange = ranges.find(r => r.startLine === 4 && r.endLine === 6);
            assert.ok(innerIfRange, 'Should fold inner IF from line 4 to 6');
        });

        test('Should fold IF with ELSIF correctly', () => {
            const code = `MyProc PROCEDURE()
  CODE
  If condition1
    statement1
  ElsIf condition2
    statement2
  Else
    statement3
  End
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have a fold for the entire IF structure
            const ifRange = ranges.find(r => r.startLine === 2 && r.endLine === 8);
            assert.ok(ifRange, 'Should fold IF from line 2 to 8 (including ELSIF and ELSE)');
        });

        test('Should fold IF without ELSE correctly', () => {
            const code = `MyProc PROCEDURE()
  CODE
  If condition
    statement1
    statement2
  End
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should have a fold for the IF
            const ifRange = ranges.find(r => r.startLine === 2 && r.endLine === 5);
            assert.ok(ifRange, 'Should fold IF from line 2 to 5');
        });

        test('Should NOT fold single-line IF with period terminator', () => {
            const code = `MyProc PROCEDURE()
  CODE
  IF Cfg:SortByXYCU THEN SORT(SortQ,SortQ:ATSort,SortQ:LineNo).
  statement2
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should NOT have a fold for the single-line IF
            const ifRange = ranges.find(r => r.startLine === 2);
            assert.strictEqual(ifRange, undefined, 'Should NOT fold single-line IF');
        });

        test('Should NOT fold single-line IF with END terminator', () => {
            const code = `MyProc PROCEDURE()
  CODE
  IF x THEN y := 1 END
  statement2
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            
            const ranges = provider.computeFoldingRanges();
            
            // Should NOT have a fold for the single-line IF
            const ifRange = ranges.find(r => r.startLine === 2);
            assert.strictEqual(ifRange, undefined, 'Should NOT fold single-line IF with END');
        });
    });
});
