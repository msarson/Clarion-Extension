const { ClarionTokenizer, TokenType } = require('./out/server/src/ClarionTokenizer');

const code = 'Flush  PROCEDURE (StringTheory pStr),long, proc, virtual';
const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('Tokens for:', code);
console.log('');
tokens.forEach((t, i) => {
    const typeName = Object.keys(TokenType).find(key => TokenType[key] === t.type);
    console.log(`  [${i}] ${typeName.padEnd(20)} value='${t.value}' ${t.label ? `label='${t.label}'` : ''}`);
});
