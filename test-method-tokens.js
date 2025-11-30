const { ClarionTokenizer, TokenType } = require('./out/server/src/ClarionTokenizer');

const code = `
  PROGRAM
MyClass CLASS
Count     LONG
Name      STRING(50)
Init      PROCEDURE()
Process   PROCEDURE(LONG pValue)
  END
  CODE
  RETURN
`;
const tokenizer = new ClarionTokenizer(code);
const tokens = tokenizer.tokenize();

console.log('Tokens:');
tokens.forEach((t, i) => {
    const typeName = Object.keys(TokenType).find(key => TokenType[key] === t.type);
    console.log(`  [${i}] Line ${t.line.toString().padStart(2)} ${typeName.padEnd(20)} value='${t.value}' ${t.label ? `label='${t.label}'` : ''}`);
});
