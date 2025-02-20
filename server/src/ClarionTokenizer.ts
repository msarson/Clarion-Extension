type Token = {
    type: string;
    value: string;
    line: number;
};

class ClarionTokenizer {
    private source: string;
    private position: number;
    private line: number;
    private tokens: Token[];

    constructor(source: string) {
        this.source = source;
        this.position = 0;
        this.line = 1;
        this.tokens = [];
    }

    private isWhitespace(char: string): boolean {
        return /\s/.test(char);
    }

    private isLetter(char: string): boolean {
        return /[a-zA-Z_]/.test(char);
    }

    private isDigit(char: string): boolean {
        return /[0-9]/.test(char);
    }

    private peek(): string {
        return this.source[this.position] || "";
    }

    private advance(): string {
        const char = this.source[this.position++];
        if (char === "\n") this.line++;
        return char;
    }

    private match(expected: string): boolean {
        if (this.peek() === expected) {
            this.advance();
            return true;
        }
        return false;
    }

    public tokenize(): Token[] {
        while (this.position < this.source.length) {
            let char = this.peek();

            // Skip whitespace
            if (this.isWhitespace(char)) {
                this.advance();
                continue;
            }

            // Skip comments (Clarion comments start with '!')
            if (char === "!") {
                while (this.peek() !== "\n" && this.position < this.source.length) {
                    this.advance();
                }
                continue;
            }

            // Identify identifiers & keywords (Allowing `:` for field references like Hea:AcctNumber)
            if (this.isLetter(char)) {
                let identifier = "";
                while (this.isLetter(this.peek()) || this.isDigit(this.peek()) || this.peek() === ":") {
                    identifier += this.advance();
                }

                const upperIdentifier = identifier.toUpperCase();
                const keywords = new Set([
                    "PROCEDURE", "CLASS", "MAP", "INTERFACE", "IF", "LOOP", "CASE", "OF", "END",
                    "APPLICATION", "VIEW", "RECORD", "GROUP", "CODE", "RETURN"
                ]);

                this.tokens.push({
                    type: keywords.has(upperIdentifier) ? "Keyword" : "Identifier",
                    value: identifier,
                    line: this.line
                });
                continue;
            }

            // Identify numbers
            if (this.isDigit(char)) {
                let number = "";
                while (this.isDigit(this.peek()) || this.peek() === ".") {
                    number += this.advance();
                }
                this.tokens.push({ type: "Number", value: number, line: this.line });
                continue;
            }

            // Identify strings (Clarion uses single quotes for strings)
            if (char === "'") {
                let str = "";
                this.advance(); // Skip opening quote
                while (this.peek() !== "'" && this.position < this.source.length) {
                    str += this.advance();
                }
                this.advance(); // Skip closing quote
                this.tokens.push({ type: "String", value: str, line: this.line });
                continue;
            }

            // Identify special characters & operators
            const operators = new Set(["=", "+", "-", "*", "/", "(", ")", ",", ".", "{", "}", ">", "<", "&", "|", "?"]);
            if (operators.has(char)) {
                this.tokens.push({ type: "Operator", value: this.advance(), line: this.line });
                continue;
            }

            // If we reach here, we encountered an unknown character
            console.warn(`Unknown character '${char}' at line ${this.line}`);
            this.advance();
        }

        return this.tokens;
    }
}

export default ClarionTokenizer;
