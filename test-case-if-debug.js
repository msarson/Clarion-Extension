const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const { DiagnosticProvider } = require('./out/server/src/providers/DiagnosticProvider');
const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs');

const code = fs.readFileSync('test-case-if-unterminated.clw', 'utf8');
const document = TextDocument.create('file:///test.clw', 'clarion', 1, code);

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('\n=== Diagnostics ===');
const diagnostics = DiagnosticProvider.validateDocument(document, tokens);
diagnostics.forEach(d => {
    console.log(`Line ${d.range.start.line}: ${d.message}`);
});

console.log(`\nTotal diagnostics: ${diagnostics.length}`);
