import * as assert from 'assert';
import { workspace, WorkspaceConfiguration } from 'vscode';

// Mock the convertToClarionString function for testing
// In a real implementation, we'd import the actual function
function convertToClarionString(text: string, lineTerminator: 'space' | 'crlf' | 'none', trimLeadingWhitespace: boolean, indentation: string, cursorColumn: number): string {
    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    
    // For continuation lines, we need to align the opening quote with the first line's opening quote
    // The first line starts at cursorColumn, so continuation lines need the same column position
    const continuationIndent = ' '.repeat(cursorColumn);
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const isLastLine = i === lines.length - 1;
        const isFirstLine = i === 0;
        
        // Optionally trim leading whitespace
        if (trimLeadingWhitespace) {
            line = line.trimStart();
        }
        
        // Convert unicode quotes to ASCII (for Clarion compiler compatibility)
        // then escape single quotes by doubling them
        const escapedLine = line
            .replace(/[\u2018\u2019]/g, "'")  // Convert unicode single quotes to ASCII
            .replace(/[\u201C\u201D]/g, '"')  // Convert unicode double quotes to ASCII
            .replace(/'/g, "''");              // Escape ASCII single quotes for Clarion
        
        // Build the string line
        let clarionLine = `'${escapedLine}`;
        
        // Add line terminator if not the last line
        if (!isLastLine) {
            switch (lineTerminator) {
                case 'space':
                    clarionLine += ' ';
                    break;
                case 'crlf':
                    clarionLine += '<13,10>';
                    break;
                case 'none':
                    // No terminator
                    break;
            }
        }
        
        // Close the quote and add continuation if not last line
        clarionLine += "'";
        if (!isLastLine) {
            clarionLine += ' & |';
        }
        
        // Add indentation
        if (isFirstLine) {
            // First line: no extra indentation (cursor is already positioned)
            result.push(clarionLine);
        } else {
            // Continuation lines: align the opening quote with first line's opening quote
            result.push(continuationIndent + clarionLine);
        }
    }
    
    return result.join('\n');
}

suite('TextEditingCommands Test Suite', () => {
    
    suite('convertToClarionString', () => {
        
        test('should convert single line with space terminator', () => {
            const input = 'SELECT * FROM Orders';
            const expected = "'SELECT * FROM Orders'";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should convert multiple lines with space terminator', () => {
            const input = 'SELECT CustomerName\nFROM Orders\nWHERE Total > 100';
            const expected = 
                "'SELECT CustomerName ' & |\n" +
                "'FROM Orders ' & |\n" +
                "'WHERE Total > 100'";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should convert multiple lines with crlf terminator', () => {
            const input = 'Line 1\nLine 2\nLine 3';
            const expected = 
                "'Line 1<13,10>' & |\n" +
                "'Line 2<13,10>' & |\n" +
                "'Line 3'";
            const result = convertToClarionString(input, 'crlf', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should convert multiple lines with none terminator', () => {
            const input = 'Part1\nPart2\nPart3';
            const expected = 
                "'Part1' & |\n" +
                "'Part2' & |\n" +
                "'Part3'";
            const result = convertToClarionString(input, 'none', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should escape single quotes', () => {
            const input = "It's a test\nWith 'quotes'";
            const expected = 
                "'It''s a test ' & |\n" +
                "'With ''quotes'''";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should apply indentation to continuation lines', () => {
            const input = 'Line 1\nLine 2';
            const expected = 
                "'Line 1 ' & |\n" +
                "  'Line 2'";
            const result = convertToClarionString(input, 'space', true, '  ', 2);
            assert.strictEqual(result, expected);
        });
        
        test('should handle SQL query example', () => {
            const input = 
                'SELECT CustomerName, OrderDate, TotalAmount\n' +
                'FROM Orders\n' +
                "WHERE OrderDate > '2024-01-01'\n" +
                'ORDER BY OrderDate DESC';
            const expected = 
                "'SELECT CustomerName, OrderDate, TotalAmount ' & |\n" +
                "'FROM Orders ' & |\n" +
                "'WHERE OrderDate > ''2024-01-01'' ' & |\n" +
                "'ORDER BY OrderDate DESC'";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should handle empty lines', () => {
            const input = 'Line 1\n\nLine 3';
            const expected = 
                "'Line 1 ' & |\n" +
                "' ' & |\n" +
                "'Line 3'";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should handle Windows line endings (CRLF)', () => {
            const input = 'Line 1\r\nLine 2\r\nLine 3';
            const expected = 
                "'Line 1 ' & |\n" +
                "'Line 2 ' & |\n" +
                "'Line 3'";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should handle complex SQL with indentation alignment', () => {
            const input = 
                'SELECT\n' +
                '  c.Name,\n' +
                '  o.Total\n' +
                'FROM Customers c\n' +
                'JOIN Orders o ON c.ID = o.CustomerID';
            // Cursor at column 17 (after "SqlQuery STRING(")
            const expected = 
                "'SELECT ' & |\n" +
                "                 'c.Name, ' & |\n" +
                "                 'o.Total ' & |\n" +
                "                 'FROM Customers c ' & |\n" +
                "                 'JOIN Orders o ON c.ID = o.CustomerID'";
            const result = convertToClarionString(input, 'space', true, '', 17);
            assert.strictEqual(result, expected);
        });
        
        test('should trim leading whitespace when enabled', () => {
            const input = '    CASE Value\n    OF 1 ; DoSomething()\n    END';
            const expected = 
                "'CASE Value ' & |\n" +
                "'OF 1 ; DoSomething() ' & |\n" +
                "'END'";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should preserve leading whitespace when disabled', () => {
            const input = '    CASE Value\n    OF 1 ; DoSomething()\n    END';
            const expected = 
                "'    CASE Value ' & |\n" +
                "'    OF 1 ; DoSomething() ' & |\n" +
                "'    END'";
            const result = convertToClarionString(input, 'space', false, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should convert unicode quotes to ASCII and escape them', () => {
            // Unicode single quotes: U+2018 (') and U+2019 (')
            // Unicode double quotes: U+201C (") and U+201D (")
            const input = "This is a \u2018smart\u2019 quote\nAnd a \u201Cdouble\u201D quote";
            const expected = 
                "'This is a ''smart'' quote ' & |\n" +
                "'And a \"double\" quote'";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
        
        test('should handle mixed ASCII and unicode quotes', () => {
            const input = "It's a test with \u2018unicode\u2019 quotes";
            const expected = "'It''s a test with ''unicode'' quotes'";
            const result = convertToClarionString(input, 'space', true, '', 0);
            assert.strictEqual(result, expected);
        });
    });
});
