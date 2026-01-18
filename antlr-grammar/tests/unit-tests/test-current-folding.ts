// Compare current folding provider vs ANTLR folding

import * as fs from 'fs';
import * as path from 'path';

// Import current tokenizer and folding provider  
const tokenizerPath = path.resolve(process.cwd(), '../out/server/src/ClarionTokenizer.js');
const foldingPath = path.resolve(process.cwd(), '../out/server/src/ClarionFoldingProvider.js');

// Check if compiled JS files exist
if (!fs.existsSync(tokenizerPath) || !fs.existsSync(foldingPath)) {
    console.error('❌ Error: Server not compiled. Run "npm run build" in server directory first.');
    console.error('');
    console.error('Expected files:');
    console.error(`  ${tokenizerPath}`);
    console.error(`  ${foldingPath}`);
    process.exit(1);
}

// Dynamic import
import(tokenizerPath).then(tokenizerModule => {
    return import(foldingPath).then(foldingModule => {
        return { tokenizerModule, foldingModule };
    });
}).then(({ tokenizerModule, foldingModule }) => {
    const ClarionTokenizer = tokenizerModule.ClarionTokenizer;
    const ClarionFoldingProvider = foldingModule.default;

    // Read test file
    const args = process.argv.slice(2);
    const filename = args[0] || '../test-programs/RealWorldTestSuite/UpdatePYAccount_IBSCommon.clw';
    
    console.log('================================================================================');
    console.log('CURRENT FOLDING PROVIDER (Regex-based Tokenizer)');
    console.log('================================================================================\n');
    
    const content = fs.readFileSync(filename, 'utf-8');
    console.log(`File: ${filename}`);
    console.log(`Size: ${content.length} characters`);
    console.log(`Lines: ${content.split('\n').length}\n`);

    // Tokenize
    const tokenizer = new ClarionTokenizer(content, 2);
    const tokens = tokenizer.tokenize();
    console.log(`Tokens: ${tokens.length}\n`);

    // Create mock TextDocument for folding provider
    const mockDocument = {
        uri: filename,
        getText: () => content,
        positionAt: (offset: number) => {
            const lines = content.substring(0, offset).split('\n');
            return {
                line: lines.length - 1,
                character: lines[lines.length - 1].length
            };
        },
        offsetAt: (position: any) => {
            const lines = content.split('\n');
            let offset = 0;
            for (let i = 0; i < position.line && i < lines.length; i++) {
                offset += lines[i].length + 1; // +1 for newline
            }
            return offset + position.character;
        },
        lineCount: content.split('\n').length
    };

    // Get folding ranges
    const provider = new ClarionFoldingProvider(tokens, mockDocument);
    const foldings = provider.computeFoldingRanges();

    console.log(`Found ${foldings.length} folding regions:\n`);
    
    // Group by kind
    const byKind = new Map<string, typeof foldings>();
    for (const f of foldings) {
        const kind = f.kind || 'structure';
        if (!byKind.has(kind)) {
            byKind.set(kind, []);
        }
        byKind.get(kind)!.push(f);
    }

    console.log('Breakdown by type:');
    for (const [kind, ranges] of byKind) {
        console.log(`  ${kind}: ${ranges.length} regions`);
    }
    console.log('');

    // Show first 10 folding regions
    console.log('┌──────────┬──────────┬────────────────────────┐');
    console.log('│ Start    │ End      │ Kind                   │');
    console.log('├──────────┼──────────┼────────────────────────┤');

    foldings.slice(0, 15).forEach((f: any) => {
        const start = (f.startLine + 1).toString().padStart(8);
        const end = (f.endLine + 1).toString().padStart(8);
        const kind = (f.kind || 'structure').padEnd(22);
        console.log(`│ ${start} │ ${end} │ ${kind} │`);
    });

    if (foldings.length > 15) {
        console.log(`│   ...    │   ...    │ (${foldings.length - 15} more)           │`);
    }

    console.log('└──────────┴──────────┴────────────────────────┘\n');

    // Show example content
    console.log('Example folding regions with content:\n');
    const lines = content.split('\n');
    
    foldings.slice(0, 3).forEach((f: any, i: number) => {
        const startLine = f.startLine;
        const endLine = f.endLine;
        const kind = f.kind || 'structure';
        
        console.log(`${i + 1}. ${kind} (lines ${startLine + 1}-${endLine + 1}):`);
        console.log('   ' + '─'.repeat(70));
        
        for (let lineNum = startLine; lineNum <= Math.min(startLine + 3, endLine); lineNum++) {
            const lineContent = lines[lineNum].substring(0, 66);
            console.log(`   ${(lineNum + 1).toString().padStart(4)}: ${lineContent}`);
        }
        
        if (endLine - startLine > 3) {
            console.log(`        ... (${endLine - startLine - 3} more lines) ...`);
            console.log(`   ${(endLine + 1).toString().padStart(4)}: ${lines[endLine].substring(0, 66)}`);
        }
        console.log();
    });

}).catch(err => {
    console.error('❌ Error loading modules:', err);
    console.error('\nMake sure to compile the server first:');
    console.error('  cd server');
    console.error('  npm run build');
    process.exit(1);
});
