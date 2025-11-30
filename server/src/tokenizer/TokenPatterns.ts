/**
 * Pattern definitions for Clarion language tokens
 */

import { TokenType } from './TokenTypes';

export const STRUCTURE_PATTERNS: Record<string, RegExp> = {
    MODULE: /^\s*MODULE\b/i,  // MODULE should be the first word on the line
    APPLICATION: /\bAPPLICATION\b(?=\s*(\(|,))/i,
    CASE: /\bCASE\b/i,
    CLASS: /\bCLASS\b/i,
    GROUP: /\bGROUP\b/i,
    FILE: /\sFILE\b/i,
    INTERFACE: /\bINTERFACE\b/i,
    IF: /\bIF\b/i,  // ✅ Re-added "IF" as a structure
    JOIN: /\bJOIN\b/i,
    LOOP: /\bLOOP\b/i,
    MAP: /\bMAP\b/i,
    MENU: /\bMENU\b(?=\s*(\(|,))/i,
    MENUBAR: /\bMENUBAR\b/i,
    //QUEUE: /\bQUEUE(?![:\(])\b/i,  // Prevents detecting Queue:Browse as a structure
    QUEUE: /\s+\bQUEUE\b(?!:)/i,

    // RECORD: /^\s*(\w+)\s+(RECORD)\b/i,
    RECORD: /\bRECORD\b/i,
    REPORT: /\bREPORT\b/i,
    SECTION: /\bSECTION\b/i,
    SHEET: /\bSHEET\b/i,
    TAB: /\bTAB\b/i,
    TOOLBAR: /^[ \t]*TOOLBAR\b(?=\s*(\(|,))/i,  // Only match TOOLBAR at beginning of line followed by ( or ,
    VIEW: /\sVIEW\b/i,
    WINDOW: /\bWINDOW\b(?=\s*(\(|,))/i,
    OPTION: /\bOPTION\b/i,
    ITEMIZE: /\bITEMIZE\b/i,
    EXECUTE: /\bEXECUTE\b/i,
    BEGIN: /\bBEGIN\b/i,  // ✅ Re-added
    FORM: /\bFORM\b/i,  // ✅ Re-added
    DETAIL: /\bDETAIL\b/i,  // ✅ Re-added
    HEADER: /\bHEADER\b/i,  // ✅ Re-added
    FOOTER: /\bFOOTER\b/i,  // ✅ Re-added
    BREAK: /\bBREAK\b/i,  // ✅ Re-added
    ACCEPT: /\bACCEPT\b/i,  // ✅ Re-added
    OLE: /\bOLE\b/i
};

/** ✅ Token Patterns */
export const tokenPatterns: Partial<Record<TokenType, RegExp>> = {
    [TokenType.Comment]: /!.*/i,
    [TokenType.LineContinuation]: /&?\s*\|.*/i,
    [TokenType.String]: /'([^']|'')*'/i,
    [TokenType.EndStatement]: /^\s*(END)\b|^\s*(\.)(?=\s|!|$)|(\.)(?=\s|!|$)/i,  // END keyword or dot terminator (not capturing trailing content)
    [TokenType.FunctionArgumentParameter]: /\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/i,  // Captures anything inside ()
    [TokenType.PointerParameter]: /\*\s*\b[A-Za-z_][A-Za-z0-9_]*\b/i,
    [TokenType.FieldEquateLabel]: /\?[A-Za-z_][A-Za-z0-9_]*/i,
    [TokenType.ClarionDocument]: /\b(?:PROGRAM|MEMBER)\b/i,
    [TokenType.ConditionalContinuation]: /\b(?:ELSE|ELSIF|OF)\b/i,  // ✅ New type for ELSE and ELSIF
    [TokenType.Keyword]: /\b(?:RETURN|THEN|UNTIL|WHILE|EXIT|NEW|PROCEDURE|ROUTINE|PROC|BREAK|KEY)\b/i, // Added KEY to keywords
    [TokenType.PictureFormat]: /(@N[^\s,]*|@[Ee][^\s,]*|@S\d+|@D\d{1,2}[.\-_'`<>]?\d{0,2}B?|@T\d{1,2}[.\-_'`]?[B]?|@[Pp][^Pp\n]+[Pp]B?|@[Kk][^Kk\n]+[Kk]B?)/i,
    [TokenType.ExecutionMarker]: /\b(?:CODE|DATA)\b/i,
    [TokenType.Type]: /\b(?:BYTE|SHORT|USHORT|LONG|ULONG|REAL|SREAL|DECIMAL|PDECIMAL|STRING|CSTRING|PSTRING|DATE|TIME|ASTRING|ANY|BSTRING|MEMO|NAME|SIGNED|UNSIGNED)(?=\(|\s|$)/i,
    [TokenType.TypeAnnotation]: /:\s*(?:byte|short|ushort|long|ulong|real|sreal|decimal|pdecimal|string|cstring|pstring|date|time)\b/i,
    [TokenType.Directive]: /\b(?:COMPILE|EMBED|SECTION|ENDSECTION)\b/i,
    [TokenType.Structure]: new RegExp(Object.values(STRUCTURE_PATTERNS).map(p => p.source).join('|'), 'i'),
    [TokenType.WindowElement]: /\b(?:BUTTON|ENTRY|TEXT|LIST|COMBO|CHECK|RADIO|OPTION|SHEET|TAB|IMAGE|LINE|BOX|ELLIPSE|PANEL|PROGRESS|REGION|PROMPT|SPIN|ITEM|GROUP)\b|STRING\s*\(@[^)]*\)/i,
    [TokenType.Attribute]: /\b(?:ALONE|AUTO|BINARY|BINDABLE|CENTERED|CREATE|CURSOR|DEFAULT|DLL|DOUBLE|DROP|DRIVER|DUP|EXTERNAL|FILL|FILTER|FIRST|FLAT|HLP|ICON|IMM|INS|MASK|MAX|MDI|MODAL|MSG|NAME|NOBAR|NOCASE|NOFRAME|NOMERGE|NOSHEET|OEM|OVER|OVR|OWNER|PAGE|PASCAL|PRE|PRIMARY|PRIVATE|PROTECTED|RAW|RECLAIM|REQ|RESIZE|RIGHT|SCROLL|STATUS|STATIC|STD|SYSTEM|THREAD|TIMER|TIP|TIMES|TRN|UPR|USE|VBX|VCR|WALLPAPER|REF)\b/i,
    [TokenType.Constant]: /\b(?:TRUE|FALSE|NULL|LEVEL:BENIGN|LEVEL:NOTIFY|LEVEL:FATAL|ICON:Asterisk|ICON:Exclamation|ICON:Hand|ICON:Question|BUTTON:YES|BUTTON:NO|BUTTON:OK|BUTTON:CANCEL|CENTER|LEFT|RIGHT)\b/i,
    [TokenType.Property]: /\b(?:color|width|height|top|left|right|bottom|text|visible|enabled|font|size|style|value|caption)\b/i,
    [TokenType.Number]: /\b[0-9]+(\.[0-9]+)?\b/i,
    [TokenType.Operator]: /[\+\-\*\/\=\>\<\&\|\~]/,
    [TokenType.Delimiter]: /[\(\)\[\]\{\}\,\:\;]/,
    [TokenType.Label]: /^[A-Za-z_][A-Za-z0-9_:]*/,  // Starts at column 0, can include colons
    [TokenType.Variable]: /\b[A-Za-z_][A-Za-z0-9_]*\b/i,
    [TokenType.ImplicitVariable]: /\b[A-Za-z_][A-Za-z0-9_]*[$#"]/i,  // ✅ Variables ending with implicit type suffixes
    [TokenType.Function]: /\b[A-Za-z_][A-Za-z0-9_]*(?=\()/i,
    [TokenType.ReferenceVariable]: /&\s*[A-Za-z_][A-Za-z0-9_]*/i,
    [TokenType.PropertyFunction]: /\b(?:GET|SET)\s*\(/i,
    [TokenType.Class]: /\b[A-Z][A-Za-z0-9_]*(?=\.)/,  // Matches capitalized names before a dot (e.g., ThisWindow.)
    // ✅ Add StructurePrefix pattern for PREFIX:Field notation
    [TokenType.StructurePrefix]: /\b[A-Z][A-Z0-9_]{0,7}\s*:\s*[A-Za-z_][A-Za-z0-9_]*/i,
    // ✅ Add StructureField pattern for Structure.Field notation
    [TokenType.StructureField]: /\b[A-Z][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/i,
    // ✅ DataTypeParameter: captures (255) in STRING(255) or (20,2) in DECIMAL(20,2)
    [TokenType.DataTypeParameter]: /\(\s*\d+\s*(?:,\s*\d+\s*)?\)/,
};

/** ✅ Ordered token types for pattern matching priority */
export const orderedTokenTypes: TokenType[] = [
    TokenType.Directive,TokenType.Comment, TokenType.ClarionDocument, TokenType.ExecutionMarker, TokenType.Label, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
    TokenType.Type, TokenType.PointerParameter, TokenType.FieldEquateLabel, TokenType.Property,
    TokenType.PropertyFunction, TokenType.Keyword, TokenType.Structure,
    // ✅ Add StructurePrefix and StructureField before other variable types
    TokenType.StructurePrefix, TokenType.StructureField,
    // ✅ Add WindowElement after Structure elements but before other types
    TokenType.WindowElement,
    TokenType.ConditionalContinuation, TokenType.Function,  // ✅ Placed after Structure, before FunctionArgumentParameter
    TokenType.FunctionArgumentParameter, TokenType.TypeAnnotation, TokenType.PictureFormat, TokenType.Number,
    TokenType.EndStatement,  // ✅ MOVED AFTER Number to avoid matching dots in decimals
    TokenType.Operator, TokenType.Class, TokenType.Attribute, TokenType.Constant, TokenType.Variable,
    TokenType.ImplicitVariable, TokenType.Delimiter, TokenType.Unknown
];
