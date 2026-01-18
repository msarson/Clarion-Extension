// Quick script to count folding regions
import { CharStream, CommonTokenStream } from 'antlr4ng';
import { ClarionLexer } from '../../generated/ClarionLexer.js';
import { ClarionParser } from '../../generated/ClarionParser.js';
import * as fs from 'fs';

function countFoldingRegions(filename: string) {
    const input = fs.readFileSync(filename, 'utf-8');
    const inputStream = CharStream.fromString(input);
    const lexer = new ClarionLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new ClarionParser(tokenStream);
    
    const tree = parser.compilationUnit();
    
    // Count all rule contexts that span multiple lines
    let count = 0;
    function countNodes(node: any): void {
        if (node.start && node.stop && node.stop.line > node.start.line) {
            count++;
        }
        if (node.children) {
            for (const child of node.children) {
                countNodes(child);
            }
        }
    }
    
    countNodes(tree);
    
    console.log(`File: ${filename}`);
    console.log(`Lines: ${input.split('\n').length}`);
    console.log(`Potential folding regions: ${count}`);
}

const args = process.argv.slice(2);
const filename = args[0];
countFoldingRegions(filename);
