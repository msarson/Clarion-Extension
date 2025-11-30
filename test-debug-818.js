const { ClarionTokenizer, TokenType } = require('./out/server/src/ClarionTokenizer');
const { DiagnosticProvider } = require('./out/server/src/providers/DiagnosticProvider');
const { TextDocument } = require('vscode-languageserver-textdocument');
const fs = require('fs');

// Get lines 815-845
const fullCode = fs.readFileSync('test-programs/syntax-tests/StringTheory.clw', 'utf8');
const lines = fullCode.split('\n');
const testCode = lines.slice(814, 845).join('\n');

console.log('=== Analyzing lines 815-845 ===\n');

// Tokenize
const tokenizer = new ClarionTokenizer(testCode);
const tokens = tokenizer.tokenize();

// Show structure-related tokens
console.log('Structure tokens:');
let ifCount = 0;
let endCount = 0;

tokens.forEach((t, i) => {
  const val = t.value.toUpperCase();
  if (['IF', 'LOOP', 'ELSE', 'ELSIF'].includes(val)) {
    if (val === 'IF' || val === 'LOOP') ifCount++;
    console.log(`  ${i}: Line ${t.line + 815}, Col ${t.start}, Type=${t.type}, Value="${t.value}"`);
  } else if (t.type === 26) { // EndStatement
    endCount++;
    console.log(`  ${i}: Line ${t.line + 815}, Col ${t.start}, Type=${t.type}, Value="${t.value}" <-- END/DOT`);
  }
});

console.log(`\nTotal IF/LOOP opens: ${ifCount}`);
console.log(`Total END/DOT closes: ${endCount}`);

// Now run diagnostics with detailed logging
const doc = TextDocument.create('file:///test.clw', 'clarion', 1, testCode);

// Manually walk through the validation logic
const diagnostics = [];
const structureStack = [];

tokens.forEach((token, i) => {
  const prevToken = i > 0 ? tokens[i - 1] : null;
  const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;
  
  // Check if structure open
  if (token.type === 16) { // Structure
    const structType = token.value.toUpperCase();
    if (['IF', 'LOOP', 'CASE'].includes(structType)) {
      structureStack.push({ type: structType, line: token.line + 815, token });
      console.log(`  Token ${i}: PUSH ${structType} at line ${token.line + 815}, stack depth=${structureStack.length}`);
    }
  }
  
  // Check if structure close
  if (token.type === 26) { // EndStatement
    if (structureStack.length > 0) {
      const popped = structureStack.pop();
      console.log(`  Token ${i}: POP ${popped.type} from line ${popped.line} (END at line ${token.line + 815}), stack depth=${structureStack.length}`);
    } else {
      console.log(`  Token ${i}: POP FAILED at line ${token.line + 815} - No structure to close`);
    }
  }
});

console.log('\nTokens 110-130:');
for (let i = 110; i <= 130 && i < tokens.length; i++) {
  const t = tokens[i];
  const typeName = TokenType[t.type];
  console.log(`  ${i}: Line ${t.line + 815}, Col ${t.start}, Type=${typeName}, Value="${t.value.substring(0, 30)}${t.value.length > 30 ? '...' : ''}"`);
}

console.log(`\nFinal stack (should be empty): ${structureStack.length} items`);
if (structureStack.length > 0) {
  structureStack.forEach(s => {
    console.log(`  Unterminated ${s.type} at line ${s.line}`);
  });
} else {
  console.log('  ✅ All structures properly terminated!');
}
