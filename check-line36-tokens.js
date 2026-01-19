const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const fs = require('fs');

const input = fs.readFileSync('test-programs/RealWorldTestSuite/FoldingIssue.clw', 'utf-8');
const chars = CharStream.fromString(input);
const lexer = new ClarionLexer(chars);
const tokens = new CommonTokenStream(lexer);
tokens.fill();

const allTokens = tokens.getTokens();
const line36Tokens = allTokens.filter(t => t.line === 36);
const line37Tokens = allTokens.filter(t => t.line === 37);

console.log('Line 36 tokens:');
line36Tokens.forEach((t, i) => {
  const typeName = lexer.symbolicNames[t.type] || 'UNKNOWN';
  const text = t.text.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  console.log(`  ${i}: col ${t.column} ${typeName.padEnd(20)} "${text}"`);
});

console.log('\nLine 37 tokens:');
line37Tokens.forEach((t, i) => {
  const typeName = lexer.symbolicNames[t.type] || 'UNKNOWN';
  const text = t.text.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  console.log(`  ${i}: col ${t.column} ${typeName.padEnd(20)} "${text}"`);
});
