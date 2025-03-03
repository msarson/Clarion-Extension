import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';
import { Token, TokenType } from './ClarionTokenizer.js';
import ClarionFileParser from './ClarionFileParser.js';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionDocumentSymbolProvider");
logger.setLevel("warn");
// ✅ Convert enum to const object for direct compatibility
const ClarionSymbolKind = {
    Root: SymbolKind.Module,
    Procedure: SymbolKind.Method,
    Routine: SymbolKind.Property,
    Variable: SymbolKind.Variable,
    Table: SymbolKind.Struct,
    TablesGroup: SymbolKind.Namespace
} as const;

export class ClarionDocumentSymbolProvider {

    public provideDocumentSymbols(tokens: Token[]): DocumentSymbol[] {
        const symbols: DocumentSymbol[] = [];
        logger.info("===============================================================================");
    
        // ✅ Keeps track of active structures (QUEUE, VIEW, GROUP, etc.) and their nodes
        const structureNodes: Map<string, DocumentSymbol> = new Map();
        let currentStructure: string = "";
    
        logger.info(`🔍 [DocumentSymbolProvider] Processing ${tokens.length} tokens for document symbols.`);
    
        // ✅ Find PROGRAM / MEMBER token (Clarion Source File)
        const documentToken = tokens.find(t => t.type === TokenType.ClarionDocument);
        let rootSymbol: DocumentSymbol | undefined;
        if (documentToken) {
            rootSymbol = DocumentSymbol.create(
                documentToken.value,
                "Clarion Source File",
                ClarionSymbolKind.Root,
                this.getTokenRange(tokens, documentToken.line, documentToken.line),
                this.getTokenRange(tokens, documentToken.line, documentToken.line),
                []
            );
            symbols.push(rootSymbol);
        } else {
            logger.info(`⚠️ [DocumentSymbolProvider] No clarionDocument token found (PROGRAM or MEMBER missing?)`);
        }
    
        // ✅ Map to track Class nodes
        const classNodes: Map<string, DocumentSymbol> = new Map();
        let currentProcedure: DocumentSymbol | null = null; 
        let insideDataBlock = false; 
        let insideRoutine = false; 
    
        for (const token of tokens) {
            const { type, value, line, subType, finishesAt } = token;
    
            // ✅ Detect CLASS and other structures
            if (type === TokenType.Label) {
                const nextToken = tokens[tokens.indexOf(token) + 1];
                if (nextToken && ["QUEUE", "GROUP", "CLASS"].includes(nextToken.value.toUpperCase())) {
                    const structType = nextToken.value.toUpperCase();
                    logger.info(`🔍 Found '${structType}' Structure '${value}' at Line ${line}`);
    
                    const structSymbol = DocumentSymbol.create(
                        value,
                        structType,
                        ClarionSymbolKind.TablesGroup,
                        this.getTokenRange(tokens, line, line),
                        this.getTokenRange(tokens, line, line),
                        []
                    );
    
                    symbols.push(structSymbol);
                    structureNodes.set(value, structSymbol);
    
                    if (structType === "CLASS") {
                        classNodes.set(value, structSymbol);
                    }
    
                    currentStructure = value;
                    continue;
                }
            }
    
            // ✅ Detect CLASS Properties (Inside QUEUE/GROUP/CLASS)
            if (type === TokenType.Label && currentStructure) {
                const nextToken = tokens[tokens.indexOf(token) + 1];
    
                // 🔥 Capture full type definition (e.g., STRING(80), CLASS(WindowManager))
                let variableType = nextToken?.value || "UnknownType";
                let lookaheadIndex = tokens.indexOf(nextToken) + 1;
                while (lookaheadIndex < tokens.length) {
                    const lookaheadToken = tokens[lookaheadIndex];
    
                    if (lookaheadToken.value.startsWith("(")) {
                        variableType += lookaheadToken.value;
                    } else if (lookaheadToken.value.endsWith(")")) {
                        variableType += lookaheadToken.value;
                        break;
                    } else if (variableType.includes("(")) {
                        variableType += lookaheadToken.value;
                    } else {
                        break;
                    }
                    lookaheadIndex++;
                }
    
                const varSymbol = DocumentSymbol.create(
                    value,
                    variableType,
                    ClarionSymbolKind.Variable,
                    this.getTokenRange(tokens, line, line),
                    this.getTokenRange(tokens, line, line),
                    []
                );
    
                if (structureNodes.has(currentStructure)) {
                    structureNodes.get(currentStructure)!.children!.push(varSymbol);
                    logger.info(`✅ Added Property '${value}' to '${currentStructure}'`);
                }
                continue;
            }
    
            // ✅ Detect PROCEDURES & METHODS
            if (subType === TokenType.Procedure && finishesAt !== undefined) {
                logger.info(`🔍 Found Procedure '${value}' at line ${line}`);
    
                // ✅ Extract procedure name
                const prevToken = tokens[tokens.indexOf(token) - 1];
                let procedureName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
                let parentNode: DocumentSymbol[];
    
                if (procedureName.includes(".")) {
                    // ✅ Class Method (Class.MethodName)
                    const [className, methodName] = procedureName.split(".", 2);
    
                    if (!classNodes.has(className)) {
                        const classSymbol = DocumentSymbol.create(
                            className,
                            "Class",
                            ClarionSymbolKind.TablesGroup,
                            this.getTokenRange(tokens, line, finishesAt),
                            this.getTokenRange(tokens, line, finishesAt),
                            []
                        );
                        symbols.push(classSymbol);
                        classNodes.set(className, classSymbol);
                        structureNodes.set(className, classSymbol);
                    }
    
                    parentNode = classNodes.get(className)!.children!;
                    procedureName = methodName;
                } else {
                    parentNode = rootSymbol ? rootSymbol.children! : symbols;
                }
    
                // ✅ Create procedure symbol
                currentProcedure = DocumentSymbol.create(
                    procedureName,
                    "",
                    ClarionSymbolKind.Procedure,
                    this.getTokenRange(tokens, line, finishesAt),
                    this.getTokenRange(tokens, line, finishesAt),
                    []
                );
    
                parentNode.push(currentProcedure);
                insideDataBlock = true;
                insideRoutine = false;
                continue;
            }
    
            // ✅ Detect ROUTINES inside the current procedure/method
            if (subType === TokenType.Routine && finishesAt !== undefined && currentProcedure) {
                const prevToken = tokens[tokens.indexOf(token) - 1];
                const routineLabel = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedRoutine";
    
                const routSymbol = DocumentSymbol.create(
                    routineLabel,
                    "Routine",
                    ClarionSymbolKind.Routine,
                    this.getTokenRange(tokens, line, finishesAt),
                    this.getTokenRange(tokens, line, finishesAt),
                    []
                );
    
                // ✅ Attach routine inside the current procedure
                currentProcedure.children!.push(routSymbol);
                insideDataBlock = false;
                insideRoutine = true;
    
                logger.info(`✅ Added Routine '${routineLabel}' inside Procedure '${currentProcedure.name}'`);
                continue;
            }
    
            // ✅ Detect END statement to properly close CLASS or QUEUE
            if (type === TokenType.EndStatement && currentStructure) {
                logger.info(`✅ Closing ${structureNodes.get(currentStructure)?.detail} '${currentStructure}' at Line ${line}`);
                structureNodes.delete(currentStructure);
                currentStructure = "";
            }
    
            // ✅ Close Structures Correctly
            if (token.finishesAt !== undefined && token.finishesAt <= line) {
                insideDataBlock = false;
                insideRoutine = false;
            }
        }
    
        logger.info(`🔍 [DocumentSymbolProvider] Finished processing tokens for document symbols.`);
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
