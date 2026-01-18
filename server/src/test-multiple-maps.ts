import { AntlrFoldingProvider } from './providers/AntlrFoldingProvider';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs';
import * as path from 'path';

// Test multiple MAPs and data sections
const testFile = path.join(__dirname, '../../../test-programs/RealWorldTestSuite/Antlr_folding_Tests.clw');
const code = fs.readFileSync(testFile, 'utf8');
const document = TextDocument.create('file:///' + testFile, 'clarion', 1, code);

console.log('Testing Multiple MAPs and Data Sections...\n');
console.log(`File: ${testFile}`);
console.log(`Lines: ${code.split('\n').length}\n`);

const provider = new AntlrFoldingProvider(document);
provider.computeFoldingRanges().then(ranges => {
    console.log(`Found ${ranges.length} folding ranges\n`);
    
    // Display all ranges
    const lines = code.split('\n');
    ranges.forEach((r, i) => {
        const startLine = r.startLine + 1;
        const endLine = r.endLine + 1;
        const startText = lines[r.startLine]?.trim().substring(0, 70);
        console.log(`${i + 1}. Lines ${startLine}-${endLine}: ${startText}`);
    });
    
    // Count MAPs
    const mapCount = ranges.filter(r => {
        const text = lines[r.startLine]?.trim().toUpperCase();
        return text === 'MAP';
    }).length;
    
    // Count GROUPs
    const groupCount = ranges.filter(r => {
        const text = lines[r.startLine]?.trim().toUpperCase();
        return text?.startsWith('ST_SYSTEMTIME') || text?.startsWith('INT64') || text?.startsWith('UINT64');
    }).length;
    
    console.log(`\n✅ MAP sections: ${mapCount}`);
    console.log(`✅ GROUP declarations: ${groupCount}`);
    
}).catch(err => {
    console.error('Error:', err);
    console.error(err.stack);
});
