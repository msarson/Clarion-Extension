import { DocumentStructure } from './DocumentStructure';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("Tokenizer");
export enum TokenType {
    Comment,
    String,
    Keyword,
    Directive,
    Function,
    Variable,
    Number,
    Operator,
    ClassLabel,
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
    ConditionalContinuation
}

export interface Token {
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
    maxLabelLength: number;  // ✅ Store max label length
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
        logger.setLevel("error");
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
                        if (tokenType == TokenType.EndStatement) {
                            logger.warn(`🔍 End Statement Detected: at Line ${lineNumber} ${line}`);
                        }
                        let newToken: Token = {
                            type: tokenType,
                            value: match[0].trim(),
                            line: lineNumber,
                            start: column,
                            maxLabelLength: 0
                        };
                        this.tokens.push(newToken);
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
    TokenType.Comment, TokenType.ClarionDocument, TokenType.ExecutionMarker, TokenType.ClassLabel, TokenType.Label, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
    TokenType.Type, TokenType.PointerParameter, TokenType.FieldEquateLabel, TokenType.Property,
    TokenType.PropertyFunction, TokenType.EndStatement, TokenType.Keyword, TokenType.Structure,
    TokenType.ConditionalContinuation,  // ✅ Placed after Structure, before FunctionArgumentParameter
    TokenType.FunctionArgumentParameter, TokenType.TypeAnnotation, TokenType.Function, TokenType.Directive, TokenType.Number,
    TokenType.Operator,  TokenType.Attribute, TokenType.Constant, TokenType.Variable,
    TokenType.ImplicitVariable, TokenType.Delimiter, TokenType.Unknown
];

const STRUCTURE_PATTERNS: Record<string, RegExp> = {
    MODULE: /^\s*MODULE\b/i,  // MODULE should be the first word on the line
    APPLICATION: /\bAPPLICATION\b/i,
    CASE: /\bCASE\b/i,
    CLASS: /\bCLASS\b/i,
    GROUP: /\bGROUP\b/i,
    FILE: /\sFILE\b/i,
    INTERFACE: /\bINTERFACE\b/i,
    IF: /\bIF\b/i,  // ✅ Re-added "IF" as a structure
    JOIN: /\bJOIN\b/i,
    LOOP: /\bLOOP\b/i,
    MAP: /\bMAP\b/i,
    MENU: /\bMENU\b/i,
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
    WINDOW: /\bWINDOW\b/i,
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
    [TokenType.Keyword]: /\b(?:RETURN|THEN|UNTIL|EXIT|NEW|PROCEDURE|ROUTINE|PROC|BREAK)\b/i,

    [TokenType.Structure]: new RegExp(
        Object.values(STRUCTURE_PATTERNS).map(r => r.source).join("|"), "i"
    ),
    [TokenType.ExecutionMarker]: /^\s*(CODE|DATA)\s*$/i,  // ✅ Matches `CODE` or `DATA` only at start of line

    [TokenType.Function]: /\b(?:COLOR|LINK|DLL)\b(?=\s*\()/i,
    [TokenType.Directive]: /\b(?:ASSERT|BEGIN|COMPILE|EQUATE|INCLUDE|ITEMIZE|OMIT|ONCE|SECTION|SIZE)\b(?=\s*\()/i,
    [TokenType.Property]: /\b(?:HVSCROLL|SEPARATOR|LIST|RESIZE|DEFAULT|CENTER|MAX|SYSTEM|IMM|DRIVER|PROP|PROPLIST|EVENT|CREATE|BRUSH|LEVEL|STD|CURSOR|BEEP|REJECT|CHARSET|PEN|LISTZONE|BUTTON|MSGMODE|TEXT|FREEZE|DDE|FF_|OCX|DOCK|MATCH|PAPER|DRIVEROP|DATATYPE|GradientTypes|STD|ITEM|MDI|GRAY|HLP)\b/i,
    [TokenType.PropertyFunction]: /\b(?:FORMAT|FONT|USE|ICON|STATUS|MSG|TIP|AT|PROJECT|PRE|FROM|NAME|DLL)\b(?=\s*\()/i,
    //[TokenType.Label]: /^\s*([A-Za-z_][A-Za-z0-9_:]*)\b/i,
    [TokenType.Label]: /^\s*([A-Za-z_][A-Za-z0-9_:.]*)\b/i,

    [TokenType.Variable]: /&?[A-Za-z_][A-Za-z0-9_]*\s*(?:&[A-Za-z_][A-Za-z0-9_]*)?/i,
    // ✅ Added support for Binary, Octal, Hex constants
    [TokenType.Number]: /[+-]?(?:\d+\.\d+|\d+(?!\.\d)|\d+[bBoOhH]|\h*[A-Fa-f0-9]+[hH])/,
    [TokenType.Operator]: /[+\-*/=<>!&]/i,
    [TokenType.ClassLabel]: /^[A-Za-z_][A-Za-z0-9_:]*\.[A-Za-z_][A-Za-z0-9_:.]*\s/i,
    [TokenType.Attribute]: /\b(?:ABOVE|ABSOLUTE|AUTO|BINDABLE|CONST|DERIVED|DIM|EXTEND|EXTERNAL|GLOBALCLASS|IMM|IMPLEMENTS|INCLUDE|INS|LATE|MODULE|NOBAR|NOCASE|NOFRAME|NOMEMO|NOMERGE|NOSHEET|OPT|OVER|OVR|OWNER|PRIVATE|PROTECTED|PUBLIC|STATIC|THREAD|TYPE|VIRTUAL)\b/i,
    [TokenType.Constant]: /\b(?:TRUE|FALSE|NULL|STD:*)\b/i,
    // ✅ NEW: Detects QUEUE, GROUP, RECORD when used as parameters
    [TokenType.TypeAnnotation]: /\b(?:QUEUE|GROUP|RECORD|FILE|VIEW|REPORT|MODULE)\s+\w+\)/i,
    [TokenType.Type]: /\b(?:ANY|ASTRING|BFLOAT4|BFLOAT8|BLOB|MEMO|BOOL|BSTRING|BYTE|CSTRING|DATE|DECIMAL|DOUBLE|FLOAT4|LONG|LIKE|PDECIMAL|PSTRING|REAL|SHORT|SIGNED|SREAL|STRING|TIME|ULONG|UNSIGNED|USHORT|VARIANT)\b/i,
    [TokenType.ImplicitVariable]: /\b[A-Za-z][A-Za-z0-9_]+(?:\$|#|")\b/i,
    [TokenType.Delimiter]: /[,():]/i,  // ❌ Remove "." from here
    [TokenType.ReferenceVariable]: /&(?:[A-Za-z_][A-Za-z0-9_]*:)?[A-Za-z_][A-Za-z0-9_]*/i,
    [TokenType.Unknown]: /\S+/i
};
