const {ClarionTokenizer} = require('./out/server/src/ClarionTokenizer.js');

const code = `TestProc PROCEDURE()
        MAP
            MODULE('KERNEL32')
                GetTickCount PROCEDURE(),ULONG
            ! Missing END for MODULE (and MAP)`;

console.log('=== Test: Unterminated MODULE inside MAP ===');
const t = new ClarionTokenizer(code);
const tokens = t.tokenize();

const moduleTokens = tokens.filter(t => t.value.toUpperCase() === 'MODULE');
console.log('\nMODULE tokens found:', moduleTokens.length);
moduleTokens.forEach(m => {
    console.log(`  Type: ${m.type} (16=Structure, 25=Label)`);
    console.log(`  Column: ${m.start}`);
    console.log(`  Parent: ${m.parent?.value}`);
    console.log(`  finishesAt: ${m.finishesAt}`);
});

const mapTokens = tokens.filter(t => t.value.toUpperCase() === 'MAP');
console.log('\nMAP tokens found:', mapTokens.length);
mapTokens.forEach(m => {
    console.log(`  Type: ${m.type}`);
    console.log(`  Column: ${m.start}`);
    console.log(`  finishesAt: ${m.finishesAt}`);
});
