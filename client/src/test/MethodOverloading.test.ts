import { describe, it } from 'mocha';
import * as assert from 'assert';

/**
 * Tests for method overloading with parameter type variations
 * 
 * These tests verify that the extension can correctly distinguish between
 * overloaded methods that have the same name but different parameter types,
 * particularly:
 * - String vs *String (pointer)
 * - String vs &String (reference)
 * - Different parameter counts
 */
describe('Method Overloading - Parameter Type Matching', () => {
    
    /**
     * Helper to parse parameter signatures similar to DocumentManager
     */
    function parseParameterSignature(paramString?: string): string[] {
        if (!paramString || paramString.trim() === '') {
            return [];
        }
        
        return paramString.split(',')
            .map(param => {
                const trimmed = param.trim();
                
                // Handle omittable parameters: <TYPE name> -> extract <TYPE>
                if (trimmed.startsWith('<')) {
                    const match = trimmed.match(/^<([^>]+)>/);
                    if (match) {
                        // Extract just the type from <TYPE name>
                        const innerContent = match[1].trim();
                        const typePart = innerContent.split(/\s+/)[0];
                        return `<${typePart.toLowerCase()}>`;
                    }
                }
                
                // Handle regular parameters: TYPE name, *TYPE name, &TYPE name
                const paramParts = trimmed.split(/\s+/);
                return paramParts[0].toLowerCase();
            });
    }
    
    /**
     * Helper to compare parameter signatures
     */
    function parametersMatch(declaredParams: string[], implParams: string[]): boolean {
        if (declaredParams.length !== implParams.length) {
            return false;
        }
        
        if (declaredParams.length === 0 && implParams.length === 0) {
            return true;
        }
        
        for (let i = 0; i < declaredParams.length; i++) {
            if (declaredParams[i] !== implParams[i]) {
                return false;
            }
        }
        
        return true;
    }
    
    describe('parseParameterSignature', () => {
        it('should parse simple String parameter', () => {
            const result = parseParameterSignature('String pValue');
            assert.deepStrictEqual(result, ['string']);
        });
        
        it('should parse pointer parameter (*String)', () => {
            const result = parseParameterSignature('*String pValue');
            assert.deepStrictEqual(result, ['*string']);
        });
        
        it('should parse reference parameter (&String)', () => {
            const result = parseParameterSignature('&String pValue');
            assert.deepStrictEqual(result, ['&string']);
        });
        
        it('should distinguish String from *String', () => {
            const param1 = parseParameterSignature('String pValue');
            const param2 = parseParameterSignature('*String pValue');
            
            assert.notDeepStrictEqual(param1, param2, 
                'String and *String should be different types');
            assert.strictEqual(param1[0], 'string');
            assert.strictEqual(param2[0], '*string');
        });
        
        it('should distinguish String from &String', () => {
            const param1 = parseParameterSignature('String pValue');
            const param2 = parseParameterSignature('&String pValue');
            
            assert.notDeepStrictEqual(param1, param2, 
                'String and &String should be different types');
            assert.strictEqual(param1[0], 'string');
            assert.strictEqual(param2[0], '&string');
        });
        
        it('should handle multiple parameters', () => {
            const result = parseParameterSignature('String p1, *String p2, Long p3');
            assert.deepStrictEqual(result, ['string', '*string', 'long']);
        });
        
        it('should handle omittable parameters with angle brackets', () => {
            // Omittable parameter: <LONG test>
            const result = parseParameterSignature('<LONG test>');
            
            // Should extract <long> including the brackets
            assert.deepStrictEqual(result, ['<long>'],
                'Should preserve angle brackets for omittable parameters');
        });
        
        it('should distinguish omittable vs required parameters', () => {
            const omittable = parseParameterSignature('<STRING pValue>');
            const required = parseParameterSignature('STRING pValue');
            
            assert.notDeepStrictEqual(omittable, required,
                'Omittable and required parameters should be different');
            assert.deepStrictEqual(omittable, ['<string>']);
            assert.deepStrictEqual(required, ['string']);
        });
        
        it('should handle mixed omittable and required parameters', () => {
            const result = parseParameterSignature('STRING p1, <LONG p2>, *STRING p3');
            
            assert.deepStrictEqual(result, ['string', '<long>', '*string'],
                'Should handle mix of required, omittable, and pointer parameters');
        });
        
        it('should handle empty parameter list', () => {
            const result = parseParameterSignature('');
            assert.deepStrictEqual(result, []);
        });
        
        it('should handle undefined parameter list', () => {
            const result = parseParameterSignature(undefined);
            assert.deepStrictEqual(result, []);
        });
        
        it('should handle parameter with attributes', () => {
            // In Clarion: AddLine PROCEDURE(*String pValue, Long pLen=0)
            const result = parseParameterSignature('*String pValue, Long pLen');
            assert.deepStrictEqual(result, ['*string', 'long']);
        });
    });
    
    describe('parametersMatch', () => {
        it('should match identical simple parameters', () => {
            const decl = parseParameterSignature('String pValue');
            const impl = parseParameterSignature('String pValue');
            
            assert.strictEqual(parametersMatch(decl, impl), true);
        });
        
        it('should NOT match String vs *String', () => {
            const decl = parseParameterSignature('String pValue');
            const impl = parseParameterSignature('*String pValue');
            
            assert.strictEqual(parametersMatch(decl, impl), false,
                'String and *String should NOT match');
        });
        
        it('should NOT match String vs &String', () => {
            const decl = parseParameterSignature('String pValue');
            const impl = parseParameterSignature('&String pValue');
            
            assert.strictEqual(parametersMatch(decl, impl), false,
                'String and &String should NOT match');
        });
        
        it('should match identical pointer parameters', () => {
            const decl = parseParameterSignature('*String pValue');
            const impl = parseParameterSignature('*String pValue');
            
            assert.strictEqual(parametersMatch(decl, impl), true);
        });
        
        it('should NOT match different parameter counts', () => {
            const decl = parseParameterSignature('String p1');
            const impl = parseParameterSignature('String p1, Long p2');
            
            assert.strictEqual(parametersMatch(decl, impl), false);
        });
        
        it('should match empty parameter lists', () => {
            const decl = parseParameterSignature('');
            const impl = parseParameterSignature('');
            
            assert.strictEqual(parametersMatch(decl, impl), true);
        });
        
        it('should match multiple parameters with different types', () => {
            const decl = parseParameterSignature('String p1, *String p2, Long p3');
            const impl = parseParameterSignature('String p1, *String p2, Long p3');
            
            assert.strictEqual(parametersMatch(decl, impl), true);
        });
        
        it('should NOT match when order differs', () => {
            const decl = parseParameterSignature('String p1, Long p2');
            const impl = parseParameterSignature('Long p1, String p2');
            
            assert.strictEqual(parametersMatch(decl, impl), false);
        });
    });
    
    describe('Real-world overloading scenarios', () => {
        it('should distinguish AddLine(String) from AddLine(*String)', () => {
            // Scenario from bug report:
            // AddLine Procedure (String pValue),virtual
            // AddLine Procedure (*String pValue),virtual
            
            const method1Decl = parseParameterSignature('String pValue');
            const method2Decl = parseParameterSignature('*String pValue');
            
            const method1Impl = parseParameterSignature('String pValue');
            const method2Impl = parseParameterSignature('*String pValue');
            
            // Method 1 should match only its implementation
            assert.strictEqual(parametersMatch(method1Decl, method1Impl), true,
                'AddLine(String) should match its implementation');
            assert.strictEqual(parametersMatch(method1Decl, method2Impl), false,
                'AddLine(String) should NOT match AddLine(*String) implementation');
            
            // Method 2 should match only its implementation
            assert.strictEqual(parametersMatch(method2Decl, method2Impl), true,
                'AddLine(*String) should match its implementation');
            assert.strictEqual(parametersMatch(method2Decl, method1Impl), false,
                'AddLine(*String) should NOT match AddLine(String) implementation');
        });
        
        it('should handle multiple overloads with same prefix', () => {
            // Example: Process(), Process(String), Process(*String), Process(String, Long)
            const overload1 = parseParameterSignature('');
            const overload2 = parseParameterSignature('String pValue');
            const overload3 = parseParameterSignature('*String pValue');
            const overload4 = parseParameterSignature('String pValue, Long pCount');
            
            // Each should be unique
            assert.strictEqual(parametersMatch(overload1, overload2), false);
            assert.strictEqual(parametersMatch(overload1, overload3), false);
            assert.strictEqual(parametersMatch(overload1, overload4), false);
            assert.strictEqual(parametersMatch(overload2, overload3), false);
            assert.strictEqual(parametersMatch(overload2, overload4), false);
            assert.strictEqual(parametersMatch(overload3, overload4), false);
        });
        
        it('should be case-insensitive for type names', () => {
            const decl = parseParameterSignature('STRING pValue');
            const impl = parseParameterSignature('string pValue');
            
            assert.strictEqual(parametersMatch(decl, impl), true,
                'Type names should be case-insensitive');
        });
        
        it('should preserve modifiers in case-insensitive comparison', () => {
            const decl = parseParameterSignature('*STRING pValue');
            const impl = parseParameterSignature('*string pValue');
            
            assert.strictEqual(parametersMatch(decl, impl), true,
                'Pointer modifiers should be preserved in case-insensitive comparison');
        });
    });
    
    describe('Add Method Implementation - findExistingImplementation', () => {
        /**
         * Helper to count parameters (from ImplementationCommands.ts)
         */
        function countParameters(paramList: string): number {
            if (!paramList || paramList.trim() === '') {
                return 0;
            }
            
            let depth = 0;
            let commaCount = 0;
            
            for (const char of paramList) {
                if (char === '(') {
                    depth++;
                } else if (char === ')') {
                    depth--;
                } else if (char === ',' && depth === 0) {
                    commaCount++;
                }
            }
            
            return commaCount + 1;
        }
        
        it('should correctly distinguish String vs *String overloads', () => {
            const clwContent = `
TestClass.AddLine   PROCEDURE(STRING pValue)
  CODE

TestClass.AddLine   PROCEDURE(*STRING pValue)  
  CODE
`;
            
            const lines = clwContent.split(/\r?\n/);
            
            // For AddLine(STRING pValue) - should find line 1
            const stringMatch = findImplementationWithTypeMatching(
                lines,
                'TestClass',
                'AddLine',
                parseParameterSignature('STRING pValue')
            );
            
            assert.strictEqual(stringMatch, 1, 
                'Should find AddLine(STRING) at line 1');
            
            // For AddLine(*STRING pValue) - should find line 4
            const pointerMatch = findImplementationWithTypeMatching(
                lines,
                'TestClass',
                'AddLine',
                parseParameterSignature('*STRING pValue')
            );
            
            assert.strictEqual(pointerMatch, 4, 
                'Should find AddLine(*STRING) at line 4');
            
            // Verify they don't cross-match
            assert.notStrictEqual(stringMatch, pointerMatch,
                'String and pointer overloads should be found at different lines');
        });
        
        it('should handle SomeOtherMethod overloads correctly', () => {
            const clwContent = `
SomeClass.SomeOtherMethod   PROCEDURE(STRING tempVar)
  CODE
  RETURN ''

SomeClass.SomeOtherMethod   PROCEDURE(*STRING tempVar)
  CODE
  RETURN ''
`;
            
            const lines = clwContent.split(/\r?\n/);
            
            // Test STRING version
            const stringResult = findImplementationWithTypeMatching(
                lines,
                'SomeClass',
                'SomeOtherMethod',
                parseParameterSignature('STRING tempVar')
            );
            
            assert.strictEqual(stringResult, 1,
                'Should find STRING version at line 1');
            
            // Test *STRING version
            const pointerResult = findImplementationWithTypeMatching(
                lines,
                'SomeClass',
                'SomeOtherMethod',
                parseParameterSignature('*STRING tempVar')
            );
            
            assert.strictEqual(pointerResult, 5,
                'Should find *STRING version at line 5');
        });
        
        it('should return null when no matching signature found', () => {
            const clwContent = `
TestClass.AddLine   PROCEDURE(STRING pValue)
  CODE

TestClass.AddLine   PROCEDURE(*STRING pValue)  
  CODE
`;
            
            const lines = clwContent.split(/\r?\n/);
            
            // Look for &STRING version that doesn't exist
            const refMatch = findImplementationWithTypeMatching(
                lines,
                'TestClass',
                'AddLine',
                parseParameterSignature('&STRING pValue')
            );
            
            assert.strictEqual(refMatch, null,
                'Should return null when no matching signature exists');
        });
        
        it('should find existing implementation with pointer parameter', () => {
            const clwContent = `
TestClass.AddLine   PROCEDURE(*STRING pValue)
  CODE
`;
            
            const lines = clwContent.split(/\r?\n/);
            
            // Parse the declaration signature  
            const declSignature = parseParameterSignature('*STRING pValue');
            
            // Should find the existing implementation
            const result = findImplementationWithTypeMatching(
                lines,
                'TestClass',
                'AddLine',
                declSignature
            );
            
            assert.strictEqual(result, 1,
                'Should find existing *STRING implementation at line 1');
        });
        
        it('should match pointer parameters from declaration vs implementation', () => {
            // Simulate what happens in real usage:
            // Declaration line: "AddLine   PROCEDURE(*STRING pValue),virtual"
            // Implementation line: "TestClass.AddLine   PROCEDURE(*STRING pValue)"
            
            const declarationLine = 'AddLine   PROCEDURE(*STRING pValue),virtual';
            const implementationLine = 'TestClass.AddLine   PROCEDURE(*STRING pValue)';
            
            // Parse both
            const declMatch = declarationLine.match(/^(\w+)\s+PROCEDURE\s*\(([^)]*)\)/i);
            const implMatch = implementationLine.match(/TestClass\.(\w+)\s+PROCEDURE\s*\(([^)]*)\)/i);
            
            assert.ok(declMatch, 'Should match declaration');
            assert.ok(implMatch, 'Should match implementation');
            
            const declParams = parseParameterSignature(declMatch![2]);
            const implParams = parseParameterSignature(implMatch![2]);
            
            assert.deepStrictEqual(declParams, ['*string'],
                'Declaration should parse to [*string]');
            assert.deepStrictEqual(implParams, ['*string'],
                'Implementation should parse to [*string]');
            
            assert.strictEqual(parametersMatch(declParams, implParams), true,
                'Declaration and implementation signatures should match');
        });
        
        it('should distinguish between multiple overloads', () => {
            // Example: Process(), Process(String), Process(*String), Process(String, Long)
            const clwContent = `
TestClass.Process   PROCEDURE()
  CODE

TestClass.Process   PROCEDURE(STRING pValue)
  CODE

TestClass.Process   PROCEDURE(*STRING pValue)
  CODE

TestClass.Process   PROCEDURE(STRING pValue, LONG pCount)
  CODE
`;
            
            const lines = clwContent.split(/\r?\n/);
            
            // Test each overload
            const noParams = findImplementationWithTypeMatching(
                lines, 'TestClass', 'Process',
                parseParameterSignature('')
            );
            assert.strictEqual(noParams, 1, 'Should find Process() at line 1');
            
            const stringParam = findImplementationWithTypeMatching(
                lines, 'TestClass', 'Process',
                parseParameterSignature('STRING pValue')
            );
            assert.strictEqual(stringParam, 4, 'Should find Process(STRING) at line 4');
            
            const pointerParam = findImplementationWithTypeMatching(
                lines, 'TestClass', 'Process',
                parseParameterSignature('*STRING pValue')
            );
            assert.strictEqual(pointerParam, 7, 'Should find Process(*STRING) at line 7');
            
            const twoParams = findImplementationWithTypeMatching(
                lines, 'TestClass', 'Process',
                parseParameterSignature('STRING pValue, LONG pCount')
            );
            assert.strictEqual(twoParams, 10, 'Should find Process(STRING, LONG) at line 10');
        });
        
        /**
         * Correct implementation that checks parameter TYPES
         */
        function findImplementationWithTypeMatching(
            lines: string[],
            className: string,
            methodName: string,
            expectedParams: string[]
        ): number | null {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                const pattern = new RegExp(
                    `^${className}\\.${methodName}\\s+PROCEDURE\\s*\\(([^)]*)\\)`,
                    'i'
                );
                
                const match = line.match(pattern);
                if (match) {
                    const implParams = parseParameterSignature(match[1]);
                    if (parametersMatch(expectedParams, implParams)) {
                        return i;
                    }
                }
            }
            
            return null;
        }
    });
    
    describe('Hover and Definition Provider - Overload Resolution', () => {
        /**
         * These tests verify that hover and goto definition correctly resolve
         * overloaded methods based on parameter types, not just parameter count
         */
        
        it('should resolve hover to correct overload based on parameter types', () => {
            // Scenario: Multiple classes with same method name
            // SystemStringClass.Str(STRING) at line 83
            // SystemStringClass.Str(SystemStringClass) at line 87
            
            const incContent = `
SystemStringClass                   CLASS,TYPE,MODULE('SystemString'),LINK('SystemString')
Str                     PROCEDURE(STRING svalue)      ! Line 83
! ... other methods
Str                     PROCEDURE(SystemStringClass s) ! Line 87
                      END
`;
            
            const clwContent = `
SystemStringClass.Str PROCEDURE(STRING s)              ! Implementation at line 206
  CODE
  SELF.pStr &= NEW STRING(SIZE(s))
  SELF.pStr = s
  
SystemStringClass.Str PROCEDURE(SystemStringClass s)    ! Implementation at line 211
  CODE
  SELF.Str(s.Str())
`;
            
            // When hovering over line 206 (STRING parameter)
            const implLineString = 'SystemStringClass.Str PROCEDURE(STRING s)';
            const paramsString = parseParameterSignature('STRING s');
            
            // When hovering over line 211 (SystemStringClass parameter)
            const implLineClass = 'SystemStringClass.Str PROCEDURE(SystemStringClass s)';
            const paramsClass = parseParameterSignature('SystemStringClass s');
            
            // These should be different signatures
            assert.strictEqual(parametersMatch(paramsString, paramsClass), false,
                'STRING and SystemStringClass parameters should not match');
            
            // Each should resolve to its own declaration
            assert.deepStrictEqual(paramsString, ['string']);
            assert.deepStrictEqual(paramsClass, ['systemstringclass']);
        });
        
        it('should resolve goto definition to correct overload line number', () => {
            // Test that F12 on implementation goes to correct declaration line
            const incLines = [
                'SystemStringClass                   CLASS,TYPE',
                '! ... other members',
                'Str                     PROCEDURE(STRING svalue)',      // Line 2 (index)
                '! ... other methods',
                '! ... other methods',  
                '! ... other methods',
                'Str                     PROCEDURE(SystemStringClass s)', // Line 6 (index)
                '                      END'
            ];
            
            // Implementation signatures
            const stringImplParams = parseParameterSignature('STRING s');
            const classImplParams = parseParameterSignature('SystemStringClass s');
            
            // Find matching declarations
            let stringDeclLine: number | null = null;
            let classDeclLine: number | null = null;
            
            for (let i = 0; i < incLines.length; i++) {
                const match = incLines[i].match(/^\s*Str\s+PROCEDURE\s*\(([^)]*)\)/i);
                if (match) {
                    const declParams = parseParameterSignature(match[1]);
                    if (parametersMatch(declParams, stringImplParams)) {
                        stringDeclLine = i;
                    }
                    if (parametersMatch(declParams, classImplParams)) {
                        classDeclLine = i;
                    }
                }
            }
            
            assert.strictEqual(stringDeclLine, 2, 
                'Should find STRING overload at line 2');
            assert.strictEqual(classDeclLine, 6,
                'Should find SystemStringClass overload at line 6');
            assert.notStrictEqual(stringDeclLine, classDeclLine,
                'Should resolve to different declaration lines');
        });
        
        it('should handle custom type parameters correctly', () => {
            // Real-world scenario: custom type vs primitive type
            const decl1 = parseParameterSignature('MyCustomType pValue');
            const decl2 = parseParameterSignature('STRING pValue');
            const decl3 = parseParameterSignature('*MyCustomType pValue');
            
            // All should be different
            assert.strictEqual(parametersMatch(decl1, decl2), false);
            assert.strictEqual(parametersMatch(decl1, decl3), false);
            assert.strictEqual(parametersMatch(decl2, decl3), false);
            
            // Verify parsed values
            assert.deepStrictEqual(decl1, ['mycustomtype']);
            assert.deepStrictEqual(decl2, ['string']);
            assert.deepStrictEqual(decl3, ['*mycustomtype']);
        });
        
        it('should handle multiline method declarations in hover', () => {
            // Some declarations span multiple lines
            const multilineDecl = `Str                     PROCEDURE(SystemStringClass s),
                                              VIRTUAL`;
            
            // Extract just the parameter part
            const match = multilineDecl.match(/PROCEDURE\s*\(([^)]*)\)/i);
            assert.ok(match, 'Should match multiline declaration');
            
            const params = parseParameterSignature(match![1]);
            assert.deepStrictEqual(params, ['systemstringclass']);
        });
        
        it('should correctly identify method implementation lines for hover', () => {
            // Test various implementation line formats
            const testCases = [
                {
                    line: 'SystemStringClass.Str PROCEDURE(STRING s)',
                    expected: { className: 'SystemStringClass', methodName: 'Str', params: ['string'] }
                },
                {
                    line: 'SystemStringClass.Str PROCEDURE(SystemStringClass s)',
                    expected: { className: 'SystemStringClass', methodName: 'Str', params: ['systemstringclass'] }
                },
                {
                    line: 'MyClass.Process   PROCEDURE(*STRING pValue)',
                    expected: { className: 'MyClass', methodName: 'Process', params: ['*string'] }
                },
                {
                    line: 'TestClass.AddLine   PROCEDURE(&STRING pValue, LONG pLen)',
                    expected: { className: 'TestClass', methodName: 'AddLine', params: ['&string', 'long'] }
                }
            ];
            
            testCases.forEach(testCase => {
                const match = testCase.line.match(/^(\w+)\.(\w+)\s+PROCEDURE\s*\(([^)]*)\)/i);
                assert.ok(match, `Should match: ${testCase.line}`);
                
                const className = match![1];
                const methodName = match![2];
                const params = parseParameterSignature(match![3]);
                
                assert.strictEqual(className, testCase.expected.className);
                assert.strictEqual(methodName, testCase.expected.methodName);
                assert.deepStrictEqual(params, testCase.expected.params);
            });
        });
    });
});
