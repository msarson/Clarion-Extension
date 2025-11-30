const { DiagnosticProvider } = require('./out/server/src/providers/DiagnosticProvider');
const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs');

const code = fs.readFileSync('test-programs/syntax-tests/StringTheory.clw', 'utf8');

console.log('Analyzing StringTheory.clw...');
const doc = TextDocument.create('file:///StringTheory.clw', 'clarion', 1, code);
const diag = DiagnosticProvider.validateDocument(doc);

console.log(`\nTotal diagnostics: ${diag.length}`);

// Filter for IF and LOOP diagnostics
const ifLoopDiag = diag.filter(d => d.message.includes('IF statement') || d.message.includes('LOOP statement'));
console.log(`\nIF/LOOP diagnostics: ${ifLoopDiag.length}`);
ifLoopDiag.forEach(d => {
  console.log(`  Line ${d.range.start.line + 1}: ${d.message}`);
});
