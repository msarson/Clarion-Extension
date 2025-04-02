import { start } from 'repl';
import { DocumentStructure } from './DocumentStructure';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("Tokenizer");
logger.setLevel("error");
export enum TokenType {
    Comment,
    String,
    Keyword,
    Directive,
    Function,
    Variable,
    Number,
    Operator,
    Class,
    Attribute,
    Property,
    Constant,
    Type,
    TypeAnnotation,
    ImplicitVariable,
    Structure,
    ReferenceVariable,
    LineContinuation,
    Delimiter,
    FunctionArgumentParameter,
    PointerParameter,
    FieldEquateLabel,
    PropertyFunction,
    Unknown,
    Label,
    EndStatement,
    ClarionDocument, // ✅ PROGRAM / MEMBER token type
    Procedure,
    Routine,
    ExecutionMarker,
    Region,
    ConditionalContinuation,
    ColorValue,
    StructureField,   // ✅ Field within a structure
    StructurePrefix,   // ✅ Prefix notation for structure fields (e.g., INV:Customer)
    // ✅ New Subtypes for PROCEDURE tokens
    GlobalProcedure,           // PROCEDURE declared at global level (with CODE)
    MethodDeclaration,         // PROCEDURE inside a CLASS/MAP/INTERFACE (definition only, no CODE)
    MethodImplementation,      // e.g., ThisWindow.Init PROCEDURE (with CODE)
    MapProcedure,              // Optional: inside MAP structure
    InterfaceMethod           // Optional: inside INTERFACE structure
}

export interface Token {
    label?: string; // ✅ Store label for the token
    colorParams?: string[];
    type: TokenType;
    subType?: TokenType;
    value: string;
    line: number;
    start: number;
    finishesAt?: number;
    parent?: Token;
    children?: Token[];
    executionMarker?: Token;  // ✅ First explicit "CODE" statement (if present)
    hasLocalData?: boolean;   // ✅ True if "DATA" exists before "CODE"
    inferredCode?: boolean;   // ✅ True if "CODE" is implied (not explicitly written)
    maxLabelLength: number;   // ✅ Store max label length
    structurePrefix?: string; // ✅ Store structure prefix (e.g., "INV" from PRE(INV))
    isStructureField?: boolean; // ✅ Flag to identify structure fields
    structureParent?: Token;  // ✅ Reference to the parent structure token
    nestedLabel?: string;     // ✅ Store the label of the nesting structure (e.g., "Queue:Browse:1" for fields inside it)
}



