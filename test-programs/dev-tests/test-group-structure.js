const { ClarionDocumentSymbolProvider } = require('./out/server/src/providers/ClarionDocumentSymbolProvider');
const { TextDocument } = require('vscode-languageserver-textdocument');

const code = `
MyMethod PROCEDURE()
in5      GROUP,PRE(),AUTO
i1          BYTE
i2          BYTE
i3          BYTE
i4          BYTE
i5          BYTE
         END
CODE
  RETURN
`;

console.log('Testing GROUP structure nesting...\n');
const doc = TextDocument.create('file:///test.clw', 'clarion', 1, code);
const provider = new ClarionDocumentSymbolProvider();
const symbols = provider.provideDocumentSymbols(doc);

function printTree(symbols, indent = 0) {
    for (const sym of symbols) {
        const prefix = '  '.repeat(indent);
        console.log(`${prefix}${sym.name} (kind=${sym.kind}, line=${sym.range.start.line + 1})`);
        if (sym.children && sym.children.length > 0) {
            printTree(sym.children, indent + 1);
        }
    }
}

printTree(symbols);
