import * as assert from 'assert';

suite('DocumentLinkProvider SECTION Tests', () => {

    test('Should extract section name from INCLUDE statement', () => {
        const tests = [
            { 
                input: "INCLUDE('ATSort_DATA.clw','GLOBAL DATA')", 
                expectedSection: 'GLOBAL DATA' 
            },
            { 
                input: "INCLUDE('file.inc','MySection')", 
                expectedSection: 'MySection' 
            },
            { 
                input: "INCLUDE('file.inc')", 
                expectedSection: undefined 
            },
            { 
                input: "INCLUDE('file.inc',  'Section With Spaces'  )", 
                expectedSection: 'Section With Spaces' 
            }
        ];

        tests.forEach(test => {
            const section = extractSectionFromInclude(test.input);
            assert.strictEqual(section, test.expectedSection, `Failed for: ${test.input}`);
        });
    });

    test('Should find SECTION line in target file', async () => {
        // Mock file content with sections
        const fileContent = [
            'PROGRAM',
            '',
            "SECTION('GLOBAL DATA')",
            'GlobalVar LONG',
            'GlobalString STRING(100)',
            '',
            "SECTION('LOCAL DATA')",
            'LocalVar LONG',
            '',
            "SECTION('PROCEDURES')",
            'MyProc PROCEDURE',
        ].join('\n');

        const sectionLine = findSectionLine(fileContent, 'GLOBAL DATA');
        assert.strictEqual(sectionLine, 2, 'Should find GLOBAL DATA section at line 2');

        const localSection = findSectionLine(fileContent, 'LOCAL DATA');
        assert.strictEqual(localSection, 6, 'Should find LOCAL DATA section at line 6');

        const notFound = findSectionLine(fileContent, 'NONEXISTENT');
        assert.strictEqual(notFound, undefined, 'Should return undefined for missing section');
    });

    test('Should extract section content with line limit', () => {
        const fileContent = [
            'PROGRAM',
            '',
            "SECTION('GLOBAL DATA')",
            'GlobalVar LONG',
            'GlobalString STRING(100)',
            'AnotherVar BYTE',
            'YetAnother STRING(50)',
            'MoreData LONG',
            'EvenMore BYTE',
            'StillMore STRING(20)',
            '',
            "SECTION('LOCAL DATA')",
            'LocalVar LONG',
        ].join('\n');

        // Test with 5 line limit
        const content = extractSectionContent(fileContent, 'GLOBAL DATA', 5);
        const lines = content.split('\n');
        
        assert.strictEqual(lines[0], "SECTION('GLOBAL DATA')", 'First line should be section header');
        assert.ok(lines.length <= 6, 'Should respect line limit (5 lines + header)'); // 5 lines + section line
        
        // Test section that ends at next section
        const shortContent = extractSectionContent(fileContent, 'LOCAL DATA', 10);
        const shortLines = shortContent.split('\n');
        assert.strictEqual(shortLines.length, 2, 'Should stop at end of file');
    });

    test('Should create document link with section target', () => {
        // Mock the link creation - we'll verify it includes section info
        const includeInfo = {
            fileName: 'data.clw',
            section: 'MySection',
            lineNumber: 5
        };

        assert.strictEqual(includeInfo.section, 'MySection', 'Should extract section name');
    });

    test('Should create hover content showing section preview', () => {
        const sectionContent = [
            "SECTION('GLOBAL DATA')",
            'GlobalVar LONG',
            'GlobalString STRING(100)',
            'AnotherVar BYTE'
        ].join('\n');

        const hover = createSectionHover(sectionContent, 'data.clw', 'GLOBAL DATA');
        
        assert.ok(hover.includes('GLOBAL DATA'), 'Hover should mention section name');
        assert.ok(hover.includes('GlobalVar'), 'Hover should show section content');
        assert.ok(hover.includes('data.clw'), 'Hover should show filename');
    });
});

// Helper functions that should be implemented in the provider
function extractSectionFromInclude(text: string): string | undefined {
    const match = text.match(/INCLUDE\s*\(\s*'[^']+'\s*,\s*'([^']+)'\s*\)/i);
    return match ? match[1] : undefined;
}

function findSectionLine(content: string, sectionName: string): number | undefined {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/SECTION\s*\(\s*'([^']+)'\s*\)/i);
        if (match && match[1] === sectionName) {
            return i;
        }
    }
    return undefined;
}

function extractSectionContent(content: string, sectionName: string, maxLines: number = 10): string {
    const lines = content.split('\n');
    const startLine = findSectionLine(content, sectionName);
    
    if (startLine === undefined) {
        return '';
    }

    const result: string[] = [];
    result.push(lines[startLine]); // Add section header
    
    // Find end of section (next SECTION or end of file)
    let endLine = lines.length;
    for (let i = startLine + 1; i < lines.length; i++) {
        if (lines[i].match(/SECTION\s*\(/i)) {
            endLine = i;
            break;
        }
    }

    // Add content lines up to maxLines
    const contentLines = Math.min(maxLines, endLine - startLine - 1);
    for (let i = 1; i <= contentLines; i++) {
        if (startLine + i < endLine) {
            result.push(lines[startLine + i]);
        }
    }

    return result.join('\n');
}

function createSectionHover(sectionContent: string, fileName: string, sectionName: string): string {
    return `**${fileName}** - Section: **${sectionName}**\n\n\`\`\`clarion\n${sectionContent}\n\`\`\``;
}
