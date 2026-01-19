const fs = require('fs');
const { CharStream } = require('antlr4ng');
const { ClarionLexer } = require('./server/src/generated/ClarionLexer');

// The exact line from the user
const line = "  If pSize > 500 Then pSize = 10.                       ! default to 10MB";

console.log('Line:', JSON.stringify(line));
console.log('\nTokenizing...\n');

// Tokenize the line
const inputStream = CharStream.fromString(line);
const lexer = new ClarionLexer(inputStream);
const tokens = lexer.getAllTokens();

// Display tokens
tokens.forEach((token, i) => {
    const typeName = lexer.vocabulary.getSymbolicName(token.type) || `<${token.type}>`;
    console.log(`${i.toString().padStart(2)}. Token[${token.type.toString().padStart(3)}] ${typeName.padEnd(20)} "${token.text}" at col ${token.column}`);
});
