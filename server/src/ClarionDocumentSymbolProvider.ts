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

    // public provideDocumentSymbols(tokens: Token[]): DocumentSymbol[] {
    //     const symbols: DocumentSymbol[] = [];
    //     const nodes: DocumentSymbol[][] = [symbols];

    //     let insideProcedure = false;
    //     let insideRoutine = false;
    //     let rootSymbol: DocumentSymbol | null = null;

    //     logger.warn(`🔍 [DocumentSymbolProvider] Processing ${tokens.length} tokens for document symbols.`);

    //     // ✅ Process `clarionDocument` token first (PROGRAM / MEMBER)
    //     const documentToken = tokens.find(t => t.type === TokenType.ClarionDocument);

    //     if (documentToken) {
    //         rootSymbol = DocumentSymbol.create(
    //             documentToken.value,
    //             "Clarion Source File",
    //             ClarionSymbolKind.Root,
    //             this.getTokenRange(tokens, documentToken.line, documentToken.line),
    //             this.getTokenRange(tokens, documentToken.line, documentToken.line),
    //             []
    //         );
    //         nodes[nodes.length - 1].push(rootSymbol);
    //         nodes.push(rootSymbol.children!);

    //         // ✅ Extract TABLES immediately (no need to wait)
    //         ClarionFileParser.getFileSymbols(tokens, nodes);
    //     } else {
    //         logger.warn(`⚠️ [DocumentSymbolProvider] No clarionDocument token found (PROGRAM or MEMBER missing?)`);
    //     }

    //     let outsideClassOrInterfaceOrMap = true;

    //     // ✅ Filter tokens before processing (only process relevant ones)
    //     tokens
    //         .filter(t => t.type === TokenType.Keyword || t.type === TokenType.Label || t.type === TokenType.Structure || t.type === TokenType.EndStatement)
    //         .forEach(token => {
    //             const upperValue = token.value.toUpperCase();
                
    //             if (token.type === TokenType.Structure) {
    //                 // ✅ Detect MAP, CLASS, INTERFACE (ENTERING SCOPE)
    //                 if (["MAP", "CLASS", "INTERFACE"].includes(upperValue)) {
    //                     outsideClassOrInterfaceOrMap = false;
    //                 }
    //             }

    //             // ✅ Detect END (EXITING SCOPE)
    //             if (token.type === TokenType.EndStatement && !outsideClassOrInterfaceOrMap) {
    //                 outsideClassOrInterfaceOrMap = true;
    //             }

    //             // ✅ Handle PROCEDURE (only if OUTSIDE MAP/CLASS/INTERFACE)
    //             if (upperValue === "PROCEDURE" && outsideClassOrInterfaceOrMap) {
    //                 if (insideRoutine) {
    //                     nodes.pop();
    //                     insideRoutine = false;
    //                     this.updateLastSymbolRange(nodes, tokens, token.line);
    //                 }
    //                 if (insideProcedure) {
    //                     nodes.pop();
    //                     insideProcedure = false;
    //                     this.updateLastSymbolRange(nodes, tokens, token.line);
    //                 }

    //                 const procSymbol = DocumentSymbol.create(
    //                     tokens[tokens.indexOf(token) - 1]?.value || "UnnamedProcedure",
    //                     "",
    //                     ClarionSymbolKind.Procedure,
    //                     this.getTokenRange(tokens, token.line, token.line),
    //                     this.getTokenRange(tokens, token.line, token.line),
    //                     []
    //                 );

    //                 nodes[nodes.length - 1].push(procSymbol);
    //                 nodes.push(procSymbol.children!);
    //                 insideProcedure = true;
    //             }

    //             // ✅ Handle ROUTINE
    //             else if (upperValue === "ROUTINE") {
    //                 if (insideRoutine) {
    //                     nodes.pop();
    //                     insideRoutine = false;
    //                     this.updateLastSymbolRange(nodes, tokens, token.line);
    //                 }

    //                 const routSymbol = DocumentSymbol.create(
    //                     tokens[tokens.indexOf(token) - 1]?.value || "UnnamedRoutine",
    //                     "",
    //                     ClarionSymbolKind.Routine,
    //                     this.getTokenRange(tokens, token.line, token.line),
    //                     this.getTokenRange(tokens, token.line, token.line),
    //                     []
    //                 );

    //                 nodes[nodes.length - 1].push(routSymbol);
    //                 nodes.push(routSymbol.children!);
    //                 insideRoutine = true;
    //             }

    //             // ✅ Handle VARIABLES
    //             else if (token.type === TokenType.Label) {
    //                 const varSymbol = DocumentSymbol.create(
    //                     token.value,
    //                     "",
    //                     ClarionSymbolKind.Variable,
    //                     this.getTokenRange(tokens, token.line, token.line),
    //                     this.getTokenRange(tokens, token.line, token.line),
    //                     []
    //                 );
    //                 nodes[nodes.length - 1].push(varSymbol);
    //             }
    //         });

    //     logger.warn(`🔍 [DocumentSymbolProvider] Finished processing tokens for document symbols.`);

    //     return symbols;
    // }

    public provideDocumentSymbols(tokens: Token[]): DocumentSymbol[] {
        const symbols: DocumentSymbol[] = [];
        const nodes: DocumentSymbol[][] = [symbols];
    
        logger.warn(`🔍 [DocumentSymbolProvider] Processing ${tokens.length} tokens for document symbols.`);
    
        // ✅ Find PROGRAM / MEMBER token
        const documentToken = tokens.find(t => t.type === TokenType.ClarionDocument);
        if (documentToken) {
            const rootSymbol = DocumentSymbol.create(
                documentToken.value,
                "Clarion Source File",
                ClarionSymbolKind.Root,
                this.getTokenRange(tokens, documentToken.line, documentToken.line),
                this.getTokenRange(tokens, documentToken.line, documentToken.line),
                []
            );
            nodes[nodes.length - 1].push(rootSymbol);
            nodes.push(rootSymbol.children!);
              //         // ✅ Extract TABLES immediately (no need to wait)
            ClarionFileParser.getFileSymbols(tokens, nodes);
        } else {
            logger.warn(`⚠️ [DocumentSymbolProvider] No clarionDocument token found (PROGRAM or MEMBER missing?)`);
        }
    
        // ✅ Process tokens in a single pass
        for (const token of tokens) {
            const { type, value, line, isProcedure, procedureFinishesAt, isRoutine, routineFinishesAt, isStructure, structureFinishesAt } = token;
    
            // if (isStructure && structureFinishesAt !== undefined) {
            //     // ✅ STRUCTURE: CLASS, MAP, INTERFACE, GROUP, FILE, etc.
            //     const structSymbol = DocumentSymbol.create(
            //         value,
            //         "Structure",
            //         ClarionSymbolKind.TablesGroup,
            //         this.getTokenRange(tokens, line, structureFinishesAt),
            //         this.getTokenRange(tokens, line, structureFinishesAt),
            //         []
            //     );
            //     nodes[nodes.length - 1].push(structSymbol);
            //     nodes.push(structSymbol.children!);
            // }
    
            if (token.isProcedure && token.procedureFinishesAt !== undefined) {
                logger.warn(`🔍 [DocumentSymbolProvider] Found Procedure at line ${line}`);
            
                // ✅ Get the previous token as the procedure label (if it's a Label)
                const prevToken = tokens[tokens.indexOf(token) - 1];
                const procedureName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
            
                // ✅ PROCEDURE: Use defined range
                const procSymbol = DocumentSymbol.create(
                    procedureName,
                    "",
                    ClarionSymbolKind.Procedure,
                    this.getTokenRange(tokens, line, token.procedureFinishesAt),
                    this.getTokenRange(tokens, line, token.procedureFinishesAt),
                    []
                );
            
                nodes[nodes.length - 1].push(procSymbol);
                nodes.push(procSymbol.children!);
            }
            
    
            if (isRoutine && routineFinishesAt !== undefined) {
                // ✅ ROUTINE: Use defined range
                const routSymbol = DocumentSymbol.create(
                    value || "UnnamedRoutine",
                    "",
                    ClarionSymbolKind.Routine,
                    this.getTokenRange(tokens, line, routineFinishesAt),
                    this.getTokenRange(tokens, line, routineFinishesAt),
                    []
                );
                nodes[nodes.length - 1].push(routSymbol);
                nodes.push(routSymbol.children!);
            }
    
            // if (type === TokenType.Label) {
            //     // ✅ VARIABLE (Label)
            //     const varSymbol = DocumentSymbol.create(
            //         value,
            //         "",
            //         ClarionSymbolKind.Variable,
            //         this.getTokenRange(tokens, line, line),
            //         this.getTokenRange(tokens, line, line),
            //         []
            //     );
            //     nodes[nodes.length - 1].push(varSymbol);
            // }
    
            // ✅ CLOSE Nested Structures at their Finish Lines
            if (structureFinishesAt !== undefined && structureFinishesAt <= line) nodes.pop();
            if (procedureFinishesAt !== undefined && procedureFinishesAt <= line) nodes.pop();
            if (routineFinishesAt !== undefined && routineFinishesAt <= line) nodes.pop();
        }
    
        logger.warn(`🔍 [DocumentSymbolProvider] Finished processing tokens for document symbols.`);
        return symbols;
    }
    
    private updateLastSymbolRange(nodes: DocumentSymbol[][], tokens: Token[], endLine: number): void {
        if (nodes.length === 0) return;

        const currentNodes = nodes[nodes.length - 1];
        if (currentNodes.length > 0) {
            const lastSymbol = currentNodes.pop()!;

            // 🔍 Fix: Ensure we're passing the tokens array, NOT nodes
            lastSymbol.range = this.getTokenRange(tokens, lastSymbol.range.start.line, endLine);

            currentNodes.push(lastSymbol);
        }
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

    // private tryCreateRootSymbol(token: Token): { found: boolean; symbol?: DocumentSymbol } {
    //     let name = '';

    //     if (token.type === TokenType.Keyword && token.value.toUpperCase() === "MEMBER") {
    //         name = "MEMBER";
    //     } else if (token.type === TokenType.Keyword && token.value.toUpperCase() === "PROGRAM") {
    //         name = "PROGRAM";
    //     }

    //     if (name) {
    //         const rootSymbol = DocumentSymbol.create(
    //             name,
    //             "",
    //             ClarionSymbolKind.Root,
    //             this.getTokenRange(tokens, token.line, token.line),
    //             this.getTokenRange(tokens, token.line, token.line),
    //             []
    //         );
    //         return { found: true, symbol: rootSymbol };
    //     }

    //     return { found: false };
    // }
}
