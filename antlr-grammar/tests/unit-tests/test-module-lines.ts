// Test to check MODULE start/stop line numbers
import { CharStream, CommonTokenStream, ParserRuleContext } from 'antlr4ng';
import { ClarionLexer } from '../../generated/ClarionLexer.js';
import { ClarionParser, ModuleReferenceContext } from '../../generated/ClarionParser.js';
import * as fs from 'fs';

function findModules(ctx: ParserRuleContext): void {
    if (ctx instanceof ModuleReferenceContext) {
        const moduleName = ctx.STRING_LITERAL()?.getText() || '?';
        const startLine = ctx.start?.line || 0;
        const stopLine = ctx.stop?.line || 0;
        const stopText = ctx.stop?.text || '?';
        
        console.log(`MODULE ${moduleName}:`);
        console.log(`  Start line: ${startLine}`);
        console.log(`  Stop line: ${stopLine}`);
        console.log(`  Stop token: "${stopText}"`);
        console.log(`  moduleContent count: ${ctx.moduleContent().length}`);
        console.log();
    }
    
    if (ctx.children) {
        for (const child of ctx.children) {
            if (child instanceof ParserRuleContext) {
                findModules(child);
            }
        }
    }
}

function testModuleLines(filename: string) {
    const input = fs.readFileSync(filename, 'utf-8');
    const inputStream = CharStream.fromString(input);
    const lexer = new ClarionLexer(inputStream);
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new ClarionParser(tokenStream);
    
    parser.removeErrorListeners();
    
    const tree = parser.compilationUnit();
    
    findModules(tree);
}

const args = process.argv.slice(2);
const filename = args[0];
testModuleLines(filename);
