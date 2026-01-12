import { Hover } from 'vscode-languageserver-protocol';
import { HoverContext } from './HoverContextBuilder';
import { ProcedureHoverResolver } from './ProcedureHoverResolver';
import { MethodHoverResolver } from './MethodHoverResolver';
import { VariableHoverResolver } from './VariableHoverResolver';
import { SymbolHoverResolver } from './SymbolHoverResolver';
import { ContextualHoverHandler } from './ContextualHoverHandler';
import { BuiltinFunctionService } from '../../utils/BuiltinFunctionService';
import { AttributeService } from '../../utils/AttributeService';
import { HoverFormatter } from './HoverFormatter';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("HoverRouter");
logger.setLevel("error");

/**
 * Routes hover requests to appropriate resolvers based on context
 * Replaces nested if/else logic with clear, testable routing
 */
export class HoverRouter {
    private builtinService = BuiltinFunctionService.getInstance();
    private attributeService = AttributeService.getInstance();

    constructor(
        private procedureResolver: ProcedureHoverResolver,
        private methodResolver: MethodHoverResolver,
        private variableResolver: VariableHoverResolver,
        private symbolResolver: SymbolHoverResolver,
        private contextHandler: ContextualHoverHandler,
        private formatter: HoverFormatter
    ) {}

    /**
     * Route hover request to appropriate resolver
     */
    async route(context: HoverContext): Promise<Hover | null> {
        const { word, wordRange, line, document, position, tokens, documentStructure, isInMapBlock, isInWindowContext, isInClassBlock, hasLabelBefore } = context;

        // 1. Handle special keywords (MODULE, TO, ELSE, PROCEDURE)
        const keywordHover = this.handleSpecialKeywords(context);
        if (keywordHover) return keywordHover;

        // 2. Handle procedure calls
        const procedureCallHover = await this.procedureResolver.resolveProcedureCall(word, document, position, wordRange, line);
        if (procedureCallHover) return procedureCallHover;

        // 3. Handle data types and controls
        const symbolHover = this.symbolResolver.resolve(word, { hasLabelBefore, isInWindowContext });
        if (symbolHover) return symbolHover;

        // 4. Handle attributes
        const attributeHover = this.handleAttribute(word, line, wordRange, document);
        if (attributeHover) return attributeHover;

        // 5. Handle built-in functions
        const builtinHover = this.handleBuiltin(word, line, wordRange, document, position);
        if (builtinHover) return builtinHover;

        // 6. Handle method implementations
        const methodImplHover = await this.methodResolver.resolveMethodImplementation(document, position, line);
        if (methodImplHover) return methodImplHover;

        // 7. Handle procedure implementations
        const procImplHover = await this.procedureResolver.resolveProcedureImplementation(document, position, line, documentStructure);
        if (procImplHover) return procImplHover;

        // 8. Handle MAP declarations
        const mapDeclHover = await this.procedureResolver.resolveMapDeclaration(document, position, line, documentStructure);
        if (mapDeclHover) return mapDeclHover;

        // 9. Handle method declarations
        const methodDeclHover = await this.methodResolver.resolveMethodDeclaration(document, position, line);
        if (methodDeclHover) return methodDeclHover;

        // 10. Variables handled by downstream logic (structure access, self.member, local/global vars)
        return null; // Let calling code handle variable resolution
    }

    /**
     * Handle special keywords (MODULE, TO, ELSE, PROCEDURE)
     */
    private handleSpecialKeywords(context: HoverContext): Hover | null {
        const { word, line, tokens, position, isInMapBlock, isInClassBlock } = context;
        const upperWord = word.toUpperCase();

        if (upperWord === 'MODULE') {
            return this.contextHandler.handleModuleKeyword(isInMapBlock);
        }

        if (upperWord === 'TO') {
            return this.contextHandler.handleToKeyword(tokens, position, line);
        }

        if (upperWord === 'ELSE') {
            return this.contextHandler.handleElseKeyword(tokens, position);
        }

        if (upperWord === 'PROCEDURE') {
            return this.contextHandler.handleProcedureKeyword(line, isInMapBlock, isInClassBlock);
        }

        return null;
    }

    /**
     * Handle Clarion attributes
     */
    private handleAttribute(word: string, line: string, wordRange: any, document: any): Hover | null {
        if (!this.attributeService.isAttribute(word)) {
            return null;
        }

        logger.info(`Found Clarion attribute: ${word}`);
        const attribute = this.attributeService.getAttribute(word);
        const paramCount = this.countFunctionParameters(line, word, wordRange, document);
        logger.info(`Attribute parameter count: ${paramCount}`);

        return this.formatter.formatAttribute(word, attribute, paramCount);
    }

    /**
     * Handle built-in functions
     */
    private handleBuiltin(word: string, line: string, wordRange: any, document: any, position: any): Hover | null {
        if (!this.builtinService.isBuiltin(word)) {
            return null;
        }

        // Check if it's preceded by a dot (would be a class method call)
        const textBeforeWord = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: wordRange.start.character }
        });

        if (textBeforeWord.trimEnd().endsWith('.')) {
            logger.info(`Word ${word} is preceded by dot - treating as class method, not built-in`);
            return null;
        }

        logger.info(`Found built-in function: ${word}`);
        const signatures = this.builtinService.getSignatures(word);
        const paramCount = this.countFunctionParameters(line, word, wordRange, document);
        logger.info(`Parameter count in call: ${paramCount}`);

        return this.formatter.formatBuiltin(word, signatures, paramCount);
    }

    /**
     * Count parameters in a function/attribute call
     * Returns null if unable to parse, 0 if empty parentheses
     */
    private countFunctionParameters(line: string, word: string, wordRange: any, document: any): number | null {
        // Check if there's an opening paren after the word
        const textAfterWord = document.getText({
            start: { line: wordRange.start.line, character: wordRange.end.character },
            end: { line: wordRange.start.line, character: Math.min(wordRange.end.character + 10, line.length) }
        }).trimStart();

        if (textAfterWord.startsWith('(')) {
            // There's a paren, count the actual parameters
            return this.countParametersInCall(line, word);
        } else {
            // No paren after word - assume no parameters
            return 0;
        }
    }

    /**
     * Counts parameters in a function/procedure call
     * Returns null if empty, number of parameters otherwise
     */
    private countParametersInCall(line: string, procedureName: string): number | null {
        const callMatch = line.match(new RegExp(`${procedureName}\\s*\\(([^)]*)\\)`, 'i'));
        if (!callMatch) return null;

        const params = callMatch[1].trim();
        if (params === '') return null;

        // Simple comma count (doesn't handle nested parentheses perfectly, but works for most cases)
        const paramCount = params.split(',').length;
        const isEmpty = params.trim() === '';

        return isEmpty ? null : paramCount;
    }
}
