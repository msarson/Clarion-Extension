const {ClarionTokenizer} = require('./out/server/src/ClarionTokenizer.js');

// Test 1: MODULE at start of line (indented)
const code1 = `  MODULE('KERNEL32')`;
console.log('=== Test 1: Indented MODULE ===');
console.log('Code:', JSON.stringify(code1));
console.log('Code starts with spaces:', code1.startsWith('  '));
const t1 = new ClarionTokenizer(code1);
const tokens1 = t1.tokenize();
console.log('All tokens:');
tokens1.forEach(t => console.log(`  type=${t.type}, value="${t.value}", start=${t.start}, line=${t.line}`));

// Test 2: MODULE with label
const code2 = `MyModule MODULE('KERNEL32')`;
console.log('\n=== Test 2: MODULE with label ===');
console.log('Code:', JSON.stringify(code2));
const t2 = new ClarionTokenizer(code2);
const tokens2 = t2.tokenize();
console.log('All tokens:');
tokens2.forEach(t => console.log(`  type=${t.type}, value="${t.value}", start=${t.start}, line=${t.line}`));

// Test 3: MODULE at true start
const code3 = `MODULE('KERNEL32')`;
console.log('\n=== Test 3: MODULE at start (no indent) ===');
console.log('Code:', JSON.stringify(code3));
const t3 = new ClarionTokenizer(code3);
const tokens3 = t3.tokenize();
console.log('All tokens:');
tokens3.forEach(t => console.log(`  type=${t.type}, value="${t.value}", start=${t.start}, line=${t.line}`));
