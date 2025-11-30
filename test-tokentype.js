const { ClarionTokenizer, TokenType } = require('./out/server/src/ClarionTokenizer');

const code = `  if size(self.value) < 10
    return
  end`;

console.log('Code:');
console.log(code);
console.log('\nTokenizing...\n');

const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('Tokens:');
tokens.forEach((t, i) => {
    const typeName = TokenType[t.type];
    console.log(`  ${i}: Line=${t.line}, Col=${t.start}, Type=${t.type} (${typeName}), Value="${t.value}"`);
});

console.log('\nStructure-related tokens:');
tokens.forEach((t, i) => {
    const typeName = TokenType[t.type];
    const val = t.value.toUpperCase();
    if (['IF', 'LOOP', 'END', 'ELSE', 'ELSIF'].includes(val) || t.type === TokenType.EndStatement || t.type === TokenType.Structure) {
        console.log(`  ${i}: Line=${t.line}, Col=${t.start}, Type=${t.type} (${typeName}), Value="${t.value}"`);
    }
});
