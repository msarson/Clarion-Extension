import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';

import ClarionFileParser from './ClarionFileParser.js';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionDocumentSymbolProvider");
logger.setLevel("info");
import { globalClarionSettings, serverInitialized } from './server.js';
import { Token, TokenType } from './ClarionTokenizer.js';
// ✅ Convert enum to const object for direct compatibility
const ClarionSymbolKind = {
    Root: SymbolKind.Module,
    Procedure: SymbolKind.Method,
    Routine: SymbolKind.Property,
    Variable: SymbolKind.Variable,
    Table: SymbolKind.Struct,
    TablesGroup: SymbolKind.Namespace,
    Property: SymbolKind.Function // ✅ Added Property as Function (Can be changed)
} as const;


export class ClarionDocumentSymbolProvider {
    public extractStringContents(rawString: string): string {
        const match = rawString.match(/'([^']+)'/);  // ✅ Extract text inside single quotes
        return match ? match[1] : rawString;         // ✅ Return extracted name or fallback to raw value
    }

    
    public provideDocumentSymbols(tokens: Token[], documentUri: string): DocumentSymbol[] {
        if (!serverInitialized) {
            logger.warn(`⚠️ Server not initialized, skipping document symbols for: ${documentUri}`);
            return [];
        }
    
        const symbols: DocumentSymbol[] = [];
        const parentStack: DocumentSymbol[] = [];  // ✅ Tracks structure nesting
        let currentStructure: DocumentSymbol | null = null;
        let currentProcedure: DocumentSymbol | null = null;
        let insideDefinitionBlock: boolean = false; // ✅ Track if we're inside a definition block
    
        logger.info(`🔍 Processing ${tokens.length} tokens for document symbols in ${documentUri}.`);
    
        for (const token of tokens) {
            const { type, value, line, subType, finishesAt, executionMarker } = token;
    
            // ✅ Detect the start of a procedure definition block (before CODE)
            if (executionMarker && executionMarker.value.toUpperCase() === "CODE") {
                logger.info(`🚀 Entering execution block at Line ${executionMarker.line}. Definitions end here.`);
                insideDefinitionBlock = false; // ✅ Now we're in actual executable code
            }
    
            // ✅ Handle STRUCTURES (APPLICATION, QUEUE, GROUP, CLASS, etc.)
            if (type === TokenType.Structure) {
                logger.info(`📌 Found Structure '${value}' at Line ${line}`);
    
                // ✅ Use previous token as label if it's a Label
                const prevToken = tokens[tokens.indexOf(token) - 1];
                let labelName = prevToken?.type === TokenType.Label ? prevToken.value : null;
    
                // ✅ If no label, check for a TokenType.String after the structure
                if (!labelName) {
                    const nextToken = tokens[tokens.indexOf(token) + 1];
                    if (nextToken?.type === TokenType.String) {
                        labelName = this.extractStringContents(nextToken.value);
                    }
                }
    
                // ✅ Ensure correct formatting "STRUCTURE_TYPE (Label)"
                let structureName = `${value} (${labelName || "Unnamed"})`;
    
                const structureSymbol = DocumentSymbol.create(
                    structureName,  
                    "",
                    ClarionSymbolKind.TablesGroup,  
                    this.getTokenRange(tokens, line, finishesAt ?? line),
                    this.getTokenRange(tokens, line, finishesAt ?? line),
                    []
                );
    
                // ✅ If we have a parent structure, add this as a child
                if (currentStructure) {
                    currentStructure.children!.push(structureSymbol);
                    logger.info(`🔗 Nested '${structureName}' inside '${currentStructure.name}'`);
                } else {
                    symbols.push(structureSymbol);
                }
    
                // ✅ Push this structure onto the stack
                parentStack.push(structureSymbol);
                currentStructure = structureSymbol;
                continue;
            }
    
            // ✅ Handle PROCEDURES (Identified as `TokenType.Keyword` with value "PROCEDURE")
            if (type === TokenType.Keyword && value.toUpperCase() === "PROCEDURE" && finishesAt !== undefined) {
                logger.info(`📌 Found Procedure '${value}' at Line ${line}`);
    
                // ✅ Use previous token (if it’s a Label) as the Procedure name
                const prevToken = tokens[tokens.indexOf(token) - 1];
                let procedureName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
    
                const procedureSymbol = DocumentSymbol.create(
                    procedureName,
                    "Procedure",
                    ClarionSymbolKind.Procedure,
                    this.getTokenRange(tokens, line, finishesAt),
                    this.getTokenRange(tokens, line, finishesAt),
                    []
                );
    
                // ✅ If inside a CLASS, nest it under the CLASS
                if (currentStructure) {
                    currentStructure.children!.push(procedureSymbol);
                    logger.info(`🔗 Nested Procedure '${procedureName}' inside '${currentStructure.name}'`);
                } else {
                    symbols.push(procedureSymbol);
                }
    
                currentProcedure = procedureSymbol;  // ✅ Track current procedure
                insideDefinitionBlock = true; // ✅ Mark that we are inside a definition block
                continue;
            }
    
            // ✅ Handle PROCEDURE DEFINITIONS inside a PROCEDURE (Before CODE)
            if (insideDefinitionBlock && type === TokenType.Keyword && value.toUpperCase() === "PROCEDURE") {
                const prevToken = tokens[tokens.indexOf(token) - 1];
                const procedureDefName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedDefinition";
    
                const procedureDefSymbol = DocumentSymbol.create(
                    procedureDefName,
                    "Procedure Definition",
                    ClarionSymbolKind.Property,  // ✅ Treat procedure definitions as properties
                    this.getTokenRange(tokens, line, finishesAt ?? line),
                    this.getTokenRange(tokens, line, finishesAt ?? line),
                    []
                );
    
                // ✅ Ensure it is correctly nested inside the **procedure**
                if (currentProcedure) {
                    currentProcedure.children!.push(procedureDefSymbol);
                    logger.info(`✅ Added Procedure Definition '${procedureDefName}' inside Procedure '${currentProcedure.name}'`);
                } else {
                    logger.warn(`⚠️ Procedure Definition '${procedureDefName}' found but no currentProcedure set!`);
                    symbols.push(procedureDefSymbol);
                }
                continue;
            }
    
            // ✅ Handle END statements (closing a structure or procedure)
            if (type === TokenType.EndStatement) {
                if (parentStack.length > 0) {
                    const finishedStructure = parentStack.pop();
                    logger.info(`✅ Closing Structure '${finishedStructure!.name}' at Line ${line}`);
                    currentStructure = parentStack.length > 0 ? parentStack[parentStack.length - 1] : null;
                } else {
                    currentProcedure = null;  // ✅ Close the current procedure
                }
            }
        }
    
        logger.info(`✅ Finished processing tokens. ${symbols.length} top-level structures detected.`);
        return symbols;
    }
    

    
    






    private getTokenRange(tokens: Token[], startLine: number, endLine: number): Range {
        const startToken = tokens.find((t: Token) => t.line === startLine);
        const endToken = [...tokens].reverse().find((t: Token) => t.line === endLine);

        if (!startToken || !endToken) {
            logger.info(`⚠️ [DocumentSymbolProvider] getTokenRange: Unable to find tokens for range (${startLine}-${endLine})`);
            return Range.create(startLine, 0, endLine, 0);
        }

        return Range.create(startToken.line, startToken.start, endToken.line, endToken.start + endToken.value.length);
    }
}
