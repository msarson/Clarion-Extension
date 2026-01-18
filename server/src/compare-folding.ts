import { AntlrFoldingProvider } from './providers/AntlrFoldingProvider';
import ClarionFoldingProvider from './ClarionFoldingProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from './ClarionTokenizer';
import * as fs from 'fs';
import * as path from 'path';

// Compare old and new folding providers
const testFile = path.join(__dirname, '../../../test-programs/RealWorldTestSuite/UpdatePYAccount_IBSCommon.clw');
const code = fs.readFileSync(testFile, 'utf8');
const document = TextDocument.create('file:///' + testFile, 'clarion', 1, code);

console.log('Comparing Folding Providers...\n');
console.log(`File: ${testFile}`);
console.log(`Lines: ${code.split('\n').length}\n`);

// Test existing tokenizer-based provider
const tokenizer = new ClarionTokenizer(code);
tokenizer.tokenize();
const tokens = (tokenizer as any).tokens; // Access private field for testing
const existingProvider = new ClarionFoldingProvider(tokens, document);
const existingRanges = existingProvider.computeFoldingRanges();

console.log(`✅ Existing (Tokenizer) Provider: ${existingRanges.length} regions`);

// Test new ANTLR-based provider
const antlrProvider = new AntlrFoldingProvider(document);
antlrProvider.computeFoldingRanges().then(antlrRanges => {
    console.log(`✅ ANTLR Provider: ${antlrRanges.length} regions\n`);
    
    const diff = existingRanges.length - antlrRanges.length;
    console.log(`Difference: ${diff > 0 ? '+' : ''}${-diff} (${diff > 0 ? 'ANTLR has fewer' : 'ANTLR has more'})`);
    
    // Compare a few ranges
    console.log('\nFirst 5 ranges comparison:');
    for (let i = 0; i < Math.min(5, existingRanges.length, antlrRanges.length); i++) {
        const existing = existingRanges[i];
        const antlr = antlrRanges[i];
        const existingStart = existing.startLine + 1;
        const existingEnd = existing.endLine + 1;
        const antlrStart = antlr.startLine + 1;
        const antlrEnd = antlr.endLine + 1;
        
        const match = existingStart === antlrStart && existingEnd === antlrEnd ? '✅' : '❌';
        console.log(`${match} #${i+1}: Existing ${existingStart}-${existingEnd} vs ANTLR ${antlrStart}-${antlrEnd}`);
    }
    
    // Find ranges in existing but not in ANTLR
    console.log('\nAnalyzing differences...');
    let matchCount = 0;
    for (const existingRange of existingRanges) {
        const found = antlrRanges.some(ar => 
            ar.startLine === existingRange.startLine && 
            ar.endLine === existingRange.endLine
        );
        if (found) matchCount++;
    }
    
    console.log(`Exact matches: ${matchCount}/${existingRanges.length} (${(matchCount/existingRanges.length*100).toFixed(1)}%)`);
    console.log(`Missing in ANTLR: ${existingRanges.length - matchCount}`);
    console.log(`Extra in ANTLR: ${antlrRanges.length - matchCount}`);
});
