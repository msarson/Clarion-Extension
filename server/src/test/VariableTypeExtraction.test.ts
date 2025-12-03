import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { SymbolKind } from 'vscode-languageserver-types';
import { setServerInitialized } from '../serverState';

suite('Variable Type Extraction Tests', () => {
    
    setup(() => {
        setServerInitialized(true);
    });

    /**
     * Helper to find a variable symbol by name
     */
    function findVariable(symbols: ClarionDocumentSymbol[], name: string): ClarionDocumentSymbol | undefined {
        for (const symbol of symbols) {
            if (symbol.kind === SymbolKind.Variable) {
                // Check both _clarionVarName and the name field (which may include type)
                if (symbol._clarionVarName === name || symbol.name === name || symbol.name.startsWith(name + ' ')) {
                    return symbol;
                }
            }
            if (symbol.children) {
                const found = findVariable(symbol.children, name);
                if (found) return found;
            }
        }
        return undefined;
    }

    /**
     * Helper to get the type from a variable's detail string
     */
    function extractType(variable: ClarionDocumentSymbol): string {
        // Access the _clarionType property which has the full declaration
        const anyVar = variable as any;
        if (anyVar._clarionType) {
            // The _clarionType has the full declaration like "long,auto"
            // We need to extract just the type part before the comma
            const fullDecl = anyVar._clarionType;
            const commaIndex = fullDecl.indexOf(',');
            if (commaIndex !== -1) {
                return fullDecl.substring(0, commaIndex).trim();
            }
            return fullDecl.trim();
        }
        // Fallback: try to extract from the name
        const parts = variable.name.split(' ');
        if (parts.length > 1) {
            return parts.slice(1).join(' ');
        }
        return '';
    }

    test('Variable type extraction - long with auto attribute', () => {
        const code = `PROGRAM

StringTheory.Base64Encode Procedure(*string pText, *long pLen)
x         long, auto
y         long, auto
z         long(1)
a         long, auto
b         long
sz        long, auto
triplet   string(4)
bits      long, over(triplet)
table     string('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/')
expectLen long,auto
  code
`;

        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();

        const provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');

        console.log('\n=== Variable Type Extraction Test ===');
        
        // Find the Base64Encode method (recursively)
        function findMethod(syms: ClarionDocumentSymbol[], name: string): ClarionDocumentSymbol | undefined {
            for (const symbol of syms) {
                if (symbol.name.includes(name)) {
                    return symbol;
                }
                if (symbol.children) {
                    const found = findMethod(symbol.children, name);
                    if (found) return found;
                }
            }
            return undefined;
        }
        
        const base64Encode = findMethod(symbols, 'Base64Encode');

        assert.ok(base64Encode, 'Should find Base64Encode method');
        console.log(`Found method: ${base64Encode!.name}`);

        // Test each variable
        const testCases = [
            { name: 'x', expectedType: 'long' },
            { name: 'y', expectedType: 'long' },
            { name: 'z', expectedType: 'long(1)' },
            { name: 'a', expectedType: 'long' },
            { name: 'b', expectedType: 'long' },
            { name: 'sz', expectedType: 'long' },
            { name: 'triplet', expectedType: 'string(4)' },
            { name: 'bits', expectedType: 'long' },
            { name: 'table', expectedType: "string('ABCDEFGHIJ...)" },  // Should show abbreviated literal
            { name: 'expectLen', expectedType: 'long' }
        ];

        for (const testCase of testCases) {
            const variable = findVariable(base64Encode!.children || [], testCase.name);
            assert.ok(variable, `Should find variable '${testCase.name}'`);
            
            const actualType = extractType(variable!);
            console.log(`Variable '${testCase.name}': expected='${testCase.expectedType}', actual='${actualType}'`);
            
            assert.strictEqual(
                actualType,
                testCase.expectedType,
                `Variable '${testCase.name}' should have type '${testCase.expectedType}' but got '${actualType}'`
            );
        }
    });

    test('Variable type extraction - various attribute positions', () => {
        const code = `PROGRAM

TestProc Procedure()
var1    long,auto           ! type, then attribute
var2    long                ! type only
var3    string(20),auto     ! type with size, then attribute
var4    string('hello')     ! type with literal
var5    long,dim(10)        ! type with array dimension
var6    long,over(var5)     ! type with over
var7    byte,static         ! type with static
var8    real,auto,thread    ! type with multiple attributes
  code
`;

        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();

        const provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');

        console.log('\n=== Attribute Position Test ===');

        // Find TestProc
        let testProc: ClarionDocumentSymbol | undefined;
        for (const symbol of symbols) {
            if (symbol.name.includes('TestProc')) {
                testProc = symbol;
                break;
            }
        }

        assert.ok(testProc, 'Should find TestProc');

        const testCases = [
            { name: 'var1', expectedType: 'long' },
            { name: 'var2', expectedType: 'long' },
            { name: 'var3', expectedType: 'string(20)' },
            { name: 'var4', expectedType: "string('hello')" },  // Should show literal
            { name: 'var5', expectedType: 'long' },
            { name: 'var6', expectedType: 'long' },
            { name: 'var7', expectedType: 'byte' },
            { name: 'var8', expectedType: 'real' }
        ];

        for (const testCase of testCases) {
            const variable = findVariable(testProc!.children || [], testCase.name);
            assert.ok(variable, `Should find variable '${testCase.name}'`);
            
            const actualType = extractType(variable!);
            console.log(`Variable '${testCase.name}': expected='${testCase.expectedType}', actual='${actualType}'`);
            
            assert.strictEqual(
                actualType,
                testCase.expectedType,
                `Variable '${testCase.name}' should have type '${testCase.expectedType}' but got '${actualType}'`
            );
        }
    });

    test('Variable type extraction - group without label', () => {
        const code = `PROGRAM

TestProc Procedure()
bits        long
            group,over(bits),pre()
triplet1      string(1)
triplet2      string(1)
triplet3      string(1)
            end
  code
`;

        const tokenizer = new ClarionTokenizer(code);
        const tokens = tokenizer.tokenize();

        const provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');

        console.log('\n=== Group Without Label Test ===');

        // Find TestProc
        let testProc: ClarionDocumentSymbol | undefined;
        for (const symbol of symbols) {
            if (symbol.name.includes('TestProc')) {
                testProc = symbol;
                break;
            }
        }

        assert.ok(testProc, 'Should find TestProc');

        // bits should be of type long
        const bits = findVariable(testProc!.children || [], 'bits');
        assert.ok(bits, 'Should find variable bits');
        assert.strictEqual(extractType(bits!), 'long', 'bits should have type long');

        // Find the group (should be a Struct kind)
        let group: ClarionDocumentSymbol | undefined;
        for (const child of testProc!.children || []) {
            if (child.kind === SymbolKind.Struct && child.name.includes('OVER')) {
                group = child;
                break;
            }
        }

        assert.ok(group, 'Should find the OVER group');
        console.log(`Found group: ${group!.name}`);

        // The group should have the three triplet fields as children
        assert.ok(group!.children, 'Group should have children');
        assert.strictEqual(group!.children!.length, 3, 'Group should have 3 children');

        // Check each triplet field
        const triplet1 = findVariable(group!.children || [], 'triplet1');
        const triplet2 = findVariable(group!.children || [], 'triplet2');
        const triplet3 = findVariable(group!.children || [], 'triplet3');

        assert.ok(triplet1, 'Should find triplet1 as child of group');
        assert.ok(triplet2, 'Should find triplet2 as child of group');
        assert.ok(triplet3, 'Should find triplet3 as child of group');

        assert.strictEqual(extractType(triplet1!), 'string(1)', 'triplet1 should have type string(1)');
        assert.strictEqual(extractType(triplet2!), 'string(1)', 'triplet2 should have type string(1)');
        assert.strictEqual(extractType(triplet3!), 'string(1)', 'triplet3 should have type string(1)');
    });
});
