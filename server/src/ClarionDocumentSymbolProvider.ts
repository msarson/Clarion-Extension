import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';
import { Token, TokenType } from './ClarionTokenizer.js';
import ClarionFileParser from './ClarionFileParser.js';
import logger from './logger.js';

enum ClarionSymbolKind {
    Root = SymbolKind.Module,
    Procedure = SymbolKind.Method,
    Routine = SymbolKind.Property,
    Variable = SymbolKind.Variable,
    Table = SymbolKind.Struct,
    TablesGroup = SymbolKind.Namespace
}

export class ClarionDocumentSymbolProvider {
    public provideDocumentSymbols(tokens: Token[]): DocumentSymbol[] {
        const symbols: DocumentSymbol[] = [];
        const nodes: DocumentSymbol[][] = [symbols];
    
        let insideProcedure = false;
        let insideRoutine = false;
        let rootSymbol: DocumentSymbol | null = null;
    
        logger.info(`🔍 [DEBUG] Processing ${tokens.length} tokens for document symbols.`);
    
        // ✅ Process `clarionDocument` token first (PROGRAM / MEMBER)
        const documentToken = tokens.find(t => t.type === TokenType.clarionDocument);
        if (documentToken) {
            rootSymbol = DocumentSymbol.create(
                documentToken.value,
                "Clarion Source File",
                ClarionSymbolKind.Root as SymbolKind,
                this.getTokenRange(tokens, documentToken.line, documentToken.line),
                this.getTokenRange(tokens, documentToken.line, documentToken.line),
                []
            );
            nodes[nodes.length - 1].push(rootSymbol);
            nodes.push(rootSymbol.children!);
    
            // ✅ Extract TABLES immediately (no need to wait)
            ClarionFileParser.getFileSymbols(tokens, nodes);
        } else {
            logger.warn(`⚠️ [DEBUG] No clarionDocument token found (PROGRAM or MEMBER missing?)`);
        }
        let tokenCounter = 0
        let tokenCount = tokens.filter(t => 
            t.type === TokenType.Keyword || 
            t.type === TokenType.Label).length;
        // ✅ Filter tokens before processing (only process relevant ones)
        tokens
            .filter(t => t.type === TokenType.Keyword || t.type === TokenType.Label)
            .forEach(token => {
                tokenCounter++;
                const upperValue = token.value.toUpperCase();
               
                // ✅ Handle PROCEDURE (still inside `TokenType.Keyword`)
                if (upperValue === "PROCEDURE") {
                    if (insideRoutine) {
                        nodes.pop();
                        insideRoutine = false;
                        this.updateLastSymbolRange(nodes, tokens, token.line);
                    }
                    if (insideProcedure) {
                        nodes.pop();
                        insideProcedure = false;
                        this.updateLastSymbolRange(nodes, tokens, token.line);
                    }
    
                    const procSymbol = DocumentSymbol.create(
                        tokens[tokens.indexOf(token) - 1]?.value || "UnnamedProcedure",
                        "",
                        ClarionSymbolKind.Procedure as SymbolKind,
                        this.getTokenRange(tokens, token.line, token.line),
                        this.getTokenRange(tokens, token.line, token.line),
                        []
                    );
    
                    nodes[nodes.length - 1].push(procSymbol);
                    nodes.push(procSymbol.children!);
                    insideProcedure = true;
                }
    
                // ✅ Handle ROUTINE (still inside `TokenType.Keyword`)
                else if (upperValue === "ROUTINE") {
                    if (insideRoutine) {
                        nodes.pop();
                        insideRoutine = false;
                        this.updateLastSymbolRange(nodes, tokens, token.line);
                    }
    
                    const routSymbol = DocumentSymbol.create(
                        tokens[tokens.indexOf(token) - 1]?.value || "UnnamedRoutine",
                        "",
                        ClarionSymbolKind.Routine as SymbolKind,
                        this.getTokenRange(tokens, token.line, token.line),
                        this.getTokenRange(tokens, token.line, token.line),
                        []
                    );
    
                    nodes[nodes.length - 1].push(routSymbol);
                    nodes.push(routSymbol.children!);
                    insideRoutine = true;
                }
    
                // ✅ Handle VARIABLES
                else if (token.type === TokenType.Label) {
                    const varSymbol = DocumentSymbol.create(
                        token.value,
                        "",
                        ClarionSymbolKind.Variable as SymbolKind,
                        this.getTokenRange(tokens, token.line, token.line),
                        this.getTokenRange(tokens, token.line, token.line),
                        []
                    );
                    nodes[nodes.length - 1].push(varSymbol);
                }
            });
    
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
            logger.warn(`⚠️ [DEBUG] getTokenRange: Unable to find tokens for range (${startLine}-${endLine})`);
            return Range.create(startLine, 0, endLine, 0);
        }

        return Range.create(startToken.line, startToken.start, endToken.line, endToken.start + endToken.value.length);
    }

    private tryCreateRootSymbol(token: Token): { found: boolean; symbol?: DocumentSymbol } {
        let name = '';

        if (token.type === TokenType.Keyword && token.value.toUpperCase() === "MEMBER") {
            name = "MEMBER";
        } else if (token.type === TokenType.Keyword && token.value.toUpperCase() === "PROGRAM") {
            name = "PROGRAM";
        }

        if (name) {
            const rootSymbol = DocumentSymbol.create(
                name,
                "",
                ClarionSymbolKind.Root as SymbolKind,
                this.getTokenRange([token], token.line, token.line),
                this.getTokenRange([token], token.line, token.line),
                []
            );
            return { found: true, symbol: rootSymbol };
        }

        return { found: false };
    }
}
