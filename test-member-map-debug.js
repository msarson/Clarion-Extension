const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const { ClarionDocumentSymbolProvider } = require('./out/server/src/providers/ClarionDocumentSymbolProvider');
const { setServerInitialized } = require('./out/server/src/serverState');
const fs = require('fs');

setServerInitialized(true);

const code = fs.readFileSync('test-member-map.clw', 'utf8');
console.log('=== MEMBER/MAP Test ===');

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('\nTokens:');
tokens.forEach((tok, i) => {
    console.log(`${i}: Line ${tok.line} [${tok.type}] "${tok.value}"`);
});

const provider = new ClarionDocumentSymbolProvider();
const symbols = provider.provideDocumentSymbols(tokens, 'file:///test.clw');

console.log('\n=== SYMBOLS ===');
function printSymbols(syms, indent = '') {
    for (const sym of syms) {
        console.log(`${indent}- ${sym.name} (kind=${sym.kind})`);
        if (sym.children) printSymbols(sym.children, indent + '  ');
    }
}
printSymbols(symbols);

const findDo = (syms) => {
    for (const sym of syms) {
        if (sym.name.toLowerCase().includes('do')) return sym;
        if (sym.children) {
            const found = findDo(sym.children);
            if (found) return found;
        }
    }
    return null;
};

const doSym = findDo(symbols);
if (doSym) {
    console.log('\n⚠️ FOUND DO: ' + doSym.name);
} else {
    console.log('\n✅ No DO symbol found');
}
