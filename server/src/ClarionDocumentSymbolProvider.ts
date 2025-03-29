import { DocumentSymbol, Range, SymbolKind } from 'vscode-languageserver-types';

import LoggerManager from './logger';
const logger = LoggerManager.getLogger("ClarionDocumentSymbolProvider");
logger.setLevel("error");
import { serverInitialized } from './server.js';
import { Token, TokenType } from './ClarionTokenizer.js';

const ClarionSymbolKind = {
    Root: SymbolKind.Module,
    Procedure: SymbolKind.Function,
    Routine: SymbolKind.Property,
    Variable: SymbolKind.Variable,
    Table: SymbolKind.Struct,
    TablesGroup: SymbolKind.Namespace,
    Property: SymbolKind.Function,
    Method: SymbolKind.Function,
    Class: SymbolKind.Class
} as const;

const clarionStructureKindMap: Record<string, SymbolKind> = {
    CLASS: SymbolKind.Class,
    WINDOW: SymbolKind.Interface,       // 🧩
    SHEET: SymbolKind.Module,           // 📦
    TAB: SymbolKind.EnumMember,         // #
    GROUP: SymbolKind.Struct,           // 🏗️
    QUEUE: SymbolKind.Array,            // 📚
    REPORT: SymbolKind.File,            // 📄
    JOIN: SymbolKind.Event,             // 🟢
    APPLICATION: SymbolKind.Interface,  // same as WINDOW
    TOOLBAR: SymbolKind.Object,         // 🧱
    MENUBAR: SymbolKind.Object,         // 🧱
    MENU: SymbolKind.Enum,              // 📜
    OPTION: SymbolKind.Constant         // 🔘
};
export class ClarionDocumentSymbolProvider {
    classSymbolMap: Map<string, DocumentSymbol> = new Map();
    public extractStringContents(rawString: string): string {
        const match = rawString.match(/'([^']+)'/);
        return match ? match[1] : rawString;
    }

    public provideDocumentSymbols(tokens: Token[], documentUri: string): DocumentSymbol[] {
        if (!serverInitialized) {
            logger.warn(`⚠️ Server not initialized, skipping document symbols for: ${documentUri}`);
            return [];
        }
        this.classSymbolMap.clear();
        const symbols: DocumentSymbol[] = [];
        const parentStack: DocumentSymbol[] = [];
        let currentStructure: DocumentSymbol | null = null;


        let currentProcedure: DocumentSymbol | null = null;
        let currentClassImplementation: DocumentSymbol | null = null;
        let insideDefinitionBlock = false;


        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const { type, value, line, subType, finishesAt, executionMarker } = token;
            if (executionMarker?.value.toUpperCase() === "CODE") {
                insideDefinitionBlock = false;
            }

            if (type === TokenType.Structure) {

                this.handleStructureToken(tokens, i, symbols, parentStack, currentStructure);
                currentStructure = parentStack[parentStack.length - 1] ?? null;
                continue;
            }
            if (type === TokenType.PropertyFunction && value.toUpperCase() === "PROJECT") {
                this.handleProjectToken(tokens, i, symbols, currentStructure, currentProcedure);
                continue;
            }


            if ((subType === TokenType.Procedure || subType === TokenType.Class)) {
                const isImplementation = token.executionMarker?.value.toUpperCase() === "CODE";
                if (isImplementation || token.finishesAt !== undefined) {
                    const result = this.handleProcedureOrClassToken(tokens, i, symbols, currentStructure);
                    currentProcedure = result.procedureSymbol;
                    currentClassImplementation = result.classImplementation;
                    insideDefinitionBlock = true;
                } else {
                    this.handleProcedureDefinitionToken(tokens, i, symbols, currentStructure);
                }
                continue;
            }



            const insideClassOrModule =
                currentStructure?.kind === SymbolKind.Class ||
                currentStructure?.name?.startsWith("MODULE");

            if ((insideDefinitionBlock || insideClassOrModule) &&
                type === TokenType.Keyword &&
                value.toUpperCase() === "PROCEDURE") {

                this.handleProcedureDefinitionToken(tokens, i, symbols, currentStructure);
                continue;
            }

            if ((type === TokenType.Type || type === TokenType.ReferenceVariable || type === TokenType.Variable) && i > 0) {
                this.handleVariableToken(tokens, i, symbols, currentStructure, currentProcedure);
                continue;
            }

            if (type === TokenType.EndStatement) {
                const result = this.handleEndStatementToken(parentStack, line);
                currentStructure = result.currentStructure;
                currentProcedure = result.currentProcedure;
            }
        }
        const lastToken = tokens.at(-1);

        // No need for final sorting here since we're sorting as symbols are added
        // This ensures symbols are already in the correct order when VS Code renders the outline


        return symbols;
    }
    private handleProjectToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentStructure: DocumentSymbol | null,
        currentProcedure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line } = token;

        // Extract what's inside the parentheses: PROJECT(INV:Customer)
        let projectValue = "PROJECT";
        const parenStart = tokens[index + 1];
        const parenContent = [];

        let j = index + 2;
        let parenDepth = 1;

        while (j < tokens.length && parenDepth > 0) {
            const t = tokens[j];
            if (t.value === "(") parenDepth++;
            else if (t.value === ")") parenDepth--;

            if (parenDepth > 0) parenContent.push(t.value);
            j++;
        }

        if (parenContent.length > 0) {
            projectValue = parenContent.join("").trim();
        }

        const projectSymbol = DocumentSymbol.create(
            "PROJECT",
            "(" + projectValue + ")",
            SymbolKind.Property,
            this.getTokenRange(tokens, line, line),
            this.getTokenRange(tokens, line, line),
            []
        );

        const target = currentStructure || currentProcedure;
        this.addSymbolToParent(projectSymbol, target, symbols);
    }



    private handleStructureToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        parentStack: DocumentSymbol[],
        currentStructure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { value, line, finishesAt } = token;

        const foldingOnly = ["IF", "LOOP", "CASE", "BEGIN", "EXECUTE", "ITEMIZE", "BREAK", "ACCEPT"];
        if (foldingOnly.includes(value.toUpperCase())) return;

        if (value.toUpperCase() === "MODULE") {
            const sameLineTokens = tokens.filter(t => t.line === token.line);
            const currentIndex = sameLineTokens.findIndex(t => t === token);

            // Look backwards on the same line for a comma (i.e., inside `CLASS(...)`)
            for (let j = currentIndex - 1; j >= 0; j--) {
                const prev = sameLineTokens[j];
                if (prev.value === ',') {
                    return;
                }
                if (prev.value === '(' || prev.type === TokenType.Structure || prev.type === TokenType.Keyword) {
                    break; // likely not an attribute list
                }
            }
        }

        const labelName = this.findStructureLabelName(tokens, index);
        const upperValue = value.toUpperCase();
        const structureKind = clarionStructureKindMap[upperValue] ?? ClarionSymbolKind.TablesGroup;

        let displayName: string;

        if (upperValue === "JOIN") {
            let joinArgs = "";
            const parenContent: string[] = [];
            let j = index + 2;
            let parenDepth = 1;

            while (j < tokens.length && parenDepth > 0) {
                const t = tokens[j];
                if (t.value === "(") parenDepth++;
                else if (t.value === ")") parenDepth--;

                if (parenDepth > 0) parenContent.push(t.value);
                j++;
            }

            joinArgs = parenContent.join("").trim();
            displayName = `JOIN (${joinArgs})`;
        } else {
            displayName = labelName ? `${value} (${labelName})` : value;
        }

        const structureSymbol = DocumentSymbol.create(
            displayName,
            "",
            structureKind,
            this.getTokenRange(tokens, line, finishesAt ?? line),
            this.getTokenRange(tokens, line, finishesAt ?? line),
            []
        );

        // CLASS support: inject Properties/Methods
        if (upperValue === "CLASS" && labelName) {
            this.classSymbolMap.set(labelName.toUpperCase(), structureSymbol);

            const propsContainer = DocumentSymbol.create(
                "Properties",
                "",
                SymbolKind.Property,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            (propsContainer as any).sortText = "0001";

            const methodsContainer = DocumentSymbol.create(
                "Methods",
                "",
                SymbolKind.Method,
                structureSymbol.range,
                structureSymbol.range,
                []
            );
            (methodsContainer as any).sortText = "0002";

            (structureSymbol as any).$clarionProps = propsContainer;
            (structureSymbol as any).$clarionMethods = methodsContainer;

            structureSymbol.children!.push(propsContainer);
            structureSymbol.children!.push(methodsContainer);
        }




        this.addSymbolToParent(structureSymbol, currentStructure, symbols);
        parentStack.push(structureSymbol);
    }



    private findStructureLabelName(tokens: Token[], index: number): string | null {
        const prevToken = tokens[index - 1];
        let labelName = prevToken?.type === TokenType.Label ? prevToken.value : null;

        if (!labelName) {
            const startIndex = index;
            const maxLookahead = 5;
            for (let j = 1; j <= maxLookahead; j++) {
                const lookahead = tokens[startIndex + j];
                if (!lookahead) break;
                if (lookahead.value === '(') continue;
                if (lookahead.type === TokenType.String) {
                    labelName = this.extractStringContents(lookahead.value);
                    break;
                }
                if ([TokenType.Label, TokenType.Structure, TokenType.Keyword].includes(lookahead.type)) {
                    break;
                }
            }
        }

        return labelName;
    }

    private createStructureSymbol(
        tokens: Token[],
        name: string,
        startLine: number,
        endLine: number
    ): DocumentSymbol {
        return DocumentSymbol.create(
            name,
            "",
            ClarionSymbolKind.TablesGroup,
            this.getTokenRange(tokens, startLine, endLine),
            this.getTokenRange(tokens, startLine, endLine),
            []
        );
    }

    private handleProcedureOrClassToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentStructure: DocumentSymbol | null
    ): { procedureSymbol: DocumentSymbol, classImplementation: DocumentSymbol | null } {
        const token = tokens[index];
        const { line, finishesAt } = token;
        const prevToken = tokens[index - 1];
        const procedureName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedProcedure";
        const classMatch = procedureName.includes('.') ? procedureName.split('.')[0] : null;

        let container: DocumentSymbol | null = currentStructure;
        let classImplementation: DocumentSymbol | null = null;

        // New: Check if method line is inside any class range
        for (const classSymbol of this.classSymbolMap.values()) {
            const classStart = classSymbol.range.start.line;
            const classEnd = classSymbol.range.end.line;
            if (line >= classStart && line <= classEnd) {
                container = classSymbol;
                break;
            }
        }

        // Fallback: old behavior if no range match but name exists
        if (!container && classMatch) {
            classImplementation = this.findOrCreateClassImplementation(
                symbols, classMatch, tokens, line, finishesAt ?? line
            );
            container = classImplementation;
        }


        const shortName = classMatch ? procedureName.replace(`${classMatch}.`, "") : procedureName;
        const procedureSymbol = this.createProcedureSymbol(
            tokens, shortName, classMatch, line, finishesAt ?? line
        );

        this.addSymbolToParent(procedureSymbol, container, symbols);

        return { procedureSymbol, classImplementation };
    }

    private findOrCreateClassImplementation(
        symbols: DocumentSymbol[],
        className: string,
        tokens: Token[],
        startLine: number,
        endLine: number
    ): DocumentSymbol {
        const fullName = `${className} (Implementation)`;

        const search = (list: DocumentSymbol[]): DocumentSymbol | null => {
            for (const symbol of list) {
                if (symbol.name === fullName) return symbol;
                const found = search(symbol.children ?? []);
                if (found) return found;
            }
            return null;
        };

        let classImplementation = search(symbols);

        if (!classImplementation) {
            classImplementation = DocumentSymbol.create(
                fullName,
                "Class Method Implementation",
                ClarionSymbolKind.Class,
                this.getTokenRange(tokens, startLine, endLine),
                this.getTokenRange(tokens, startLine, endLine),
                []
            );
            symbols.push(classImplementation);
        }

        return classImplementation;
    }



    private createProcedureSymbol(
        tokens: Token[],
        name: string,
        isClassMethod: string | null,
        startLine: number,
        endLine: number
    ): DocumentSymbol {
        const range = this.getTokenRange(tokens, startLine, endLine);
        return DocumentSymbol.create(
            name,
            isClassMethod ? "Method" : "Procedure",
            isClassMethod ? ClarionSymbolKind.Method : ClarionSymbolKind.Procedure,
            range,
            range,
            []
        );
    }
    private handleProcedureDefinitionToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        _currentStructure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line, finishesAt, parent } = token;
        const prevToken = tokens[index - 1];
        const procedureDefName = prevToken?.type === TokenType.Label ? prevToken.value : "UnnamedDefinition";

        // 🔍 Extract the definition detail — e.g. "(string newValue), virtual"
        // 🔍 Extract the definition detail — e.g. "(string newValue), virtual"
        let detail = "";
        let j = index + 1;

        while (j < tokens.length) {
            const t = tokens[j];
            if (t.line !== line) break;
            if (t.type === TokenType.EndStatement || t.type === TokenType.Structure ) break;
            detail += t.value;
            j++;
        }

        // 🔧 Strip comment manually if present
        const commentIndex = detail.indexOf("!");
        if (commentIndex !== -1) {
            detail = detail.substring(0, commentIndex);
        }

        detail = detail.trim();


        const procedureDefSymbol = DocumentSymbol.create(
            procedureDefName,
            detail || "()",
            ClarionSymbolKind.Property,
            this.getTokenRange(tokens, line, finishesAt ?? line),
            this.getTokenRange(tokens, line, finishesAt ?? line),
            []
        );

        // ✅ Prefer attaching to MODULE if that's the current structure
        if (_currentStructure?.name?.startsWith("MODULE")) {
            _currentStructure.children!.push(procedureDefSymbol);
            return;
        }

        // ✅ Otherwise fallback to class method grouping
        const parentSymbol = this.findSymbolForParentToken(parent, symbols, line);
        let methodTarget = parentSymbol;
        if (parentSymbol?.kind === ClarionSymbolKind.Class) {
            methodTarget = parentSymbol.children?.find(c =>
                c.name === "Methods" && c.kind === SymbolKind.Method
            ) ?? parentSymbol;
        }

        this.addSymbolToParent(procedureDefSymbol, methodTarget, symbols);
    }





    private findSymbolForParentToken(
        parentToken: Token | undefined,
        symbols: DocumentSymbol[],
        currentLine: number
    ): DocumentSymbol | null {
        const methodLabel = parentToken?.value ?? '';
        const nameParts = methodLabel.split('.');
        const possibleClassName = nameParts.length > 1 ? nameParts[0].toUpperCase() : null;

        for (const classSymbol of this.classSymbolMap.values()) {
            const className = classSymbol.name.split(' ')[0].toUpperCase();
            const start = classSymbol.range.start.line;
            const end = classSymbol.range.end.line;

            const matchesRange = currentLine >= start && currentLine <= end;
            const matchesName = possibleClassName === className;

            if (matchesRange && (!possibleClassName || matchesName)) {
                return classSymbol;
            }
        }

        logger.warn(`⚠️ Could not match parent for method '${methodLabel}' on line ${currentLine}`);
        return null;
    }




    private handleVariableToken(
        tokens: Token[],
        index: number,
        symbols: DocumentSymbol[],
        currentStructure: DocumentSymbol | null,
        currentProcedure: DocumentSymbol | null
    ): void {
        const token = tokens[index];
        const { line } = token;
        const prevToken = tokens[index - 1];

        if (prevToken?.type === TokenType.Label) {
            const typeParts: string[] = [];
            let j = index;
            let parenDepth = 0;
            let started = false;

            while (j < tokens.length) {
                const t = tokens[j];
                const v = t.value;

                // Start on the initial type token
                if (!started && (t.type === TokenType.Type || t.type === TokenType.ReferenceVariable || t.type === TokenType.Variable)) {
                    started = true;
                    typeParts.push(v);
                    j++;

                    // If the next token is not an opening paren, we're done
                    if (tokens[j]?.value !== '(') break;

                    continue;
                }

                // Handle parens
                if (v === '(') parenDepth++;
                if (v === ')') parenDepth--;

                typeParts.push(v);
                j++;

                // Done when closing last paren
                if (started && parenDepth === 0) break;
            }

            const fullType = typeParts.join('').trim();



            const variableSymbol = DocumentSymbol.create(
                prevToken.value,
                fullType,
                ClarionSymbolKind.Variable,
                this.getTokenRange(tokens, prevToken.line, line),
                this.getTokenRange(tokens, prevToken.line, line),
                []
            );


            const target = currentStructure || currentProcedure;
            this.addSymbolToParent(variableSymbol, target, symbols);
        }
    }

    private handleEndStatementToken(
        parentStack: DocumentSymbol[],
        line: number
    ): { currentStructure: DocumentSymbol | null, currentProcedure: DocumentSymbol | null } {
        if (parentStack.length > 0) {
            const finishedStructure = parentStack.pop();



            return {
                currentStructure: parentStack[parentStack.length - 1] ?? null,
                currentProcedure: null
            };
        } else {
            return {
                currentStructure: null,
                currentProcedure: null
            };
        }
    }


    private addSymbolToParent(
        symbol: DocumentSymbol,
        parent: DocumentSymbol | null,
        symbols: DocumentSymbol[]
    ): void {
        const container = parent?.name ?? 'TOP LEVEL';

        if (parent) {
            const isVariable = symbol.kind === ClarionSymbolKind.Variable;
            const isMethod = symbol.kind === ClarionSymbolKind.Method;

            // Set sortText for all symbols based on name
            (symbol as any).sortText = symbol.name.toLowerCase();

            if (isVariable && (parent as any).$clarionProps) {
                const propsContainer = (parent as any).$clarionProps;
                // Add to properties container
                propsContainer.children!.push(symbol);

                // Sort immediately after adding
                this.sortContainerChildren(propsContainer);
            } else if (isMethod && (parent as any).$clarionMethods) {
                const methodsContainer = (parent as any).$clarionMethods;
                // Add to methods container
                methodsContainer.children!.push(symbol);

                // Sort immediately after adding
                this.sortContainerChildren(methodsContainer);
            } else {
                // Add to regular parent
                parent.children!.push(symbol);
            }

        } else {
            // Top-level symbol
            symbols.push(symbol);
        }
    }

    /**
     * Sort children of a container alphabetically
     */
    private sortContainerChildren(container: DocumentSymbol): void {
        if (!container.children || container.children.length <= 1) {
            return; // Nothing to sort
        }

        // Sort children alphabetically
        container.children.sort((a: DocumentSymbol, b: DocumentSymbol) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );

        // Update sortText to match the new order
        for (let i = 0; i < container.children.length; i++) {
            const child = container.children[i];
            (child as any).sortText = i.toString().padStart(4, "0");
        }
    }


    private getTokenRange(tokens: Token[], startLine: number, endLine: number): Range {
        const startToken = tokens.find((t: Token) => t.line === startLine);
        const endToken = [...tokens].reverse().find((t: Token) => t.line === endLine);

        // If either token is missing, fallback to line-wide range
        if (!startToken || !endToken) {
            return Range.create(startLine, 0, endLine, 999);  // use large column to include whole line
        }

        return Range.create(
            startToken.line, startToken.start,
            endToken.line, endToken.start + endToken.value.length
        );
    }
}
