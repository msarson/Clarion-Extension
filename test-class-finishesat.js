const {ClarionTokenizer} = require('./out/server/src/ClarionTokenizer.js');
const {DocumentStructure} = require('./out/server/src/DocumentStructure.js');

const code = `MyClass CLASS
            MODULE('KERNEL32')
                GetTickCount PROCEDURE(),ULONG
        END`;

console.log('=== Debugging CLASS finishesAt ===\n');
console.log('Code:');
console.log(code);
console.log('\n');

// Tokenize
const t = new ClarionTokenizer(code);
const tokens = t.tokenize();

console.log('\nTokens:');
tokens.forEach((tok, i) => {
    console.log(`${i}: line=${tok.line}, type=${tok.type}, value="${tok.value}"`);
});

// Check CLASS and END tokens
const classToken = tokens.find(t => t.value.toUpperCase() === 'CLASS');
const endToken = tokens.find(t => t.value.toUpperCase() === 'END');
const moduleToken = tokens.find(t => t.value.toUpperCase() === 'MODULE');

console.log('\n=== After Tokenization ===');
console.log('CLASS:', classToken ? {line: classToken.line, finishesAt: classToken.finishesAt, parent: classToken.parent?.value} : 'NOT FOUND');
console.log('MODULE:', moduleToken ? {line: moduleToken.line, finishesAt: moduleToken.finishesAt, parent: moduleToken.parent?.value} : 'NOT FOUND');
console.log('END:', endToken ? {line: endToken.line, type: endToken.type} : 'NOT FOUND');
