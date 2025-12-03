import { tokenPatterns } from '../tokenizer/TokenPatterns';
import { TokenType } from '../tokenizer/TokenTypes';

/**
 * Extract attribute keywords from the tokenizer's attribute pattern
 */
export function getAttributeKeywords(): string[] {
    const pattern = tokenPatterns[TokenType.Attribute];
    if (!pattern) return [];
    
    // Extract the pattern source and parse out the keywords
    const source = pattern.source;
    // Pattern is: \b(?:KEYWORD1|KEYWORD2|...)\b
    const match = source.match(/\(\?:([^)]+)\)/);
    if (!match) return [];
    
    // Split by | and convert to uppercase
    return match[1].split('|').map((kw: string) => kw.toUpperCase());
}

/**
 * Additional attribute-like keywords not in the main pattern but used in specific contexts
 */
const ADDITIONAL_ATTRIBUTES = [
    'DIM',      // Array dimensions
    'EQUATE',   // Constant definition
    'LIKE',     // Type mirroring
    'ONCE',     // Execute once modifier
    'VIRTUAL',  // Virtual method
    'DERIVED',  // Derived method
    'PUBLIC',   // Access modifier (if not already in pattern)
    'C',        // C calling convention
    'PROC',     // Procedure attribute
    'MODULE',   // Module declaration (used in MAP declarations)
];

/**
 * Check if a value is an attribute keyword
 */
export function isAttributeKeyword(value: string): boolean {
    const upper = value.toUpperCase();
    const tokenAttributes = getAttributeKeywords();
    return tokenAttributes.includes(upper) || ADDITIONAL_ATTRIBUTES.includes(upper);
}

/**
 * Get data type keywords from the tokenizer's Type pattern
 */
export function getDataTypeKeywords(): string[] {
    const pattern = tokenPatterns[TokenType.Type];
    if (!pattern) return [];
    
    // Extract the pattern source and parse out the keywords
    const source = pattern.source;
    // Pattern is: \b(?:TYPE1|TYPE2|...)\b
    const match = source.match(/\(\?:([^)]+)\)/);
    if (!match) return [];
    
    // Split by | and convert to uppercase
    return match[1].split('|').map((kw: string) => kw.toUpperCase());
}

/**
 * Check if a value is a data type keyword
 */
export function isDataType(value: string): boolean {
    const upper = value.toUpperCase();
    const dataTypes = getDataTypeKeywords();
    return dataTypes.includes(upper);
}

/**
 * Notes on special keywords:
 * 
 * SIZE - This is a function but can be used in data declarations like:
 *   SavRec STRING(1),DIM(SIZE(Cus:Record))
 * It should be handled as a function call, not an attribute.
 * 
 * SIGNED/UNSIGNED - These are data type modifiers that appear in the Type pattern.
 * They can modify other types like BYTE,UNSIGNED or appear as return types.
 * They appear in the tokenizer as TokenType.Type.
 * 
 * Return Type Detection:
 * In procedure declarations, the return type can appear anywhere in the attribute list:
 *   TestProc1 PROCEDURE(),PROC,LONG,NAME('TestProc1')
 *   TestProc2 PROCEDURE(),NAME('TestProc2'),PROC,LONG
 *   TestProc3 PROCEDURE(),LONG,NAME('TestProc3')
 * Use isDataType() to identify return types among the attributes.
 */
