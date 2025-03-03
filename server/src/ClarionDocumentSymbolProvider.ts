import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';
import { Token, TokenType } from './ClarionTokenizer.js';
import ClarionFileParser from './ClarionFileParser.js';
import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionDocumentSymbolProvider");

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
    const nodes: DocumentSymbol[][] = [symbols];

    // ✅ Keeps track of active structures (QUEUE, VIEW, GROUP, etc.) and their nodes
    const structureNodes: Map<string, DocumentSymbol> = new Map();

    // ✅ Keeps track of the current open structure (QUEUE, VIEW, etc.)
    let currentStructure: string = "";

    logger.warn(`🔍 [DocumentSymbolProvider] Processing ${tokens.length} tokens for document symbols.`);

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
        nodes[0].push(rootSymbol);
    } else {
        logger.warn(`⚠️ [DocumentSymbolProvider] No clarionDocument token found (PROGRAM or MEMBER missing?)`);
    }

    // ✅ Map to hold class-based root nodes
    const classNodes: Map<string, DocumentSymbol> = new Map();
    let currentProcedure: DocumentSymbol | null = null; // ✅ Tracks current procedure/method
    let insideDataBlock = false; // ✅ Tracks if inside a DATA block
    let insideRoutine = false; // ✅ Tracks if inside a routine

    for (const token of tokens) {
        const { type, value, line, subType, finishesAt } = token;

        // ✅ Detect PROCEDURES & METHODS
        if (subType === TokenType.Procedure && finishesAt !== undefined) {
            logger.warn(`🔍 [DocumentSymbolProvider] Found Procedure at line ${line}`);

            // ✅ Extract class name if present (before `.`)
            const prevToken = tokens[tokens.indexOf(token) - 1];
            let procedureName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
            let parentNode: DocumentSymbol[] = rootSymbol ? rootSymbol.children! : symbols;

            if (procedureName.includes(".")) {
                // ✅ Class Method (Class.MethodName)
                const [className, methodName] = procedureName.split(".", 2);

                // ✅ Ensure a root node for this class exists
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
                }

                // ✅ Add method inside the class node
                parentNode = classNodes.get(className)!.children!;
                procedureName = methodName;
            }

            // ✅ PROCEDURE/METHOD: Use defined range
            currentProcedure = DocumentSymbol.create(
                procedureName,
                "",
                ClarionSymbolKind.Procedure,
                this.getTokenRange(tokens, line, finishesAt),
                this.getTokenRange(tokens, line, finishesAt),
                []
            );

            parentNode.push(currentProcedure);
            nodes.push(currentProcedure.children!);
            insideDataBlock = true; // ✅ Default to Data block (before CODE)
            insideRoutine = false; // ✅ Reset routine tracking
        }

        // ✅ Detect ROUTINES inside the current procedure/method
        if (subType === TokenType.Routine && finishesAt !== undefined && currentProcedure) {
            // ✅ Get the previous token (should be the label for the routine)
            const prevToken = tokens[tokens.indexOf(token) - 1];
            const routineLabel = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedRoutine";

            const routSymbol = DocumentSymbol.create(
                routineLabel,  // ✅ Use routine label instead of "ROUTINE"
                "Routine",
                ClarionSymbolKind.Routine,
                this.getTokenRange(tokens, line, finishesAt),
                this.getTokenRange(tokens, line, finishesAt),
                []
            );

            // ✅ Attach to the current procedure
            currentProcedure.children!.push(routSymbol);
            nodes.push(routSymbol.children!);
            insideDataBlock = false; // ✅ Default to execution mode
            insideRoutine = true; // ✅ Track that we are inside a routine
        }

        // ✅ Detect Execution Markers (DATA / CODE) & track variables
        if (type === TokenType.ExecutionMarker) {
            if (value.toUpperCase() === "CODE") {
                insideDataBlock = false; // ✅ CODE ends data declaration
            } else if (value.toUpperCase() === "DATA" && insideRoutine) {
                insideDataBlock = true; // ✅ DATA inside a routine starts a new variable block
            }
            logger.warn(`🔍 Execution Marker Detected: '${value}' at Line ${line} - insideDataBlock: ${insideDataBlock}`);
        }

        if (type === TokenType.Label && currentProcedure) {
            const nextToken = tokens[tokens.indexOf(token) + 1];
            const variableType = nextToken?.value || "UnknownType"; // ✅ Extract type from the next token
        
            const isComplexType = ["QUEUE", "VIEW", "RECORD", "GROUP", "FILE", "CLASS"].includes(variableType.toUpperCase());
        
            if (insideDataBlock || isComplexType) {
                if (isComplexType) {
                    // ✅ Create a structure node (e.g., `Queue:Browse:1` or `ThisWindow`)
                    const structSymbol = DocumentSymbol.create(
                        value,
                        variableType,
                        ClarionSymbolKind.TablesGroup,
                        this.getTokenRange(tokens, line, line),
                        this.getTokenRange(tokens, line, line),
                        []
                    );
        
                    currentProcedure.children!.push(structSymbol);
                    structureNodes.set(value, structSymbol); // ✅ Store reference for nested members
                    logger.warn(`✅ Created Structure '${value}' of type '${variableType}' at Line ${line}`);
        
                    // ✅ Track active CLASS or QUEUE (so its members get added as children)
                    if (variableType.toUpperCase() === "QUEUE" || variableType.toUpperCase() === "CLASS") {
                        currentStructure = value; // ✅ Track currently open CLASS or QUEUE
                        logger.warn(`🔍 Now tracking ${variableType} '${currentStructure}'`);
                    }
                } else {
                    // ✅ Regular variable inside DATA block
                    const varSymbol = DocumentSymbol.create(
                        value,
                        variableType,
                        ClarionSymbolKind.Variable,
                        this.getTokenRange(tokens, line, line),
                        this.getTokenRange(tokens, line, line),
                        []
                    );
        
                    // ✅ If inside a CLASS or QUEUE, add members as children
                    if (currentStructure && structureNodes.has(currentStructure)) {
                        structureNodes.get(currentStructure)!.children!.push(varSymbol);
                        logger.warn(`✅ Added '${value}' to ${structureNodes.get(currentStructure)!.detail} '${currentStructure}'`);
                    } else {
                        currentProcedure.children!.push(varSymbol);
                        logger.warn(`✅ Added Variable '${value}' to Procedure '${currentProcedure.name}'`);
                    }
                }
            } else {
                logger.warn(`⚠️ Skipping variable '${value}' at Line ${line} (not in DATA block or without structure)`);
            }
        }
        
        // ✅ Detect PROCEDURE declarations inside a CLASS
        if (subType === TokenType.Procedure && finishesAt !== undefined && currentStructure) {
            logger.warn(`🔍 Found CLASS Method '${value}' inside '${currentStructure}' at Line ${line}`);
        
            // ✅ Create method symbol
            const methodSymbol = DocumentSymbol.create(
                value,
                "Method",
                ClarionSymbolKind.Procedure,
                this.getTokenRange(tokens, line, finishesAt),
                this.getTokenRange(tokens, line, finishesAt),
                []
            );
        
            // ✅ Attach to the current CLASS
            structureNodes.get(currentStructure)!.children!.push(methodSymbol);
            logger.warn(`✅ Added Method '${value}' to CLASS '${currentStructure}'`);
        
            continue;
        }
        
        // ✅ Detect END statement to close CLASS or QUEUE properly
        if (type === TokenType.EndStatement && currentStructure) {
            logger.warn(`✅ Closing ${structureNodes.get(currentStructure)?.detail} '${currentStructure}' at Line ${line}`);
            structureNodes.delete(currentStructure); // ✅ Remove from active structures
            currentStructure = ""; // ✅ Reset tracking
        }
        
        

        // ✅ Close Structures Correctly
        if (token.finishesAt !== undefined && token.finishesAt <= line && nodes.length > 1) {
            nodes.pop();
        }
    }

    logger.warn(`🔍 [DocumentSymbolProvider] Finished processing tokens for document symbols.`);
    return symbols;
}

    

    private getTokenRange(tokens: Token[], startLine: number, endLine: number): Range {
        const startToken = tokens.find((t: Token) => t.line === startLine);
        const endToken = [...tokens].reverse().find((t: Token) => t.line === endLine);

        if (!startToken || !endToken) {
            logger.warn(`⚠️ [DocumentSymbolProvider] getTokenRange: Unable to find tokens for range (${startLine}-${endLine})`);
            return Range.create(startLine, 0, endLine, 0);
        }

        return Range.create(startToken.line, startToken.start, endToken.line, endToken.start + endToken.value.length);
    }
}
