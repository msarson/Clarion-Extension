// Test script to debug document link generation
const fs = require('fs');
const path = require('path');

// Read the file
const filePath = 'F:\\Playground\\AlignAt\\AT-Sort-Report\\AtSort.clw';
const content = fs.readFileSync(filePath, 'utf-8');

console.log('=== FILE ANALYSIS ===');
console.log(`File: ${filePath}`);
console.log(`Lines: ${content.split('\n').length}`);
console.log('');

// Test INCLUDE pattern
console.log('=== TESTING INCLUDE PATTERN ===');
const includePattern = /^\s*INCLUDE\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]*)['"]\s*)?\)/gim;
let match;
let includeMatches = [];
while ((match = includePattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    includeMatches.push({
        line: lineNumber,
        fullMatch: match[0],
        fileName: match[1],
        label: match[2] || ''
    });
}

console.log(`Found ${includeMatches.length} INCLUDE statements:`);
includeMatches.forEach(m => {
    console.log(`  Line ${m.line}: ${m.fullMatch.trim()}`);
    console.log(`    -> File: "${m.fileName}", Label: "${m.label}"`);
});
console.log('');

// Test MODULE pattern
console.log('=== TESTING MODULE PATTERN ===');
const modulePattern = /^\s*MODULE\s*\(\s*['"]([^'"]+)['"]\s*\)/gim;
let moduleMatches = [];
while ((match = modulePattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    moduleMatches.push({
        line: lineNumber,
        fullMatch: match[0],
        fileName: match[1]
    });
}

console.log(`Found ${moduleMatches.length} MODULE statements:`);
moduleMatches.forEach(m => {
    console.log(`  Line ${m.line}: ${m.fullMatch.trim()}`);
    console.log(`    -> File: "${m.fileName}"`);
});
console.log('');

// Find MAP section
console.log('=== TESTING MAP SECTION ===');
const mapMatch = content.match(/\bMAP\b/i);
if (mapMatch) {
    const mapStart = mapMatch.index;
    const mapLine = content.substring(0, mapStart).split('\n').length;
    
    // Find END after MAP
    const afterMap = content.substring(mapStart);
    const endMatch = afterMap.match(/^\s*END\s*$/im);
    
    if (endMatch) {
        const mapEnd = mapStart + endMatch.index;
        const mapContent = content.substring(mapStart, mapEnd);
        const endLine = content.substring(0, mapEnd).split('\n').length;
        
        console.log(`MAP found at line ${mapLine}, ends at line ${endLine}`);
        console.log(`MAP content length: ${mapContent.length} chars`);
        console.log('');
        
        // Parse procedures in MAP
        console.log('=== PROCEDURES IN MAP ===');
        const procPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?/gim;
        let procMatches = [];
        let procMatch;
        
        const mapLines = mapContent.split('\n');
        mapLines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.match(/^(MAP|END|MODULE|INCLUDE)/i)) {
                const lineInFile = mapLine + idx;
                // Try to match procedure declaration
                const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)(?:\s*,\s*([A-Za-z_][A-Za-z0-9_]*))?/i);
                if (m) {
                    procMatches.push({
                        line: lineInFile,
                        name: m[1],
                        params: m[2],
                        returnType: m[3] || '',
                        fullLine: trimmed
                    });
                }
            }
        });
        
        console.log(`Found ${procMatches.length} procedure declarations:`);
        procMatches.forEach(p => {
            console.log(`  Line ${p.line}: ${p.name}(${p.params})${p.returnType ? ', ' + p.returnType : ''}`);
        });
    } else {
        console.log('ERROR: MAP found but no matching END');
    }
} else {
    console.log('ERROR: No MAP section found');
}
console.log('');

// Check what links would be generated
console.log('=== LINK GENERATION ANALYSIS ===');
console.log(`Total potential links from INCLUDE: ${includeMatches.length}`);
console.log(`Total potential links from MODULE: ${moduleMatches.length}`);
console.log('');

// Check if files can be resolved
console.log('=== FILE RESOLUTION TEST ===');
const testFiles = [
    'KEYCODES.CLW',
    'CBCodeParse.INC',
    'CbWndPreview.inc',
    'ATSort_DATA.clw',
    'ATSort_Window.clw'
];

testFiles.forEach(file => {
    const fileDir = path.dirname(filePath);
    const fullPath = path.join(fileDir, file);
    const exists = fs.existsSync(fullPath);
    console.log(`  ${file}: ${exists ? 'EXISTS at ' + fullPath : 'NOT FOUND'}`);
});
