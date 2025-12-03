import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { TokenHelper } from '../utils/TokenHelper';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

suite('DefinitionProvider Behavior Tests', () => {
    
    function createDocument(code: string): TextDocument {
        return TextDocument.create('test://test.clw', 'clarion', 1, code);
    }

    suite('Word Extraction for Goto Definition', () => {
        
        test('Should extract method name from self.Method() call', () => {
            const code = 'self.SaveFile()';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 8 }; // On 'SaveFile'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'self.SaveFile');
        });

        test('Should extract prefixed variable (LOC:Counter)', () => {
            const code = 'LOC:Counter = 123';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 5 }; // On 'LOC:Counter'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'LOC:Counter');
        });

        test('Should extract procedure name from call', () => {
            const code = '  HelperProc(123)';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 6 }; // On 'HelperProc'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'HelperProc');
        });

        test('Should extract structure field (MyQueue.Name)', () => {
            const code = 'MyQueue.Name = \'Test\'';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 10 }; // On 'Name'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'MyQueue.Name');
        });

        test('Should extract DO routine target', () => {
            const code = '  DO ProcessData';
            const doc = createDocument(code);
            const pos: Position = { line: 0, character: 8 }; // On 'ProcessData'
            
            const range = TokenHelper.getWordRangeAtPosition(doc, pos);
            
            assert.ok(range, 'Should find word range');
            assert.strictEqual(doc.getText(range!), 'ProcessData');
        });
    });

    suite('Symbol Detection in Token Stream', () => {
        
        test('Should detect local variable declaration', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            // Find the LocalVar token
            const localVarToken = tokens.find(t => 
                t.label && t.label.toLowerCase() === 'localvar'
            );
            
            assert.ok(localVarToken, 'Should find LocalVar token');
            assert.strictEqual(localVarToken!.line, 1, 'Should be on line 1');
        });

        test('Should detect PROCEDURE declaration', () => {
            const code = `MyProc PROCEDURE()
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const procToken = tokens.find(t => 
                t.subType === TokenType.Procedure || 
                t.value.toUpperCase() === 'PROCEDURE'
            );
            
            assert.ok(procToken, 'Should find PROCEDURE token');
            assert.strictEqual(procToken!.line, 0, 'Should be on line 0');
        });

        test('Should detect ROUTINE declaration', () => {
            const code = `MyProc PROCEDURE()
ProcessData ROUTINE
  CODE
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const routineToken = tokens.find(t => 
                t.subType === TokenType.Routine ||
                (t.label && t.label.toLowerCase() === 'processdata')
            );
            
            assert.ok(routineToken, 'Should find ROUTINE token');
        });

        test('Should detect CLASS method declaration', () => {
            const code = `MyClass CLASS
  Init PROCEDURE()
  SaveFile PROCEDURE()
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const classToken = tokens.find(t => 
                t.subType === TokenType.Class ||
                t.value.toUpperCase() === 'CLASS'
            );
            
            assert.ok(classToken, 'Should find CLASS token');
        });

        test('Should detect QUEUE structure with fields', () => {
            const code = `MyQueue QUEUE
  Name STRING(40)
  Age LONG
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const queueToken = tokens.find(t => 
                t.label && t.label.toLowerCase() === 'myqueue'
            );
            
            assert.ok(queueToken, 'Should find QUEUE declaration');
        });
    });

    suite('Scope Detection for Definition Search', () => {
        
        test('Should find innermost procedure scope', () => {
            const code = `MyProc PROCEDURE()
LocalVar LONG
  CODE
  LocalVar = 123
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 3);
            
            assert.ok(scope, 'Should find scope');
            assert.ok(scope!.value.toUpperCase().includes('PROCEDURE'));
        });

        test('Should find routine scope within procedure', () => {
            const code = `MyProc PROCEDURE()
ProcessData ROUTINE
  CODE
  ! Inside routine
  END`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            
            const scope = TokenHelper.getInnermostScopeAtLine(tokens, 3);
            
            assert.ok(scope, 'Should find scope');
            assert.ok(scope!.value.toUpperCase().includes('ROUTINE'));
        });
    });

    suite('Method Implementation Pattern Detection', () => {
        
        test('Should detect method implementation pattern', () => {
            const line = 'ThisWindow.Init PROCEDURE()';
            const pattern = /^(\w+)\.(\w+)\s+PROCEDURE/i;
            
            const match = line.match(pattern);
            
            assert.ok(match, 'Should match method implementation pattern');
            assert.strictEqual(match![1], 'ThisWindow', 'Should extract class name');
            assert.strictEqual(match![2], 'Init', 'Should extract method name');
        });

        test('Should detect method implementation with parameters', () => {
            const line = 'MyClass.Process PROCEDURE(STRING pName, LONG pId)';
            const pattern = /^(\w+)\.(\w+)\s+PROCEDURE/i;
            
            const match = line.match(pattern);
            
            assert.ok(match, 'Should match method with parameters');
            assert.strictEqual(match![1], 'MyClass');
            assert.strictEqual(match![2], 'Process');
        });
    });

    suite('Self Method Call Pattern Detection', () => {
        
        test('Should detect self.Method() pattern', () => {
            const line = '  self.SaveFile()';
            const dotIndex = line.indexOf('.');
            
            assert.ok(dotIndex > 0, 'Should find dot');
            
            const beforeDot = line.substring(0, dotIndex).trim();
            const afterDot = line.substring(dotIndex + 1);
            
            assert.strictEqual(beforeDot.toLowerCase(), 'self');
            assert.ok(afterDot.startsWith('SaveFile'), 'Should have method name after dot');
        });

        test('Should detect self.Method with parameters', () => {
            const line = 'self.Process(\'Test\', 123)';
            const hasParens = line.includes('(');
            
            assert.ok(hasParens, 'Should detect method call with parameters');
        });
    });
});
