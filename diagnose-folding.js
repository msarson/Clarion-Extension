const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const { ClarionParser } = require('./out/server/src/generated/ClarionParser');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

function diagnose(filePath) {
    console.log(`${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}Diagnosing: ${path.basename(filePath)}${colors.reset}`);
    console.log(`${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}\n`);

    const input = fs.readFileSync(filePath, 'utf-8');
    const lines = input.split('\n');
    
    console.log(`${colors.blue}File Info:${colors.reset}`);
    console.log(`  Total lines: ${lines.length}`);
    console.log(`  File size: ${input.length} bytes\n`);

    // Parse the file
    const chars = CharStream.fromString(input);
    const lexer = new ClarionLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new ClarionParser(tokens);
    
    // Collect errors
    const errors = [];
    parser.removeErrorListeners();
    parser.addErrorListener({
        syntaxError: (recognizer, offendingSymbol, line, column, msg, e) => {
            errors.push({ line, column, msg, token: offendingSymbol?.text });
        }
    });

    const startTime = Date.now();
    const tree = parser.compilationUnit();
    const parseTime = Date.now() - startTime;

    console.log(`${colors.blue}Parse Results:${colors.reset}`);
    console.log(`  Parse time: ${parseTime}ms`);
    console.log(`  Errors: ${errors.length}\n`);

    if (errors.length > 0) {
        console.log(`${colors.red}═══ Parse Errors ═══${colors.reset}`);
        errors.slice(0, 10).forEach((err, idx) => {
            console.log(`${colors.red}${idx + 1}.${colors.reset} Line ${err.line}, Col ${err.column}`);
            console.log(`   ${colors.gray}${err.msg}${colors.reset}`);
            if (err.token) {
                console.log(`   ${colors.yellow}Token: '${err.token}'${colors.reset}`);
            }
            
            // Show context
            if (err.line > 0 && err.line <= lines.length) {
                const contextLine = lines[err.line - 1];
                console.log(`   ${colors.gray}Code: ${contextLine.trim()}${colors.reset}`);
            }
            console.log();
        });
        
        if (errors.length > 10) {
            console.log(`${colors.gray}... and ${errors.length - 10} more errors${colors.reset}\n`);
        }

        // Find the earliest error line
        const firstErrorLine = Math.min(...errors.map(e => e.line));
        console.log(`${colors.yellow}First error at line: ${firstErrorLine}${colors.reset}`);
        console.log(`${colors.gray}Showing context around first error:${colors.reset}`);
        const start = Math.max(1, firstErrorLine - 2);
        const end = Math.min(lines.length, firstErrorLine + 2);
        for (let i = start; i <= end; i++) {
            const marker = i === firstErrorLine ? `${colors.red}→${colors.reset}` : ' ';
            console.log(`${marker} ${colors.gray}${i}:${colors.reset} ${lines[i - 1]}`);
        }
        console.log();
    } else {
        console.log(`${colors.green}✓ No parse errors!${colors.reset}\n`);
    }

    // Simulate folding calculation (simplified - just for diagnostics)
    console.log(`${colors.blue}═══ Folding Analysis ═══${colors.reset}`);
    console.log(`${colors.gray}Note: Restart your language server to see actual folding results${colors.reset}\n`);
    
    return {
        success: errors.length === 0,
        errorCount: errors.length,
        firstErrorLine: errors.length > 0 ? Math.min(...errors.map(e => e.line)) : null,
        totalLines: lines.length,
        parseTime
    };
}

// Main
const filePath = process.argv[2] || 'test-programs/RealWorldTestSuite/FoldingIssue.clw';

if (!fs.existsSync(filePath)) {
    console.error(`${colors.red}Error: File not found: ${filePath}${colors.reset}`);
    process.exit(1);
}

const result = diagnose(filePath);

console.log(`${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}`);
if (result.success) {
    console.log(`${colors.green}✓ SUCCESS - File parses without errors${colors.reset}`);
} else {
    console.log(`${colors.red}✗ FAILED - ${result.errorCount} parse errors found${colors.reset}`);
    console.log(`${colors.yellow}  First error at line ${result.firstErrorLine}${colors.reset}`);
}
console.log(`${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}`);
