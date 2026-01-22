const fs = require('fs');
const path = require('path');

// Load the compiled modules
const { ClarionTokenizer } = require('./out/server/src/ClarionTokenizer');
const ClarionFoldingProvider = require('./out/server/src/ClarionFoldingProvider').default;
const { AntlrFoldingProvider } = require('./out/server/src/providers/AntlrFoldingProvider');
const { TextDocument } = require('vscode-languageserver-textdocument');

const filePath = 'C:\\Clarion\\Clarion11.1\\accessory\\libsrc\\win\\stringtheory.clw';

async function compareProviders() {
    console.log('='.repeat(70));
    console.log('ANTLR vs Tokenizer Comparison Analysis');
    console.log('='.repeat(70));
    
    const code = fs.readFileSync(filePath, 'utf8');
    const lines = code.split('\n');
    const document = TextDocument.create('file:///' + filePath, 'clarion', 1, code);
    
    console.log(`\nFile: ${path.basename(filePath)}`);
    console.log(`Lines: ${lines.length}`);
    console.log(`Size: ${(code.length / 1024).toFixed(2)} KB\n`);
    
    // =========================================================================
    // TOKENIZER PROVIDER
    // =========================================================================
    console.log('Running Tokenizer-based folding...');
    const tokenizerStart = performance.now();
    
    const tokenizer = new ClarionTokenizer(code, 2);
    tokenizer.tokenize();
    const tokens = tokenizer.tokens;
    const tokenizerProvider = new ClarionFoldingProvider(tokens, document);
    const tokenizerRanges = tokenizerProvider.computeFoldingRanges();
    
    const tokenizerTime = performance.now() - tokenizerStart;
    console.log(`  ✓ Complete: ${tokenizerRanges.length} ranges in ${tokenizerTime.toFixed(2)}ms\n`);
    
    // =========================================================================
    // ANTLR PROVIDER
    // =========================================================================
    console.log('Running ANTLR-based folding...');
    const antlrStart = performance.now();
    
    const antlrProvider = new AntlrFoldingProvider(document);
    const antlrRanges = await antlrProvider.computeFoldingRanges();
    
    const antlrTime = performance.now() - antlrStart;
    console.log(`  ✓ Complete: ${antlrRanges.length} ranges in ${antlrTime.toFixed(2)}ms\n`);
    
    // =========================================================================
    // COMPARISON
    // =========================================================================
    console.log('='.repeat(70));
    console.log('COMPARISON RESULTS');
    console.log('='.repeat(70));
    
    const diff = antlrRanges.length - tokenizerRanges.length;
    console.log(`\nRange counts:`);
    console.log(`  Tokenizer: ${tokenizerRanges.length} ranges`);
    console.log(`  ANTLR:     ${antlrRanges.length} ranges`);
    console.log(`  Difference: ${diff > 0 ? '+' : ''}${diff} (ANTLR has ${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'})`);
    
    console.log(`\nPerformance:`);
    console.log(`  Tokenizer: ${tokenizerTime.toFixed(2)}ms`);
    console.log(`  ANTLR:     ${antlrTime.toFixed(2)}ms`);
    console.log(`  Ratio:     ${(antlrTime / tokenizerTime).toFixed(1)}x slower`);
    
    // =========================================================================
    // MATCH ANALYSIS
    // =========================================================================
    console.log(`\n${'='.repeat(70)}`);
    console.log('MATCH ANALYSIS');
    console.log('='.repeat(70));
    
    let exactMatches = 0;
    const tokenizerMap = new Map();
    
    for (const range of tokenizerRanges) {
        const key = `${range.startLine}:${range.endLine}`;
        tokenizerMap.set(key, range);
    }
    
    for (const range of antlrRanges) {
        const key = `${range.startLine}:${range.endLine}`;
        if (tokenizerMap.has(key)) {
            exactMatches++;
        }
    }
    
    console.log(`\nExact matches: ${exactMatches} (${(exactMatches / Math.max(tokenizerRanges.length, antlrRanges.length) * 100).toFixed(1)}%)`);
    
    // =========================================================================
    // FIND MISSING PATTERNS
    // =========================================================================
    console.log(`\n${'='.repeat(70)}`);
    console.log('RANGES IN ANTLR BUT NOT IN TOKENIZER (First 20)');
    console.log('='.repeat(70));
    
    const missing = [];
    for (const antlrRange of antlrRanges) {
        const key = `${antlrRange.startLine}:${antlrRange.endLine}`;
        if (!tokenizerMap.has(key)) {
            missing.push(antlrRange);
        }
    }
    
    console.log(`\nFound ${missing.length} ranges in ANTLR but not in Tokenizer\n`);
    
    for (let i = 0; i < Math.min(20, missing.length); i++) {
        const range = missing[i];
        const startLine = range.startLine;
        const endLine = range.endLine;
        const startText = lines[startLine] ? lines[startLine].trim().substring(0, 60) : '';
        const endText = lines[endLine] ? lines[endLine].trim().substring(0, 60) : '';
        
        console.log(`\n${i + 1}. Lines ${startLine + 1}-${endLine + 1} (${endLine - startLine + 1} lines):`);
        console.log(`   Start: ${startText}`);
        console.log(`   End:   ${endText}`);
    }
    
    // =========================================================================
    // FIND EXTRA PATTERNS
    // =========================================================================
    console.log(`\n${'='.repeat(70)}`);
    console.log('RANGES IN TOKENIZER BUT NOT IN ANTLR (First 20)');
    console.log('='.repeat(70));
    
    const antlrMap = new Map();
    for (const range of antlrRanges) {
        const key = `${range.startLine}:${range.endLine}`;
        antlrMap.set(key, range);
    }
    
    const extra = [];
    for (const tokenizerRange of tokenizerRanges) {
        const key = `${tokenizerRange.startLine}:${tokenizerRange.endLine}`;
        if (!antlrMap.has(key)) {
            extra.push(tokenizerRange);
        }
    }
    
    console.log(`\nFound ${extra.length} ranges in Tokenizer but not in ANTLR\n`);
    
    for (let i = 0; i < Math.min(20, extra.length); i++) {
        const range = extra[i];
        const startLine = range.startLine;
        const endLine = range.endLine;
        const startText = lines[startLine] ? lines[startLine].trim().substring(0, 60) : '';
        const endText = lines[endLine] ? lines[endLine].trim().substring(0, 60) : '';
        
        console.log(`\n${i + 1}. Lines ${startLine + 1}-${endLine + 1} (${endLine - startLine + 1} lines):`);
        console.log(`   Start: ${startText}`);
        console.log(`   End:   ${endText}`);
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(70));
}

compareProviders().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
