import { ClarionTokenizer, TokenType } from './ClarionTokenizer';

const source = `
  MEMBER

StringTheory._GetNextBufferSize PROCEDURE(long pLen)
LocalVar  LONG
CODE
  LocalVar = pLen * 2
  RETURN LocalVar
`;

const tokenizer = new ClarionTokenizer(source);
const tokens = tokenizer.tokenize();

console.log('\n=== ALL TOKENS ===');
for (const token of tokens) {
    console.log(`Line ${token.line}: type=${TokenType[token.type]}(${token.type}), subType=${token.subType ? TokenType[token.subType] + '(' + token.subType + ')' : 'none'}, value="${token.value}", label="${token.label || 'none'}"`);
}

console.log('\n=== PROCEDURE TOKENS ===');
const procTokens = tokens.filter(t => t.type === TokenType.Procedure || t.value.toUpperCase() === 'PROCEDURE');
for (const token of procTokens) {
    console.log(`Line ${token.line}: type=${TokenType[token.type]}(${token.type}), subType=${token.subType ? TokenType[token.subType] + '(' + token.subType + ')' : 'none'}, value="${token.value}", label="${token.label || 'none'}"`);
}

console.log('\n=== METHOD IMPLEMENTATION TOKENS ===');
const methodTokens = tokens.filter(t => t.subType === TokenType.MethodImplementation);
console.log(`Found ${methodTokens.length} method implementation tokens`);
for (const token of methodTokens) {
    console.log(`Line ${token.line}: type=${TokenType[token.type]}(${token.type}), value="${token.value}", label="${token.label || 'none'}"`);
}
