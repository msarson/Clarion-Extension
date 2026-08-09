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

    suite('isProcedureOrFunction', () => {
        function makeToken(type: TokenType): Token {
            return {
                type,
                value: 'X',
                line: 0,
                start: 0,
                finishesAt: undefined,
            } as unknown as Token;
        }

        test('returns true for TokenType.Procedure', () => {
            assert.strictEqual(TokenHelper.isProcedureOrFunction(makeToken(TokenType.Procedure)), true);
        });

        test('returns true for TokenType.Function', () => {
            assert.strictEqual(TokenHelper.isProcedureOrFunction(makeToken(TokenType.Function)), true);
        });

        test('returns false for unrelated token types', () => {
            const others = [
                TokenType.Keyword,
                TokenType.Variable,
                TokenType.Label,
                TokenType.Structure,
                TokenType.Routine,
                TokenType.Comment,
            ];
            for (const t of others) {
                assert.strictEqual(
                    TokenHelper.isProcedureOrFunction(makeToken(t)),
                    false,
                    `Expected false for ${TokenType[t]}`
                );
            }
        });

        test('FUNCTION declaration tokenized as Function returns true', () => {
            const code = `MyProc FUNCTION(),STRING
  CODE
  RETURN ''`;
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const callable = tokens.find(t => TokenHelper.isProcedureOrFunction(t));
            assert.ok(callable, 'Expected at least one Procedure or Function token');
        });
    });

    // #171 — INCLUDE-aware string-guard exception substrate.
    // Detector recognises the FIRST string-literal argument of file-reference
    // statements (INCLUDE / MODULE / MEMBER / LINK) so DefinitionProvider can
    // make a precise exception to its isPositionInString bail.
    suite('isInsideFileRefArg', () => {

        function cursorIn(source: string, search: string, occurrence = 1): { tokens: Token[]; line: number; character: number } {
            const tokens = new ClarionTokenizer(source).tokenize();
            const lines = source.split(/\r?\n/);
            let hits = 0;
            for (let line = 0; line < lines.length; line++) {
                let from = 0;
                while (true) {
                    const idx = lines[line].indexOf(search, from);
                    if (idx === -1) break;
                    hits++;
                    if (hits === occurrence) {
                        // Land cursor 1 char into the match so we're inside the string body, not on the opening quote
                        return { tokens, line, character: idx + 1 };
                    }
                    from = idx + search.length;
                }
            }
            throw new Error(`cursorIn: occurrence ${occurrence} of '${search}' not found in source`);
        }

        test('positive — cursor inside INCLUDE filename arg', () => {
            const { tokens, line, character } = cursorIn(
                "  PROGRAM\n  INCLUDE('MyClass.inc')\n  CODE\n",
                'MyClass.inc'
            );
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg(tokens, line, character),
                true,
                'cursor inside INCLUDE filename string must be recognised'
            );
        });

        test('positive — cursor inside MEMBER filename arg', () => {
            const { tokens, line, character } = cursorIn(
                "  MEMBER('Parent.clw')\n",
                'Parent.clw'
            );
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg(tokens, line, character),
                true,
                'cursor inside MEMBER filename string must be recognised'
            );
        });

        test('positive — cursor inside MODULE filename arg', () => {
            const code =
                "  PROGRAM\n" +
                "  MAP\n" +
                "    MODULE('lib.clw')\n" +
                "      Foo PROCEDURE\n" +
                "    END\n" +
                "  END\n" +
                "  CODE\n";
            const { tokens, line, character } = cursorIn(code, 'lib.clw');
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg(tokens, line, character),
                true,
                'cursor inside MODULE filename string must be recognised'
            );
        });

        test('positive — cursor inside LINK filename arg', () => {
            // LINK closes the 4th file-ref statement type per substrate-symmetry —
            // the detector filters by `referencedFile !== undefined`, which the
            // tokenizer populates for LINK per `TokenTypes.ts:117` contract.
            const { tokens, line, character } = cursorIn(
                "  PROGRAM\n  MAP\n  END\n  LINK('foo.lib')\n  CODE\n",
                'foo.lib'
            );
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg(tokens, line, character),
                true,
                'cursor inside LINK filename string must be recognised'
            );
        });

        test('negative scope-fence — cursor inside unrelated string literal', () => {
            // No INCLUDE/MODULE/MEMBER/LINK token on this line → must return false.
            const { tokens, line, character } = cursorIn(
                "  PROGRAM\n  CODE\n  MyVar = 'something.inc'\n",
                'something.inc'
            );
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg(tokens, line, character),
                false,
                'cursor in non-file-ref string must NOT be recognised (over-fire gate per Bob spec)'
            );
        });

        test('negative — cursor inside SECTION arg (second string of INCLUDE)', () => {
            // Detector scopes to FIRST string after file-ref token; cursor in 2nd → false.
            const { tokens, line, character } = cursorIn(
                "  INCLUDE('foo.inc'),SECTION('mySection')\n",
                'mySection'
            );
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg(tokens, line, character),
                false,
                'cursor in SECTION arg (2nd string after INCLUDE) must NOT be recognised'
            );
        });

        test('positive — cursor inside FIRST string of INCLUDE-with-SECTION still recognised', () => {
            // Same line as above but cursor on the filename string — bidirectional pair.
            const { tokens, line, character } = cursorIn(
                "  INCLUDE('foo.inc'),SECTION('mySection')\n",
                'foo.inc'
            );
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg(tokens, line, character),
                true,
                'cursor in FIRST string (filename) of two-arg INCLUDE must be recognised'
            );
        });

        test('negative — cursor on whitespace before the file-ref string', () => {
            // Cursor on a non-string position on the line should return false even
            // though the line has a file-ref token + string arg.
            const code = "  INCLUDE('foo.inc')\n";
            const tokens = new ClarionTokenizer(code).tokenize();
            // Position 2 = on the 'I' of INCLUDE, before the string starts at col 10.
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg(tokens, 0, 2),
                false,
                'cursor on the INCLUDE keyword itself must NOT be recognised'
            );
        });

        test('negative — empty token array', () => {
            assert.strictEqual(
                TokenHelper.isInsideFileRefArg([], 0, 0),
                false,
                'empty token array must return false defensively'
            );
        });
    });

    // ── #373: string literals swallowed inside composite tokens ──────────────
    // The tokenizer folds `command ('/netnolog')` into ONE FunctionArgumentParameter
    // token — no TokenType.String token is emitted for the literal — so the
    // String-token-only check missed these positions and hover/F12 ran the full
    // resolver chain on string contents (12.5s cold walk, #373).
    suite('isPositionInString (#373 — embedded literals)', () => {

        // The exact #361/#373 repro line shape from IBSCommon.clw
        const reproLine = "    if ~command ('/netnolog') and (command ('/nettalklog') or command ('/neterrors'))";

        test('word inside a literal swallowed by a composite token → true', () => {
            const tokens = new ClarionTokenizer(reproLine).tokenize();
            const ch = reproLine.indexOf('netnolog') + 2; // inside the word, inside the quotes
            assert.strictEqual(
                TokenHelper.isPositionInString(tokens, 0, ch),
                true,
                `position ${ch} is inside '/netnolog' and must be recognised as in-string`
            );
        });

        test('second literal on the same line → true', () => {
            const tokens = new ClarionTokenizer(reproLine).tokenize();
            const ch = reproLine.indexOf('nettalklog') + 3;
            assert.strictEqual(TokenHelper.isPositionInString(tokens, 0, ch), true);
        });

        test('function name outside the quotes on the same token → false', () => {
            const tokens = new ClarionTokenizer(reproLine).tokenize();
            const ch = reproLine.indexOf('command') + 2; // on 'command', before its '('
            assert.strictEqual(
                TokenHelper.isPositionInString(tokens, 0, ch),
                false,
                'the function name itself is NOT inside a string — must not over-suppress'
            );
        });

        test('plain String token in an assignment still detected → true', () => {
            const code = "  Msg = 'hello world'";
            const tokens = new ClarionTokenizer(code).tokenize();
            const ch = code.indexOf('world') + 1;
            assert.strictEqual(TokenHelper.isPositionInString(tokens, 0, ch), true);
        });

        test('doubled-quote escape inside a literal → still in-string after it', () => {
            const code = "  x = foo('it''s here')";
            const tokens = new ClarionTokenizer(code).tokenize();
            const ch = code.indexOf('here') + 1;
            assert.strictEqual(
                TokenHelper.isPositionInString(tokens, 0, ch),
                true,
                "'' is an escaped quote, not a string terminator"
            );
        });

        test('identifier after a closing quote on the same line → false', () => {
            const code = "  if command ('/x') and MyVar";
            const tokens = new ClarionTokenizer(code).tokenize();
            const ch = code.indexOf('MyVar') + 1;
            assert.strictEqual(
                TokenHelper.isPositionInString(tokens, 0, ch),
                false,
                'a genuine identifier after the literal must still resolve'
            );
        });
    });
});
