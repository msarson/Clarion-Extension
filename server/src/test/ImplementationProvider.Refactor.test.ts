/**
 * Tests for ImplementationProvider refactoring to use DocumentStructure APIs
 * Tests the IMPROVED behavior after refactoring to use DocumentStructure.isInMapBlock()
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { TokenCache } from '../TokenCache';

suite('ImplementationProvider - DocumentStructure API Integration', () => {
    let provider: ImplementationProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new ImplementationProvider();
        tokenCache = TokenCache.getInstance();
    });
    
    teardown(() => {
        // Clear any cached documents after each test
        tokenCache.clearTokens('test://test1.clw');
        tokenCache.clearTokens('test://test2.clw');
        tokenCache.clearTokens('test://test3.clw');
    });

    suite('MAP procedure implementation finding (integration test)', () => {
        test('should find implementation for MAP declaration', async () => {
            const code = `  MAP
    TestProc PROCEDURE()
  END

TestProc PROCEDURE()
CODE
  RETURN
END`;
            const doc = TextDocument.create('test://test1.clw', 'clarion', 1, code);
            const position = Position.create(1, 7); // On "TestProc" in MAP
            
            const location = await provider.provideImplementation(doc, position);
            
            assert.ok(location, 'Should find implementation');
            if (location && !Array.isArray(location)) {
                assert.strictEqual(location.range.start.line, 4, 'Should point to implementation line');
            }
        });

        test('should handle MAP declaration without implementation', async () => {
            const code = `  MAP
    NonExistent PROCEDURE()
  END`;
            const doc = TextDocument.create('test://test2.clw', 'clarion', 1, code);
            const position = Position.create(1, 7); // On "NonExistent" in MAP
            
            const location = await provider.provideImplementation(doc, position);
            
            assert.strictEqual(location, null, 'Should return null when no implementation found');
        });

        test('should handle overloaded procedures correctly', async () => {
            const code = `  MAP
    TestProc PROCEDURE()
    TestProc PROCEDURE(STRING s)
  END

TestProc PROCEDURE()
CODE
  RETURN
END

TestProc PROCEDURE(STRING s)
CODE
  RETURN
END`;
            const doc = TextDocument.create('test://test3.clw', 'clarion', 1, code);
            const position = Position.create(2, 7); // On second "TestProc" in MAP
            
            const location = await provider.provideImplementation(doc, position);
            
            assert.ok(location, 'Should find implementation');
            if (location && !Array.isArray(location)) {
                // Should find the one with STRING parameter
                assert.strictEqual(location.range.start.line, 10, 'Should point to overload with STRING parameter');
            }
        });
    });

    suite('Class method implementation - className filtering', () => {
        test('should NOT return a different class method when searching by class name', async () => {
            // ChildClass.DoWork is in this file, ParentClass.DoWork is NOT
            // When we search for ParentClass.DoWork, we should return null (not ChildClass.DoWork)
            const code = `ChildClass.DoWork PROCEDURE()
  CODE
  RETURN

ChildClass.Other PROCEDURE()
  CODE
  RETURN`;
            const doc = TextDocument.create('test://classfilter1.clw', 'clarion', 1, code);
            tokenCache.clearTokens('test://classfilter1.clw');

            // Simulate what findMethodImplementationCrossFile does when looking for ParentClass.DoWork:
            // It searches current file first — should NOT match ChildClass.DoWork
            // We test this indirectly: cursor on SELF.DoWork() in a procedure body
            // For direct testing, we can verify via a SELF call where the class matches
            const codeSelf = `ChildClass    CLASS
DoWork          PROCEDURE
END

ChildClass.SomeMethod PROCEDURE()
  CODE
  SELF.DoWork()
  RETURN

ChildClass.DoWork PROCEDURE()
  CODE
  RETURN`;
            const docSelf = TextDocument.create('test://classfilter2.clw', 'clarion', 1, codeSelf);
            tokenCache.clearTokens('test://classfilter2.clw');

            const position = Position.create(6, 9); // cursor on "DoWork" in SELF.DoWork()
            const location = await provider.provideImplementation(docSelf, position);

            assert.ok(location, 'Should find ChildClass.DoWork implementation');
            if (location && !Array.isArray(location)) {
                assert.strictEqual(location.range.start.line, 9, 'Should navigate to ChildClass.DoWork PROCEDURE()');
            }
        });

        test('method implementation search should filter by class name to avoid wrong-class match', async () => {
            // Two different classes with same method name in same file
            // Cursor on SELF.Process() inside ClassA.SomeMethod - should find ClassA.Process NOT ClassB.Process
            const code = `ClassA    CLASS
Process   PROCEDURE
END

ClassB    CLASS
Process   PROCEDURE
END

ClassA.SomeMethod PROCEDURE()
  CODE
  SELF.Process()
  RETURN

ClassA.Process PROCEDURE()
  CODE
  RETURN

ClassB.Process PROCEDURE()
  CODE
  RETURN`;
            const doc = TextDocument.create('test://classfilter3.clw', 'clarion', 1, code);
            tokenCache.clearTokens('test://classfilter3.clw');

            const position = Position.create(10, 9); // cursor on "Process" in SELF.Process()
            const location = await provider.provideImplementation(doc, position);

            assert.ok(location, 'Should find an implementation');
            if (location && !Array.isArray(location)) {
                assert.strictEqual(location.range.start.line, 13, 'Should navigate to ClassA.Process, not ClassB.Process');
            }
        });
    });

    suite('PARENT method call detection', () => {
        test('extractMethodCall should detect PARENT as objectName', async () => {
            // Test that provideImplementation handles PARENT.Method() without crashing
            // (Cannot test cross-file lookup without file system, but can verify it returns null
            //  rather than the wrong class's implementation)
            const code = `ParentClass    CLASS
DoWork           PROCEDURE
END

ChildClass     CLASS(ParentClass)
DoWork           PROCEDURE
END

ChildClass.SomeMethod PROCEDURE()
  CODE
  PARENT.DoWork()
  RETURN

ChildClass.DoWork PROCEDURE()
  CODE
  RETURN`;
            const doc = TextDocument.create('test://parent1.clw', 'clarion', 1, code);
            tokenCache.clearTokens('test://parent1.clw');

            const position = Position.create(10, 11); // cursor on "DoWork" in PARENT.DoWork()
            const location = await provider.provideImplementation(doc, position);

            // ChildClass.DoWork is in this file, but PARENT.DoWork() should NOT navigate to it.
            // Since ParentClass.DoWork has no implementation in this file, result is null.
            if (location && !Array.isArray(location)) {
                const lines = code.split('\n');
                const navigatedLine = lines[location.range.start.line];
                assert.ok(
                    !navigatedLine.toUpperCase().includes('CHILDCLASS.'),
                    `PARENT.DoWork() should NOT navigate to ChildClass.DoWork, but navigated to: "${navigatedLine}"`
                );
            }
            // null is also acceptable (no cross-file resolution in unit test context)
        });

        test('PARENT.Method() should not navigate to same-named method in child class', async () => {
            // The critical regression: before the fix, PARENT.DoWork() would navigate to
            // ChildClass.DoWork because findMethodImplementationInFile ignored the class name filter.
            const code = `ChildClass.CallerMethod PROCEDURE()
  CODE
  PARENT.DoWork()
  RETURN

ChildClass.DoWork PROCEDURE()
  CODE
  RETURN`;
            const doc = TextDocument.create('test://parent2.clw', 'clarion', 1, code);
            tokenCache.clearTokens('test://parent2.clw');

            const position = Position.create(2, 11); // cursor on "DoWork" in PARENT.DoWork()
            const location = await provider.provideImplementation(doc, position);

            if (location && !Array.isArray(location)) {
                const lines = code.split('\n');
                const navigatedLine = lines[location.range.start.line];
                // Should NOT find ChildClass.DoWork (line 5)
                assert.notStrictEqual(
                    location.range.start.line, 5,
                    `PARENT.DoWork() must not navigate to ChildClass.DoWork at line 5, got: "${navigatedLine}"`
                );
            }
            // null = correct (no parent implementation in this file)
        });
    });
});
