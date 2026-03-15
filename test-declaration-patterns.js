/**
 * Test tokenizer handling of declaration patterns discovered in ANTLR work
 */

const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');

// Test cases based on ANTLR discoveries
const testCases = [
    {
        name: "1. Soft keywords as field names (FONT, FAMILY, SIZE, COLOR, PATTERN)",
        code: `StyleQueueType QUEUE,TYPE
  Font GROUP,Name('Font')
    FontName STRING(100)
    Family STRING(100)
    Size LONG
    Color STRING(7)
  END
  Interior GROUP
    Color STRING(7)
    Pattern STRING(100)
  END
END`,
        checks: [
            { desc: "Font as GROUP name", tokenValue: "Font", shouldNotBeType: "Structure" },
            { desc: "Family as field name", tokenValue: "Family", shouldNotBeType: "Property" },
            { desc: "Size as field name", tokenValue: "Size", shouldNotBeType: "Property" },
            { desc: "Color as field name", tokenValue: "Color", shouldNotBeType: "Property" },
            { desc: "Pattern as field name", tokenValue: "Pattern" }
        ]
    },
    {
        name: "2. Anonymous/unnamed fields (padding)",
        code: `MyGroup GROUP
  STRING('\\')
  ActualField LONG
END`,
        checks: [
            { desc: "Should tokenize unnamed STRING field", tokenValue: "STRING", shouldBeType: "Type" }
        ]
    },
    {
        name: "3. Reference variables with structure types",
        code: `QRef &QUEUE
GRef &GROUP
FRef &FILE
CustomRef &MyQueueType`,
        checks: [
            { desc: "&QUEUE reference", tokenValue: "&", shouldHaveNext: "QUEUE" },
            { desc: "&GROUP reference", tokenValue: "&", shouldHaveNext: "GROUP" },
            { desc: "&FILE reference", tokenValue: "&", shouldHaveNext: "FILE" }
        ]
    },
    {
        name: "4. Optional comma before attributes",
        code: `power1 LONG,AUTO
power2 LONG AUTO`,
        checks: [
            { desc: "With comma", tokenValue: "AUTO", afterValue: "power1" },
            { desc: "Without comma", tokenValue: "AUTO", afterValue: "power2" }
        ]
    },
    {
        name: "5. GROUP/QUEUE pre-initialization",
        code: `g GROUP(sourceGroup)
q QUEUE(sourceQueue)
MyQueue QUEUE,TYPE
instance QUEUE(MyQueue)`,
        checks: [
            { desc: "GROUP with source", tokenValue: "GROUP" },
            { desc: "QUEUE with source", tokenValue: "QUEUE" },
            { desc: "QUEUE TYPE definition", tokenValue: "TYPE" }
        ]
    },
    {
        name: "6. Nested structure references with DOT",
        code: `myVar.inner.field = 5
SELF.memberVar.subField = 10`,
        checks: [
            { desc: "Multi-level dot notation", tokenValue: "myVar" }
        ]
    },
    {
        name: "7. EQUATE declarations without values (ITEMIZE)",
        code: `ITEMIZE
  First EQUATE
  Second EQUATE
  Third EQUATE(100)
END`,
        checks: [
            { desc: "ITEMIZE structure", tokenValue: "ITEMIZE", shouldBeType: "Structure" },
            { desc: "EQUATE without value", tokenValue: "EQUATE", line: 1 },
            { desc: "EQUATE with value", tokenValue: "EQUATE", line: 3 }
        ]
    },
    {
        name: "8. One-line structure declarations with DOT",
        code: `EmptyGroup GROUP.
EmptyQueue QUEUE,TYPE.`,
        checks: [
            { desc: "GROUP with DOT terminator", tokenValue: "GROUP" },
            { desc: "QUEUE with DOT terminator", tokenValue: "QUEUE" },
            { desc: "DOT as terminator", tokenValue: "." }
        ]
    },
    {
        name: "9. CLASS instantiation patterns",
        code: `st StringTheory()
loc:class StringTheory()
myClass CLASS(BaseClass)`,
        checks: [
            { desc: "Direct instantiation", tokenValue: "StringTheory" },
            { desc: "CLASS with inheritance", tokenValue: "CLASS", shouldBeType: "Structure" }
        ]
    },
    {
        name: "10. Hybrid IF statement (inline + block)",
        code: `IF ~hDC THEN message('failed')
    WineventExtendedErr = ds_WinError()
    ds_ErrorSet(err)
END`,
        checks: [
            { desc: "IF keyword", tokenValue: "IF", shouldBeType: "Structure" },
            { desc: "THEN keyword", tokenValue: "THEN", shouldBeType: "Keyword" }
        ]
    }
];

// Run tests
console.log('🧪 Testing Declaration Patterns from ANTLR Analysis\n');
console.log('='.repeat(70) + '\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

testCases.forEach((testCase, idx) => {
    console.log(`\n${idx + 1}. ${testCase.name}`);
    console.log('-'.repeat(70));
    
    const tokenizer = new ClarionTokenizer(testCase.code);
    const tokens = tokenizer.tokenize();
    
    console.log(`   Code: ${testCase.code.split('\n')[0]}...`);
    console.log(`   Tokens generated: ${tokens.length}`);
    
    if (testCase.checks) {
        testCase.checks.forEach(check => {
            totalTests++;
            
            const matchingTokens = tokens.filter(t => 
                t.value === check.tokenValue || 
                t.value.toUpperCase() === check.tokenValue.toUpperCase()
            );
            
            if (matchingTokens.length === 0) {
                console.log(`   ❌ ${check.desc}: Token '${check.tokenValue}' not found`);
                failedTests++;
                return;
            }
            
            const token = matchingTokens[0];
            
            // Check type if specified
            if (check.shouldBeType) {
                if (token.type === check.shouldBeType) {
                    console.log(`   ✅ ${check.desc}: ${token.type}`);
                    passedTests++;
                } else {
                    console.log(`   ❌ ${check.desc}: Expected ${check.shouldBeType}, got ${token.type}`);
                    failedTests++;
                }
            } else if (check.shouldNotBeType) {
                if (token.type !== check.shouldNotBeType) {
                    console.log(`   ✅ ${check.desc}: ${token.type} (not ${check.shouldNotBeType})`);
                    passedTests++;
                } else {
                    console.log(`   ❌ ${check.desc}: Should NOT be ${check.shouldNotBeType}`);
                    failedTests++;
                }
            } else if (check.shouldHaveNext) {
                const tokenIdx = tokens.indexOf(token);
                const nextToken = tokens[tokenIdx + 1];
                if (nextToken && (nextToken.value === check.shouldHaveNext || 
                    nextToken.value.toUpperCase() === check.shouldHaveNext.toUpperCase())) {
                    console.log(`   ✅ ${check.desc}: Next token is ${nextToken.value}`);
                    passedTests++;
                } else {
                    console.log(`   ❌ ${check.desc}: Next token should be ${check.shouldHaveNext}, got ${nextToken?.value || 'none'}`);
                    failedTests++;
                }
            } else {
                // Just check it exists
                console.log(`   ✅ ${check.desc}: Found`);
                passedTests++;
            }
        });
    }
});

console.log('\n' + '='.repeat(70));
console.log(`\n📊 Results: ${passedTests}/${totalTests} passed, ${failedTests} failed`);
console.log(`   Pass rate: ${((passedTests/totalTests)*100).toFixed(1)}%\n`);

if (failedTests > 0) {
    process.exit(1);
}
