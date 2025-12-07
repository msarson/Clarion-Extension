/**
 * Pattern matching and initialization for tokenization
 */

import { TokenType } from './TokenTypes';
import { tokenPatterns, STRUCTURE_PATTERNS } from './TokenPatterns';

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
        
        // 🚀 PERFORMANCE: Optimized order balancing specificity and frequency
        // Critical: More specific patterns MUST come before more general ones
        // Also ordered by frequency within specificity groups
        PatternMatcher.orderedTypes = [
            // HIGH PRIORITY: Must match first due to specificity
            TokenType.Comment,              // Very common, must be early to skip comment content
            TokenType.LineContinuation,     // Must be early (can contain other tokens)
            TokenType.String,               // Must be before Variable (strings can contain variable-like text)
            
            // DIRECTIVES: Must be before Label (OMIT/COMPILE at column 0)
            TokenType.Directive,            // Specific keywords with special syntax (OMIT, COMPILE, etc.)
            
            // LABELS & SPECIAL: Must be before general identifiers
            TokenType.Label,                // Must be before Variable (labels are identifiers at column 0)
            TokenType.FieldEquateLabel,     // Must be before Variable (?FieldName)
            TokenType.ReferenceVariable,    // Must be before Variable (&Variable)
            
            // SPECIFIC IDENTIFIERS: Before general Variable
            TokenType.ClarionDocument,      // Rare but specific (PROGRAM/MEMBER)
            TokenType.ExecutionMarker,      // Specific (CODE/DATA)
            TokenType.EndStatement,         // Specific (END/.)
            TokenType.ConditionalContinuation, // Specific (ELSE/ELSIF/OF)
            TokenType.Keyword,              // Common, more specific than Variable
            
            // STRUCTURES: Before Variable but after keywords
            TokenType.Structure,            // Must be before Variable
            TokenType.WindowElement,        // Specific window controls
            
            // TYPES: Must be before Function to avoid STRING(50) being parsed as function call
            TokenType.Type,                 // Common, specific type keywords
            TokenType.DataTypeParameter,    // Must be after Type (captures (255) in STRING(255))
            TokenType.TypeAnnotation,       // Specific type annotations
            
            // FUNCTIONS & PROPERTIES: Specific patterns
            TokenType.Function,             // Must be before FunctionArgumentParameter
            TokenType.FunctionArgumentParameter, // Must be before Variable
            TokenType.PropertyFunction,     // Specific properties with parentheses
            TokenType.Property,             // Specific property names
            
            // FIELD REFERENCES: Before Variable
            TokenType.StructurePrefix,      // Must be before Variable (PREFIX:Field)
            TokenType.StructureField,       // Must be before Variable (Structure.Field)
            TokenType.Class,                // Must be before Variable (Class.Method)
            
            // COMPLEX PATTERNS: Before simple ones
            TokenType.PointerParameter,     // *Variable before Variable
            TokenType.PictureFormat,        // @... formats
            
            // SIMPLE TOKENS: Common, can be checked relatively early
            TokenType.Number,               // Very common
            TokenType.Operator,             // Very common
            TokenType.Delimiter,            // Very common
            
            // ATTRIBUTES & CONSTANTS: After types
            TokenType.Attribute,            // Specific attribute keywords
            TokenType.Constant,             // Specific constants (TRUE/FALSE/NULL)
            
            // GENERAL: Last specific check before catchall
            TokenType.ImplicitVariable,     // Variable with suffix ($/#/")
            TokenType.Variable,             // General identifier - must be late
            
            // CATCHALL: Absolute last resort
            TokenType.Unknown
        ];
        
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
