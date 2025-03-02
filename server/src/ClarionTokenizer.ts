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
    ExecutionMarker
}

export interface Token {
    type: TokenType;
    subType?: TokenType; // To replace isProcedure, isRoutine, etc.
    value: string;
    line: number;
    start: number;
    finishesAt?: number;  // Unified field for structure, procedure, method, routine
}


export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];
    private lines: string[];
    constructor(text: string) {
        this.text = text;
        this.tokens = [];
        this.lines = [];
        
    }

    /** ✅ Public method to tokenize text */
    public tokenize(): Token[] {
        logger.setLevel("error");
        logger.info("🔍 Starting tokenization...");
        this.lines = this.text.split(/\r?\n/);



        this.tokenizeLines(this.lines); // ✅ Step 1: Tokenize all lines
        this.analyzeTokenRelationships(); // ✅ Step 2: Process relationships

        logger.info("🔍 Tokenization complete.");
        return this.tokens;
    }

    /** ✅ Step 1: Tokenize all lines */
    private tokenizeLines(lines: string[]): void {
        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            if (line.trim() === "") continue; // ✅ Skip blank lines

            let position = 0;
            let column = line.match(/^(\s*)/)?.[0].length || 0;

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
                            start: column
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

    /** ✅ Step 2: Analyze Token Relationships */
    private analyzeTokenRelationships(): void {
        let structureStack: { tokenIndex: number, type: string, startLine: number }[] = [];
        let procedureRoutineStack: { tokenIndex: number, startLine: number, subType: TokenType }[] = [];
        let insideClassOrInterfaceOrMapDepth = 0; // Track nesting levels

        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];

            // ✅ Detect STRUCTURES (IF, CASE, LOOP, CLASS, etc.)
            if (token.type === TokenType.Structure) {
                logger.warn(`🔍 Structure Detected: '${token.value}' at Line ${token.line}, Ends at ${token.finishesAt ?? "UNKNOWN"}`);
               
                    token.subType = TokenType.Structure;
                    structureStack.push({ tokenIndex: i, type: token.value.trim(), startLine: token.line });
                // ✅ Handle CLASS, MAP, INTERFACE as deeper scopes
                if (["CLASS", "MAP", "INTERFACE"].includes(token.value.toUpperCase())) {
                    insideClassOrInterfaceOrMapDepth++;
                    logger.warn(`🛠  >>>> ${token.value}, Depth: ${insideClassOrInterfaceOrMapDepth} `);
                }
            }

            // ✅ Detect END statement for structures
            if (token.type === TokenType.EndStatement) {
                const lastStructure = structureStack.pop();
                if (lastStructure) {
                    this.tokens[lastStructure.tokenIndex].finishesAt = token.line;
                    logger.warn(`✅ [CHECK] Structure '${lastStructure.type}' starts at Line ${lastStructure.startLine} ends at Line ${token.line}`);

                    if (["CLASS", "MAP", "INTERFACE"].includes(lastStructure.type.toUpperCase())) {
                        insideClassOrInterfaceOrMapDepth = Math.max(0, insideClassOrInterfaceOrMapDepth - 1);
                        logger.warn(`🛠  <<<< ${lastStructure.type}, Depth: ${insideClassOrInterfaceOrMapDepth}`);
                    }
                } else {
                    logger.warn(`⚠️[WARNING] Unmatched END at Line ${token.line}`);
                }
            }


            if (
                token.type === TokenType.Keyword &&
                ["PROCEDURE", "ROUTINE"].includes(token.value.toUpperCase())
            ) {
                // 🛠 Debugging: Log current depth of CLASS, INTERFACE, MAP
                logger.warn(
                    `🛠 PROCEDURE detected at Line ${token.line} | Current insideClassOrInterfaceOrMapDepth: ${insideClassOrInterfaceOrMapDepth}`
                );

                // ✅ Ignore PROCEDURE inside CLASS, INTERFACE, or MAP
                if (insideClassOrInterfaceOrMapDepth > 0) {
                    logger.warn(
                        `🚫 Ignored PROCEDURE at Line ${token.line} (Inside CLASS/MAP/INTERFACE) | Depth: ${insideClassOrInterfaceOrMapDepth}`
                    );
                    continue;
                }

                // ✅ If we're already inside a PROCEDURE or ROUTINE, close it before opening a new one
                if (procedureRoutineStack.length > 0) {
                    const lastProcRoutine = procedureRoutineStack.pop();
                    if (lastProcRoutine) {
                        this.tokens[lastProcRoutine.tokenIndex].finishesAt = token.line - 1;
                        logger.warn(
                            `✅ [Closed] ${this.tokens[lastProcRoutine.tokenIndex].value} Ends at Line ${token.line - 1}`
                        );
                    }
                }

                // ✅ Push new PROCEDURE or ROUTINE onto the stack
                token.subType = token.value.toUpperCase() === "PROCEDURE" ? TokenType.Procedure : TokenType.Routine;
                procedureRoutineStack.push({ tokenIndex: i, startLine: token.line, subType: token.subType });

                logger.warn(
                    `🔍 Detected ${token.value.toUpperCase()} at Line ${token.line}, Ends at UNKNOWN (Waiting for next procedure/routine or EOF)`
                );
            }





        }

        // ✅ Close remaining STRUCTURES at EOF
        while (structureStack.length > 0) {
            const lastStructure = structureStack.pop();
            if (lastStructure !== undefined) {
                this.tokens[lastStructure.tokenIndex].finishesAt = this.lines.length;
                logger.warn(`⚠️ Structure '${this.tokens[lastStructure.tokenIndex].value}' had no explicit END, closing at line ${this.lines.length}.`);
            }
        }

        // ✅ Close remaining PROCEDURES at EOF
        while (procedureRoutineStack.length > 0) {
            const lastProcedure = procedureRoutineStack.pop();
            if (lastProcedure !== undefined) {
                this.tokens[lastProcedure.tokenIndex].finishesAt = this.lines.length;
                logger.warn(`⚠️ Procedure/Routine '${this.tokens[lastProcedure.tokenIndex].value}' had no explicit END, closing at line ${this.lines.length}.`);
            }
        }

        // ✅ Final Logging
        for (const token of this.tokens) {
            if (token.subType !== undefined && !token.finishesAt) {
                logger.warn(`⚠️ Structure '${token.value}' at Line ${token.line} is missing an end marker!`);
            } else if (token.subType !== undefined) {
                logger.warn(`✅ Structure '${token.value}' at Line ${token.line} marked with subtype ${token.subType} and finishes at ${token.finishesAt}!`);
            }
        }
    }



}

