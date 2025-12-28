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

// Find MAP structure
const mapStructure = tokens.find(t => t.type === TokenType.Structure && t.value.toUpperCase() === 'MAP');
console.log('\n=== MAP Structure ===');
if (mapStructure) {
    console.log(`Found MAP at line ${mapStructure.line}`);
    console.log(`Children count: ${mapStructure.children?.length || 0}`);
    if (mapStructure.children) {
        mapStructure.children.forEach((child, i) => {
            console.log(`  Child[${i}]: line=${child.line}, type=${TokenType[child.type]}, subType=${child.subType ? TokenType[child.subType] : 'none'}, value="${child.value}"`);
        });
    }
} else {
    console.log('MAP structure not found!');
}

console.log('\n=== Tokens in MAP block (lines 0-2) ===');
tokens.filter(t => t.line >= 0 && t.line <= 2).forEach((t, i) => {
    console.log(`Line ${t.line}: type=${TokenType[t.type]}, subType=${t.subType ? TokenType[t.subType] : 'none'}, value="${t.value}", parent="${t.parent?.value || 'none'}"`);
});

console.log('\n=== MapProcedure Tokens ===');
const mapProcs = tokens.filter(t => t.subType === TokenType.MapProcedure);
console.log(`Found ${mapProcs.length} MapProcedure tokens`);
mapProcs.forEach(t => {
    console.log(`Line ${t.line}: "${t.value}", label="${t.label}", parent="${t.parent?.value || 'none'}"`);
});

console.log('\n=== GlobalProcedure Tokens ===');
const globalProcs = tokens.filter(t => t.subType === TokenType.GlobalProcedure);
console.log(`Found ${globalProcs.length} GlobalProcedure tokens`);
globalProcs.forEach(t => {
    console.log(`Line ${t.line}: "${t.value}", label="${t.label}", parent="${t.parent?.value || 'none'}"`);
});
