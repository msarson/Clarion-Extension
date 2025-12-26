import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import ClarionFoldingProvider from '../ClarionFoldingProvider';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';

suite('Downstream Consumers - Dot Terminator Tests', () => {
    
    /**
     * Helper to create a TextDocument from code string
     */
    function createDocument(code: string): TextDocument {
        return TextDocument.create('test://test.clw', 'clarion', 1, code);
    }
    
    suite('FoldingProvider with Dot-Terminated Structures', () => {
        
        test('Should create fold range for dot-terminated IF', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    MESSAGE('Error allocating string')
  .
  RETURN`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            const ranges = provider.computeFoldingRanges();
            
            console.log(`\n=== FoldingProvider Test: Dot-Terminated IF ===`);
            console.log(`Total fold ranges: ${ranges.length}`);
            ranges.forEach((range, idx) => {
                console.log(`  Range ${idx}: lines ${range.startLine}-${range.endLine}`);
            });
            
            // Should have fold range for IF (lines 3-5)
            const ifFold = ranges.find(r => r.startLine === 3 && r.endLine === 5);
            assert.ok(ifFold, 
                `Should create fold range for dot-terminated IF [3-5], ` +
                `but found ranges: ${ranges.map(r => `[${r.startLine}-${r.endLine}]`).join(', ')}`
            );
        });
        
        test('Should create fold range for dot-terminated LOOP', () => {
            const code = `TestProc PROCEDURE()
i LONG
  CODE
  LOOP
    i += 1
    IF i > 5 THEN BREAK.
  .
  RETURN`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            const ranges = provider.computeFoldingRanges();
            
            console.log(`\n=== FoldingProvider Test: Dot-Terminated LOOP ===`);
            console.log(`Total fold ranges: ${ranges.length}`);
            
            // Should have fold range for LOOP
            const loopFold = ranges.find(r => r.startLine === 3 && r.endLine === 6);
            assert.ok(loopFold,
                `Should create fold range for dot-terminated LOOP [3-6]`
            );
        });
        
        test('Should create fold range for dot-terminated CASE', () => {
            const code = `TestProc PROCEDURE()
choice LONG
  CODE
  CASE choice
  OF 1
    result = 10
  OF 2
    result = 20
  .
  RETURN`;
            
            const tokenizer = new ClarionTokenizer(code);
            const tokens = tokenizer.tokenize();
            const provider = new ClarionFoldingProvider(tokens);
            const ranges = provider.computeFoldingRanges();
            
            console.log(`\n=== FoldingProvider Test: Dot-Terminated CASE ===`);
            console.log(`Total fold ranges: ${ranges.length}`);
            
            // Should have fold range for CASE
            const caseFold = ranges.find(r => r.startLine === 3 && r.endLine === 8);
            assert.ok(caseFold,
                `Should create fold range for dot-terminated CASE [3-8]`
            );
        });
    });
    
    suite('DiagnosticProvider with Dot-Terminated Structures', () => {
        
        test('Should NOT flag dot-terminated IF as unterminated', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    MESSAGE('Error allocating string')
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            console.log(`\n=== DiagnosticProvider Test: Dot-Terminated IF ===`);
            console.log(`Total diagnostics: ${diagnostics.length}`);
            diagnostics.forEach((diag, idx) => {
                console.log(`  Diagnostic ${idx}: ${diag.message} (line ${diag.range.start.line})`);
            });
            
            // Should NOT have diagnostic for IF being unterminated
            const ifDiagnostic = diagnostics.find(d =>
                d.message.includes('IF') && d.message.includes('not terminated')
            );
            
            assert.strictEqual(ifDiagnostic, undefined,
                `Should NOT flag dot-terminated IF as unterminated, ` +
                `but found diagnostic: ${ifDiagnostic?.message}`
            );
        });
        
        test('Should NOT flag dot-terminated LOOP as unterminated', () => {
            const code = `TestProc PROCEDURE()
i LONG
  CODE
  LOOP
    i += 1
    IF i > 5 THEN BREAK.
  .
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            console.log(`\n=== DiagnosticProvider Test: Dot-Terminated LOOP ===`);
            console.log(`Total diagnostics: ${diagnostics.length}`);
            
            // Should NOT have diagnostic for LOOP being unterminated
            const loopDiagnostic = diagnostics.find(d =>
                d.message.includes('LOOP') && d.message.includes('not terminated')
            );
            
            assert.strictEqual(loopDiagnostic, undefined,
                `Should NOT flag dot-terminated LOOP as unterminated`
            );
        });
        
        test('Should NOT flag dot-terminated CASE as unterminated', () => {
            const code = `TestProc PROCEDURE()
choice LONG
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
            
            console.log(`\n=== DiagnosticProvider Test: Dot-Terminated CASE ===`);
            console.log(`Total diagnostics: ${diagnostics.length}`);
            
            // Should NOT have diagnostic for CASE being unterminated
            const caseDiagnostic = diagnostics.find(d =>
                d.message.includes('CASE') && d.message.includes('not terminated')
            );
            
            assert.strictEqual(caseDiagnostic, undefined,
                `Should NOT flag dot-terminated CASE as unterminated`
            );
        });
        
        test('SHOULD flag actually unterminated IF', () => {
            const code = `TestProc PROCEDURE()
x LONG
  CODE
  IF x > 0 THEN
    MESSAGE('Error')
  RETURN`;
            
            const document = createDocument(code);
            const diagnostics = DiagnosticProvider.validateDocument(document);
            
            console.log(`\n=== DiagnosticProvider Test: Unterminated IF (No Dot) ===`);
            console.log(`Total diagnostics: ${diagnostics.length}`);
            
            // SHOULD have diagnostic for IF being unterminated
            const ifDiagnostic = diagnostics.find(d =>
                d.message.includes('IF') && d.message.includes('not terminated')
            );
            
            assert.ok(ifDiagnostic,
                `SHOULD flag unterminated IF (no END or dot)`
            );
        });
    });
});
