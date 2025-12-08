const {ClarionTokenizer} = require('./out/server/src/ClarionTokenizer.js');

// Test MAP with indented procedure declarations (no PROCEDURE keyword)
const code = `MAP
  MyProc(LONG x)
  OtherFunc(STRING s),STRING
END`;

console.log('=== MAP with indented procedure declarations ===');
console.log('Code:\n' + code);
console.log('\nAll tokens:');
const t = new ClarionTokenizer(code);
const tokens = t.tokenize();
tokens.forEach(t => {
    if (t.type === 25 || t.type === 16 || t.value === 'MyProc' || t.value === 'OtherFunc') {
        console.log(`  type=${t.type}, value="${t.value}", start=${t.start}, line=${t.line}, column=${t.start}`);
    }
});

console.log('\nLabel tokens (type=25):');
tokens.filter(t => t.type === 25).forEach(t => {
    console.log(`  "${t.value}" at column ${t.start}, line ${t.line}`);
});

console.log('\nStructure tokens (type=16):');
tokens.filter(t => t.type === 16).forEach(t => {
    console.log(`  "${t.value}" at column ${t.start}, line ${t.line}`);
});
