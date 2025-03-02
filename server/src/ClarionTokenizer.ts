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
    ClarionDocument // ✅ PROGRAM / MEMBER token type
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    start: number;
    isStructure?: boolean;
    structureFinishesAt?: number;
    isProcedure?: boolean;
    procedureFinishesAt?: number;
    isRoutine?: boolean;
    routineFinishesAt?: number;
}

export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];

    constructor(text: string) {
        this.text = text;
        this.tokens = [];
    }

    /** ✅ Public method to tokenize text */
    public tokenize(): Token[] {
        logger.info("🔍 [Tokenizer] Starting tokenization...");
        const lines = this.text.split(/\r?\n/);


        
        this.tokenizeLines(lines); // ✅ Step 1: Tokenize all lines
        this.analyzeTokenRelationships(); // ✅ Step 2: Process relationships

        logger.info("🔍 [Tokenizer] Tokenization complete.");
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
        let procedureStack: { tokenIndex: number, startLine: number }[] = [];
        let routineStack: { tokenIndex: number, startLine: number }[] = [];
        let insideClassOrInterfaceOrMapDepth = 0; // Track nesting levels

        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
           
            // ✅ Detect STRUCTURES
            if (token.type === TokenType.Structure) {
                logger.info(`🔍 [Tokenizer] Structure Detected: '${token.value}' at Line ${token.line}, Ends at ${token.structureFinishesAt ?? "UNKNOWN"}`);

                token.isStructure = true;
                structureStack.push({ tokenIndex: i, type: token.value.trim(), startLine: token.line });

                // ✅ If it's a CLASS, MAP, or INTERFACE, enter a new scope
                if (["CLASS", "MAP", "INTERFACE"].includes(token.value.toUpperCase())) {
                    insideClassOrInterfaceOrMapDepth++;
                }
            }

            // ✅ Detect END statements (Closing last opened structure)
            if (token.type === TokenType.EndStatement) {
                logger.info(`🔍 [Tokenizer] [CHECK] END detected at Line ${token.line}`);
                const lastStructure = structureStack.pop();
                if (lastStructure) {
                    this.tokens[lastStructure.tokenIndex].structureFinishesAt = token.line;
                    logger.info(`✅ [Tokenizer] [CHECK] Structure '${lastStructure.type}' starts at Line ${lastStructure.startLine} ends at Line ${token.line}`);
                    // ✅ If exiting a CLASS, MAP, or INTERFACE, decrease scope depth
                    if (["CLASS", "MAP", "INTERFACE"].includes(lastStructure.type.toUpperCase())) {
                        insideClassOrInterfaceOrMapDepth = Math.max(0, insideClassOrInterfaceOrMapDepth - 1);
                    }
                } else {
                    logger.warn(`⚠️[Tokenizer] [WARNING] Unmatched END at Line ${token.line}`);
                }
            }

            // ✅ Handle PROCEDURE tokens (Only if not inside CLASS/MAP/INTERFACE)
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "PROCEDURE") {
                if (insideClassOrInterfaceOrMapDepth === 0) {
                    if (procedureStack.length > 0) {
                        const lastProcedure = procedureStack.pop();
                        if (lastProcedure) {
                            this.tokens[lastProcedure.tokenIndex].procedureFinishesAt = token.line - 1;
                        }
                    }
                    token.isProcedure = true;
                    procedureStack.push({ tokenIndex: i, startLine: token.line });
                    logger.warn(`🔍 Procedure Detected at Line ${token.line}, Ends at ${token.procedureFinishesAt ?? "UNKNOWN"}`);
                } else {
                    // ✅ Ensure PROCEDURE inside class/map is explicitly NOT marked
                    token.isProcedure = false;
                }
            }

            // ✅ Handle ROUTINE tokens
            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "ROUTINE") {
                if (routineStack.length > 0) {
                    const lastRoutine = routineStack.pop();
                    if (lastRoutine) {
                        this.tokens[lastRoutine.tokenIndex].routineFinishesAt = token.line - 1;
                    }
                }
                token.isRoutine = true;
                routineStack.push({ tokenIndex: i, startLine: token.line });
            }
        }

        // ✅ Close any remaining open STRUCTURES at EOF
        while (structureStack.length > 0) {
            const lastStructure = structureStack.pop();
            if (lastStructure !== undefined) {
                this.tokens[lastStructure.tokenIndex].structureFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
            }
        }

        // ✅ Close any remaining open PROCEDURES at EOF
        while (procedureStack.length > 0) {
            const lastProcedure = procedureStack.pop();
            if (lastProcedure !== undefined) {
                this.tokens[lastProcedure.tokenIndex].procedureFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
            }
        }

        // ✅ Close any remaining open ROUTINES at EOF
        while (routineStack.length > 0) {
            const lastRoutine = routineStack.pop();
            if (lastRoutine !== undefined) {
                this.tokens[lastRoutine.tokenIndex].routineFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
            }
        }
        for (const token of this.tokens) {
            if (token.isStructure && !token.structureFinishesAt) {
                logger.warn(`⚠️[Tokenizer] [WARNING] Structure '${token.value}' at Line ${token.line} is missing an end marker!`);
            }
        }

    }


}

