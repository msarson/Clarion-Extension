/**
 * Centralized Clarion Language Regex Patterns
 * 
 * This module provides consistent regex patterns used throughout the extension
 * for parsing Clarion source code. Centralizing these patterns ensures:
 * - Consistency across all providers
 * - Easier maintenance and bug fixes
 * - Single source of truth for Clarion syntax patterns
 */

/**
 * Regex patterns for Clarion language constructs
 */
export class ClarionPatterns {
    
    // ===================================================================
    // METHOD AND PROCEDURE PATTERNS
    // ===================================================================
    
    /**
     * Matches a method implementation line: ClassName.MethodName PROCEDURE
     * Supports both with and without parentheses:
     * - ThisWindow.Ask PROCEDURE
     * - ThisWindow.Ask PROCEDURE()
     * - ThisWindow.Ask PROCEDURE(LONG x, STRING y)
     * 
     * Capture groups:
     * [1] = Class name
     * [2] = Method name
     * [3] = Parameter list (undefined if no parens, empty string if ())
     * 
     * Examples:
     * - "ThisWindow.Ask PROCEDURE" → ["ThisWindow", "Ask", undefined]
     * - "ThisWindow.Ask PROCEDURE()" → ["ThisWindow", "Ask", ""]
     * - "ThisWindow.Ask PROCEDURE(LONG x)" → ["ThisWindow", "Ask", "LONG x"]
     */
    public static readonly METHOD_IMPLEMENTATION = /^\s*(\w+)\.(\w+)\s+(?:PROCEDURE|FUNCTION)\s*(?:\(([^)]*)\))?/i;
    
    /**
     * Matches a method implementation line (strict - must be at start of line)
     * Same as METHOD_IMPLEMENTATION but enforces no leading whitespace
     */
    public static readonly METHOD_IMPLEMENTATION_STRICT = /^(\w+)\.(\w+)\s+(?:PROCEDURE|FUNCTION)\s*(?:\(([^)]*)\))?/i;
    
    /**
     * Matches a method implementation line (legacy - requires parentheses)
     * This pattern is deprecated - use METHOD_IMPLEMENTATION instead
     * @deprecated Use METHOD_IMPLEMENTATION which supports optional parens
     */
    public static readonly METHOD_IMPLEMENTATION_LEGACY = /^(\w+)\.(\w+)\s+PROCEDURE\s*\((.*?)\)/i;
    
    /**
     * Tests if a line is a method implementation
     * Works with both PROCEDURE and FUNCTION
     */
    public static readonly IS_METHOD_IMPLEMENTATION = /^\s*\w+\.\w+\s+(PROCEDURE|FUNCTION)/i;
    
    /**
     * Matches a procedure declaration in a MAP block
     * Handles both formats:
     * - MyProc(params)              [indented, no PROCEDURE keyword]
     * - MyProc    PROCEDURE(params) [column 0, with PROCEDURE keyword]
     * 
     * Capture groups:
     * [1] = Procedure name
     */
    public static readonly MAP_PROCEDURE_DECLARATION = /^\s*(\w+)\s*(?:PROCEDURE\s*)?\(/i;
    
    /**
     * Matches a standalone procedure implementation
     * MyProc PROCEDURE(params) at start of line
     * 
     * Capture groups:
     * [1] = Leading whitespace
     * [2] = Procedure name
     * [3] = Keyword (PROCEDURE or FUNCTION)
     */
    public static readonly PROCEDURE_IMPLEMENTATION = /^(\s*)(\w+)\s+(PROCEDURE|FUNCTION)/i;
    
    /**
     * Matches a standalone procedure/function implementation with parentheses
     * Used for detecting procedure implementations that need to show MAP declarations
     * 
     * Capture groups:
     * [1] = Procedure name
     */
    public static readonly PROCEDURE_IMPLEMENTATION_WITH_PARAMS = /^(\w+)\s+(?:PROCEDURE|FUNCTION)\s*\(/i;
    
    /**
     * Matches any PROCEDURE or FUNCTION declaration (method, standalone, or routine)
     * Supports optional parentheses for zero-parameter procedures
     */
    public static readonly PROCEDURE_OR_FUNCTION = /^\w+\s+(PROCEDURE|ROUTINE|FUNCTION)/i;
    
    /**
     * Tests if a line contains PROCEDURE, ROUTINE, or FUNCTION keyword
     */
    public static readonly HAS_PROCEDURE_KEYWORD = /^(\w+\.)?(\w+)\s+(PROCEDURE|ROUTINE|FUNCTION)\b/i;
    
    /**
     * Matches a PROCEDURE or FUNCTION declaration with parentheses (for parameter counting)
     * Capture groups:
     * [1] = Parameter list
     */
    public static readonly PROCEDURE_WITH_PARAMS = /(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i;
    
    // ===================================================================
    // CLASS PATTERNS
    // ===================================================================
    
    /**
     * Matches a CLASS declaration
     * MyClass CLASS(BaseClass)
     * MyClass CLASS,MODULE('file.clw')
     */
    public static readonly CLASS_DECLARATION = /^(\w+)\s+CLASS/i;
    
    // ===================================================================
    // HELPER METHODS
    // ===================================================================
    
    /**
     * Checks if a line is a method implementation
     */
    public static isMethodImplementation(line: string): boolean {
        return this.IS_METHOD_IMPLEMENTATION.test(line);
    }
    
    /**
     * Checks if a line is a standalone procedure/function
     */
    public static isProcedureOrFunction(line: string): boolean {
        return this.PROCEDURE_OR_FUNCTION.test(line);
    }
    
    /**
     * Parses a method implementation line
     * Returns null if not a valid method implementation
     */
    public static parseMethodImplementation(line: string): {
        className: string;
        methodName: string;
        paramList: string | undefined;
    } | null {
        const match = line.match(this.METHOD_IMPLEMENTATION);
        if (!match) return null;
        
        return {
            className: match[1],
            methodName: match[2],
            paramList: match[3]
        };
    }
    
    /**
     * Counts parameters in a procedure declaration
     * Handles nested parentheses and omittable parameters <LONG x>
     */
    public static countParameters(line: string): number {
        const match = line.match(this.PROCEDURE_WITH_PARAMS);
        if (!match) return 0;
        
        const paramList = match[1].trim();
        if (paramList === '') return 0;
        
        // Count commas at depth 0, accounting for nested parentheses
        let depth = 0;
        let commaCount = 0;
        let angleDepth = 0; // For omittable parameters <LONG Var>
        
        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];
            
            if (char === '(') {
                depth++;
            } else if (char === ')') {
                depth--;
            } else if (char === '<') {
                angleDepth++;
            } else if (char === '>') {
                angleDepth--;
            } else if (char === ',' && depth === 0 && angleDepth === 0) {
                commaCount++;
            }
        }
        
        return commaCount + 1;
    }
}
