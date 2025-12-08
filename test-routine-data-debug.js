const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const { ClarionDocumentSymbolProvider } = require('./out/server/src/providers/ClarionDocumentSymbolProvider');
const { setServerInitialized } = require('./out/server/src/serverState');
const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs');

setServerInitialized(true);

const code = fs.readFileSync('test-routine-data-variables.clw', 'utf8');
const document = TextDocument.create('file:///test.clw', 'clarion', 1, code);

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('\n=== All Tokens ===');
tokens.forEach((t, i) => {
    console.log(`${i}: Line ${t.line}: [${t.type}] "${t.value}"`);
});

console.log('\n=== ROUTINE Token Info ===');
const routineToken = tokens.find(t => t.value.toUpperCase() === 'ROUTINE');
if (routineToken) {
    console.log(`ROUTINE at line ${routineToken.line}`);
    console.log(`  hasLocalData: ${routineToken.hasLocalData}`);
    console.log(`  finishesAt: ${routineToken.finishesAt}`);
}

console.log('\n=== Variable Tokens ===');
tokens.forEach((t, i) => {
    if (t.value.toUpperCase().startsWith('ROU:') || t.value === 'SaveWallID') {
        console.log(`${i}: Line ${t.line}: [${t.type}] "${t.value}"`);
    }
});

console.log('\n=== Document Symbols ===');
const provider = new ClarionDocumentSymbolProvider();
const symbols = provider.provideDocumentSymbols(tokens, document.uri);

function printSymbols(syms, indent = 0) {
    for (const sym of syms) {
        console.log(`${'  '.repeat(indent)}${sym.name} (kind=${sym.kind})`);
        if (sym.children && sym.children.length > 0) {
            printSymbols(sym.children, indent + 1);
        }
    }
}

printSymbols(symbols);
console.log(`\nFound ${symbols.length} top-level symbols`);
