const {ClarionTokenizer} = require('./out/server/src/ClarionTokenizer.js');
const fs = require('fs');

// Test with PROPERLY INDENTED code (valid Clarion syntax)
const code1 = `MyClass CLASS
  MODULE('KERNEL32')
    GetTickCount PROCEDURE(),ULONG
  END
END`;
console.log('=== MODULE inside CLASS (properly indented) ===');
const t1 = new ClarionTokenizer(code1);
const tokens1 = t1.tokenize();
const moduleTokens1 = tokens1.filter(t => t.value.toUpperCase() === 'MODULE');
console.log('MODULE token type:', moduleTokens1[0]?.type, '(16=Structure, 25=Label)');
console.log('MODULE at column:', moduleTokens1[0]?.start);
console.log('Has finishesAt?', moduleTokens1[0]?.finishesAt);
console.log('Has parent?', moduleTokens1[0]?.parent?.value);

const code2 = `  MAP
    MODULE('KERNEL32')
      GetTickCount PROCEDURE(),ULONG
    END
  END`;
console.log('\n=== MODULE inside MAP (properly indented) ===');
const t2 = new ClarionTokenizer(code2);
const tokens2 = t2.tokenize();
const moduleTokens2 = tokens2.filter(t => t.value.toUpperCase() === 'MODULE');
console.log('MODULE token type:', moduleTokens2[0]?.type, '(16=Structure, 25=Label)');
console.log('MODULE at column:', moduleTokens2[0]?.start);
console.log('Has finishesAt?', moduleTokens2[0]?.finishesAt);
console.log('Has parent?', moduleTokens2[0]?.parent?.value);

const code3 = `MyClass CLASS,MODULE
  Init PROCEDURE()
  .
END`;
console.log('\n=== MODULE as CLASS attribute ===');
const t3 = new ClarionTokenizer(code3);
const tokens3 = t3.tokenize();
const moduleTokens3 = tokens3.filter(t => t.value.toUpperCase() === 'MODULE');
console.log('MODULE token type:', moduleTokens3[0]?.type, '(16=Structure, 25=Label)');
console.log('MODULE at column:', moduleTokens3[0]?.start);
console.log('Has finishesAt?', moduleTokens3[0]?.finishesAt);
console.log('Has parent?', moduleTokens3[0]?.parent?.value);
