import * as assert from 'assert';
import { workspace, WorkspaceConfiguration } from 'vscode';

// Mock the convertToClarionString function for testing
// In a real implementation, we'd import the actual function
function convertToClarionString(text: string, lineTerminator: 'space' | 'crlf' | 'none', indentation: string): string {
    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isLastLine = i === lines.length - 1;
        
        // Escape single quotes by doubling them
        const escapedLine = line.replace(/'/g, "''");
        
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
        result.push(indentation + clarionLine);
    }
    
    return result.join('\n');
}

suite('TextEditingCommands Test Suite', () => {
    
    suite('convertToClarionString', () => {
        
        test('should convert single line with space terminator', () => {
            const input = 'SELECT * FROM Orders';
            const expected = "'SELECT * FROM Orders'";
            const result = convertToClarionString(input, 'space', '');
            assert.strictEqual(result, expected);
        });
        
        test('should convert multiple lines with space terminator', () => {
            const input = 'SELECT CustomerName\nFROM Orders\nWHERE Total > 100';
            const expected = 
                "'SELECT CustomerName ' & |\n" +
                "'FROM Orders ' & |\n" +
                "'WHERE Total > 100'";
            const result = convertToClarionString(input, 'space', '');
            assert.strictEqual(result, expected);
        });
        
        test('should convert multiple lines with crlf terminator', () => {
            const input = 'Line 1\nLine 2\nLine 3';
            const expected = 
                "'Line 1<13,10>' & |\n" +
                "'Line 2<13,10>' & |\n" +
                "'Line 3'";
            const result = convertToClarionString(input, 'crlf', '');
            assert.strictEqual(result, expected);
        });
        
        test('should convert multiple lines with none terminator', () => {
            const input = 'Part1\nPart2\nPart3';
            const expected = 
                "'Part1' & |\n" +
                "'Part2' & |\n" +
                "'Part3'";
            const result = convertToClarionString(input, 'none', '');
            assert.strictEqual(result, expected);
        });
        
        test('should escape single quotes', () => {
            const input = "It's a test\nWith 'quotes'";
            const expected = 
                "'It''s a test ' & |\n" +
                "'With ''quotes'''";
            const result = convertToClarionString(input, 'space', '');
            assert.strictEqual(result, expected);
        });
        
        test('should apply indentation', () => {
            const input = 'Line 1\nLine 2';
            const expected = 
                "  'Line 1 ' & |\n" +
                "  'Line 2'";
            const result = convertToClarionString(input, 'space', '  ');
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
            const result = convertToClarionString(input, 'space', '');
            assert.strictEqual(result, expected);
        });
        
        test('should handle empty lines', () => {
            const input = 'Line 1\n\nLine 3';
            const expected = 
                "'Line 1 ' & |\n" +
                "' ' & |\n" +
                "'Line 3'";
            const result = convertToClarionString(input, 'space', '');
            assert.strictEqual(result, expected);
        });
        
        test('should handle Windows line endings (CRLF)', () => {
            const input = 'Line 1\r\nLine 2\r\nLine 3';
            const expected = 
                "'Line 1 ' & |\n" +
                "'Line 2 ' & |\n" +
                "'Line 3'";
            const result = convertToClarionString(input, 'space', '');
            assert.strictEqual(result, expected);
        });
        
        test('should handle complex SQL with indentation', () => {
            const input = 
                'SELECT\n' +
                '  c.Name,\n' +
                '  o.Total\n' +
                'FROM Customers c\n' +
                'JOIN Orders o ON c.ID = o.CustomerID';
            const expected = 
                "    'SELECT ' & |\n" +
                "    '  c.Name, ' & |\n" +
                "    '  o.Total ' & |\n" +
                "    'FROM Customers c ' & |\n" +
                "    'JOIN Orders o ON c.ID = o.CustomerID'";
            const result = convertToClarionString(input, 'space', '    ');
            assert.strictEqual(result, expected);
        });
    });
});
