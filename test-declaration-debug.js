/**
 * Debug specific failing patterns
 */

const { ClarionTokenizer, TokenType } = require('./out/server/src/ClarionTokenizer');

// Map token type numbers to names
const tokenTypeNames = {};
for (const key in TokenType) {
    if (typeof TokenType[key] === 'number') {
        tokenTypeNames[TokenType[key]] = key;
    }
}

function debugTokens(name, code) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`${name}`);
    console.log('-'.repeat(70));
    console.log(`Code:\n${code}`);
    console.log('-'.repeat(70));
    
    const tokenizer = new ClarionTokenizer(code);
    const tokens = tokenizer.tokenize();
    
    console.log(`Tokens (${tokens.length}):`);
    tokens.forEach((token, idx) => {
        const typeName = tokenTypeNames[token.type] || `Unknown(${token.type})`;
        console.log(`  [${idx}] Line ${token.line}: "${token.value}" → ${typeName}`);
    });
}

// Debug failing cases
debugTokens("Test 2: Anonymous STRING field", 
`MyGroup GROUP
  STRING('\\\\')
  ActualField LONG
END`);

debugTokens("Test 3: Reference variables with &QUEUE, &GROUP, &FILE",
`QRef &QUEUE
GRef &GROUP
FRef &FILE`);

debugTokens("Test 6: Nested dot notation",
`myVar.inner.field = 5`);

debugTokens("Test 7: ITEMIZE structure",
`ITEMIZE
  First EQUATE
  Second EQUATE
END`);

debugTokens("Test 10: IF/THEN in statement context",
`IF ~hDC THEN message('failed')
  x = 1
END`);
