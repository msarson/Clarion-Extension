import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { serverSettings } from '../serverSettings';
import LoggerManager from '../logger';

import { validateStructureTerminators, validateConditionalBlocks, validateFileStructures, validateCaseStructures, validateExecuteStructures, validateViewProjectFields } from './diagnostics/StructureDiagnostics';
import { validateClassInterfaceImplementation, validateClassProperties } from './diagnostics/ClassDiagnostics';
import { validateReturnStatements, validateDiscardedReturnValuesForPlainCalls, validateDiscardedReturnValues as _validateDiscardedReturnValues } from './diagnostics/ReturnValueDiagnostics';
import { validateCycleBreakOutsideLoop } from './diagnostics/ControlFlowDiagnostics';
import { validateUndeclaredVariablesAsync as _validateUndeclaredVariablesAsync } from './diagnostics/UndeclaredVariableDiagnostics';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { validateReservedKeywordLabels } from './diagnostics/LabelDiagnostics';
import { validateMissingIncludes, validateMissingConstants } from './diagnostics/MissingIncludeDiagnostics';
import { validateMissingMapDeclarations, validateMissingImplementations } from './diagnostics/MapDeclarationDiagnostics';
import { validateUnicodeCharacters } from './diagnostics/UnicodeDiagnostics';
import { validateAttributeApplicability } from './diagnostics/AttributeDiagnostics';
import { validateItemizeBlocks } from './diagnostics/ItemizeDiagnostics';

const logger = LoggerManager.getLogger("DiagnosticProvider");
logger.setLevel("error");

/**
 * Diagnostic Provider for Clarion Language.
 * Thin facade — all validation logic lives in the diagnostics/ sub-modules.
 */
export class DiagnosticProvider {

    public static validateDocument(document: TextDocument, tokens?: Token[], caller?: string): Diagnostic[] {
        const perfStart = performance.now();

        if (!tokens) {
            const tokenizer = new ClarionTokenizer(document.getText());
            tokens = tokenizer.tokenize();
        }

        const diagnostics: Diagnostic[] = [
            ...validateStructureTerminators(tokens, document),
            ...validateConditionalBlocks(tokens, document),
            ...validateFileStructures(tokens, document),
            ...validateCaseStructures(tokens, document),
            ...validateExecuteStructures(tokens, document),
            ...validateViewProjectFields(tokens, document),
            ...validateClassInterfaceImplementation(tokens, document),
            ...validateReturnStatements(tokens, document),
            ...validateClassProperties(tokens, document),
            ...validateDiscardedReturnValuesForPlainCalls(tokens, document),
            ...validateCycleBreakOutsideLoop(tokens, document),
            // 6b40d7da Phase B (#115): undeclared-variable validator moved to the
            // async pass — needs SymbolFinderService for cross-file scope resolution
            // (Tier 5b/6/7). See `DiagnosticProvider.validateUndeclaredVariables`
            // and the await at server.ts:340+ next to `validateDiscardedReturnValues`.
            ...validateReservedKeywordLabels(tokens, document),
            ...validateUnicodeCharacters(document),
            ...validateAttributeApplicability(tokens, document),
            ...validateItemizeBlocks(tokens, document),
        ];

        logger.perf(`🚀 Validation complete${caller ? ` (caller: ${caller})` : ''}`, {
            'time_ms': (performance.now() - perfStart).toFixed(2),
            'tokens': tokens.length,
            'diagnostics': diagnostics.length
        });

        return diagnostics;
    }

    /** Async pass: warn when dot-access method call discards a return value. Closes #61 */
    public static async validateDiscardedReturnValues(
        tokens: Token[],
        document: TextDocument,
        memberLocator: MemberLocatorService
    ): Promise<Diagnostic[]> {
        return _validateDiscardedReturnValues(tokens, document, memberLocator);
    }

    /** Async pass: warn when a procedure implementation has no MAP declaration in the parent file. Closes #89 */
    public static async validateMissingMapDeclarations(
        tokens: Token[],
        document: TextDocument
    ): Promise<Diagnostic[]> {
        return validateMissingMapDeclarations(tokens, document);
    }

    /** Async pass: warn when a MAP/MODULE declaration has no implementation in the referenced CLW. Closes #89 */
    public static async validateMissingImplementations(
        tokens: Token[],
        document: TextDocument,
        getOpenDocumentContent?: (absPath: string) => string | null
    ): Promise<Diagnostic[]> {
        return validateMissingImplementations(tokens, document, getOpenDocumentContent);
    }

    /** Async pass: warn when a variable's type is defined in an .inc not yet included. Closes #83 */
    public static async validateMissingIncludes(
        tokens: Token[],
        document: TextDocument
    ): Promise<Diagnostic[]> {
        return validateMissingIncludes(tokens, document);
    }

    /** Async pass: info when a variable's class requires Link/DLL project constants not yet defined. Closes #83 */
    public static async validateMissingConstants(
        tokens: Token[],
        document: TextDocument
    ): Promise<Diagnostic[]> {
        return validateMissingConstants(tokens, document);
    }

    /**
     * Async pass: undeclared-variable diagnostic with full canonical-scope-chain
     * resolution. Routes through `SymbolFinderService.findSymbol` for cross-file
     * Tier 5b/6/7 coverage that single-file token walks miss. Gated by
     * `serverSettings.undeclaredVariablesEnabled`. Closes #115 (paired with
     * task `6b40d7da`); follow-up to #62.
     */
    public static async validateUndeclaredVariables(
        tokens: Token[],
        document: TextDocument,
        symbolFinder: SymbolFinderService
    ): Promise<Diagnostic[]> {
        if (!serverSettings.undeclaredVariablesEnabled) return [];
        return _validateUndeclaredVariablesAsync(tokens, document, symbolFinder);
    }
}
