const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const { DiagnosticProvider } = require('./out/server/src/providers/DiagnosticProvider');
const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs');

const code = fs.readFileSync('test-return-validation.clw', 'utf8');
const document = TextDocument.create('file:///test.clw', 'clarion', 1, code);

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('\n=== Source Lines ===');
code.split('\n').forEach((line, i) => {
    console.log(`Line ${i}: "${line}"`);
});

console.log('\n=== Tokens Around PROCEDURE ===');
tokens.forEach((t, i) => {
    if (t.value.toUpperCase() === 'PROCEDURE' || i >= 11 && i <= 19) {
        console.log(`${i}: Line ${t.line}: [${t.type}] "${t.value}" (col ${t.start})`);
    }
});

console.log('\n=== Diagnostics ===');
const diagnostics = DiagnosticProvider.validateDocument(document, tokens);
diagnostics.forEach(d => {
    console.log(`Line ${d.range.start.line}: ${d.message}`);
});

console.log(`\nTotal diagnostics: ${diagnostics.length}`);
