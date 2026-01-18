import { CharStream, CommonTokenStream } from 'antlr4ng';
import { ClarionLexer } from './generated/ClarionLexer';
import { ClarionParser } from './generated/ClarionParser';
import * as fs from 'fs';
import * as path from 'path';

// Debug parse tree for FoldingIssue.clw
const testFile = path.join(__dirname, '../../../test-programs/RealWorldTestSuite/FoldingIssue.clw');
const code = fs.readFileSync(testFile, 'utf8');

console.log('Parsing FoldingIssue.clw...\n');

const inputStream = CharStream.fromString(code);
const lexer = new ClarionLexer(inputStream);
const tokenStream = new CommonTokenStream(lexer);
const parser = new ClarionParser(tokenStream);

const tree = parser.compilationUnit();

// Walk the tree and show all contexts with their line numbers
function walkTree(ctx: any, indent = 0): void {
    if (!ctx) return;
    
    const name = ctx.constructor.name;
    const start = ctx.start?.line;
    const stop = ctx.stop?.line;
    
    if (start && stop && stop > start) {
        const spaces = '  '.repeat(indent);
        console.log(`${spaces}${name} (lines ${start}-${stop})`);
    }
    
    // Only show control contexts
    if (name.includes('Control') || name.includes('Declaration') || 
        name.includes('Statement') || name === 'MapSectionContext' ||
        name === 'CodeSectionContext') {
        const spaces = '  '.repeat(indent);
        console.log(`${spaces}${name} (lines ${start}-${stop})`);
        
        // Recurse to children
        if (ctx.children) {
            for (const child of ctx.children) {
                if (child.constructor.name !== 'TerminalNode') {
                    walkTree(child, indent + 1);
                }
            }
        }
    } else if (ctx.children) {
        // Skip but recurse
        for (const child of ctx.children) {
            walkTree(child, indent);
        }
    }
}

walkTree(tree);
