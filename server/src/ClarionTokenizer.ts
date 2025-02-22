export enum TokenType {
    Comment,
    String,
    Keyword,
    Directive,
    Function,
    Variable,
    Number,
    Operator,
    Label,
    Class,
    Attribute,
    Property,
    Constant,
    Type,
    ImplicitVariable,
    Structure,  // ✅ Structure TokenType for FILE, JOIN, etc.
   // Procedure,  // ✅ TokenType for PROCEDURE()
   // Routine,    // ✅ New TokenType for ROUTINE
    LineContinuation, // ✅ For '|'
    Delimiter,   // ✅ Added for symbols like '(', ')', ','  
    Unknown
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    start: number;
    context?: string; // ✅ Optional context property to track structure context
}

export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];
    private contextStack: { type: string; startLine: number }[];
    private logMessage: (message: string) => void;

    constructor(text: string, logMessage: (message: string) => void) {
        this.text = text;
        this.tokens = [];
        this.contextStack = [];
        this.logMessage = logMessage;
    }

    public tokenize(): Token[] {
        const lines = this.text.split(/\r?\n/);

        lines.forEach((line, lineNumber) => {
            let position = 0;
            let column = 0;
            const leadingSpaces = line.match(/^(\s*)/);
            if (leadingSpaces) {
                column = leadingSpaces[0].length;
            }

            while (position < line.length) {
                const substring = line.slice(position);
                let matched = false;

                if (line.trim() === "") break;

                for (const tokenTypeKey of Object.keys(tokenPatterns)) {
            //        this.logMessage(`🔍 Checking for ${TokenType[Number(tokenTypeKey)]} at Line ${lineNumber}, Col ${column}`);
                    const tokenType = Number(tokenTypeKey) as TokenType;
                    const pattern = tokenPatterns[tokenType];
                    let match;
                    while ((match = pattern.exec(substring)) !== null) {
                        if (match.index !== 0) break;

                        this.logMessage(`✅ Matched: '${match[0]}' as ${TokenType[tokenType]} at Line ${lineNumber}, Col ${column}`);

                        // ✅ Handle context stack for structures
                        if (tokenType === TokenType.Structure) {
                            this.contextStack.push({ type: match[0].toUpperCase(), startLine: lineNumber });
                        }

                        // ✅ Handle END keyword for structures
                        if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "END" && this.contextStack.length > 0) {
                            const context = this.contextStack.pop();
                            if (context) {
                                this.logMessage(`🔍 [DEBUG] Structure ${context.type} starts at line ${context.startLine} and ends at line ${lineNumber}`);
                            }
                        }

                        // // ✅ Detect PROCEDUREs, but do NOT manage their end
                        // if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "PROCEDURE") {
                        //     this.logMessage(`✅ [DEBUG] Found PROCEDURE '${match[0]}' at line ${lineNumber}`);
                        // }

                        // // ✅ Detect ROUTINEs
                        // if (tokenType === TokenType.Routine) {
                        //     this.logMessage(`✅ [DEBUG] Found ROUTINE '${match[0]}' at line ${lineNumber}`);
                        // }

                        // ✅ Add Token
                        this.tokens.push({
                            type: tokenType,
                            value: match[0],
                            line: lineNumber,
                            start: column,
                            context: this.contextStack.length > 0 ? this.contextStack[this.contextStack.length - 1].type : undefined
                        });

                        position += match[0].length;
                        column += match[0].length;
                        matched = true;
                        break;
                    }

                    if (matched) break;
                }

                if (!matched) {
                    position++;
                    column++;
                }
            }
        });

        this.logMessage(`📊 Tokenization Complete. Total Tokens: ${this.tokens.length}`);
        return this.tokens;
    }
}

export const tokenPatterns: Record<TokenType, RegExp> = {
    [TokenType.Comment]: /!.*/i,
    [TokenType.LineContinuation]: /&?\s*\|.*/i,
    [TokenType.String]: /'([^']|'')*'/i,
    [TokenType.Keyword]: /\b(?:RETURN|OF|ELSE|THEN|UNTIL|EXIT|NEW|END|PROCEDURE|ROUTINE)\b/i,
    [TokenType.Structure]: /\b(?:APPLICATION|CASE|CLASS|GROUP|IF|INTERFACE|FILE|JOIN|LOOP|MAP|MENU|MENUBAR|MODULE|QUEUE|RECORD|REPORT|SECTION|SHEET|TAB|TOOLBAR|VIEW|WINDOW)\b(?=[,()\s]|$)/i,
//    [TokenType.Procedure]: /\bPROCEDURE\b/i,
   // [TokenType.Routine]: /\bROUTINE\b/i,
    [TokenType.Function]: /\b(?:PROJECT|STATUS|AT)\b/i,
    [TokenType.Directive]: /\b(?:ASSERT|BEGIN|COMPILE|EQUATE|INCLUDE|ITEMIZE|OMIT|ONCE|SECTION|SIZE)\b/i,
    [TokenType.Property]: /\b(?:DRIVER|PROP|PROPLIST|EVENT|COLOR|CREATE|BRUSH|LEVEL|STD|CURSOR|ICON|BEEP|REJECT|FONT|CHARSET|PEN|LISTZONE|BUTTON|MSGMODE|TEXT|FREEZE|DDE|FF_|OCX|DOCK|MATCH|PAPER|DRIVEROP|DATATYPE|GradientTypes)\b/i,
    [TokenType.Variable]: /\b(?:LOC|GLO):\w+\b/i,
    [TokenType.Number]: /\b\d+(\.\d+)?\b/i,
    [TokenType.Operator]: /[+\-*/=<>!&]/i,
    [TokenType.Label]: /^[A-Za-z_][A-Za-z0-9_:.]*\s/i,
    [TokenType.Class]: /^[A-Za-z_][A-Za-z0-9_:]*\.[A-Za-z_][A-Za-z0-9_:.]*\s/i,
    [TokenType.Attribute]: /\b(?:ABOVE|ABSOLUTE|AUTO|BINDABLE|CONST|DERIVED|DIM|DLL|EXTEND|EXTERNAL|GLOBALCLASS|IMM|IMPLEMENTS|INCLUDE|INS|LATE|LINK|MODULE|NAME|NOBAR|NOCASE|NOFRAME|NOMEMO|NOMERGE|NOSHEET|OPT|OVER|OVR|OWNER|PRE|PRIVATE|PROTECTED|PUBLIC|STATIC|THREAD|TYPE|VIRTUAL)\b/i,
    [TokenType.Constant]: /\b(?:TRUE|FALSE|NULL)\b/i,
    [TokenType.Type]: /\b(?:ANY|ASTRING|BFLOAT4|BFLOAT8|BLOB|MEMO|BOOL|BSTRING|BYTE|CSTRING|DATE|DECIMAL|DOUBLE|FLOAT4|LONG|LIKE|PDECIMAL|PSTRING|REAL|SHORT|SIGNED|SREAL|STRING|TIME|ULONG|UNSIGNED|USHORT|VARIANT)\b/i,
    [TokenType.ImplicitVariable]: /\b[A-Za-z][A-Za-z0-9_]+(?:\$|#|")\b/i,
    [TokenType.Delimiter]: /[,():]/i,
    [TokenType.Unknown]: /\S+/i
};
