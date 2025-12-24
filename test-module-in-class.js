const {ClarionTokenizer} = require('./out/server/src/ClarionTokenizer.js');

const code = `MyClass CLASS
            MODULE('KERNEL32')
                GetTickCount PROCEDURE(),ULONG
        END`;

console.log('=== MODULE without END inside CLASS ===');
const t = new ClarionTokenizer(code);
const tokens = t.tokenize();

console.log('\nAll tokens:');
tokens.forEach((token, i) => {
    console.log(`${i}: line=${token.line}, col=${token.start}, type=${token.type}, value="${token.value}", finishesAt=${token.finishesAt}, parent=${token.parent?.value}`);
});
