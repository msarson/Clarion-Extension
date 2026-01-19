const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./server/src/generated/ClarionLexer');
const fs = require('fs');

const input = CharStream.fromString(fs.readFileSync('test-programs/RealWorldTestSuite/Antlr_folding_Tests.clw', 'utf8'));
const lexer = new ClarionLexer(input);
const tokens = new CommonTokenStream(lexer);
tokens.fill();

const allTokens = tokens.getTokens();
const line11Start = allTokens.findIndex(t => t.line === 11 && t.text === 'If');

console.log('Tokens around line 11 IF statement:\n');
const subset = allTokens.slice(line11Start, line11Start + 30);
subset.forEach((t, i) => {
    const typeName = lexer.vocabulary.getSymbolicName(t.type) || 'UNKNOWN';
    console.log(`${(line11Start+i).toString().padStart(3)}. Line ${t.line.toString().padStart(2)} col ${t.column.toString().padStart(2)} [${t.type.toString().padStart(3)}] ${typeName.padEnd(20)} "${t.text.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
});
