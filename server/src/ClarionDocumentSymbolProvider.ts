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

        logger.warn(`🔍 [DocumentSymbolProvider] Processing ${tokens.length} tokens for document symbols.`);

        // ✅ Process `clarionDocument` token first (PROGRAM / MEMBER)
        const documentToken = tokens.find(t => t.type === TokenType.ClarionDocument);

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
            logger.warn(`⚠️ [DocumentSymbolProvider] No clarionDocument token found (PROGRAM or MEMBER missing?)`);
        }
        let tokenCounter = 0
        let outsideClassOrInterfaceOrMap = true;
        // ✅ Filter tokens before processing (only process relevant ones)
        tokens
            .filter(t => t.type === TokenType.Keyword || t.type === TokenType.Label || t.type === TokenType.Structure || t.type === TokenType.EndStatement)
            .forEach(token => {
                const upperValue = token.value.toUpperCase();
                if (token.type === TokenType.Structure) {
                    //        logger.info(`🔍 [DocumentSymbolProvider] Found Structure: ${token.value} at Line ${token.line}`);
                    // ✅ Detect MAP, CLASS, INTERFACE (ENTERING SCOPE)
                    if (["MAP", "CLASS", "INTERFACE"].includes(upperValue)) {
                        outsideClassOrInterfaceOrMap = false;
                        //  logger.info(`🚫 [DocumentSymbolProvider] ENTERED ${upperValue} at Line ${token.line}, PROCEDUREs will be skipped`);
                    }
                }

                // ✅ Detect END (EXITING SCOPE)
                if (token.type === TokenType.EndStatement) {
                    // Only reset if we were inside MAP/CLASS/INTERFACE
                    if (!outsideClassOrInterfaceOrMap) {
                        outsideClassOrInterfaceOrMap = true;
                        // logger.info(`✅ [DocumentSymbolProvider] EXITED MAP/CLASS/INTERFACE at Line ${token.line}, PROCEDUREs can be processed`);
                    }
                }

                // ✅ Handle PROCEDURE (only if OUTSIDE MAP/CLASS/INTERFACE)
                if (upperValue === "PROCEDURE" && outsideClassOrInterfaceOrMap) {
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
                } else if (upperValue === "PROCEDURE") {
                    //  logger.info(`🚫 [DocumentSymbolProvider] Skipping PROCEDURE at Line ${token.line} (Inside MAP/CLASS/INTERFACE)`);
                }

                // ✅ Handle ROUTINE
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