/** ✅ Ordered token types */
const orderedTokenTypes: TokenType[] = [
    TokenType.Comment, TokenType.ClarionDocument, TokenType.ExecutionMarker, TokenType.Label, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
    TokenType.Type, TokenType.PointerParameter, TokenType.FieldEquateLabel, TokenType.Property,
    TokenType.PropertyFunction, TokenType.EndStatement, TokenType.Keyword, TokenType.Structure, TokenType.FunctionArgumentParameter,
    TokenType.TypeAnnotation, TokenType.Function, TokenType.Directive, TokenType.Number,
    TokenType.Operator, TokenType.Class, TokenType.Attribute, TokenType.Constant, TokenType.Variable,
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
    [TokenType.Keyword]: /\b(?:RETURN|OF|ELSE|THEN|UNTIL|EXIT|NEW|PROCEDURE|ROUTINE|PROC|BREAK)\b/i,
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
    [TokenType.Class]: /^[A-Za-z_][A-Za-z0-9_:]*\.[A-Za-z_][A-Za-z0-9_:.]*\s/i,
    [TokenType.Attribute]: /\b(?:ABOVE|ABSOLUTE|AUTO|BINDABLE|CONST|DERIVED|DIM|EXTEND|EXTERNAL|GLOBALCLASS|IMM|IMPLEMENTS|INCLUDE|INS|LATE|MODULE|NOBAR|NOCASE|NOFRAME|NOMEMO|NOMERGE|NOSHEET|OPT|OVER|OVR|OWNER|PRIVATE|PROTECTED|PUBLIC|STATIC|THREAD|TYPE|VIRTUAL)\b/i,
    [TokenType.Constant]: /\b(?:TRUE|FALSE|NULL|STD:*)\b/i,
    // ✅ NEW: Detects QUEUE, GROUP, RECORD when used as parameters
    [TokenType.TypeAnnotation]: /\b(?:QUEUE|GROUP|RECORD|FILE|VIEW|REPORT|MODULE)\s+\w+\)/i,
    [TokenType.Type]: /\b(?:ANY|ASTRING|BFLOAT4|BFLOAT8|BLOB|MEMO|BOOL|BSTRING|BYTE|CSTRING|DATE|DECIMAL|DOUBLE|FLOAT4|LONG|LIKE|PDECIMAL|PSTRING|REAL|SHORT|SIGNED|SREAL|STRING|TIME|ULONG|UNSIGNED|USHORT|VARIANT)\b/i,
    [TokenType.ImplicitVariable]: /\b[A-Za-z][A-Za-z0-9_]+(?:\$|#|")\b/i,
    [TokenType.Delimiter]: /[,():]/i,  // ❌ Remove "." from here
    [TokenType.ReferenceVariable]: /&([A-Za-z_][A-Za-z0-9_]*):([A-Za-z_][A-Za-z0-9_]*(:\d+)?)/i,
    [TokenType.Unknown]: /\S+/i
};