/** ✅ Ordered token types */
const orderedTokenTypes: TokenType[] = [
    TokenType.Comment, TokenType.ClarionDocument, TokenType.Label, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
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
    QUEUE: /\bQUEUE(?![:\(])\b/i,  // Prevents detecting Queue:Browse as a structure
   // RECORD: /^\s*(\w+)\s+(RECORD)\b/i,
    RECORD: /\bRECORD\b/i,
    REPORT: /\bREPORT\b/i,
    SECTION: /\bSECTION\b/i,
    SHEET: /\bSHEET\b/i,
    TAB: /\bTAB\b/i,
    TOOLBAR: /\bTOOLBAR\b/i,
    VIEW: /\bVIEW\b/i,
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
    [TokenType.EndStatement]: /^\s*(END|\.)\s*$/i,  // ✅ Matches `END` or `.`
    [TokenType.FunctionArgumentParameter]: /\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/i,  // Captures anything inside ()
    [TokenType.PointerParameter]: /\*\s*\b[A-Za-z_][A-Za-z0-9_]*\b/i,
    [TokenType.FieldEquateLabel]: /\?[A-Za-z_][A-Za-z0-9_]*/i,
    [TokenType.ClarionDocument]: /\b(?:PROGRAM|MEMBER)\b/i,
    [TokenType.Keyword]: /\b(?:RETURN|OF|ELSE|THEN|UNTIL|EXIT|NEW|PROCEDURE|ROUTINE|PROC|BREAK)\b/i,
    [TokenType.Structure]: new RegExp(
        Object.values(STRUCTURE_PATTERNS).map(r => r.source).join("|"), "i"
    ),
    [TokenType.Function]: /\b(?:COLOR|LINK|DLL)\b(?=\s*\()/i,
    [TokenType.Directive]: /\b(?:ASSERT|BEGIN|COMPILE|EQUATE|INCLUDE|ITEMIZE|OMIT|ONCE|SECTION|SIZE)\b(?=\s*\()/i,
    [TokenType.Property]: /\b(?:HVSCROLL|SEPARATOR|LIST|RESIZE|DEFAULT|CENTER|MAX|SYSTEM|IMM|DRIVER|PROP|PROPLIST|EVENT|CREATE|BRUSH|LEVEL|STD|CURSOR|BEEP|REJECT|CHARSET|PEN|LISTZONE|BUTTON|MSGMODE|TEXT|FREEZE|DDE|FF_|OCX|DOCK|MATCH|PAPER|DRIVEROP|DATATYPE|GradientTypes|STD|ITEM|MDI|GRAY|HLP)\b/i,
    [TokenType.PropertyFunction]: /\b(?:FORMAT|FONT|USE|ICON|STATUS|MSG|TIP|AT|PROJECT|PRE|FROM|NAME|DLL)\b(?=\s*\()/i,
    [TokenType.Label]: /^\s*([A-Za-z_][A-Za-z0-9_:]*)\b/i,
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
    [TokenType.ReferenceVariable]: /&[A-Za-z_][A-Za-z0-9_]*:[A-Za-z_][A-Za-z0-9_:]*/i,
    [TokenType.Unknown]: /\S+/i
};
