const fs = require('fs');
const path = require('path');

// Read the test file
const testFile = path.join(__dirname, 'test-unlabeled-group.clw');
const content = fs.readFileSync(testFile, 'utf-8');

// Load the tokenizer
const tokenizerPath = path.join(__dirname, 'out', 'server', 'src', 'ClarionTokenizer.js');
const { ClarionTokenizer } = require(tokenizerPath);

const tokenizer = new ClarionTokenizer();
tokenizer.text = content;
const tokens = tokenizer.tokenize();

console.log('\n=== Tokens for unlabeled group test ===\n');

// Find tokens around the GROUP declaration
let inGroup = false;
tokens.forEach((token, index) => {
    if (token.line >= 3 && token.line <= 10) {
        const typeStr = typeof token.type === 'number' ? `TokenType.${token.type}` : String(token.type);
        const prefix = token.line === 4 ? '>>> ' : '    ';
        console.log(`${prefix}Line ${token.line + 1}: ${typeStr.padEnd(20)} "${token.value}" finishesAt=${token.finishesAt || 'undefined'}`);
        
        if (token.value?.toLowerCase() === 'group') {
            inGroup = true;
            console.log(`    ^^^ GROUP starts at line ${token.line + 1}, finishesAt=${token.finishesAt}`);
        }
        if (token.value?.toLowerCase() === 'end' && inGroup) {
            console.log(`    ^^^ END found at line ${token.line + 1}, finishesAt=${token.finishesAt}`);
            inGroup = false;
        }
    }
});

console.log('\n=== Looking for GROUP token ===\n');
const groupToken = tokens.find(t => t.value?.toLowerCase() === 'group' && t.line === 4);
if (groupToken) {
    console.log('GROUP token:', JSON.stringify(groupToken, null, 2));
} else {
    console.log('❌ No GROUP token found at line 5 (index 4)');
}

console.log('\n=== Looking for END token ===\n');
const endToken = tokens.find(t => t.value?.toLowerCase() === 'end' && t.line === 8);
if (endToken) {
    console.log('END token:', JSON.stringify(endToken, null, 2));
} else {
    console.log('❌ No END token found at line 9 (index 8)');
}
