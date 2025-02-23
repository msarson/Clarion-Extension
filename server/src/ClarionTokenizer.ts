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
    TypeAnnotation, // ✅ NEW: Used for complex types like Queue, Group when passed as parameters
    ImplicitVariable,
    Structure,
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
}

export class ClarionTokenizer {
    private text: string;
    private tokens: Token[];
    private logMessage: (message: string) => void;

    constructor(text: string, logMessage: (message: string) => void) {
        this.text = text;
        this.tokens = [];
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

            // ✅ Check if the first word is a LABEL (Column 1), but ignore if the first character is '!'
            if (column === 0) {
                if (line.startsWith("!")) {
                    this.logMessage(`🔹 [DEBUG] Skipping label check: Line ${lineNumber} starts with '!', treating as comment.`);
                } else {
                    const labelMatch = line.match(/^(\S+)\s/); // Capture first word before space
                    if (labelMatch) {
                        this.tokens.push({
                            type: TokenType.Label,
                            value: labelMatch[1],
                            line: lineNumber,
                            start: column
                        });

                        this.logMessage(`✅ Matched: '${labelMatch[1]}' as Label at Line ${lineNumber}, Col ${column}`);

                        // Move position past the label
                        position += labelMatch[1].length + 1; // +1 to skip the space
                        column += labelMatch[1].length + 1;
                    }
                }
            }


            while (position < line.length) {
                const substring = line.slice(position);
                let matched = false;

                if (line.trim() === "") break;
                const orderedTokenTypes: TokenType[] = [
                    TokenType.Comment,
                    TokenType.LineContinuation,
                    TokenType.String,
                    TokenType.Variable,
                    TokenType.Type,
                    TokenType.FunctionArgumentParameter,  // ✅ Parameters must be detected before structures
                    TokenType.PointerParameter,
                    TokenType.FieldEquateLabel,
                    TokenType.Property,
                    TokenType.PropertyFunction,
                    TokenType.Keyword,
                    TokenType.Structure,  // ✅ Structures must be detected after parameters
                    TokenType.TypeAnnotation,
                    TokenType.Function,
                    TokenType.Directive,
                    
                    TokenType.Number,
                    TokenType.Operator,
                    TokenType.Class,
                    TokenType.Attribute,
                    TokenType.Constant,
                    
                    TokenType.ImplicitVariable,
                    TokenType.Delimiter,
                    TokenType.Unknown
                ];
                /** 🔍 Check for Other Tokens */
                for (const tokenType of orderedTokenTypes) {
                    //const tokenType = Number(tokenTypeKey) as TokenType;
                    const pattern = tokenPatterns[tokenType];
                    let match;

                    if (!pattern) continue; // ✅ Skip if pattern is undefined

                    while ((match = pattern.exec(substring)) !== null) {

                        if (match.index !== 0) break;

                        this.logMessage(`✅ Matched: '${match[0]}' as ${TokenType[tokenType]} at Line ${lineNumber}, Col ${column}`);

                        this.tokens.push({
                            type: tokenType,
                            value: match[0],
                            line: lineNumber,
                            start: column
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

export const tokenPatterns: Partial<Record<TokenType, RegExp>> = {
    [TokenType.Comment]: /!.*/i,
    [TokenType.LineContinuation]: /&?\s*\|.*/i,
    [TokenType.String]: /'([^']|'')*'/i,
    [TokenType.FunctionArgumentParameter]: /(?<=\()\s*'?[\w:*]+(?:\s*[,)]|'\s*[,)])/i,
    [TokenType.PointerParameter]: /\*\s*\b[A-Za-z_][A-Za-z0-9_:]*\b/i,
    [TokenType.FieldEquateLabel]: /\?[A-Za-z_][A-Za-z0-9_]*/i,

    [TokenType.Keyword]: /\b(?:RETURN|OF|ELSE|THEN|UNTIL|EXIT|NEW|END|PROCEDURE|ROUTINE)\b/i,

    // ✅ Excludes QUEUE when appearing inside parameters
    [TokenType.Structure]: /\b(?:APPLICATION|CASE|CLASS|GROUP|IF|INTERFACE|FILE|JOIN|LOOP|MAP|MENU|MENUBAR|MODULE|QUEUE(?!\s+\w+\))|RECORD|REPORT|SECTION|SHEET|TAB|TOOLBAR|VIEW|WINDOW|OPTION|ITEMIZE|EXECUTE|BEGIN|FORM|DETAIL|HEADER|FOOTER|BREAK|ACCEPT|OLE)\b/i,

    [TokenType.Function]: /\b(?:COLOR|LINK|DLL)\b(?=\s*\()/i,
    [TokenType.Directive]: /\b(?:ASSERT|BEGIN|COMPILE|EQUATE|INCLUDE|ITEMIZE|OMIT|ONCE|SECTION|SIZE)\b(?=\s*\()/i,
    [TokenType.Property]: /\b(?:HVSCROLL|SEPARATOR|LIST|RESIZE|DEFAULT|CENTER|MAX|SYSTEM|IMM|DRIVER|PROP|PROPLIST|EVENT|CREATE|BRUSH|LEVEL|STD|CURSOR|BEEP|REJECT|CHARSET|PEN|LISTZONE|BUTTON|MSGMODE|TEXT|FREEZE|DDE|FF_|OCX|DOCK|MATCH|PAPER|DRIVEROP|DATATYPE|GradientTypes|STD|ITEM|MDI|GRAY|HLP)\b/i,
    [TokenType.PropertyFunction]: /\b(?:FORMAT|FONT|USE|ICON|STATUS|MSG|TIP|AT|PROJECT|FROM|NAME|DLL)\b(?=\s*\()/i,

    [TokenType.Variable]: /\b[A-Z]+\:\w+\b/i,

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

    [TokenType.Unknown]: /\S+/i
};


