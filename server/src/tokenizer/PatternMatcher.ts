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
                // #485: Label FIRST. It is guarded to column 0, and its regex refuses the
                // reserved words (OMIT/COMPILE/PROGRAM/MEMBER/END/CODE/DATA…) unless a ':' or
                // word character follows — so `OMIT('x')` still tokenises as a Directive
                // while `Omit:pXPos EQUATE(4)` (ABUserControl.CLW) is the one Label it is,
                // not Directive "Omit" + ":" + "pXPos". A column-0 word is a label by
                // language rule; the Structure path already defers to that at column 0.
                TokenType.Label,
                TokenType.Directive, TokenType.EndStatement, TokenType.Structure, TokenType.Keyword,
                TokenType.ClarionDocument, TokenType.ExecutionMarker,
                TokenType.ConditionalContinuation, TokenType.WindowElement,
                TokenType.Type, TokenType.TypeAnnotation, // MUST be before Function to avoid STRING(50) as function
                TokenType.TypeReference, TokenType.Attribute, TokenType.Function, TokenType.PropertyFunction, // #546: FunctionArgumentParameter no longer tried — Function accepts a space before the paren
                TokenType.Property, TokenType.StructurePrefix, TokenType.StructureField, TokenType.Class,
                TokenType.Constant,
                TokenType.ImplicitVariable, TokenType.Variable, TokenType.Unknown
            ],
            'lower': [ // Lowercase letter - identifiers, keywords (case-insensitive)
                // #485: Label FIRST, as in the 'upper' group (see there). With Keyword tried
                // first, a column-0 label whose first word is a statement keyword —
                // `return:xml Equate(2)` in NetTalk's NetWeb.inc — tokenised as Keyword
                // "return" + ":" + "xml", while `Return:xml` did not.
                TokenType.Label,
                TokenType.Directive, TokenType.ClarionDocument,
                TokenType.ExecutionMarker, TokenType.ConditionalContinuation, TokenType.Structure, TokenType.Keyword,
                // EndStatement is in 'upper' and belongs here too. Without it, a lowercase `end`
                // at column 0 had no pattern that accepts it and lost its leading 'e' to the
                // single-char fallback advance, tokenising as Variable 'nd'. It only appeared to
                // work when indented, because the (absent) 'whitespace' class fell back to all
                // patterns and matched EndStatement's /^\s*(END)\b/ at the preceding space.
                TokenType.EndStatement,
                TokenType.Type, TokenType.TypeAnnotation, // MUST be before Function
                TokenType.TypeReference, TokenType.Attribute, TokenType.Function, TokenType.PropertyFunction, // #546: FunctionArgumentParameter no longer tried — Function accepts a space before the paren
                TokenType.Property, TokenType.StructurePrefix, TokenType.StructureField, TokenType.Class,
                TokenType.Constant,
                TokenType.ImplicitVariable, TokenType.Variable, TokenType.Unknown
            ],
            'underscore': [ // Underscore - identifiers only
                TokenType.Label, TokenType.ReferenceVariable, TokenType.Variable, 
                TokenType.StructurePrefix, TokenType.StructureField, TokenType.Unknown
            ],
            // getCharClass returns 'whitespace' for ' ' and '\t'. With no entry here the lookup
            // returned undefined and fell back to all ~33 patterns — and since whitespace is ~33%
            // of a Clarion source file and is never skipped (the loop advances one char at a time
            // when nothing matches), that accounted for 92.5% of every regex exec the lexer ran.
            // Nothing needs to match AT a whitespace position: LineContinuation re-matches at the
            // '|' itself, and MODULE /^\s*MODULE/ and TOOLBAR /^[ \t]*TOOLBAR/ re-match at the
            // keyword through their zero-width \s*.
            'whitespace': [],
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