export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];
    private lines: string[];
    private tabSize: number;  // ✅ Store tabSize
    maxLabelWidth: number = 0;



    constructor(text: string, tabSize: number = 2) {  // ✅ Default to 2 if not provided
        this.text = text;
        this.tokens = [];
        this.lines = [];
        this.tabSize = tabSize;  // ✅ Store the provided or default value
    }


    /** ✅ Public method to tokenize text */
    public tokenize(): Token[] {
        
        logger.info("🔍 Starting tokenization...");
        this.lines = this.text.split(/\r?\n/);



        this.tokenizeLines(this.lines); // ✅ Step 1: Tokenize all lines
        this.processDocumentStructure(); // ✅ Step 2: Process relationships

        logger.info("🔍 Tokenization complete.");
        return this.tokens;
    }

    /** ✅ Step 1: Tokenize all lines */
    private tokenizeLines(lines: string[]): void {
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            if (line.trim() === "") continue; // ✅ Skip blank lines

            let position = 0;
            let expandedLine = this.expandTabs(line);
            let column = expandedLine.match(/^(\s*)/)?.[0].length || 0;

            while (position < line.length) {
                const substring = line.slice(position);
                let matched = false;

                for (const tokenType of orderedTokenTypes) {
                    const pattern = tokenPatterns[tokenType];
                    if (!pattern) continue;

                    if (tokenType === TokenType.Label && column !== 0) continue; // ✅ Labels must be in column 0

                    let match = pattern.exec(substring);
                    if (match && match.index === 0) {
                      
                        
                        let newToken: Token = {
                            type: tokenType,
                            value: match[0].trim(),
                            line: lineNumber,
                            start: column,
                            maxLabelLength: 0
                        };
                        
                        // ✅ Special handling for structure field references
                        if (tokenType === TokenType.StructureField) {
                            // Extract structure and field parts from dot notation (e.g., Invoice.Customer or Queue:Browse:1.ViewPosition)
                            const dotIndex = match[0].lastIndexOf('.');
                            if (dotIndex > 0) {
                                const structurePart = match[0].substring(0, dotIndex);
                                const fieldPart = match[0].substring(dotIndex + 1);
                                logger.info(`🔍 Detected structure field reference: ${structurePart}.${fieldPart}`);
                            }
                        } else if (tokenType === TokenType.StructurePrefix) {
                            // Extract prefix and field parts from prefix notation (e.g., INV:Customer)
                            // For complex cases like Queue:Browse:1:Field, we need to find the last colon
                            const colonIndex = match[0].lastIndexOf(':');
                            if (colonIndex > 0) {
                                const prefixPart = match[0].substring(0, colonIndex);
                                const fieldPart = match[0].substring(colonIndex + 1);
                                logger.info(`🔍 Detected structure prefix reference: ${prefixPart}:${fieldPart}`);
                            }
                        }
                        
                        this.tokens.push(newToken);
                        // 🌈 Special handling for COLOR(...)
                        if (tokenType === TokenType.Function && match[0].toUpperCase() === "COLOR") {
                            // Look ahead for '(' and extract the contents
                            const parenStart = line.indexOf("(", position);
                            if (parenStart > -1) {
                                let parenDepth = 1;
                                let currentPos = parenStart + 1;
                                let paramString = "";

                                while (currentPos < line.length && parenDepth > 0) {
                                    const char = line[currentPos];
                                    if (char === "(") parenDepth++;
                                    else if (char === ")") parenDepth--;

                                    if (parenDepth > 0) {
                                        paramString += char;
                                    }
                                    currentPos++;
                                }

                                // Split param string into arguments
                                const rawParams = paramString.split(",").map(s => s.trim()).filter(Boolean);
                                // Store parsed COLOR(...) arguments
                                newToken.colorParams = [];

                                for (const param of rawParams) {
                                    const isEquate = /^COLOR:[A-Za-z0-9]+$/i.test(param);
                                    const isRGBHex = /^(-)?([0-9A-F]+)H$/i.test(param);

                                    if (isEquate || isRGBHex) {
                                        this.tokens.push({
                                            type: TokenType.ColorValue,
                                            value: param,
                                            line: lineNumber,
                                            start: column, // You could refine this based on match position
                                            maxLabelLength: 0
                                        });
                                        
                                        logger.info(`🌈 COLOR param tokenized: ${param} ${column}`);
                                        
                                    }

                                    newToken.colorParams.push(param);
                                }

                                // Store as custom metadata
                                newToken.colorParams = rawParams;
                                logger.info(`🎨 Parsed COLOR params at line ${lineNumber}: ${rawParams.join(", ")}`);
                            }
                        }
                        else if (match[0].toUpperCase() === "COLOR") {
                            logger.info(`🌈 COLOR name detected at line ${lineNumber} ${tokenType}`);
                        }
                        
                        logger.info(`Detected: Token Type: ${newToken.type} Token Value: '${newToken.value}' at Line ${newToken.line}, Column ${newToken.start}`);
                        logger.info(`Line: ${line}`);

                        position += match[0].length;
                        column += match[0].length;
                        matched = true;
                        break;


                    }
                }

                if (!matched) {
                    position++;
                    column++;
                }
            }
        }



    }



    private processDocumentStructure(): void {
        // ✅ First Pass: Identify Labels & Compute Max Label Length

        // ✅ Second Pass: Process Token Relationships
        // ✅ Create a DocumentStructure instance and process the tokens
        const documentStructure = new DocumentStructure(this.tokens);
        documentStructure.process();

    }


    /** ✅ Expand tabs into spaces for correct alignment */
    private expandTabs(line: string): string {
        let expanded = "";
        let currentColumn = 0;

        for (let char of line) {
            if (char === "\t") {
                let nextTabStop = Math.ceil((currentColumn + 1) / this.tabSize) * this.tabSize;
                let spacesToAdd = nextTabStop - currentColumn; // ✅ Correct calculation
                expanded += " ".repeat(spacesToAdd);
                currentColumn = nextTabStop;
            } else {
                expanded += char;
                currentColumn++;
            }
        }

        return expanded;
    }




}


