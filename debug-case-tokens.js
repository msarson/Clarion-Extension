const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const fs = require('fs');

const input = fs.readFileSync('test-programs/RealWorldTestSuite/FoldingIssue.clw', 'utf-8');
const lexer = new ClarionLexer(CharStream.fromString(input));
const tokens = new CommonTokenStream(lexer);
tokens.fill();

const toks = tokens.getTokens();
const line11 = toks.filter(t => t.line === 11);
const line12 = toks.filter(t => t.line === 12);

console.log('Line 11 tokens:');
line11.forEach(t => console.log(`  col=${t.column} type=${t.type} text='${t.text.replace(/\n/g,'\\n')}'`));

console.log('\nLine 12 tokens:');
line12.forEach(t => console.log(`  col=${t.column} type=${t.type} text='${t.text.replace(/\n/g,'\\n')}'`));
