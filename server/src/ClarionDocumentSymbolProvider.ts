import {
    DocumentSymbol,
    SymbolKind,
    Range
} from "vscode-languageserver";

import { Token, TokenType } from "./ClarionTokenizer";
import { ExecutionRangeProvider } from "./ExecutionRangeProvider";
import LoggerManager from "./logger";
import { ASTNode, DocumentAST } from "./DocumentAst";
const logger = LoggerManager.getLogger("DocumentSymbolProvider");
logger.setLevel("info");
let astLogged: boolean = false;
export class ClarionDocumentSymbolProvider {
    private getEnumName(value: number): string | undefined {
        return Object.entries(TokenType).find(([key, val]) => val === value)?.[0];
    }


    /** ✅ Converts AST Nodes to Document Symbols */
    // private convertASTToSymbols(node: ASTNode, symbols: DocumentSymbol[]): void {
    //     const symbolKind = this.getSymbolKindForASTType(node.type);

    //     const symbol: DocumentSymbol = {
    //         name: node.name,
    //         detail: node.type,
    //         kind: symbolKind,
    //         range: this.createRange(node.line, node.finishesAt ?? node.line),
    //         selectionRange: this.createRange(node.line, node.finishesAt ?? node.line),
    //         children: []
    //     };

    //     for (const child of node.children) {
    //         this.convertASTToSymbols(child, symbol.children!);
    //     }

    //     symbols.push(symbol);
    // }

    /** ✅ Determines the correct SymbolKind for AST Nodes */
    private getSymbolKindForASTType(type: string): SymbolKind {
        switch (type) {
            case "Procedure":
                return SymbolKind.Method;
            case "Routine":
                return SymbolKind.Property;
            case "Class":
                return SymbolKind.Class;
            case "Variable":
                return SymbolKind.Variable;
            case "Struct":
                return SymbolKind.Struct;
            case "Namespace":
                return SymbolKind.Namespace;
            default:
                return SymbolKind.Object;
        }
    }

    /** ✅ Logs the AST structure recursively */
    private logAST(node: ASTNode, depth: number): void {
        
        const indent = " ".repeat(depth * 2);
        logger.info(`${indent}🔹 ${node.type} - ${node.name} (Line: ${node.start}, Ends: ${node.end ?? 'Unknown'})`);
        for (const child of node.children) {
            this.logAST(child, depth + 1);
        }
        
    }

    public provideDocumentSymbols(tokens: Token[], documentUri: string): DocumentSymbol[] {




        logger.info(`🔍 Processing document symbols for ${documentUri}`);
        const symbols: DocumentSymbol[] = [];
        const stack: DocumentSymbol[] = [];
        if (!astLogged) {
            logger.info('Start if ast logging');
            const ast = new DocumentAST(tokens);
            const astRoot = ast.getAST();

            // ✅ Log AST structure
            this.logAST(astRoot, 0);
            astLogged = true;
            logger.info('End of AST logging');
        }

        // ✅ Convert AST to Document Symbols
        // this.convertASTToSymbols(astRoot, symbols);



        // ✅ Track execution ranges
        const documentLineCount = tokens.length > 0 ? tokens[tokens.length - 1].line : 0;
        const executionProvider = new ExecutionRangeProvider(tokens, documentLineCount);


        // ✅ Track procedure/methods with their start and finish lines
        const procedures: { symbol: DocumentSymbol, start: number, finish: number }[] = [];

        // ✅ First pass - Collect all procedures & methods
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (executionProvider.isInsideExecution(token.line)) continue; // Skip execution code

            if (token.type === TokenType.Keyword && token.value.toUpperCase() === "PROCEDURE") {
                if (token.finishesAt === undefined) continue;

                const procedureName = i > 0 ? tokens[i - 1].value : "UnnamedProcedure";
                const isMethod = i > 0 && tokens[i - 1].type === TokenType.ClassLabel;
                logger.info(`🔍 Processing ${isMethod ? "method" : "procedure"} ${procedureName}`);
                const procedureSymbol: DocumentSymbol = {
                    name: procedureName,
                    detail: isMethod ? "Class Method" : "Procedure",
                    kind: isMethod ? SymbolKind.Method : SymbolKind.Function,
                    range: this.createRange(token.line, token.finishesAt),
                    selectionRange: this.createRange(token.line, token.finishesAt),
                    children: []
                };

                procedures.push({ symbol: procedureSymbol, start: token.line, finish: token.finishesAt });

                if (stack.length > 0 && !isMethod) {
                    stack[stack.length - 1].children?.push(procedureSymbol);
                } else {
                    symbols.push(procedureSymbol);
                }

                stack.push(procedureSymbol);
            }
        }

