import { Hover, MarkupContent } from 'vscode-languageserver-protocol';
import { HoverContext } from './HoverContextBuilder';
import { ProcedureHoverResolver } from './ProcedureHoverResolver';
import { MethodHoverResolver } from './MethodHoverResolver';
import { VariableHoverResolver } from './VariableHoverResolver';
import { SymbolHoverResolver } from './SymbolHoverResolver';
import { RoutineHoverResolver } from './RoutineHoverResolver';
import { ContextualHoverHandler } from './ContextualHoverHandler';
import { BuiltinFunctionService } from '../../utils/BuiltinFunctionService';
import { AttributeService } from '../../utils/AttributeService';
import { PropertyService } from '../../utils/PropertyService';
import { EventService } from '../../utils/EventService';
import { DirectiveService } from '../../utils/DirectiveService';
import { HoverFormatter } from './HoverFormatter';
import { TokenCache } from '../../TokenCache';
import { Token, TokenType } from '../../ClarionTokenizer';
import * as path from 'path';
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
    private propertyService = PropertyService.getInstance();
    private eventService = EventService.getInstance();
    private directiveService = DirectiveService.getInstance();

    constructor(
        private procedureResolver: ProcedureHoverResolver,
        private methodResolver: MethodHoverResolver,
        private variableResolver: VariableHoverResolver,
        private symbolResolver: SymbolHoverResolver,
        private routineResolver: RoutineHoverResolver,
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

        // 1.5 Handle IMPLEMENTS(InterfaceName) hover
        const implementsHover = this.handleImplementsHover(line, position, tokens);
        if (implementsHover) return implementsHover;

        // 2. Handle routine references (DO statements) - check early to handle namespace prefixes
        const routineHover = await this.routineResolver.resolveRoutineReference(document, position, line);
        if (routineHover) return routineHover;

        // 3. Handle procedure calls
        const procedureCallHover = await this.procedureResolver.resolveProcedureCall(word, document, position, wordRange, line);
        if (procedureCallHover) return procedureCallHover;

        // 4. Handle method implementations (BEFORE built-ins to handle methods named like keywords)
        const methodImplHover = await this.methodResolver.resolveMethodImplementation(document, position, line);
        if (methodImplHover) return methodImplHover;

        // 5. Handle procedure implementations
        const procImplHover = await this.procedureResolver.resolveProcedureImplementation(document, position, line, documentStructure);
        if (procImplHover) return procImplHover;

        // 6. Handle MAP declarations (check BEFORE method declarations to avoid confusion)
        const mapDeclHover = await this.procedureResolver.resolveMapDeclaration(document, position, line, documentStructure);
        if (mapDeclHover) return mapDeclHover;

        // 7. Handle method declarations (BEFORE built-ins to avoid shadowing by keyword help)
        if (!isInMapBlock) { // Skip if in MAP/MODULE block to prevent misidentification
            const methodDeclHover = await this.methodResolver.resolveMethodDeclaration(document, position, line);
            if (methodDeclHover) return methodDeclHover;
        }

        // 8. Handle data types and controls
        const symbolHover = this.symbolResolver.resolve(word, { hasLabelBefore, isInWindowContext });
        if (symbolHover) return symbolHover;

        // 9. Handle attributes
        const attributeHover = this.handleAttribute(word, line, wordRange, document);
        if (attributeHover) return attributeHover;

        // 9.5 Handle PROP: runtime property equates
        const propHover = this.handlePropEquate(word);
        if (propHover) return propHover;

        // 9.6 Handle EVENT: equates
        const eventHover = this.handleEventEquate(word);
        if (eventHover) return eventHover;

        // 9.7 Handle compiler directives (EQUATE, INCLUDE, COMPILE, OMIT, etc.)
        const directiveHover = this.handleDirective(word);
        if (directiveHover) return directiveHover;

        // 10. Handle built-in functions (AFTER method declarations to avoid shadowing)
        const builtinHover = this.handleBuiltin(word, line, wordRange, document, position, tokens);
        if (builtinHover) return builtinHover;

        // 11. Variables handled by downstream logic (structure access, self.member, local/global vars)
        return null; // Let calling code handle variable resolution
    }

    /**
     * Handle special keywords (MODULE, TO, ELSE, PROCEDURE, HIDE, DISABLE, TYPE)
     */
    private handleSpecialKeywords(context: HoverContext): Hover | null {
        const { word, line, tokens, position, isInMapBlock, isInClassBlock, isInWindowContext, documentStructure } = context;
        const upperWord = word.toUpperCase();

        if (upperWord === 'WINDOW' || upperWord === 'APPLICATION' || upperWord === 'REPORT') {
            const containerHover = this.handleContainerKeyword(upperWord, position, tokens, documentStructure);
            if (containerHover) return containerHover;
        }

        if (upperWord === 'PROGRAM' || upperWord === 'MEMBER') {
            return this.contextHandler.handleProgramOrMemberKeyword(word, documentStructure);
        }

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

        if (upperWord === 'HIDE' || upperWord === 'DISABLE') {
            // Attribute when inside a window/control declaration; builtin when in code section
            return this.contextHandler.handleWindowBuiltin(word, isInWindowContext);
        }

        if (upperWord === 'TYPE') {
            // Attribute on GROUP/QUEUE/CLASS (outside window); builtin TYPE(string) inside REPORT
            return this.contextHandler.handleWindowBuiltin(word, !isInWindowContext);
        }

        return null;
    }

    /**
     * Renders a structured hover for a WINDOW / APPLICATION / REPORT keyword.
     * Pulls the descriptor populated by `DocumentStructure.populateWindowDescriptors`
     * and formats title, geometry, MDI mode, icon, and residual attributes.
     * Returns null when the cursor isn't on a container Structure token whose
     * descriptor has been built (e.g. cursor lands on the keyword text but the
     * token type is something else entirely).
     */
    private handleContainerKeyword(
        keyword: string,
        position: { line: number; character: number },
        tokens: Token[],
        documentStructure: { getWindowDescriptor(t: Token): import('../../tokenizer/WindowDescriptorParser').WindowDescriptor | undefined }
    ): Hover | null {
        // Find the Structure token at this cursor position whose value matches the keyword.
        const containerToken = tokens.find(t =>
            t.type === TokenType.Structure &&
            t.value.toUpperCase() === keyword &&
            t.line === position.line &&
            position.character >= t.start &&
            position.character <= t.start + t.value.length
        );
        if (!containerToken) return null;

        const desc = documentStructure.getWindowDescriptor(containerToken);
        if (!desc) return null;

        const lines: string[] = [];
        const labelText = containerToken.label ? `${containerToken.label} ` : '';
        lines.push(`**${labelText}${keyword}**`);
        if (desc.title) lines.push(`*${desc.title}*`);

        const meta: string[] = [];
        if (desc.at) {
            const geom = typeof desc.at === 'string'
                ? `AT(${desc.at})`
                : `${desc.at.w}×${desc.at.h} @ (${desc.at.x},${desc.at.y})`;
            meta.push(`📐 ${geom}`);
        }
        if (desc.mdi) {
            meta.push(desc.mdiChild ? '🪟 MDI child' : '🪟 MDI parent');
        }
        if (desc.systemMenu) meta.push('System menu');
        if (desc.statusBar) meta.push('Status bar');
        if (desc.icon) meta.push(`Icon: \`${desc.icon}\``);
        if (meta.length) {
            lines.push('');
            lines.push(meta.join(' · '));
        }

        if (desc.attributes.length) {
            lines.push('');
            lines.push(`**Attributes:** ${desc.attributes.map(a => `\`${a}\``).join(', ')}`);
        }

        const content: MarkupContent = { kind: 'markdown', value: lines.join('\n') };
        return { contents: content };
    }

    /**
     * Handle hover over interface name inside IMPLEMENTS(InterfaceName)
     */
    private handleImplementsHover(line: string, position: { character: number }, tokens: Token[]): Hover | null {
        const implementsRe = /\bIMPLEMENTS\s*\(\s*(\w+)\s*\)/gi;
        let match: RegExpExecArray | null;
        while ((match = implementsRe.exec(line)) !== null) {
            const ifaceName = match[1];
            const nameStart = match.index + match[0].indexOf(ifaceName);
            const nameEnd = nameStart + ifaceName.length;
            if (position.character < nameStart || position.character > nameEnd) continue;

            // Search current doc tokens first
            let declFile: string | null = null;
            const ifaceToken = tokens.find(t =>
                t.type === TokenType.Structure &&
                (t as any).subType === TokenType.Interface &&
                t.label?.toLowerCase() === ifaceName.toLowerCase()
            );

            if (!ifaceToken) {
                // Search all TokenCache entries
                const cache = TokenCache.getInstance();
                for (const uri of cache.getAllCachedUris()) {
                    const cached = cache.getTokensByUri(uri);
                    if (!cached) continue;
                    const found = cached.find(t =>
                        t.type === TokenType.Structure &&
                        (t as any).subType === TokenType.Interface &&
                        t.label?.toLowerCase() === ifaceName.toLowerCase()
                    );
                    if (found) {
                        try {
                            declFile = path.basename(decodeURIComponent(uri.replace(/^file:\/\/\//i, '')));
                        } catch {
                            declFile = uri;
                        }
                        break;
                    }
                }
            }

            const lines: string[] = [`**INTERFACE** \`${ifaceName}\``];
            if (declFile) lines.push(declFile);
            const content: MarkupContent = { kind: 'markdown', value: lines.join('\n\n') };
            return { contents: content };
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
     * Handle PROP: runtime property equates (e.g. PROP:Enabled, PROP:Handle)
     */
    private handlePropEquate(word: string): Hover | null {
        const entry = this.propertyService.getPropEntry(word);
        if (!entry) return null;
        logger.info(`Found PROP: equate: ${word}`);
        return this.formatter.formatPropEquate(entry);
    }

    /**
     * Handle EVENT: equates (e.g. EVENT:Accepted, EVENT:CloseWindow)
     */
    private handleEventEquate(word: string): Hover | null {
        const entry = this.eventService.getEventEntry(word);
        if (!entry) return null;
        logger.info(`Found EVENT: equate: ${word}`);
        return this.formatter.formatEventEquate(entry);
    }

    /**
     * Handle compiler directives (EQUATE, INCLUDE, COMPILE, OMIT, ASSERT, etc.)
     */
    private handleDirective(word: string): Hover | null {
        const entry = this.directiveService.getDirective(word);
        if (!entry) return null;
        logger.info(`Found compiler directive: ${word}`);
        return this.formatter.formatDirective(entry);
    }

    /**
     * Handle built-in functions
     */
    private handleBuiltin(word: string, line: string, wordRange: any, document: any, position: any, tokens: any[]): Hover | null {
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

        // Resolve structureType of first argument for overload narrowing (e.g. OPEN(Names) → 'FILE')
        const firstArgType = this.resolveFirstArgStructureType(line, word, tokens);

        return this.formatter.formatBuiltin(word, signatures, paramCount, firstArgType ?? undefined);
    }

    /**
     * Extracts the first argument name from a builtin call on the given line,
     * then looks it up in tokens to find its structureType (e.g. 'FILE', 'VIEW').
     * Returns null if the type cannot be determined.
     */
    private resolveFirstArgStructureType(line: string, word: string, tokens: Token[]): string | null {
        const callMatch = line.match(new RegExp(`\\b${word}\\s*\\(\\s*([A-Za-z_][A-Za-z0-9_:]*)`, 'i'));
        if (!callMatch) return null;
        const firstArgName = callMatch[1].toUpperCase();

        const labelToken = tokens.find(t =>
            t.type === TokenType.Label &&
            t.label?.toUpperCase() === firstArgName &&
            t.structureType !== undefined
        );
        return labelToken?.structureType ?? null;
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
