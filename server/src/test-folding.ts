import { AntlrFoldingProvider } from './providers/AntlrFoldingProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';

// Test the folding provider
const testFile = path.join(__dirname, '../../../test-programs/RealWorldTestSuite/UpdatePYAccount_IBSCommon.clw');
const code = fs.readFileSync(testFile, 'utf8');

const document = TextDocument.create('file:///' + testFile, 'clarion', 1, code);
const provider = new AntlrFoldingProvider(document);

console.log('Testing ANTLR Folding Provider...\n');
console.log(`File: ${testFile}`);
console.log(`Lines: ${code.split('\n').length}\n`);

provider.computeFoldingRanges().then(ranges => {
    console.log(`Found ${ranges.length} folding ranges:\n`);
    
    // Group by kind
    const byKind: { [key: string]: number } = {};
    ranges.forEach(r => {
        const kind = r.kind || 'unknown';
        byKind[kind] = (byKind[kind] || 0) + 1;
    });
    
    console.log('Breakdown by kind:');
    Object.entries(byKind).forEach(([kind, count]) => {
        console.log(`  ${kind}: ${count}`);
    });
    
    console.log('\nFirst 10 folding ranges:');
    ranges.slice(0, 10).forEach(r => {
        const startLine = r.startLine + 1; // Convert to 1-based
        const endLine = r.endLine + 1;
        const lines = code.split('\n');
        const startText = lines[r.startLine]?.trim().substring(0, 50);
        console.log(`  Lines ${startLine}-${endLine} (${r.kind || 'unknown'}): ${startText}`);
    });
    
    // Get statistics
    provider.getFoldingStatistics().then(stats => {
        console.log(`\nStatistics: ${stats.total} total regions`);
    });
    
}).catch(err => {
    console.error('Error:', err);
    console.error(err.stack);
});
