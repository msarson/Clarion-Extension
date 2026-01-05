import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { TokenHelper } from '../utils/TokenHelper';
import { Token, TokenType, ClarionTokenizer } from '../ClarionTokenizer';

suite('TokenHelper Tests', () => {
    
    suite('getWordRangeAtPosition', () => {
        
        function createDocument(text: string): TextDocument {
            return TextDocument.create('test://test.clw', 'clarion', 1, text);
        }

        test('Should extract word with colon prefix - LOC:Field', () => {
            const doc = createDocument('  LOC:Field = 123');
            const pos: Position = { line: 0, character: 5 }; // On 'LOC:Field'
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            assert.strictEqual(range!.start.character, 2);
            assert.strictEqual(range!.end.character, 11);
            assert.strictEqual(doc.getText(range!), 'LOC:Field');
        });

        test('Should extract Clarion prefix notation - Cust:Name', () => {
            const doc = createDocument('Cust:Name STRING(40)');
            const pos: Position = { line: 0, character: 3 }; // On 'Cust'
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            assert.strictEqual(doc.getText(range!), 'Cust:Name');
        });

        test('Should handle dot notation - cursor on prefix (MyGroup.MyField)', () => {
            const doc = createDocument('  MyGroup.MyField = 1');
            const pos: Position = { line: 0, character: 4 }; // On 'MyGroup'
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            // When cursor is on the prefix part, return just the prefix
            assert.strictEqual(doc.getText(range!), 'MyGroup');
        });

        test('Should handle dot notation - cursor on field (MyGroup.MyField)', () => {
            const doc = createDocument('  MyGroup.MyField = 1');
            const pos: Position = { line: 0, character: 12 }; // On 'MyField'
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            // When cursor is on the field part, return full qualified name
            assert.strictEqual(doc.getText(range!), 'MyGroup.MyField');
        });

        test('Should handle self.Method() notation', () => {
            const doc = createDocument('  self.SaveFile()');
            const pos: Position = { line: 0, character: 8 }; // On 'SaveFile'
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            assert.strictEqual(doc.getText(range!), 'self.SaveFile');
        });

        test('Should handle simple identifier without prefix', () => {
            const doc = createDocument('  MyVariable = 123');
            const pos: Position = { line: 0, character: 4 }; // On 'MyVariable'
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            assert.strictEqual(doc.getText(range!), 'MyVariable');
        });

        test('Should handle multiple colons - File:Record:Field', () => {
            const doc = createDocument('File:Record:Field = 1');
            const pos: Position = { line: 0, character: 10 }; // Somewhere in the middle
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            assert.strictEqual(doc.getText(range!), 'File:Record:Field');
        });

        test('Should return null for empty position', () => {
            const doc = createDocument('   ');
            const pos: Position = { line: 0, character: 1 }; // On whitespace
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.strictEqual(range, null);
        });

        test('Should handle cursor at start of word', () => {
            const doc = createDocument('MyProc PROCEDURE()');
            const pos: Position = { line: 0, character: 0 }; // At 'M' of MyProc
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            assert.strictEqual(doc.getText(range!), 'MyProc');
        });

        test('Should handle cursor at end of word', () => {
            const doc = createDocument('MyProc PROCEDURE()');
            const pos: Position = { line: 0, character: 5 }; // After 'MyProc'
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should return a range');
            assert.strictEqual(doc.getText(range!), 'MyProc');
        });
    });

    suite('getInnermostScopeAtLine', () => {
        
        test('Should find procedure scope', () => {
            const code = `MyProc PROCEDURE()
CODE
  MyVar LONG
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 2); // Line with MyVar
            
            assert.ok(scope, 'Should find a scope');
            assert.ok(scope!.value.toUpperCase().includes('PROCEDURE'));
        });

        test('Should find routine scope within procedure', () => {
            const code = `MyProc PROCEDURE()
MyRoutine ROUTINE
CODE
  RETURN
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 2); // Inside routine
            
            assert.ok(scope, 'Should find a scope');
            // Should return the innermost scope (routine, not procedure)
            assert.strictEqual(scope!.subType, TokenType.Routine, 'Should be a routine scope');
            assert.strictEqual(scope!.label?.toUpperCase(), 'MYROUTINE', 'Should be MyRoutine');
        });

        test('Should return undefined for line outside any scope', () => {
            const code = `! Comment at top
MyProc PROCEDURE()
CODE
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 0); // Comment line
            
            assert.strictEqual(scope, undefined);
        });

        test('Should not return MethodDeclaration from CLASS data section', () => {
            const code = `MyClass CLASS
Init PROCEDURE()
  END
MyProc PROCEDURE()
CODE
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            // Line 1 is the method declaration inside CLASS
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 1);
            
            // Should not find the method declaration as a valid scope
            // (or should find the class, depending on implementation)
            assert.ok(scope === undefined || scope.subType !== TokenType.MethodDeclaration);
        });
    });

    suite('getParentScopeOfRoutine', () => {
        
        test('Should find parent procedure of routine', () => {
            const code = `MyProc PROCEDURE()
MyRoutine ROUTINE
CODE
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            // Find the routine token
            const routineToken = tokens.find(t => 
                t.subType === TokenType.Routine || 
                t.value.toUpperCase().includes('ROUTINE')
            );
            
            assert.ok(routineToken, 'Should find routine token');
            
            const parent = TokenHelper.getParentScopeOfRoutine(tokens, routineToken!);
            
            assert.ok(parent, 'Should find parent scope');
            assert.ok(parent!.value.toUpperCase().includes('PROCEDURE'));
        });

        test('Should return undefined for routine with no parent', () => {
            const code = `GlobalRoutine ROUTINE
CODE
END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const routineToken = tokens.find(t => 
                t.subType === TokenType.Routine ||
                t.value.toUpperCase().includes('ROUTINE')
            );
            
            if (routineToken) {
                const parent = TokenHelper.getParentScopeOfRoutine(tokens, routineToken);
                assert.strictEqual(parent, undefined);
            }
        });
    });
});
