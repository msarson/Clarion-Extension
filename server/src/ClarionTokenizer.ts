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
}



export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];
    private lines: string[];
    private tabSize: number;  // ✅ Store tabSize

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
        let structureStack: Token[] = [];
        let procedureStack: Token[] = [];
        let routineStack: Token[] = [];
        let insideRoutine: Token | null = null;  // ✅ Tracks the current routine
        let foundData = false;  // ✅ Tracks if "DATA" has been found inside a routine
        let insideClassOrInterfaceOrMapDepth = 0; // ✅ Track nesting levels for CLASS/MAP/INTERFACE
        let structureIndentMap: Map<Token, number> = new Map(); // ✅ Stores indentation per structure

        let maxLabelWidth = 0;  // ✅ Track max label length for proper indentation

        // ✅ First Pass: Identify Labels & Compute Max Label Length
        for (const token of this.tokens) {
            if (token.start === 0 && token.type !== TokenType.Comment) {
                token.type = TokenType.Label;
                maxLabelWidth = Math.max(maxLabelWidth, token.value.length);
                logger.info(`📌 Label '${token.value}' detected at Line ${token.line}, forced to column 0.`);
            }
        }

        // ✅ Second Pass: Process Token Relationships
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];

            // ✅ Detect STRUCTURES (CLASS, MAP, INTERFACE, etc.)
            if (token.type === TokenType.Structure) {
                logger.warn(`🔍 Structure Detected: '${token.value}' at Line ${token.line}, Ends at ${token.finishesAt ?? "UNKNOWN"}`);

                token.subType = TokenType.Structure;

                // ✅ If there's an open structure, assign this as a child
                if (structureStack.length > 0) {
                    let parent = structureStack[structureStack.length - 1];
                    token.parent = parent;
                    parent.children = parent.children || [];
                    parent.children.push(token);
                }

                // ✅ Store indentation for this structure (right after max label width)
                let indentLevel = maxLabelWidth + 2;
                structureIndentMap.set(token, indentLevel);
                logger.info(`📌 Structure '${token.value}' at Line ${token.line} assigned indent ${indentLevel}`);

                structureStack.push(token);

                if (["CLASS", "MAP", "INTERFACE"].includes(token.value.toUpperCase())) {
                    insideClassOrInterfaceOrMapDepth++;
                    logger.warn(`🛠 >>>> ${token.value}, Depth: ${insideClassOrInterfaceOrMapDepth}`);
                }
            }

            // ✅ Detect END statement for structures
            if (token.type === TokenType.EndStatement) {
                const lastStructure = structureStack.pop();
                if (lastStructure) {
                    lastStructure.finishesAt = token.line;
                    token.start = structureIndentMap.get(lastStructure) || 0;  // Align END with its parent structure
                    logger.info(`✅ END at Line ${token.line} aligned with '${lastStructure.value}' at indent ${token.start}`);

                    if (["CLASS", "MAP", "INTERFACE"].includes(lastStructure.value.toUpperCase())) {
                        insideClassOrInterfaceOrMapDepth = Math.max(0, insideClassOrInterfaceOrMapDepth - 1);
                        logger.warn(`🛠 <<<< ${lastStructure.value}, Depth: ${insideClassOrInterfaceOrMapDepth}`);
                    }
                } else {
                    logger.warn(`⚠️ [WARNING] Unmatched END at Line ${token.line}`);
                }
            }

            // ✅ Detect PROCEDURE declarations
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "PROCEDURE") {
                logger.warn(`🛠 PROCEDURE detected at Line ${token.line} | Depth: ${insideClassOrInterfaceOrMapDepth}`);

                if (insideClassOrInterfaceOrMapDepth > 0) {
                    logger.warn(`🚫 Ignored PROCEDURE at Line ${token.line} (Inside CLASS/MAP/INTERFACE)`);
                    continue;
                }

                // ✅ Check if the previous token on the same line is a class reference
                let prevToken = this.tokens[i - 1];
                let isClassMethod = prevToken && prevToken.type === TokenType.Class;

                // ✅ Close previous PROCEDURE before opening a new one
                if (procedureStack.length > 0) {
                    const lastProcedure = procedureStack.pop();
                    if (lastProcedure) {
                        lastProcedure.finishesAt = token.line - 1;
                        logger.warn(`✅ [Closed] PROCEDURE '${lastProcedure.value}' Ends at Line ${token.line - 1}`);
                    }
                }

                // ✅ Close all ROUTINEs since they're only valid inside their PROCEDURE
                while (routineStack.length > 0) {
                    const lastRoutine = routineStack.pop();
                    if (lastRoutine) {
                        lastRoutine.finishesAt = token.line - 1;
                        logger.warn(`✅ [Closed] ROUTINE Ends at Line ${token.line - 1}`);
                    }
                }

                // ✅ Assign parent-child relationship (if inside a structure)
                if (structureStack.length > 0) {
                    let parent = structureStack[structureStack.length - 1];
                    token.parent = parent;
                    parent.children = parent.children || [];
                    parent.children.push(token);
                }

                // ✅ Set subType correctly for class methods vs global procedures
                token.subType = isClassMethod ? TokenType.Class : TokenType.Procedure;

                if (isClassMethod) {
                    logger.warn(`📌 Class Method Implementation Detected: '${prevToken.value}.${token.value}' at Line ${token.line}`);
                } else {
                    logger.warn(`🔍 New PROCEDURE '${token.value}' at Line ${token.line}, Ends at UNKNOWN`);
                }

                // ✅ Push onto the procedure stack
                procedureStack.push(token);
            }


            // ✅ Detect ROUTINE declarations
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "ROUTINE") {
                logger.warn(`🛠 ROUTINE detected at Line ${token.line}`);

                if (procedureStack.length === 0) {
                    logger.warn(`⚠️ WARNING: ROUTINE declared without a PROCEDURE! Ignoring...`);
                    continue;
                }

                // ✅ Close the last ROUTINE before opening a new one
                if (routineStack.length > 0) {
                    const lastRoutine = routineStack.pop();
                    if (lastRoutine) {
                        lastRoutine.finishesAt = token.line - 1;
                        logger.warn(`✅ [Closed] Previous ROUTINE Ends at Line ${token.line - 1}`);
                    }
                }

                // ✅ Assign parent-child relationship (inside a procedure)
                let parentProcedure = procedureStack[procedureStack.length - 1];
                token.parent = parentProcedure;
                parentProcedure.children = parentProcedure.children || [];
                parentProcedure.children.push(token);

                // ✅ Track this routine for DATA/CODE detection
                insideRoutine = token;
                foundData = false;
                token.subType = TokenType.Routine;
                routineStack.push(token);

                logger.warn(`🔍 New ROUTINE '${token.value}' at Line ${token.line}, Ends at UNKNOWN`);
            }

            // ✅ Detect DATA inside a ROUTINE (but not PROCEDURE)
            if (token.type === TokenType.ExecutionMarker && token.value.toUpperCase() === "DATA") {
                if (insideRoutine) {
                    insideRoutine.hasLocalData = true;
                    foundData = true;
                    logger.warn(`📌 [INFO] DATA detected inside ROUTINE at Line ${token.line}`);
                }
            }

            // ✅ Detect CODE inside a ROUTINE or PROCEDURE
            if (token.type === TokenType.ExecutionMarker && token.value.toUpperCase() === "CODE") {
                if (insideRoutine) {
                    insideRoutine.executionMarker = token;
                    logger.warn(`📌 [INFO] Explicit CODE detected inside ROUTINE at Line ${token.line}`);
                } else if (procedureStack.length > 0) {
                    let parentProcedure = procedureStack[procedureStack.length - 1];
                    parentProcedure.executionMarker = token;
                    logger.warn(`📌 [INFO] Explicit CODE detected inside PROCEDURE at Line ${token.line}`);
                }
            }

            // ✅ If we reach the end of a routine without explicit CODE, assume it's inferred
            if (insideRoutine && (i === this.tokens.length - 1 || this.tokens[i + 1].type === TokenType.Keyword)) {
                if (!insideRoutine.executionMarker) {
                    insideRoutine.inferredCode = true;
                    logger.warn(`📌 [INFO] ROUTINE '${insideRoutine.value}' has inferred CODE.`);
                }
                insideRoutine = null;
            }
        }
        // ✅ At EOF, close any remaining open PROCEDUREs
        while (procedureStack.length > 0) {
            const lastProcedure = procedureStack.pop();
            if (lastProcedure) {
                lastProcedure.finishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.warn(`⚠️ [EOF] PROCEDURE '${lastProcedure.value}' closed at Line ${lastProcedure.finishesAt}`);
            }
        }

        // ✅ Also close any remaining ROUTINEs at EOF
        while (routineStack.length > 0) {
            const lastRoutine = routineStack.pop();
            if (lastRoutine) {
                lastRoutine.finishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.warn(`⚠️ [EOF] ROUTINE '${lastRoutine.value}' closed at Line ${lastRoutine.finishesAt}`);
            }
        }

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
    TokenType.Comment, TokenType.ClarionDocument, TokenType.ExecutionMarker, TokenType.Label, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
    TokenType.Type, TokenType.PointerParameter, TokenType.FieldEquateLabel, TokenType.Property,
    TokenType.PropertyFunction, TokenType.EndStatement, TokenType.Keyword, TokenType.Structure,
    TokenType.ConditionalContinuation,  // ✅ Placed after Structure, before FunctionArgumentParameter
    TokenType.FunctionArgumentParameter, TokenType.TypeAnnotation, TokenType.Function, TokenType.Directive, TokenType.Number,
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
