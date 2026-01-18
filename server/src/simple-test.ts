import * as fs from 'fs';
import { CharStream, CommonTokenStream } from 'antlr4ng';
import { ClarionLexer } from './generated/ClarionLexer';
import { ClarionParser } from './generated/ClarionParser';

// Simple parse test
const filePath = process.argv[2];
if (!filePath) {
    console.error('Usage: node simple-test.js <file-path>');
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const inputStream = CharStream.fromString(content);
const lexer = new ClarionLexer(inputStream);
const tokenStream = new CommonTokenStream(lexer);
const parser = new ClarionParser(tokenStream);

// Parse
const tree = parser.compilationUnit();

console.log(`\nParsing complete:  
 Tree: ${tree ? '✅' : '❌'}`);
