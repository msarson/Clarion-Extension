/**
 * Shared utility for parsing and comparing procedure/method signatures
 * Used for overload resolution in both class methods and MAP procedures
 */

import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ProcedureSignatureUtils");

export class ProcedureSignatureUtils {
    /**
     * Extracts parameter types from a procedure/method signature
     * Returns array of normalized parameter types (e.g., ['STRING', '*STRING', 'LONG'])
     * Handles both traditional format (with PROCEDURE/FUNCTION keyword) and shorthand MAP format
     */
    public static extractParameterTypes(signature: string): string[] {
        // Try with PROCEDURE/FUNCTION keyword first
        let match = signature.match(/(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i);
        
        // If no match, try shorthand MAP format: ProcName(params) or ProcName(params),ReturnType
        if (!match) {
            match = signature.match(/^\s*\w+\s*\(([^)]*)\)/);
        }
        
        if (!match) return [];
        
        const paramList = match[1].trim();
        if (paramList === '') return [];
        
        // Split by commas at depth 0 (respecting nested parens and angle brackets)
        const params: string[] = [];
        let currentParam = '';
        let depth = 0;
        let angleDepth = 0;
        
        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];
            
            if (char === '(') {
                depth++;
                currentParam += char;
            } else if (char === ')') {
                depth--;
                currentParam += char;
            } else if (char === '<') {
                angleDepth++;
                currentParam += char;
            } else if (char === '>') {
                angleDepth--;
                currentParam += char;
            } else if (char === ',' && depth === 0 && angleDepth === 0) {
                params.push(currentParam.trim());
                currentParam = '';
            } else {
                currentParam += char;
            }
        }
        
        if (currentParam.trim()) {
            params.push(currentParam.trim());
        }
        
        // Extract just the type from each parameter (remove variable names and defaults)
        return params.map(param => this.extractParameterType(param));
    }
    
    /**
     * Extracts the type from a single parameter string
     * Examples:
     *   "STRING s" -> "STRING"
     *   "*STRING pStr" -> "*STRING"
     *   "<LONG lOpt>" -> "LONG"
     *   "LONG lVal=0" -> "LONG"
     *   "&STRING sRef" -> "&STRING"
     */
    private static extractParameterType(param: string): string {
        // Remove angle brackets for omittable parameters
        let normalized = param.replace(/^<\s*/, '').replace(/\s*>$/, '');
        
        // Remove default values (=something)
        normalized = normalized.replace(/\s*=.+$/, '');
        
        // Extract type - everything before the last word (which is the variable name)
        // Handle special cases like *STRING, &STRING, etc.
        const words = normalized.trim().split(/\s+/);
        
        if (words.length === 0) return '';
        if (words.length === 1) return words[0].toUpperCase();
        
        // If last word is a valid type, it's the type (no variable name given)
        // Otherwise, everything except last word is the type
        const lastWord = words[words.length - 1];
        
        // Check if last word looks like a variable name (starts with letter, has mixed case or lowercase)
        if (lastWord.match(/^[a-z]/i) && (lastWord !== lastWord.toUpperCase() || lastWord.length > 1)) {
            // Last word is likely variable name, rest is type
            return words.slice(0, -1).join(' ').toUpperCase();
        }
        
        // All words are the type
        return words.join(' ').toUpperCase();
    }
    
    /**
     * Compares two parameter type arrays to see if they match
     * Handles reference indicators like *, &, etc.
     */
    public static parametersMatch(implParams: string[], declParams: string[]): boolean {
        if (implParams.length !== declParams.length) {
            return false;
        }
        
        for (let i = 0; i < implParams.length; i++) {
            const implType = implParams[i];
            const declType = declParams[i];
            
            // Normalize for comparison (remove extra spaces)
            const normalizedImpl = implType.replace(/\s+/g, ' ').trim();
            const normalizedDecl = declType.replace(/\s+/g, ' ').trim();
            
            if (normalizedImpl !== normalizedDecl) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Counts parameters in a procedure/method signature
     * Handles omittable parameters like <LONG SomeVar> and default values LONG SomeVar=1
     * Handles both traditional format (with PROCEDURE/FUNCTION keyword) and shorthand MAP format
     */
    public static countParameters(signature: string): number {
        // Try with PROCEDURE/FUNCTION keyword first
        let match = signature.match(/(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i);
        
        // If no match, try shorthand MAP format: ProcName(params) or ProcName(params),ReturnType
        if (!match) {
            match = signature.match(/^\s*\w+\s*\(([^)]*)\)/);
        }
        
        if (!match) return 0;
        
        const paramList = match[1].trim();
        if (paramList === '') return 0;
        
        // Count commas at depth 0 (respecting nested parens and angle brackets)
        let count = 1; // Start at 1 if there's any content
        let depth = 0;
        let angleDepth = 0;
        
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
                count++;
            }
        }
        
        return count;
    }
}
