const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const { ClarionDocumentSymbolProvider } = require('./out/server/src/providers/ClarionDocumentSymbolProvider');
const { setServerInitialized } = require('./out/server/src/serverState');
const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs');

setServerInitialized(true);

const code = fs.readFileSync('test-code-statement-bug.clw', 'utf8');
const document = TextDocument.create('file:///test.clw', 'clarion', 1, code);

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('\n=== All Tokens ===');
tokens.forEach((t, i) => {
    console.log(`${i}: Line ${t.line}: [${t.type}] "${t.value}"`);
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

// Look for the "do Call_ButtonProc" symbol
const findSymbol = (syms, name) => {
    for (const sym of syms) {
        if (sym.name.toLowerCase().includes(name.toLowerCase())) {
            return sym;
        }
        if (sym.children) {
            const found = findSymbol(sym.children, name);
            if (found) return found;
        }
    }
    return null;
};

const doSymbol = findSymbol(symbols, 'do ');
if (doSymbol) {
    console.log('\n⚠️ FOUND DO STATEMENT IN SYMBOLS:');
    console.log(`  Name: ${doSymbol.name}`);
    console.log(`  Kind: ${doSymbol.kind}`);
} else {
    console.log('\n✅ DO statement not in symbols (correct behavior)');
}
