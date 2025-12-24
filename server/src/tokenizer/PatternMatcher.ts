/**
 * Pattern matching and initialization for tokenization
 */

import { TokenType } from './TokenTypes';
import { tokenPatterns, STRUCTURE_PATTERNS, orderedTokenTypes } from './TokenPatterns';

export class PatternMatcher {
    private static compiledPatterns: Map<TokenType, RegExp> | null = null;
    private static orderedTypes: TokenType[] | null = null;
    private static patternsByCharClass: Map<string, TokenType[]> | null = null;

    /**
     * Initialize patterns (called once at startup)
     */
    public static initializePatterns(): void {
        if (PatternMatcher.compiledPatterns) {
            return; // Already initialized
        }

        PatternMatcher.compiledPatterns = new Map();
        PatternMatcher.patternsByCharClass = new Map();
        
        // 🚀 PERFORMANCE: Use the exported orderedTokenTypes from TokenPatterns
        // This ensures consistency between pattern order definitions
        PatternMatcher.orderedTypes = orderedTokenTypes;
        
        for (const type of PatternMatcher.orderedTypes) {
            const pattern = tokenPatterns[type];
            if (pattern) {
                PatternMatcher.compiledPatterns.set(type, pattern);
            }
        }
        
        // 🚀 PERFORMANCE: Build pattern groups by character class
        // This allows us to skip entire groups of patterns based on first character
        const charClassGroups: Record<string, TokenType[]> = {
            'comment': [TokenType.Comment],
            'string': [TokenType.String],
            'question': [TokenType.FieldEquateLabel],
            'at': [TokenType.PictureFormat],
            'pipe': [TokenType.LineContinuation],
            'ampersand': [TokenType.ReferenceVariable, TokenType.LineContinuation],
            'star': [TokenType.PointerParameter],
            'digit': [TokenType.Number],
            'operator': [TokenType.Operator],
            'delimiter': [TokenType.Delimiter, TokenType.DataTypeParameter, TokenType.EndStatement],
            'upper': [ // Uppercase letter - identifiers, keywords, structures
                TokenType.Directive, TokenType.Label, TokenType.Keyword,
                TokenType.ClarionDocument, TokenType.ExecutionMarker, TokenType.EndStatement,
                TokenType.ConditionalContinuation, TokenType.Structure, TokenType.WindowElement,
                TokenType.Type, TokenType.TypeAnnotation, // MUST be before Function to avoid STRING(50) as function
                TokenType.Function, TokenType.FunctionArgumentParameter, TokenType.PropertyFunction,
                TokenType.Property, TokenType.StructurePrefix, TokenType.StructureField, TokenType.Class,
                TokenType.Attribute, TokenType.Constant,
                TokenType.ImplicitVariable, TokenType.Variable, TokenType.Unknown
            ],
            'lower': [ // Lowercase letter - identifiers, keywords (case-insensitive)
                TokenType.Keyword, TokenType.Directive, TokenType.ClarionDocument,
                TokenType.ExecutionMarker, TokenType.ConditionalContinuation, TokenType.Structure,
                TokenType.Type, TokenType.TypeAnnotation, // MUST be before Function
                TokenType.Function, TokenType.FunctionArgumentParameter, TokenType.PropertyFunction,
                TokenType.Property, TokenType.StructurePrefix, TokenType.StructureField, TokenType.Class,
                TokenType.Attribute, TokenType.Constant,
                TokenType.ImplicitVariable, TokenType.Variable, TokenType.Unknown
            ],
            'underscore': [ // Underscore - identifiers only
                TokenType.Label, TokenType.ReferenceVariable, TokenType.Variable, 
                TokenType.StructurePrefix, TokenType.StructureField, TokenType.Unknown
            ],
            'other': [ // Fallback - test all patterns
                ...PatternMatcher.orderedTypes
            ]
        };
        
        for (const [charClass, types] of Object.entries(charClassGroups)) {
            PatternMatcher.patternsByCharClass.set(charClass, types);
        }
    }

    /**
     * Get compiled patterns map
     */
    public static getCompiledPatterns(): Map<TokenType, RegExp> {
        if (!PatternMatcher.compiledPatterns) {
            PatternMatcher.initializePatterns();
        }
        return PatternMatcher.compiledPatterns!;
    }

    /**
     * Get ordered token types for matching
     */
    public static getOrderedTypes(): TokenType[] {
        if (!PatternMatcher.orderedTypes) {
            PatternMatcher.initializePatterns();
        }
        return PatternMatcher.orderedTypes!;
    }

    /**
     * Get patterns by character class for optimization
     */
    public static getPatternsByCharClass(): Map<string, TokenType[]> {
        if (!PatternMatcher.patternsByCharClass) {
            PatternMatcher.initializePatterns();
        }
        return PatternMatcher.patternsByCharClass!;
    }

    /**
     * Classify character for fast pattern filtering
     */
    public static getCharClass(char: string): string {
        if (char >= 'A' && char <= 'Z') return 'upper';
        if (char >= 'a' && char <= 'z') return 'lower';
        if (char === '_') return 'underscore';
        if (char >= '0' && char <= '9') return 'digit';
        if (char === '!') return 'comment';
        if (char === "'") return 'string';
        if (char === '&') return 'ampersand';
        if (char === '@') return 'at';
        if (char === '?') return 'question';
        if (char === '|') return 'pipe';
        if (char === '*') return 'star';
        if ('+-*/=<>'.indexOf(char) >= 0) return 'operator';
        if ('(),:.'.indexOf(char) >= 0) return 'delimiter';
        if (char === ' ' || char === '\t') return 'whitespace';
        return 'other';
    }
}
