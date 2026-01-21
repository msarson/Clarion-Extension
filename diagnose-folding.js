const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const { ClarionParser } = require('./out/server/src/generated/ClarionParser');
const { ClarionPreprocessor } = require('./out/server/src/utils/ClarionPreprocessor');
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

// Simple folding range collector
function collectFoldingRanges(node, ranges) {
    if (!node) return;
    
    // Check if this node represents a foldable construct
    // (Simplified - just checks if node has meaningful start/stop positions)
    if (node.start && node.stop && node.start.line < node.stop.line) {
        ranges.push({
            start: node.start,
            stop: node.stop
        });
    }
    
    // Recursively collect from children
    if (node.children) {
        for (const child of node.children) {
            collectFoldingRanges(child, ranges);
        }
    }
}

function diagnose(filePath) {
    console.log(`${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}Diagnosing: ${path.basename(filePath)}${colors.reset}`);
    console.log(`${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}\n`);

    const input = fs.readFileSync(filePath, 'utf-8');
    const lines = input.split('\n');
    
    console.log(`${colors.blue}File Info:${colors.reset}`);
    console.log(`  Total lines: ${lines.length}`);
    console.log(`  File size: ${input.length} bytes\n`);

    // PREPROCESSING: Handle COMPILE/OMIT blocks
    console.log(`${colors.blue}Preprocessing:${colors.reset}`);
    const preprocessResult = ClarionPreprocessor.preprocess(input);
    console.log(`  COMPILE/OMIT blocks: ${preprocessResult.blocksProcessed}`);
    console.log(`  Lines replaced: ${preprocessResult.linesRemoved}\n`);
    
    const textToParse = preprocessResult.transformedText;

    // Parse the file
    const chars = CharStream.fromString(textToParse);
    const lexer = new ClarionLexer(chars);
    const tokens = new CommonTokenStream(lexer);
    const parser = new ClarionParser(tokens);
    
    // Collect errors
    const errors = [];
    const sllErrors = [];
    
    // Two-stage parsing: Try SLL first, fall back to LL if errors
    parser.removeErrorListeners();
    parser.addErrorListener({
        syntaxError: (recognizer, offendingSymbol, line, column, msg, e) => {
            sllErrors.push({ line, column, msg, token: offendingSymbol?.text });
        },
        reportAmbiguity: () => {},
        reportAttemptingFullContext: () => {},
        reportContextSensitivity: () => {}
    });
    
    // Try SLL mode first
    const { PredictionMode } = require('antlr4ng');
    parser.interpreter.predictionMode = PredictionMode.SLL;
    
    const startTime = Date.now();
    let tree = parser.compilationUnit();
    
    // If SLL had errors, retry with LL
    if (sllErrors.length > 0) {
        console.log(`${colors.yellow}⚠️  SLL mode had ${sllErrors.length} error(s), retrying with LL mode${colors.reset}\n`);
        tokens.seek(0);
        parser.reset();
        parser.removeErrorListeners();
        parser.addErrorListener({
            syntaxError: (recognizer, offendingSymbol, line, column, msg, e) => {
                errors.push({ line, column, msg, token: offendingSymbol?.text });
            },
            reportAmbiguity: () => {},
            reportAttemptingFullContext: () => {},
            reportContextSensitivity: () => {}
        });
        parser.interpreter.predictionMode = PredictionMode.LL;
        tree = parser.compilationUnit();
    }
    
    const parseTime = Date.now() - startTime;

    console.log(`${colors.blue}Parse Results:${colors.reset}`);
    console.log(`  Parse time: ${parseTime}ms`);
    console.log(`  Errors: ${errors.length}\n`);

    // Analyze parse tree for folding ranges
    const foldingRanges = [];
    if (tree) {
        collectFoldingRanges(tree, foldingRanges);
    }

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
        const lastErrorLine = Math.max(...errors.map(e => e.line));
        console.log(`${colors.yellow}First error at line: ${firstErrorLine}${colors.reset}`);
        console.log(`${colors.yellow}Last error at line: ${lastErrorLine}${colors.reset}`);
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

    // Folding analysis
    console.log(`${colors.blue}═══ Folding Analysis ═══${colors.reset}`);
    console.log(`${colors.gray}Total folding ranges found: ${foldingRanges.length}${colors.reset}`);
    
    if (foldingRanges.length > 0) {
        const lastFold = foldingRanges[foldingRanges.length - 1];
        const lastFoldLine = lastFold.stop?.line || 0;
        console.log(`${colors.gray}Last fold ends at line: ${lastFoldLine}${colors.reset}`);
        
        // Check if folding continued past errors
        if (errors.length > 0) {
            const firstErrorLine = Math.min(...errors.map(e => e.line));
            if (lastFoldLine > firstErrorLine) {
                const linesAfterError = lastFoldLine - firstErrorLine;
                const coverage = ((lastFoldLine / lines.length) * 100).toFixed(1);
                console.log(`${colors.green}✓ Folding continued ${linesAfterError} lines past first error${colors.reset}`);
                console.log(`${colors.green}✓ Folding coverage: ${coverage}% of file${colors.reset}`);
            } else {
                console.log(`${colors.red}✗ Folding stopped at error (line ${lastFoldLine} vs error at ${firstErrorLine})${colors.reset}`);
            }
        }
    }
    
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