        // ✅ Second pass - Process other tokens & assign them to correct parents
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (executionProvider.isInsideExecution(token.line)) continue; // Skip execution code

            let parentProcedure = procedures.find(proc => token.line >= proc.start && token.line <= proc.finish);
            //  logger.info(` 📌 Token ${token.value} ${this.getEnumName(token.type)} is inside ${parentProcedure?.symbol.name}`);
            const previousToken = i > 0 ? tokens[i - 1] : undefined;


            const validTypes = new Set([TokenType.Type, TokenType.Variable, TokenType.ReferenceVariable]);
            if (validTypes.has(token.type) && previousToken?.type === TokenType.Label) {
                logger.info(`🔍 Processing type ${token.value}`);
                const typeSymbol: DocumentSymbol = {
                    name: previousToken.value,
                    detail: token.value + this.extractTypeLength(tokens, i),
                    kind: SymbolKind.Variable,
                    range: this.createRange(token.line, token.finishesAt),
                    selectionRange: this.createRange(token.line, token.finishesAt),
                    children: []
                };
                if (parentProcedure) {
                    parentProcedure.symbol.children?.push(typeSymbol);
                } else {
                    symbols.push(typeSymbol);
                }
            }
            if (token.type === TokenType.Structure) {
                logger.info(`🔍 Processing structure ${token.value}`);
                const structureSymbol: DocumentSymbol = {
                    name: token.value,
                    detail: "Structure",
                    kind: SymbolKind.Struct,
                    range: this.createRange(token.line, token.finishesAt),
                    selectionRange: this.createRange(token.line, token.finishesAt),
                    children: []
                };

                if (parentProcedure) {
                    parentProcedure.symbol.children?.push(structureSymbol);
                } else {
                    symbols.push(structureSymbol);
                }

                if (token.children) {
                    for (const childToken of token.children) {
                        this.processNestedToken(structureSymbol, childToken);
                    }
                }
                else {
                    logger.info(`🔍 No children found for structure ${token.value}`);

                }
            }
        }

        return symbols;
    }
    /**
     * ✅ Extracts the length declaration (e.g., `(100)`) after a type token.
     * @param tokens The token array
     * @param tokenIndex The index of the type token in the array
     * @returns The extracted length (e.g., "(100)") or an empty string if none exists.
     */
    private extractTypeLength(tokens: Token[], tokenIndex: number): string {
        if (tokenIndex < 0 || tokenIndex >= tokens.length - 2) {
            return ""; // ✅ Invalid position or not enough tokens to check
        }

        const openParen = tokens[tokenIndex + 1];
        const numberToken = tokens[tokenIndex + 2];
        const closeParen = tokens[tokenIndex + 3];

        if (
            openParen?.type === TokenType.Delimiter && openParen.value === "(" &&
            numberToken?.type === TokenType.Number &&
            closeParen?.type === TokenType.Delimiter && closeParen.value === ")"
        ) {
            return `(${numberToken.value})`; // ✅ Successfully extracted length
        }

        return ""; // ❌ No valid length declaration found
    }

    private processNestedToken(parent: DocumentSymbol, token: Token): void {
        const nestedSymbol: DocumentSymbol = {
            name: token.value,
            detail: "Nested Structure",
            kind: SymbolKind.Struct,
            range: this.createRange(token.line, token.finishesAt),
            selectionRange: this.createRange(token.line, token.finishesAt),
            children: []
        };
        logger.info(`🔍 Processing nested token ${token.value}`);
        parent.children?.push(nestedSymbol);

        if (token.children) {
            for (const child of token.children) {
                this.processNestedToken(nestedSymbol, child);
            }
        }
    }

    private createRange(startLine: number, endLine: number | undefined): Range {
        return {
            start: { line: startLine, character: 0 },
            end: { line: endLine ?? startLine, character: 0 }
        };
    }
}
