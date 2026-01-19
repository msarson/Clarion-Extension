const { CharStream, CommonTokenStream } = require('antlr4ng');
const { ClarionLexer } = require('./out/server/src/generated/ClarionLexer');
const { ClarionParser } = require('./out/server/src/generated/ClarionParser');
const fs = require('fs');

// Read the file
const filename = process.argv[2] || 'test-programs/RealWorldTestSuite/FoldingIssue.clw';
const input = fs.readFileSync(filename, 'utf-8');

// Lex
const chars = CharStream.fromString(input);
const lexer = new ClarionLexer(chars);
const tokens = new CommonTokenStream(lexer);
tokens.fill();

// Get all tokens for reference
const allTokens = tokens.getTokens();
console.log('\n=== ALL TOKENS (lines 10-20) ===');
allTokens.filter(t => t.line >= 10 && t.line <= 20 && t.type !== -1).forEach((token, idx) => {
    const tokenName = ClarionLexer.symbolicNames[token.type] || token.type;
    console.log(`${idx}: Line ${token.line}:${token.column} Type=${token.type.toString().padStart(3)} ${tokenName.padEnd(25)} Text="${token.text}"`);
});

// Parse
const parser = new ClarionParser(tokens);
const tree = parser.compilationUnit();

// Find all IF statements and analyze them
function findIfStatements(ctx, depth = 0) {
    if (!ctx) return;
    
    const indent = '  '.repeat(depth);
    
    if (ctx.constructor.name === 'IfStatementContext') {
        const startToken = ctx.start;
        const stopToken = ctx.stop;
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`IF STATEMENT FOUND at line ${startToken.line}:${startToken.column}`);
        console.log(`${'='.repeat(80)}`);
        
        // Get the expression context
        const exprCtx = ctx.expression ? ctx.expression(0) : ctx.expression;
        if (exprCtx) {
            const exprStart = exprCtx.start;
            const exprStop = exprCtx.stop;
            
            console.log(`\nIF CONDITION:`);
            console.log(`  Start: line ${exprStart.line}:${exprStart.column} token="${exprStart.text}" type=${exprStart.type}`);
            console.log(`  Stop:  line ${exprStop.line}:${exprStop.column} token="${exprStop.text}" type=${exprStop.type}`);
            
            // Show all tokens in the expression
            console.log(`\n  Tokens in expression:`);
            const exprTokens = allTokens.filter(t => 
                (t.line > exprStart.line || (t.line === exprStart.line && t.column >= exprStart.column)) &&
                (t.line < exprStop.line || (t.line === exprStop.line && t.column <= exprStop.column)) &&
                t.type !== -1
            );
            exprTokens.forEach(t => {
                const tokenName = ClarionLexer.symbolicNames[t.type] || t.type;
                console.log(`    Line ${t.line}:${t.column} ${tokenName.padEnd(20)} "${t.text}"`);
            });
            
            // Trace through the expression parse tree
            console.log(`\n  Expression parse tree:`);
            traceExpression(exprCtx, '    ');
        }
        
        console.log(`\nIF STATEMENT END:`);
        console.log(`  Stop token: line ${stopToken.line}:${stopToken.column} token="${stopToken.text}" type=${stopToken.type} (${ClarionLexer.symbolicNames[stopToken.type]})`);
        
        // Show the next token after the IF
        const stopIndex = allTokens.findIndex(t => t === stopToken);
        if (stopIndex >= 0 && stopIndex < allTokens.length - 1) {
            const nextToken = allTokens[stopIndex + 1];
            console.log(`  Next token: line ${nextToken.line}:${nextToken.column} token="${nextToken.text}" type=${nextToken.type} (${ClarionLexer.symbolicNames[nextToken.type]})`);
        }
        
        // Show what caused the IF to end
        console.log(`\nWHY DID IF STOP HERE?`);
        if (stopToken.type === 4) { // DOT
            console.log(`  ❌ IF terminated by DOT token`);
            console.log(`  ⚠️  This suggests the expression parser stopped early!`);
            console.log(`  Expected: Expression should consume "self.UseBuffer" fully`);
            console.log(`  Actual: Expression stopped at "self" and DOT was interpreted as IF terminator`);
        } else if (stopToken.type === 39) { // END
            console.log(`  ✅ IF terminated by END token (expected)`);
        }
    }
    
    // Recursively search children
    if (ctx.children) {
        ctx.children.forEach(child => findIfStatements(child, depth + 1));
    }
}

function traceExpression(ctx, indent) {
    if (!ctx) return;
    
    const name = ctx.constructor.name;
    console.log(`${indent}${name}`);
    
    // If this is a fieldRef or postfixExpression, show details
    if (name === 'FieldRefContext' || name === 'PostfixExpressionContext') {
        if (ctx.start && ctx.stop) {
            console.log(`${indent}  start: ${ctx.start.text} (line ${ctx.start.line}:${ctx.start.column})`);
            console.log(`${indent}  stop:  ${ctx.stop.text} (line ${ctx.stop.line}:${ctx.stop.column})`);
        }
    }
    
    if (ctx.children) {
        ctx.children.forEach(child => {
            if (child.constructor) {
                traceExpression(child, indent + '  ');
            }
        });
    }
}

// Find and analyze all IF statements
findIfStatements(tree);
