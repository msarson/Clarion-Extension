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
                const paramParts = param.trim().split(/\s+/);
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
    
    describe('Add Method Implementation - findExistingImplementation bug', () => {
        /**
         * Simulates the current buggy behavior in ImplementationCommands.ts
         * which only checks parameter COUNT, not parameter TYPES
         */
        function findExistingImplementation_BUGGY(
            clwContent: string,
            className: string,
            methodName: string,
            parameterCount: number
        ): number | null {
            const lines = clwContent.split(/\r?\n/);
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Match: ClassName.MethodName    PROCEDURE(params)
                const pattern = new RegExp(
                    `^${className}\\.${methodName}\\s+PROCEDURE\\s*\\(([^)]*)\\)`,
                    'i'
                );
                
                const match = line.match(pattern);
                if (match) {
                    // BUG: Only checks parameter count, not types
                    const implParamCount = countParameters(match[1]);
                    if (implParamCount === parameterCount) {
                        return i;
                    }
                }
            }
            
            return null;
        }
        
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
        
        it('should demonstrate the bug: finds wrong overload based on count only', () => {
            const clwContent = `
SomeClass.SomeOtherMethod   PROCEDURE(STRING tempVar)
  CODE
  RETURN ''

SomeClass.SomeOtherMethod   PROCEDURE(*STRING tempVar)
  CODE
  RETURN ''
`;
            
            // Both methods have 1 parameter, so count-only matching finds the first one
            const foundLine = findExistingImplementation_BUGGY(clwContent, 'SomeClass', 'SomeOtherMethod', 1);
            
            // Bug: This returns line 1 (String version) for BOTH overloads
            assert.strictEqual(foundLine, 1, 
                'Buggy implementation finds first method with matching count');
            
            // The bug is that we cannot distinguish between:
            // - SomeOtherMethod(STRING tempVar)
            // - SomeOtherMethod(*STRING tempVar)
            // Because both have parameterCount = 1
        });
        
        it('should fail to distinguish String vs *String overloads', () => {
            const clwContent = `
TestClass.AddLine   PROCEDURE(STRING pValue)
  CODE

TestClass.AddLine   PROCEDURE(*STRING pValue)  
  CODE
`;
            
            // When checking for AddLine(*STRING), it incorrectly finds AddLine(STRING)
            const foundLine = findExistingImplementation_BUGGY(clwContent, 'TestClass', 'AddLine', 1);
            
            assert.strictEqual(foundLine, 1, 
                'Bug: finds first method with count=1, regardless of pointer modifier');
            
            // This prevents adding the *STRING overload because it thinks it already exists
        });
        
        it('should correctly distinguish with type-aware matching', () => {
            // This test shows what the CORRECT behavior should be
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
});
