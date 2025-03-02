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
    
        logger.warn(`🔍 [DocumentSymbolProvider] Processing ${tokens.length} tokens for document symbols.`);
    
        // ✅ Find PROGRAM / MEMBER token
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
    
        for (const token of tokens) {
            const { type, value, line, subType, finishesAt } = token;
    
            if (subType === TokenType.Procedure && finishesAt !== undefined) {
                logger.warn(`🔍 [DocumentSymbolProvider] Found Procedure at line ${line}`);
    
                // ✅ Extract class name if present (before `.`)
                const prevToken = tokens[tokens.indexOf(token) - 1];
                let procedureName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
    
                let parentNode: DocumentSymbol[];
    
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
                } else {
                    // ✅ Global Procedure (No `.` in name)
                    parentNode = rootSymbol ? rootSymbol.children! : symbols;
                }
    
                // ✅ PROCEDURE: Use defined range
                const procSymbol = DocumentSymbol.create(
                    procedureName,
                    "",
                    ClarionSymbolKind.Procedure,
                    this.getTokenRange(tokens, line, finishesAt),
                    this.getTokenRange(tokens, line, finishesAt),
                    []
                );
    
                parentNode.push(procSymbol);
                nodes.push(procSymbol.children!);
            }
    
            if (subType === TokenType.Routine && finishesAt !== undefined) {
                const routSymbol = DocumentSymbol.create(
                    value || "UnnamedRoutine",
                    "",
                    ClarionSymbolKind.Routine,
                    this.getTokenRange(tokens, line, finishesAt),
                    this.getTokenRange(tokens, line, finishesAt),
                    []
                );
    
                // ✅ Attach to last added procedure or root
                if (nodes.length > 1) {
                    nodes[nodes.length - 1].push(routSymbol);
                    nodes.push(routSymbol.children!);
                } else {
                    symbols.push(routSymbol);
                    nodes.push(routSymbol.children!);
                }
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
