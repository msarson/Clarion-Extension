const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const { ClarionDocumentSymbolProvider } = require('./out/server/src/providers/ClarionDocumentSymbolProvider');
const { setServerInitialized } = require('./out/server/src/serverState');
const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs');

// Initialize server state
setServerInitialized(true);

const code = fs.readFileSync('test-class-group-property.clw', 'utf8');
const document = TextDocument.create('file:///test.clw', 'clarion', 1, code);

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('\n=== Token Hierarchy (GROUP and fields) ===');
tokens.forEach((t, i) => {
    if (t.value.toUpperCase() === 'CLASS' || t.value.toUpperCase() === 'GROUP' || 
        t.value === 'BoundBox' || t.value === 'MaxX' || t.value === 'MaxY') {
        const parentInfo = t.parent ? `parent="${t.parent.value}"` : 'no parent';
        const childrenInfo = t.children ? `children=${t.children.length}` : 'no children';
        console.log(`${i}: [${t.type}] "${t.value}" | ${parentInfo} | ${childrenInfo}`);
        if (t.children && t.children.length > 0) {
            t.children.forEach((child, ci) => {
                console.log(`  -> child ${ci}: "${child.value}" (line ${child.line})`);
            });
        }
    }
});

console.log('\n=== Document Symbols ===');
const provider = new ClarionDocumentSymbolProvider();
const symbols = provider.provideDocumentSymbols(tokens, document.uri);

console.log(`Found ${symbols.length} top-level symbols`);

function printSymbols(syms, indent = 0) {
    for (const sym of syms) {
        console.log(`${'  '.repeat(indent)}${sym.name} (kind=${sym.kind}) - line ${sym.range.start.line}`);
        if (sym.children && sym.children.length > 0) {
            printSymbols(sym.children, indent + 1);
        }
    }
}

printSymbols(symbols);

