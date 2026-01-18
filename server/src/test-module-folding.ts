import { AntlrFoldingProvider } from './providers/AntlrFoldingProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';

// Test MODULE folding in main.clw
const testFile = path.join(__dirname, '../../../test-programs/RealWorldTestSuite/main.clw');
const code = fs.readFileSync(testFile, 'utf8');
const document = TextDocument.create('file:///' + testFile, 'clarion', 1, code);

console.log('Testing MODULE Folding in main.clw...\n');

const provider = new AntlrFoldingProvider(document);
provider.computeFoldingRanges().then(ranges => {
    console.log(`Found ${ranges.length} folding ranges\n`);
    
    // Display all ranges
    const lines = code.split('\n');
    ranges.forEach((r, i) => {
        const startLine = r.startLine + 1;
        const endLine = r.endLine + 1;
        const startText = lines[r.startLine]?.trim().substring(0, 60);
        console.log(`${i + 1}. Lines ${startLine}-${endLine}: ${startText}`);
    });
    
    // Check for MODULE
    const hasModule = ranges.some(r => {
        const text = lines[r.startLine]?.trim().toUpperCase();
        return text?.includes('MODULE');
    });
    
    console.log(`\n✅ MODULE folding: ${hasModule ? 'YES' : 'NO'}`);
    
    // Find the MODULE range specifically
    const moduleRange = ranges.find(r => {
        const text = lines[r.startLine]?.trim().toUpperCase();
        return text?.includes('MODULE');
    });
    
    if (moduleRange) {
        console.log(`   MODULE range: lines ${moduleRange.startLine + 1}-${moduleRange.endLine + 1}`);
    } else {
        console.log(`   ❌ MODULE range not found!`);
    }
    
}).catch(err => {
    console.error('Error:', err);
    console.error(err.stack);
});
