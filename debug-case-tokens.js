const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const fs = require('fs');

const input = fs.readFileSync('test-programs/RealWorldTestSuite/FoldingIssue.clw', 'utf-8');
const lexer = new ClarionLexer(CharStream.fromString(input));
const tokens = new CommonTokenStream(lexer);
tokens.fill();

const toks = tokens.getTokens();
const line16 = toks.filter(t => t.line === 16);

console.log('Line 16 tokens:');
line16.forEach(t => console.log(`  col=${t.column} type=${t.type} text='${t.text}'`));

const line17 = toks.filter(t => t.line === 17);
console.log('\nLine 17 tokens:');
line17.forEach(t => console.log(`  col=${t.column} type=${t.type} text='${t.text}'`));
