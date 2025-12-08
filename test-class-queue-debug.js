const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const { DiagnosticProvider } = require('./out/server/src/providers/DiagnosticProvider');
const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs');

const code = fs.readFileSync('test-class-queue-terminator.clw', 'utf8');
const document = TextDocument.create('file:///test.clw', 'clarion', 1, code);

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('\n=== All Tokens ===');
tokens.forEach((t, i) => {
    const parentInfo = t.parent ? `parent="${t.parent.value}"` : 'no parent';
    const childrenInfo = t.children ? `children=${t.children.length}` : 'no children';
    const finishesAt = t.finishesAt !== undefined ? `finishesAt=${t.finishesAt}` : 'no finishesAt';
    console.log(`${i}: Line ${t.line}: [${t.type}] "${t.value}" | ${parentInfo} | ${childrenInfo} | ${finishesAt}`);
});

console.log('\n=== CLASS token details ===');
const classToken = tokens.find(t => t.value.toUpperCase() === 'CLASS');
if (classToken) {
    console.log(`CLASS at line ${classToken.line}`);
    console.log(`  finishesAt: ${classToken.finishesAt}`);
    console.log(`  children: ${classToken.children ? classToken.children.length : 0}`);
    if (classToken.children) {
        classToken.children.forEach((child, i) => {
            console.log(`    child ${i}: "${child.value}" at line ${child.line}, type=${child.type}, finishesAt=${child.finishesAt}`);
        });
    }
}

console.log('\n=== Diagnostics ===');
const diagnostics = DiagnosticProvider.validateDocument(document, tokens);
diagnostics.forEach(d => {
    console.log(`Line ${d.range.start.line}: ${d.message}`);
});

console.log(`\nTotal diagnostics: ${diagnostics.length}`);

