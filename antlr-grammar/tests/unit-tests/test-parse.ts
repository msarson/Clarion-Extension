import * as fs from 'fs';
import * as path from 'path';
import { CharStream, CommonTokenStream, ParseTreeWalker } from 'antlr4ng';
import { ClarionLexer } from '../../generated/ClarionLexer';
import { ClarionParser } from '../../generated/ClarionParser';
import { ClarionParserListener } from '../../generated/ClarionParserListener';
import { ParserRuleContext } from 'antlr4ng';

/**
 * Simple test harness to parse Clarion files with ANTLR grammar
 */
class SimpleListener implements ClarionParserListener {
    private indent = 0;

    private log(message: string) {
        console.log('  '.repeat(this.indent) + message);
    }

    enterEveryRule(ctx: ParserRuleContext) {
        const ruleName = ClarionParser.ruleNames[ctx.ruleIndex];
        const text = ctx.getText();
        const displayText = text.length > 50 ? text.substring(0, 50) + '...' : text;
        this.log(`→ ${ruleName}: "${displayText}"`);
        this.indent++;
    }

    exitEveryRule(ctx: ParserRuleContext) {
        this.indent--;
    }

    visitTerminal() {
        // Not needed for this test
    }

    visitErrorNode() {
        // Not needed for this test
    }
}

function parseFile(filePath: string): boolean {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Parsing: ${filePath}`);
    console.log('='.repeat(80));

    try {
        // Read file
        const input = fs.readFileSync(filePath, 'utf-8');
        console.log(`\nInput (${input.length} chars):\n${input}\n`);

        // Create lexer
        const inputStream = CharStream.fromString(input);
        const lexer = new ClarionLexer(inputStream);
        const tokenStream = new CommonTokenStream(lexer);

        // Show tokens
        tokenStream.fill();
        console.log('\nTokens:');
        tokenStream.getTokens().forEach(token => {
            if (token.type !== -1) { // Skip EOF
                const tokenName = lexer.vocabulary.getSymbolicName(token.type) || 'UNKNOWN';
                console.log(`  ${tokenName.padEnd(20)} : "${token.text}"`);
            }
        });

        // Reset token stream
        tokenStream.seek(0);

        // Create parser
        const parser = new ClarionParser(tokenStream);
        
        // Parse
        console.log('\n\nParse Tree:');
        const tree = parser.compilationUnit();

        // Check for errors
        if (parser.numberOfSyntaxErrors > 0) {
            console.error(`\n❌ Parsing failed with ${parser.numberOfSyntaxErrors} syntax errors`);
            return false;
        }

        // Walk the tree
        const listener = new SimpleListener();
        ParseTreeWalker.DEFAULT.walk(listener, tree);

        console.log('\n✅ Parsing succeeded!');
        return true;

    } catch (error) {
        console.error('\n❌ Error:', error);
        return false;
    }
}

// Main
const testFile = process.argv[2] || path.join(__dirname, 'tests', 'simple-program.clw');

if (!fs.existsSync(testFile)) {
    console.error(`File not found: ${testFile}`);
    console.log('\nUsage: node test-parse.js [file.clw]');
    process.exit(1);
}

const success = parseFile(testFile);
process.exit(success ? 0 : 1);
