const fs = require('fs');
const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const { ClarionParser } = require('./out/server/src/generated/ClarionParser');

const filePath = 'C:\\Clarion\\Clarion11.1\\accessory\\libsrc\\win\\stringtheory.clw';

console.log('Loading file...');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n').length;
const size = (content.length / 1024).toFixed(2);

console.log(`File: ${filePath}`);
console.log(`Lines: ${lines}`);
console.log(`Size: ${size} KB`);
console.log('');

// Run multiple times to get average
const iterations = 3;
const times = [];

for (let i = 0; i < iterations; i++) {
    console.log(`Iteration ${i + 1}...`);
    const start = performance.now();

    // Lex
    const chars = CharStream.fromString(content);
    const lexer = new ClarionLexer(chars);
    const tokens = new CommonTokenStream(lexer);

    // Parse
    const parser = new ClarionParser(tokens);
    parser.removeErrorListeners(); // Don't print errors
    parser.buildParseTrees = true;
    const tree = parser.compilationUnit();

    const end = performance.now();
    times.push(end - start);
}

console.log('Performance Results (Lexer + Parser only):');
console.log('='.repeat(50));
console.log(`Iterations: ${iterations}`);
console.log(`Min: ${Math.min(...times).toFixed(2)} ms`);
console.log(`Max: ${Math.max(...times).toFixed(2)} ms`);
console.log(`Average: ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)} ms`);
console.log(`Median: ${times.sort((a, b) => a - b)[Math.floor(times.length / 2)].toFixed(2)} ms`);
