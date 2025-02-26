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
    Unknown
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
    
                const orderedTokenTypes: TokenType[] = [
                    TokenType.Comment, TokenType.LineContinuation, TokenType.String, TokenType.ReferenceVariable,
                    TokenType.Type, TokenType.PointerParameter, TokenType.FieldEquateLabel, TokenType.Property,
                    TokenType.PropertyFunction, TokenType.Keyword, TokenType.Structure, TokenType.FunctionArgumentParameter,
                    TokenType.TypeAnnotation, TokenType.Function, TokenType.Directive, TokenType.Number,
                    TokenType.Operator, TokenType.Class, TokenType.Attribute, TokenType.Constant, TokenType.Variable,
                    TokenType.ImplicitVariable, TokenType.Delimiter, TokenType.Unknown
                ];
    
                /** 🔍 Check for Other Tokens */
                for (const tokenType of orderedTokenTypes) {
                    const pattern = tokenPatterns[tokenType];
                    if (!pattern) {
                        logger.warn(`🔍 [DEBUG] Token pattern is undefined for ${TokenType[tokenType]}`);
                        continue;
                    }
    
                    let match = pattern.exec(substring);
                    if (match && match.index === 0) {
                        let newToken: Token = {
                            type: tokenType,
                            value: match[0],
                            line: lineNumber,
                            start: column
                        };
    
                        // ✅ Detect STRUCTURE (Push to stack)
                        if (tokenType === TokenType.Structure) {
                            newToken.isStructure = true;
                            structureStack.push({
                                tokenIndex: this.tokens.length,
                                type: match[0].trim(),
                                startLine: lineNumber
                            });
                            logger.debug(`🔍 [DEBUG] STRUCTURE START detected: '${match[0].trim()}' at Line ${lineNumber}`);
                        }
    
                        // ✅ Detect END (Pop structure stack)
                        if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "END") {
                            const lastStructure = structureStack.pop();
                            if (lastStructure) {  
                                this.tokens[lastStructure.tokenIndex].structureFinishesAt = lineNumber;
                                logger.debug(`✅ [DEBUG] STRUCTURE '${lastStructure.type}' ends at Line ${lineNumber}`);
                            } else {
                                logger.warn(`⚠️ [WARNING] Unmatched END at Line ${lineNumber} (No open STRUCTURE)`);
                            }
                        }
    
                        // ✅ Detect CLASS, INTERFACE, MAP (Ignore PROCEDURES inside)
                        if (tokenType === TokenType.Structure && ["CLASS", "INTERFACE", "MAP"].includes(match[0].toUpperCase())) {
                            insideClassOrInterfaceOrMap = true;
                        }
    
                        // ✅ Detect END (Unmark CLASS, INTERFACE, MAP scope)
                        if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "END") {
                            insideClassOrInterfaceOrMap = false;
                        }
    
                        // ✅ Detect PROCEDURE (Ignore inside CLASS, INTERFACE, MAP)
                        if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "PROCEDURE") {
                            if (!insideClassOrInterfaceOrMap) {
                                if (procedureStack.length > 0) {
                                    const lastProcedure = procedureStack.pop();
                                    if (lastProcedure) {  
                                        this.tokens[lastProcedure.tokenIndex].procedureFinishesAt = lineNumber - 1;
                                        logger.debug(`✅ [DEBUG] PROCEDURE at Line ${lastProcedure.startLine} finishes at Line ${lineNumber - 1}`);
                                    }
                                }
                                newToken.isProcedure = true;
                                procedureStack.push({ tokenIndex: this.tokens.length, startLine: lineNumber });
                                logger.debug(`🔍 [DEBUG] PROCEDURE START detected at Line ${lineNumber}`);
                            } else {
                                logger.debug(`🚫 [DEBUG] Ignoring PROCEDURE at Line ${lineNumber} (Inside ${insideClassOrInterfaceOrMap})`);
                            }
                        }
    
                        // ✅ Detect ROUTINE (Same logic as PROCEDURE)
                        if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "ROUTINE") {
                            if (routineStack.length > 0) {
                                const lastRoutine = routineStack.pop();
                                if (lastRoutine) {  
                                    this.tokens[lastRoutine.tokenIndex].routineFinishesAt = lineNumber - 1;
                                    logger.debug(`✅ [DEBUG] ROUTINE at Line ${lastRoutine.startLine} finishes at Line ${lineNumber - 1}`);
                                }
                            }
                            newToken.isRoutine = true;
                            routineStack.push({ tokenIndex: this.tokens.length, startLine: lineNumber });
                            logger.debug(`🔍 [DEBUG] ROUTINE START detected at Line ${lineNumber}`);
                        }
    
                        // ✅ Now pushing token to this.tokens
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
        });
    
        // ✅ Close any remaining open STRUCTURES at EOF
        while (structureStack.length > 0) {
            const lastStructure = structureStack.pop();
            if (lastStructure) {  
                this.tokens[lastStructure.tokenIndex].structureFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.debug(`⚠️ [DEBUG] STRUCTURE '${lastStructure.type}' finishes at EOF`);
            }
        }
    
        // ✅ Close any remaining open PROCEDURE at EOF
        while (procedureStack.length > 0) {
            const lastProcedure = procedureStack.pop();
            if (lastProcedure) {  
                this.tokens[lastProcedure.tokenIndex].procedureFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.debug(`⚠️ [DEBUG] PROCEDURE at Line ${lastProcedure.startLine} finishes at EOF`);
            }
        }
    
        // ✅ Close any remaining open ROUTINE at EOF
        while (routineStack.length > 0) {
            const lastRoutine = routineStack.pop();
            if (lastRoutine) {  
                this.tokens[lastRoutine.tokenIndex].routineFinishesAt = this.tokens[this.tokens.length - 1]?.line ?? 0;
                logger.debug(`⚠️ [DEBUG] ROUTINE at Line ${lastRoutine.startLine} finishes at EOF`);
            }
        }
    
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
    RECORD: /^\s*\w+\s+RECORD\b/i,  // RECORD must follow a label
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
    // [TokenType.FunctionArgumentParameter]: /(?<=\()\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*=\s*(?:\w+|[+-]?\d+(?:\.\d+)?|'.*?'))?(?=\s*[,)\n])/i,
    [TokenType.FunctionArgumentParameter]: /\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)/i,  // Captures anything inside ()
    [TokenType.PointerParameter]: /\*\s*\b[A-Za-z_][A-Za-z0-9_]*\b/i,

    //[TokenType.PointerParameter]: /\*\?\s*\b[A-Za-z_][A-Za-z0-9_]*\b/i,
    [TokenType.FieldEquateLabel]: /\?[A-Za-z_][A-Za-z0-9_]*/i,
    [TokenType.Keyword]: /\b(?:RETURN|OF|ELSE|THEN|UNTIL|EXIT|NEW|END|PROCEDURE|ROUTINE|PROC|BREAK)\b/i,
    [TokenType.Structure]: new RegExp(
        Object.values(STRUCTURE_PATTERNS).map(r => r.source).join("|"), "i"
    ),



    // ✅ Excludes QUEUE when appearing inside parameters

    [TokenType.Function]: /\b(?:COLOR|LINK|DLL)\b(?=\s*\()/i,
    [TokenType.Directive]: /\b(?:ASSERT|BEGIN|COMPILE|EQUATE|INCLUDE|ITEMIZE|OMIT|ONCE|SECTION|SIZE)\b(?=\s*\()/i,
    [TokenType.Property]: /\b(?:HVSCROLL|SEPARATOR|LIST|RESIZE|DEFAULT|CENTER|MAX|SYSTEM|IMM|DRIVER|PROP|PROPLIST|EVENT|CREATE|BRUSH|LEVEL|STD|CURSOR|BEEP|REJECT|CHARSET|PEN|LISTZONE|BUTTON|MSGMODE|TEXT|FREEZE|DDE|FF_|OCX|DOCK|MATCH|PAPER|DRIVEROP|DATATYPE|GradientTypes|STD|ITEM|MDI|GRAY|HLP)\b/i,
    [TokenType.PropertyFunction]: /\b(?:FORMAT|FONT|USE|ICON|STATUS|MSG|TIP|AT|PROJECT|FROM|NAME|DLL)\b(?=\s*\()/i,
    //[TokenType.Variable]: /\b[A-Z]+\:\w+\b/i,
    [TokenType.Variable]: /&?[A-Za-z_][A-Za-z0-9_]*\s*(?:&[A-Za-z_][A-Za-z0-9_]*)?/i,
    // ✅ Added support for Binary, Octal, Hex constants
    [TokenType.Number]: /[+-]?(?:\d+\.\d+|\d+(?!\.\d)|\d+[bBoOhH]|\h*[A-Fa-f0-9]+[hH])/,
    [TokenType.Operator]: /[+\-*/=<>!&]/i,
    [TokenType.Class]: /^[A-Za-z_][A-Za-z0-9_:]*\.[A-Za-z_][A-Za-z0-9_:.]*\s/i,
    [TokenType.Attribute]: /\b(?:ABOVE|ABSOLUTE|AUTO|BINDABLE|CONST|DERIVED|DIM|EXTEND|EXTERNAL|GLOBALCLASS|IMM|IMPLEMENTS|INCLUDE|INS|LATE|MODULE|NOBAR|NOCASE|NOFRAME|NOMEMO|NOMERGE|NOSHEET|OPT|OVER|OVR|OWNER|PRE|PRIVATE|PROTECTED|PUBLIC|STATIC|THREAD|TYPE|VIRTUAL)\b/i,
    [TokenType.Constant]: /\b(?:TRUE|FALSE|NULL|STD:*)\b/i,
    // ✅ NEW: Detects QUEUE, GROUP, RECORD when used as parameters
    [TokenType.TypeAnnotation]: /\b(?:QUEUE|GROUP|RECORD|FILE|VIEW|REPORT|MODULE)\s+\w+\)/i,
    [TokenType.Type]: /\b(?:ANY|ASTRING|BFLOAT4|BFLOAT8|BLOB|MEMO|BOOL|BSTRING|BYTE|CSTRING|DATE|DECIMAL|DOUBLE|FLOAT4|LONG|LIKE|PDECIMAL|PSTRING|REAL|SHORT|SIGNED|SREAL|STRING|TIME|ULONG|UNSIGNED|USHORT|VARIANT)\b/i,
    [TokenType.ImplicitVariable]: /\b[A-Za-z][A-Za-z0-9_]+(?:\$|#|")\b/i,
    [TokenType.Delimiter]: /[,():.]/i,
    [TokenType.ReferenceVariable]: /&[A-Za-z_][A-Za-z0-9_]*:[A-Za-z_][A-Za-z0-9_:]*/i,
    [TokenType.Unknown]: /\S+/i
};




