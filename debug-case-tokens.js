const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const fs = require('fs');

const input = fs.readFileSync('test-programs/RealWorldTestSuite/FoldingIssue.clw', 'utf-8');
const lexer = new ClarionLexer(CharStream.fromString(input));
const tokens = new CommonTokenStream(lexer);
tokens.fill();

const toks = tokens.getTokens();
const line5 = toks.filter(t => t.line === 5);
const line6 = toks.filter(t => t.line === 6);

console.log('Line 5 tokens:');
line5.forEach(t => console.log(`  col=${t.column} type=${t.type} text='${t.text.replace(/\n/g,'\\n')}'`));

console.log('\nLine 6 tokens:');
line6.forEach(t => console.log(`  col=${t.column} type=${t.type} text='${t.text.replace(/\n/g,'\\n')}'`));
