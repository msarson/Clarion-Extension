import { AntlrFoldingProvider } from './providers/AntlrFoldingProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';

// Test TAB folding specifically
const testFile = path.join(__dirname, '../../../test-programs/RealWorldTestSuite/FoldingIssue.clw');
const code = fs.readFileSync(testFile, 'utf8');
const document = TextDocument.create('file:///' + testFile, 'clarion', 1, code);

console.log('Testing TAB/SHEET Folding...\n');
console.log(`File: ${testFile}`);
console.log(`Lines: ${code.split('\n').length}\n`);

const provider = new AntlrFoldingProvider(document);
provider.computeFoldingRanges().then(ranges => {
    console.log(`Found ${ranges.length} folding ranges\n`);
    
    // Display all ranges with context
    const lines = code.split('\n');
    ranges.forEach((r, i) => {
        const startLine = r.startLine + 1; // Convert to 1-based
        const endLine = r.endLine + 1;
        const startText = lines[r.startLine]?.trim().substring(0, 60);
        console.log(`${i + 1}. Lines ${startLine}-${endLine}: ${startText}`);
    });
    
    // Check for TAB and SHEET
    const hasTab = ranges.some(r => {
        const text = lines[r.startLine]?.trim().toUpperCase();
        return text?.includes('TAB(');
    });
    
    const hasSheet = ranges.some(r => {
        const text = lines[r.startLine]?.trim().toUpperCase();
        return text?.includes('SHEET');
    });
    
    console.log(`\n✅ SHEET folding: ${hasSheet ? 'YES' : 'NO'}`);
    console.log(`✅ TAB folding: ${hasTab ? 'YES' : 'NO'}`);
    
}).catch(err => {
    console.error('Error:', err);
    console.error(err.stack);
});
