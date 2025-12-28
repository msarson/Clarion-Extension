import { ClarionTokenizer, TokenType } from './ClarionTokenizer';

const code = `  MAP
    ProcessOrder(LONG orderId)
  END

ProcessOrder PROCEDURE(LONG orderId)
  CODE
  RETURN
  END`;

console.log('Testing with code:');
console.log(code);
console.log('');

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

// Test from inside MAP block - should find implementation
const { MapProcedureResolver } = require('./utils/MapProcedureResolver');
const { TextDocument } = require('vscode-languageserver-textdocument');

const document = TextDocument.create('test://test.clw', 'clarion', 1, code);
const resolver = new MapProcedureResolver();

// Position on line 1 (ProcessOrder declaration in MAP)
const position = { line: 1, character: 10 };
console.log(`\nTesting findProcedureImplementation from position ${position.line}:${position.character}`);
const result = resolver.findProcedureImplementation('ProcessOrder', tokens, document, position);

if (result) {
    console.log(`✅ Found implementation at line ${result.range.start.line}`);
} else {
    console.log('❌ No implementation found');
}

// Debug: Show what tokens exist
console.log('\n=== MAP Structures ===');
const mapStructures = tokens.filter(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'MAP');
mapStructures.forEach(m => {
    console.log(`MAP at line ${m.line}, finishesAt: ${m.finishesAt}`);
});

console.log('\n=== Function tokens on line 1 ===');
const funcTokens = tokens.filter(t => t.line === 1 && t.type === TokenType.Function);
funcTokens.forEach(t => {
    console.log(`Function: "${t.value}", parent: ${t.parent?.value || 'none'}`);
});
