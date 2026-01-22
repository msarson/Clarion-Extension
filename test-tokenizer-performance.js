const fs = require('fs');
const path = require('path');

// Load the compiled tokenizer from the out directory
const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');

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
    
    // Tokenize with current extension tokenizer
    const tokenizer = new ClarionTokenizer(content, 2);
    const tokens = tokenizer.tokenize();
    
    const end = performance.now();
    times.push(end - start);
    
    if (i === 0) {
        console.log(`  Tokens produced: ${tokens.length}`);
    }
}

console.log('\nPerformance Results (Current Extension Tokenizer):');
console.log('='.repeat(50));
console.log(`Iterations: ${iterations}`);
console.log(`Min: ${Math.min(...times).toFixed(2)} ms`);
console.log(`Max: ${Math.max(...times).toFixed(2)} ms`);
console.log(`Average: ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)} ms`);
console.log(`Median: ${times.sort((a, b) => a - b)[Math.floor(times.length / 2)].toFixed(2)} ms`);