/** ✅ Ordered token types */
const orderedTokenTypes: TokenType[] = [
    TokenType.Directive,TokenType.Comment, TokenType.ClarionDocument, TokenType.ExecutionMarker, TokenType.Label, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
    TokenType.Type, TokenType.PointerParameter, TokenType.FieldEquateLabel, TokenType.Property,
    TokenType.PropertyFunction, TokenType.EndStatement, TokenType.Keyword, TokenType.Structure,
    // ✅ Add StructurePrefix and StructureField before other variable types
    TokenType.StructurePrefix, TokenType.StructureField,
    TokenType.ConditionalContinuation, TokenType.Function,  // ✅ Placed after Structure, before FunctionArgumentParameter
    TokenType.FunctionArgumentParameter, TokenType.TypeAnnotation, TokenType.Number,
    TokenType.Operator, TokenType.Class, TokenType.Attribute, TokenType.Constant, TokenType.Variable,
    TokenType.ImplicitVariable, TokenType.Delimiter, TokenType.Unknown
];

const STRUCTURE_PATTERNS: Record<string, RegExp> = {
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
    TOOLBAR: /\bTOOLBAR\b/i,
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
/** ✅ Token Patterns (Kept Exactly the Same) */
export const tokenPatterns: Partial<Record<TokenType, RegExp>> = {
    [TokenType.Comment]: /!.*/i,
    [TokenType.LineContinuation]: /&?\s*\|.*/i,
    [TokenType.String]: /'([^']|'')*'/i,
    [TokenType.EndStatement]: /^\s*(END|\.)\s*(?:!.*)?$/i,  // ✅ Matches `END` or `.`
    [TokenType.FunctionArgumentParameter]: /\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/i,  // Captures anything inside ()
    [TokenType.PointerParameter]: /\*\s*\b[A-Za-z_][A-Za-z0-9_]*\b/i,
    [TokenType.FieldEquateLabel]: /\?[A-Za-z_][A-Za-z0-9_]*/i,
    [TokenType.ClarionDocument]: /\b(?:PROGRAM|MEMBER)\b/i,
    [TokenType.ConditionalContinuation]: /\b(?:ELSE|ELSIF|OF)\b/i,  // ✅ New type for ELSE and ELSIF
    [TokenType.Keyword]: /\b(?:RETURN|THEN|UNTIL|EXIT|NEW|PROCEDURE|ROUTINE|PROC|BREAK|KEY)\b/i, // Added KEY to keywords

    [TokenType.Structure]: new RegExp(
        Object.values(STRUCTURE_PATTERNS).map(r => r.source).join("|"), "i"
    ),
    [TokenType.ExecutionMarker]: /^\s*(CODE|DATA)\s*$/i,  // ✅ Matches `CODE` or `DATA` only at start of line

    [TokenType.Function]: /\b(?:COLOR|LINK|DLL)\b(?=\s*\()/i,
    [TokenType.Directive]: /\b(?:ASSERT|BEGIN|COMPILE|EQUATE|INCLUDE|ITEMIZE|OMIT|ONCE|SECTION|SIZE)\b(?=\s*(\(|,))/i,
    [TokenType.Property]: /\b(?:HVSCROLL|SEPARATOR|LIST|RESIZE|DEFAULT|CENTER|MAX|SYSTEM|IMM|DRIVER|PROP|PROPLIST|EVENT|CREATE|BRUSH|LEVEL|STD|CURSOR|BEEP|REJECT|CHARSET|PEN|LISTZONE|BUTTON|MSGMODE|TEXT|FREEZE|DDE|FF_|OCX|DOCK|MATCH|PAPER|DRIVEROP|DATATYPE|GradientTypes|STD|ITEM|MDI|GRAY|HLP)\b/i,
    [TokenType.PropertyFunction]: /\b(?:FORMAT|FONT|USE|ICON|STATUS|MSG|TIP|AT|PROJECT|PRE|FROM|NAME|DLL)\b(?=\s*\()/i,
    //[TokenType.Label]: /^\s*([A-Za-z_][A-Za-z0-9_:]*)\b/i,
    [TokenType.Label]: /^\s*([A-Za-z_][A-Za-z0-9_:.]*)\b/i,

    // ✅ Add pattern for structure prefix notation (e.g., INV:Customer)
    // Updated to handle complex prefixes like Queue:Browse:1:Field
    [TokenType.StructurePrefix]: /\b[A-Za-z_][A-Za-z0-9_:]*:[A-Za-z_][A-Za-z0-9_]*\b/i,
    
    // ✅ Add pattern for structure field with dot notation (e.g., Invoice.Customer)
    // Updated to handle complex structure names like Queue:Browse:1.Field
    [TokenType.StructureField]: /\b[A-Za-z_][A-Za-z0-9_:]*\.[A-Za-z_][A-Za-z0-9_]*\b/i,

    [TokenType.Variable]: /&?[A-Za-z_][A-Za-z0-9_]*\s*(?:&[A-Za-z_][A-Za-z0-9_]*)?/i,
    // ✅ Added support for Binary, Octal, Hex constants
    [TokenType.Number]: /[+-]?(?:\d+\.\d+|\d+(?!\.\d)|\d+[bBoOhH]|\h*[A-Fa-f0-9]+[hH])/,
    [TokenType.Operator]: /[+\-*/=<>!&]/i,
    [TokenType.Class]: /^[A-Za-z_][A-Za-z0-9_:]*\.[A-Za-z_][A-Za-z0-9_:.]*\s/i,
    [TokenType.Attribute]: /\b(?:ABOVE|ABSOLUTE|AUTO|BINDABLE|CONST|DERIVED|DIM|EXTEND|EXTERNAL|GLOBALCLASS|IMM|IMPLEMENTS|INCLUDE|INS|LATE|MODULE|NOBAR|NOCASE|NOFRAME|NOMEMO|NOMERGE|NOSHEET|OPT|OVER|OVR|OWNER|PRIVATE|PROTECTED|PUBLIC|STATIC|THREAD|TYPE|VIRTUAL)\b/i,
    [TokenType.Constant]: /\b(?:TRUE|FALSE|NULL|STD:*)\b/i,
    // ✅ NEW: Detects QUEUE, GROUP, RECORD when used as parameters
    [TokenType.TypeAnnotation]: /\b(?:QUEUE|GROUP|RECORD|FILE|VIEW|REPORT|MODULE)\s+\w+\)/i,
    [TokenType.Type]: /\b(?:ANY|ASTRING|BFLOAT4|BFLOAT8|BLOB|MEMO|BOOL|BSTRING|BYTE|CSTRING|DATE|DECIMAL|DOUBLE|FLOAT4|LONG|LIKE|PDECIMAL|PSTRING|REAL|SHORT|SIGNED|SREAL|STRING|TIME|ULONG|UNSIGNED|USHORT|VARIANT)\b/i,
    [TokenType.ImplicitVariable]: /\b[A-Za-z][A-Za-z0-9_]+(?:\$|#|")\b/i,
    [TokenType.Delimiter]: /[,():]/i,  // ❌ Remove "." from here
    [TokenType.ReferenceVariable]: /&[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*(?::\d+)?)?/i,
    [TokenType.Unknown]: /\S+/i
};
