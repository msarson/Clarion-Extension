import { CharStream, CommonTokenStream } from 'antlr4ng';
import { ClarionLexer } from './generated/ClarionLexer';
import { ClarionParser } from './generated/ClarionParser';
import * as fs from 'fs';
import * as path from 'path';

const testFile = path.join(__dirname, '../../../test-programs/RealWorldTestSuite/Antlr_folding_Tests.clw');
const code = fs.readFileSync(testFile, 'utf8');

console.log('Parsing Antlr_folding_Tests.clw...\n');

const inputStream = CharStream.fromString(code);
const lexer = new ClarionLexer(inputStream);
const tokenStream = new CommonTokenStream(lexer);
const parser = new ClarionParser(tokenStream);

const tree = parser.compilationUnit();

console.log('Parse complete.');
console.log(`Tree exists: ${tree ? 'YES' : 'NO'}`);
