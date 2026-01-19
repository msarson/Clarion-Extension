const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const { ClarionParser } = require('./out/server/src/generated/ClarionParser');
const fs = require('fs');

// Read the test file
const inputFile = process.argv[2] || './test-programs/RealWorldTestSuite/FoldingIssue.clw';
const input = fs.readFileSync(inputFile, 'utf8');

console.log('=== SOURCE CODE ===');
console.log(input);
console.log('\n=== TOKENS ===');

// Create lexer
const chars = CharStream.fromString(input);
const lexer = new ClarionLexer(chars);

// Get all tokens
const tokens = lexer.getAllTokens();

// Print tokens with line/col info
tokens.forEach((token, idx) => {
    const typeName = lexer.symbolicNames[token.type] || `TYPE_${token.type}`;
    const text = token.text.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    console.log(`${idx.toString().padStart(3)}: Line ${token.line}:${token.column.toString().padStart(2)} Type=${token.type.toString().padStart(3)} ${typeName.padEnd(25)} Text="${text}"`);
});

console.log('\n=== PARSE TREE ===');

// Reset lexer for parsing
lexer.reset();
const tokenStream = new CommonTokenStream(lexer);
const parser = new ClarionParser(tokenStream);

// Parse (no error listener customization for now)
const tree = parser.compilationUnit();

// Print tree
console.log(tree.toStringTree(parser.ruleNames));

console.log('\n=== PROCEDURE CONTEXTS ===');

function walkTree(node, depth = 0) {
    if (!node) return;
    
    const indent = '  '.repeat(depth);
    const constructor = node.constructor.name;
    
    if (node.start && node.stop) {
        const start = `${node.start.line}:${node.start.column}`;
        const stop = `${node.stop.line}:${node.stop.column} (${node.stop.text})`;
        
        if (['ProcedureDeclarationContext', 'CodeSectionContext', 'IfStatementContext', 'LoopStatementContext', 'CaseStatementContext', 'ExecuteStatementContext', 'ModuleReferenceContext', 'MapSectionContext'].includes(constructor)) {
            console.log(`${indent}${constructor}: start=${start}, stop=${stop}`);
        }
    }
    
    if (node.children) {
        node.children.forEach(child => walkTree(child, depth + 1));
    }
}

walkTree(tree);
