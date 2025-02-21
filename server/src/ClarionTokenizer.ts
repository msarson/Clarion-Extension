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
    Structure,     // ✅ Structure TokenType for FILE, JOIN, etc.
    Procedure,     // ✅ New TokenType for PROCEDURE()
    LineContinuation, // ✅ For '|'
    Delimiter,     // ✅ Added for symbols like '(', ')', ','  
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
    private contextStack: { type: string, startLine: number }[]; // ✅ Stack to track context with start line

    constructor(text: string) {
        this.text = text;
        this.tokens = [];
        this.contextStack = []; // ✅ Initialize context stack
    }

    public tokenize(): Token[] {
        const lines = this.text.split(/\r?\n/);

        lines.forEach((line, lineNumber) => {
            let position = 0;
            let column = 0;

            // Capture leading whitespace for column tracking
            const leadingSpaces = line.match(/^(\s*)/);
            if (leadingSpaces) {
                column = leadingSpaces[0].length;
            }

            while (position < line.length) {
                const substring = line.slice(position);
                let matched = false;

                if (line.trim() === "") break; // Skip empty lines

                for (const tokenTypeKey of Object.keys(tokenPatterns)) {
                    const tokenType = Number(tokenTypeKey) as TokenType;
                    const pattern = tokenPatterns[tokenType];

                    let match;
                    while ((match = pattern.exec(substring)) !== null) {
                        if (match.index !== 0) break;  // Ensure match starts at current position

                        // ✅ LOG MATCHED TOKEN
                        console.log(`✅ Matched: '${match[0]}' as ${TokenType[tokenType]} (Pattern: ${pattern}) at Line ${lineNumber}, Col ${column}`);

                        // Ensure Labels are ONLY in column 0
                        if (tokenType === TokenType.Label && column !== 0) {
                            console.log(`❌ Skipping Misclassified Label at Col ${column}: '${match[0]}'`);
                            continue;
                        }

                        // Ensure Keywords are ONLY in column 2 or later
                        if (tokenType === TokenType.Keyword && column < 2) {
                            console.log(`❌ Skipping Misclassified Keyword at Col ${column}: '${match[0]}'`);
                            continue;
                        }

                        // ✅ Handle context stack for structures
                        if (tokenType === TokenType.Structure) {
                            this.contextStack.push({ type: match[0].toUpperCase(), startLine: lineNumber });
                        }

                        // ✅ Handle context stack for END
                        if (tokenType === TokenType.Keyword && match[0].toUpperCase() === "END" && this.contextStack.length > 0) {
                            const context = this.contextStack.pop();
                            if (context) {
                                console.log(`🔍 [DEBUG] Structure ${context.type} starts at line ${context.startLine} and ends at line ${lineNumber}`);
                            }
                        }

                        // ✅ Handle PROCEDURE within INTERFACE, CLASS, or MAP
                        if (tokenType === TokenType.Procedure && this.contextStack.length > 0) {
                            console.log(`✅ Matched PROCEDURE within ${this.contextStack[this.contextStack.length - 1].type} at Line ${lineNumber}`);
                        }

                        // ✅ Add the token
                        this.tokens.push({
                            type: tokenType,
                            value: match[0],
                            line: lineNumber,
                            start: column,
                            context: this.contextStack.length > 0 ? this.contextStack[this.contextStack.length - 1].type : undefined
                        });

                        // ✅ Move position forward based on match length
                        position += match[0].length;
                        column += match[0].length;
                        matched = true;
                        break; // ✅ Stop checking after a successful match
                    }

                    if (matched) break; // ✅ Stop checking other patterns if a match is found
                }

                if (!matched) {
                    // ✅ Ensure tokenizer moves forward even if no match
                    position++;
                    column++;
                }
            }
        });

        console.log(`📊 Tokenization Complete. Total Tokens: ${this.tokens.length}`);
        return this.tokens;
    }
}

export const tokenPatterns: Record<TokenType, RegExp> = {
    [TokenType.Comment]: /!.*/i,
    [TokenType.LineContinuation]: /&?\s*\|.*/i,

    [TokenType.String]: /'([^']|'')*'/i, // ✅ Fixed to handle multiple strings properly
    [TokenType.Keyword]: /\b(?:RETURN|OF|ELSE|THEN|UNTIL|EXIT|NEW|END)\b/i,
    [TokenType.Structure]: /\b(?:APPLICATION|CASE|CLASS|GROUP|IF|INTERFACE|JOIN|LOOP|MAP|MENU|MENUBAR|MODULE|QUEUE|RECORD|REPORT|SECTION|SHEET|TAB|TOOLBAR|VIEW|WINDOW)\b/i,
    [TokenType.Procedure]: /\bPROCEDURE\b/i,
    [TokenType.Function]: /\b(?:PROJECT|STATUS|AT)\b/i,
    [TokenType.Directive]: /\b(?:ASSERT|BEiN|COMPILE|EQUATE|INCLUDE|ITEMIZE|OMIT|ONCE|SECTION|SIZE)\b/i,
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
