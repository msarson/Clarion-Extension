import { DocumentSymbol, SymbolKind, Range } from "vscode-languageserver-types";
import { StructureNode } from "./clarionStructureExtractor.js";
import { TokenType } from "./ClarionTokenizer.js";
import logger from "./logger.js";
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token } from './ClarionTokenizer.js';
import ClarionStructureExtractor from './clarionStructureExtractor.js';

enum ClarionSymbolKind {
    Root = SymbolKind.Module,
    Procedure = SymbolKind.Method,
    Routine = SymbolKind.Property,
    Variable = SymbolKind.Variable,
    Table = SymbolKind.Struct,
    TablesGroup = SymbolKind.Namespace
}

/**
 * Parses a Clarion FILE structure to extract:
 * - File name
 * - Driver type
 * - Fields inside the RECORD block
 */
class ClarionFileParser {
    private fileNode: StructureNode;

    constructor(fileNode: StructureNode) {
        this.fileNode = fileNode;
    }

    /**
     * Extracts the table name.
     */
    public getFileName(): string {
        return this.fileNode.name;
    }

    /**
     * Extracts the DRIVER type.
     */
    public getDriverType(): string {
        for (let i = 0; i < this.fileNode.tokens.length; i++) {
            const token = this.fileNode.tokens[i];

            if (token.type === TokenType.Property && token.value.toUpperCase() === "DRIVER") {
                const nextToken = this.fileNode.tokens[i + 2]; // Expect '(' at i+1 and driver name at i+2
                if (nextToken && nextToken.type === TokenType.String) {
                    logger.info(`📂 [DEBUG] Found DRIVER '${nextToken.value.replace(/'/g, "")}'`);
                    return nextToken.value.replace(/'/g, ""); // ✅ Remove quotes
                }
            }
        }
        return "Unknown";
    }
    public getPrefix(): string {
        for (let i = 0; i < this.fileNode.tokens.length; i++) {
            const token = this.fileNode.tokens[i];
            logger.debug(`[getprefix] token type: ${token.type} token value: ${token.value}`);
             if (token.type === TokenType.PropertyFunction && token.value.toUpperCase() === "PRE") {
                 const nextToken = this.fileNode.tokens[i + 2]; // Expect '(' at i+1 and driver name at i+2
                 if (nextToken && nextToken.type === TokenType.Variable) {
                     logger.debug(`📂 [DEBUG] Found prefix '${nextToken.value.replace(/'/g, "")}'`);
                     return nextToken.value.replace(/'/g, ""); // ✅ Remove quotes
                 }
            }
        }
        return "Unknown";
    }
    /**
     * Extracts fields from the RECORD structure.
     */
    public getFields(): { name: string; type: string; start: number }[] {
        const fields: { name: string; type: string; start: number }[] = [];

        // ✅ Look for the RECORD structure inside the FILE
        for (const child of this.fileNode.children) {
            if (child.type === "RECORD") {
                logger.info(`📂 [DEBUG] Processing RECORD inside FILE '${this.fileNode.name}'`);
        
                for (let i = 0; i < child.tokens.length; i++) {
                    const token = child.tokens[i];
        
                    if (token.type === TokenType.Label) {
                        const fieldName = token.value;
                        let typeToken = child.tokens[i + 1]; // Expect field type next
                        let fullType = typeToken ? typeToken.value : ""; // Start with base type
                        
                        if (typeToken && typeToken.type === TokenType.Type) {
                            let extraTokens: string[] = [];
                            let j = i + 2; // Start checking tokens AFTER type
        
                            // Collect extra details until next label or END
                            while (j < child.tokens.length) {
                                let nextToken = child.tokens[j];
        
                                // Skip comments
                                if (nextToken.type === TokenType.Comment) {
                                    j++;
                                    continue;
                                }
        
                                // Stop when reaching next field or END
                                if (nextToken.type === TokenType.Label || 
                                    (nextToken.type === TokenType.Keyword && nextToken.value.toUpperCase() === "END")) {
                                    break;
                                }
        
                                // Capture extra details like (7,2) or DIM(4)
                                extraTokens.push(nextToken.value);
                                j++;
                            }
        
                            // Append extra details to type, if any
                            if (extraTokens.length > 0) {
                                fullType += " " + extraTokens.join(""); // Keep formatting clean
                            }
        
                            fields.push({
                                name: fieldName,
                                type: fullType.trim(), // Ensure no extra spaces
                                start: token.line
                            });
        
                            logger.info(`📂 [FIELD] ${fieldName} - ${fullType.trim()} (Line: ${token.line})`);
                        }
                    }
                }
            }
        }
        
        

        return fields;
    }

    /**
     * Converts parsed file data into a VS Code DocumentSymbol.
     */
    public toDocumentSymbol(document: any): DocumentSymbol {
        logger.info(`📌 [DEBUG] Creating symbol for FILE '${this.fileNode.name}'`);

        // ✅ Extract driver type
        const driverType = this.getDriverType();

        // ✅ Create a DocumentSymbol for the TABLE
        const tableSymbol = DocumentSymbol.create(
            this.fileNode.name,
            `Driver: ${driverType}`, // ✅ Show driver type
            SymbolKind.Struct,
            this.getLineRange(document, this.fileNode.start, this.fileNode.end ?? this.fileNode.start),
            this.getLineRange(document, this.fileNode.start, this.fileNode.end ?? this.fileNode.start),
            []
        );

        // ✅ Process child RECORD structure
        for (const childNode of this.fileNode.children) {
            if (childNode.type === "RECORD") {
                logger.info(`📌 [DEBUG] Adding RECORD for FILE '${this.fileNode.name}'`);

                const recordSymbol = DocumentSymbol.create(
                    "Record",
                    "Table Fields",
                    SymbolKind.Struct,
                    this.getLineRange(document, childNode.start, childNode.end ?? childNode.start),
                    this.getLineRange(document, childNode.start, childNode.end ?? childNode.start),
                    []
                );

                // ✅ Extract fields from RECORD
                for (const field of this.getFields()) {
                    logger.info(`📂 [DEBUG] Adding FIELD '${field.name}' to RECORD`);

                    const fieldSymbol = DocumentSymbol.create(
                        field.name,
                        field.type, // ✅ Show field type
                        SymbolKind.Field,
                        this.getLineRange(document, field.start),
                        this.getLineRange(document, field.start),
                        []
                    );

                    recordSymbol.children!.push(fieldSymbol);
                }

                // ✅ Attach RECORD to TABLE
                tableSymbol.children!.push(recordSymbol);
            }
        }

        return tableSymbol;
    }

    private getLineRange(document: any, startLineNum: number, endLineNum?: number): Range {
        if (!endLineNum) endLineNum = startLineNum;
        let lastLineText = document.getText(Range.create(endLineNum, 0, endLineNum + 1, 0));
        return Range.create(startLineNum, 0, endLineNum, lastLineText.length);
    }

    // New static method for getting file symbols
    static getFileSymbols(tokens: Token[], nodes: DocumentSymbol[][]): void {
        logger.info(`📂 [DEBUG] Processing FILE symbols...`);
        
        const extractor = new ClarionStructureExtractor(tokens);
        const fileStructures = extractor.extractStructures("FILE");
        
        logger.info(`✅ [DEBUG] Found ${fileStructures.length} FILE structures.`);
        if (fileStructures.length === 0) return;
    
        // ✅ Create "Tables" parent node
        const tablesParentSymbol = DocumentSymbol.create(
            "Tables",
            "Table Definitions",
            ClarionSymbolKind.TablesGroup as SymbolKind,
            ClarionFileParser.getTokenRange(tokens, 0, tokens.length - 1),
            ClarionFileParser.getTokenRange(tokens, 0, tokens.length - 1),
            []
        );
    
        for (const file of fileStructures) {
            const fileParser = new ClarionFileParser(file);
            const driverType = fileParser.getDriverType();
            const prefix = fileParser.getPrefix();
            const fields = fileParser.getFields();
    
            const fileSymbol = DocumentSymbol.create(
                fileParser.getFileName(),
                `${driverType} PRE(${prefix})`,
                ClarionSymbolKind.Table as SymbolKind,
                ClarionFileParser.getTokenRange(tokens, file.start, file.end ?? file.start),
                ClarionFileParser.getTokenRange(tokens, file.start, file.end ?? file.start),
                []
            );
    
            // ✅ Add fields as children of the file
            for (const field of fields) {
                const fieldSymbol = DocumentSymbol.create(
                    field.name,
                    field.type,
                    SymbolKind.Field,
                    ClarionFileParser.getTokenRange(tokens, field.start),
                    ClarionFileParser.getTokenRange(tokens, field.start),
                    []
                );
    
                fileSymbol.children!.push(fieldSymbol);
            }
    
            tablesParentSymbol.children!.push(fileSymbol);
        }
    
        nodes[0].push(tablesParentSymbol);
    }
    static getTokenRange(tokens: Token[], startIndex: number, endIndex?: number): Range {
        const startToken = tokens[startIndex];
        const endToken = tokens[endIndex ?? startIndex];
    
        return Range.create(
            startToken.line, startToken.start, 
            endToken.line, endToken.start + endToken.value.length
        );
    }
    

    // Helper method for getting line ranges
    private static getLineRange(document: TextDocument, startLineNum: number, endLineNum?: number): Range {
        if (!endLineNum) endLineNum = startLineNum;
        let lastLineText = document.getText(Range.create(endLineNum, 0, endLineNum + 1, 0));
        return Range.create(startLineNum, 0, endLineNum, lastLineText.length);
    }
}

export default ClarionFileParser;
