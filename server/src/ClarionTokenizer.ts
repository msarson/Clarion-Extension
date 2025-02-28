import logger from "./logger.js";





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
    ReferenceVariable,  // ✅ NEW: Handles cases like Queue:Browse:1
    LineContinuation,
    Delimiter,
    FunctionArgumentParameter,
    PointerParameter,
    FieldEquateLabel,
    PropertyFunction,
    Unknown,
    Label,
    EndStatement
}






export interface Token {
    type: TokenType;
    value: string;
    line: number;
    start: number;
    isStructure?: boolean;       // ✅ True if this token starts a structure
    structureFinishesAt?: number; // ✅ The line number where the structure ends
    isProcedure?: boolean;       // ✅ True if this token starts a procedure
    procedureFinishesAt?: number; // ✅ The line number where the procedure ends
    isRoutine?: boolean;         // ✅ True if this token starts a routine
    routineFinishesAt?: number;   // ✅ The line number where the routine ends
}

export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];

    constructor(text: string) {
        this.text = text;
        this.tokens = [];
    }

    public tokenize(): Token[] {
        logger.info("🔍 [DEBUG] Starting tokenization...");
        const lines = this.text.split(/\r?\n/);

        let structureStack: { tokenIndex: number, type: string, startLine: number }[] = [];
        let procedureStack: { tokenIndex: number, startLine: number }[] = [];
        let routineStack: { tokenIndex: number, startLine: number }[] = [];
        let insideClassOrInterfaceOrMap = false;

        lines.forEach((line, lineNumber) => {
            let position = 0;
            let column = 0;
            const leadingSpaces = line.match(/^(\s*)/);
            if (leadingSpaces) column = leadingSpaces[0].length;

            while (position < line.length) {
                const substring = line.slice(position);
                let matched = false;

                if (line.trim() === "") break;

                /** 🔍 Debugging: Start Processing Line */
                logger.info(`📌 [DEBUG] Processing line ${lineNumber}: "${line.trim()}"`);

                const orderedTokenTypes: TokenType[] = [
                    TokenType.Comment, TokenType.Label, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
                    TokenType.Type, TokenType.PointerParameter, TokenType.FieldEquateLabel, TokenType.Property,
                    TokenType.PropertyFunction, TokenType.EndStatement, TokenType.Keyword, TokenType.Structure, TokenType.FunctionArgumentParameter,
                    TokenType.TypeAnnotation, TokenType.Function, TokenType.Directive, TokenType.Number,
                    TokenType.Operator, TokenType.Class, TokenType.Attribute, TokenType.Constant, TokenType.Variable,
                    TokenType.ImplicitVariable, TokenType.Delimiter, TokenType.Unknown
                ];

                for (const tokenType of orderedTokenTypes) {
                    const pattern = tokenPatterns[tokenType];

                    if (!pattern) {
                        logger.info(`⚠️ [DEBUG] No regex pattern found for ${TokenType[tokenType]}`);
                        continue;
                    }

                    if (tokenType === TokenType.Label && column != 0) {
                        continue;
                    }
                    

                    let match = pattern.exec(substring);
                    if (match && match.index === 0) {
                        // if the match is a structure, make sure the character berfore it is a space 
                        if (tokenType === TokenType.Structure && position > 0 && line[position - 1] !== " ") {
                            logger.info(`⚠️ [DEBUG] Ignoring STRUCTURE at Column ${column} (No space before)`);
                            continue;
                        }
                       
                        
                        logger.info(`✅                     [DEBUG] Matched TokenType: ${TokenType[tokenType]} | Value: "${match[0]}" at Column ${column}`);

                        let newToken: Token = {
                            type: tokenType,
                            value: match[0],
                            line: lineNumber,
                            start: column
                        };

                        // ✅ Debugging for STRUCTURE matching
                        if (tokenType === TokenType.Structure) {
                            newToken.isStructure = true;
                            structureStack.push({
                                tokenIndex: this.tokens.length,
                                type: match[0].trim(),
                                startLine: lineNumber
                            });
                            logger.info(`🔍 [DEBUG] STRUCTURE START detected: '${match[0].trim()}' at Line ${lineNumber}`);
                        }

                        // ✅ Debugging for END matching
                        if (tokenType === TokenType.EndStatement) {// && match[0].toUpperCase() === "END") {
                            const lastStructure = structureStack.pop();
                            if (lastStructure) {
                                this.tokens[lastStructure.tokenIndex].structureFinishesAt = lineNumber;
                                logger.info(`✅ [DEBUG] STRUCTURE '${lastStructure.type}' ends at Line ${lineNumber}`);
                            } else {
                                logger.info(`⚠️ [WARNING] Unmatched END at Line ${lineNumber} (No open STRUCTURE)`);
                            }
                        }

                        // ✅ Debugging for CLASS, INTERFACE, MAP scope detection
                        if (tokenType === TokenType.Structure && ["CLASS", "INTERFACE", "MAP"].includes(match[0].toUpperCase())) {
                            insideClassOrInterfaceOrMap = true;
                            logger.info(`🔍 [DEBUG] Inside CLASS/INTERFACE/MAP at Line ${lineNumber}`);
                        }

                        if (tokenType === TokenType.EndStatement) {//  && match[0].toUpperCase() === "END") {
                            insideClassOrInterfaceOrMap = false;
                            logger.info(`✅ [DEBUG] Leaving CLASS/INTERFACE/MAP scope at Line ${lineNumber}`);
                        }

                        // ✅ Debugging for PROCEDURE matching
                        if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "PROCEDURE") {
                            if (!insideClassOrInterfaceOrMap) {
                                if (procedureStack.length > 0) {
                                    const lastProcedure = procedureStack.pop();
                                    if (lastProcedure) {
                                        this.tokens[lastProcedure.tokenIndex].procedureFinishesAt = lineNumber - 1;
                                        logger.info(`✅ [DEBUG] PROCEDURE at Line ${lastProcedure.startLine} finishes at Line ${lineNumber - 1}`);
                                    }
                                }
                                newToken.isProcedure = true;
                                procedureStack.push({ tokenIndex: this.tokens.length, startLine: lineNumber });
                                logger.info(`🔍 [DEBUG] PROCEDURE START detected at Line ${lineNumber}`);
                            } else {
                                logger.info(`🚫 [DEBUG] Ignoring PROCEDURE at Line ${lineNumber} (Inside ${insideClassOrInterfaceOrMap})`);
                            }
                        }

                        // ✅ Debugging for ROUTINE matching
                        if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "ROUTINE") {
                            if (routineStack.length > 0) {
                                const lastRoutine = routineStack.pop();
                                if (lastRoutine) {
                                    this.tokens[lastRoutine.tokenIndex].routineFinishesAt = lineNumber - 1;
                                    logger.info(`✅ [DEBUG] ROUTINE at Line ${lastRoutine.startLine} finishes at Line ${lineNumber - 1}`);
                                }
                            }
                            newToken.isRoutine = true;
                            routineStack.push({ tokenIndex: this.tokens.length, startLine: lineNumber });
                            logger.info(`🔍 [DEBUG] ROUTINE START detected at Line ${lineNumber}`);
                        }

                        // ✅ Pushing token to `this.tokens`
                        this.tokens.push(newToken);
                        position += match[0].length;
                        column += match[0].length;
                        matched = true;
                        break;
                    }
                }

                if (!matched) {
                  //  logger.info(`⚠️ [DEBUG] No token matched at Column ${column}, skipping character.`);
                    position++;
                    column++;
                }
            }

        });

        // ✅ Close any remaining open STRUCTURES at EOF
        while (structureStack.length > 0) {
            const lastStructure = structureStack.pop();
            if (lastStructure) {
                this.tokens[lastStructure.tokenIndex].structureFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.info(`⚠️ [DEBUG] STRUCTURE [${lastStructure.type}] at line [${lastStructure.startLine}]' finishes at EOF`);
            }
        }

        // ✅ Close any remaining open PROCEDURE at EOF
        while (procedureStack.length > 0) {
            const lastProcedure = procedureStack.pop();
            if (lastProcedure) {
                this.tokens[lastProcedure.tokenIndex].procedureFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.info(`⚠️ [DEBUG] PROCEDURE at Line ${lastProcedure.startLine} finishes at EOF`);
            }
        }

        // ✅ Close any remaining open ROUTINE at EOF
        while (routineStack.length > 0) {
            const lastRoutine = routineStack.pop();
            if (lastRoutine) {
                this.tokens[lastRoutine.tokenIndex].routineFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.info(`⚠️ [DEBUG] ROUTINE at Line ${lastRoutine.startLine} finishes at EOF`);
            }
        }
        logger.info("🔍 [DEBUG] Tokenization complete.");
        return this.tokens;
    }




}

const STRUCTURE_PATTERNS: Record<string, RegExp> = {
    MODULE: /^\s*MODULE\b/i,  // MODULE should be the first word on the line
    APPLICATION: /\bAPPLICATION\b/i,
    CASE: /\bCASE\b/i,
    CLASS: /\bCLASS\b/i,
    GROUP: /\bGROUP\b/i,
    FILE: /\bFILE\b/i,
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


export const tokenPatterns: Partial<Record<TokenType, RegExp>> = {
    [TokenType.Comment]: /!.*/i,
    [TokenType.LineContinuation]: /&?\s*\|.*/i,
    [TokenType.String]: /'([^']|'')*'/i,
    [TokenType.EndStatement]: /^\s*(END|\.)\s*$/i,  // ✅ Matches `END` or `.`
    [TokenType.FunctionArgumentParameter]: /\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/i,  // Captures anything inside ()
    [TokenType.PointerParameter]: /\*\s*\b[A-Za-z_][A-Za-z0-9_]*\b/i,
    [TokenType.FieldEquateLabel]: /\?[A-Za-z_][A-Za-z0-9_]*/i,
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




