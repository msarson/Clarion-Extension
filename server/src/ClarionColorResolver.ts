import { Color, ColorInformation, ColorPresentation, Position, Range, TextDocument } from 'vscode-languageserver-protocol';
import { Token, TokenType } from './ClarionTokenizer';

export interface ClarionRGB {
    r: number;
    g: number;
    b: number;
}

export class ClarionColorResolver {
    private static equates: Record<string, string> = {
        "COLOR:NONE": "-1",
        "COLOR:SCROLLBAR": "80000000H",
        "COLOR:BACKGROUND": "80000001H",
        "COLOR:ACTIVECAPTION": "80000002H",
        "COLOR:INACTIVECAPTION": "80000003H",
        "COLOR:MENU": "80000004H",
        "COLOR:MENUBAR": "8000001EH",
        "COLOR:WINDOW": "80000005H",
        "COLOR:WINDOWFRAME": "80000006H",
        "COLOR:MENUTEXT": "80000007H",
        "COLOR:WINDOWTEXT": "80000008H",
        "COLOR:CAPTIONTEXT": "80000009H",
        "COLOR:ACTIVEBORDER": "8000000AH",
        "COLOR:INACTIVEBORDER": "8000000BH",
        "COLOR:APPWORKSPACE": "8000000CH",
        "COLOR:HIGHLIGHT": "8000000DH",
        "COLOR:HIGHLIGHTTEXT": "8000000EH",
        "COLOR:BTNFACE": "8000000FH",
        "COLOR:BTNSHADOW": "80000010H",
        "COLOR:GRAYTEXT": "80000011H",
        "COLOR:BTNTEXT": "80000012H",
        "COLOR:INACTIVECAPTIONTEXT": "80000013H",
        "COLOR:BTNHIGHLIGHT": "80000014H",
        "COLOR:3DDSHADOW": "80000015H",
        "COLOR:3DLIGHT": "80000016H",
        "COLOR:INFOTEXT": "80000017H",
        "COLOR:INFOBACKGROUND": "80000018H",
        "COLOR:HOTLIGHT": "8000001AH",
        "COLOR:GRADIENTACTIVECAPTION": "8000001BH",
        "COLOR:GRADIENTINACTIVECAPTION": "8000001CH",
        "COLOR:MENUHIGHLIGHT": "8000001DH",
        "COLOR:BLACK": "0000000H",
        "COLOR:MAROON": "0000080H",
        "COLOR:GREEN": "0008000H",
        "COLOR:OLIVE": "0008080H",
        "COLOR:ORANGE": "00080FFH",
        "COLOR:NAVY": "0800000H",
        "COLOR:PURPLE": "0800080H",
        "COLOR:TEAL": "0808000H",
        "COLOR:GRAY": "0808080H",
        "COLOR:SILVER": "0C0C0C0H",
        "COLOR:RED": "00000FFH",
        "COLOR:LIME": "000FF00H",
        "COLOR:YELLOW": "000FFFFH",
        "COLOR:BLUE": "0FF0000H",
        "COLOR:FUCHSIA": "0FF00FFH",
        "COLOR:FUSCHIA": "0FF00FFH", // Alias
        "COLOR:AQUA": "0FFFF00H",
        "COLOR:WHITE": "0FFFFFFH",
        "COLOR:ROYALBLUE": "00E16941H",
        "COLOR:STEELBLUE": "00B48246H",
        "COLOR:SKYBLUE": "00EBCE87H",
        "COLOR:SAND": "00DEEBEFH",
        "COLOR:LIGHTSAND": "00D8E9ECH",
        "COLOR:LIGHTGRAY": "00E0E0E0H"
    };

    static resolve(value: string): ClarionRGB | null {
        let hex = value.trim();

        if (hex.startsWith("COLOR:")) {
            hex = this.equates[hex.toUpperCase()] ?? null;
            if (!hex) return null;
        }

        const match = /^-?([0-9A-F]+)H$/i.exec(hex);
        if (!match) return null;

        let rawHex = match[1].toUpperCase();
        if (/^[A-F]/.test(rawHex)) rawHex = "0" + rawHex;
        rawHex = rawHex.padStart(6, '0');

        const r = parseInt(rawHex.slice(-2), 16);
        const g = parseInt(rawHex.slice(-4, -2), 16);
        const b = parseInt(rawHex.slice(-6, -4), 16);

        return { r, g, b };
    }

    static matchEquate(r: number, g: number, b: number): string | null {
        // Create the BGR hex string from the RGB input
        const inputBgr = (b << 16) | (g << 8) | r;
    
        for (const [name, value] of Object.entries(this.equates)) {
            // Skip system colors (those starting with "8") for now
            if (value.startsWith("8")) continue;
            
            // Extract the hex value without the 'H' suffix
            const match = /^0*([0-9A-F]+)H$/i.exec(value);
            if (!match) continue;
    
            // Parse the hex value to a number
            const colorValue = parseInt(match[1], 16);
            
            // Compare the numeric values
            if (colorValue === inputBgr) {
                return name;
            }
        }
    
        return null;
    }
    
    
    static toHex(n: number): string {
        return n.toString(16).padStart(2, '0').toUpperCase();
    }
    
    /**
     * Provides color information for a document by analyzing tokens
     * @param tokens The tokens from the document
     * @param document The text document
     * @returns Array of color information
     */
    static provideDocumentColors(tokens: Token[], document: TextDocument): ColorInformation[] {
        const colors: ColorInformation[] = [];

        for (const token of tokens) {
            if (token.type === TokenType.ColorValue) {
                const rgb = this.resolve(token.value);

                if (rgb) {
                    const color: Color = {
                        red: rgb.r / 255,
                        green: rgb.g / 255,
                        blue: rgb.b / 255,
                        alpha: 1
                    };

                    const originalLine = document.getText(Range.create(
                        Position.create(token.line, 0),
                        Position.create(token.line + 1, 0)
                    ));

                    const charOffset = originalLine.indexOf(token.value); // First match of color literal on line
                    const startPos: Position = { line: token.line, character: charOffset };
                    const endPos: Position = { line: token.line, character: charOffset + token.value.length };

                    colors.push({
                        color,
                        range: Range.create(startPos, endPos)
                    });
                }
            }
        }

        return colors;
    }

    /**
     * Provides color presentation options for a given color
     * @param color The color to present
     * @param range The range in the document
     * @returns Array of color presentation options
     */
    static provideColorPresentations(color: Color, range: Range): ColorPresentation[] {
        const r = Math.round(color.red * 255);
        const g = Math.round(color.green * 255);
        const b = Math.round(color.blue * 255);

        const equate = this.matchEquate(r, g, b);
        const hex = `${this.toHex(b)}${this.toHex(g)}${this.toHex(r)}H`; // fallback

        return [{
            label: equate ?? hex,
            textEdit: {
                range,
                newText: equate ?? hex
            }
        }];
    }
}

