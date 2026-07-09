import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic } from 'vscode-languageserver/node';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { serverSettings } from '../serverSettings';
import { SolutionManager } from '../solution/solutionManager';
import LoggerManager from '../logger';

import { validateStructureTerminators, validateConditionalBlocks, validateFileStructures, validateCaseStructures, validateExecuteStructures, validateViewProjectFields } from './diagnostics/StructureDiagnostics';
import { validateClassInterfaceImplementationAsync as _validateClassInterfaceImplementationAsync, validateClassProperties } from './diagnostics/ClassDiagnostics';
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
import { validateByRefArguments } from './diagnostics/ByRefArgumentDiagnostics';
import { validateIndistinguishablePrototypes } from './diagnostics/IndistinguishablePrototypeDiagnostics';
import { OmitCompileDetector } from '../utils/OmitCompileDetector';

const logger = LoggerManager.getLogger("DiagnosticProvider");
logger.setLevel("error");

/**
 * Diagnostic Provider for Clarion Language.
 * Thin facade — all validation logic lives in the diagnostics/ sub-modules.
 */
export class DiagnosticProvider {

    public static validateDocument(
        document: TextDocument,
        tokens?: Token[],
        caller?: string,
        getOpenDocumentContent?: (absPath: string) => string | null
    ): Diagnostic[] {
        const perfStart = performance.now();

        // #258: supply ONE DocumentStructure to the validators that need it, instead of
        // each building + process()ing its own over the same token array (3 redundant
        // passes per validation cycle, previously). Fresh-tokenize path reuses the
        // structure tokenize() already built; cache-tokens path reuses the cached one.
        let structure: DocumentStructure | undefined;
        if (!tokens) {
            const tokenizer = new ClarionTokenizer(document.getText());
            tokens = tokenizer.tokenize();
            structure = tokenizer.getDocumentStructure() ?? undefined;
        } else {
            structure = TokenCache.getInstance().getStructure(document);
        }

        const diagnostics: Diagnostic[] = [
            ...validateStructureTerminators(tokens, document),
            ...validateConditionalBlocks(tokens, document),
            ...validateFileStructures(tokens, document),
            ...validateCaseStructures(tokens, document),
            ...validateExecuteStructures(tokens, document),
            ...validateViewProjectFields(tokens, document, getOpenDocumentContent),
            // #181: class-interface-implementation moved to the async pass — it
            // resolves cross-file interfaces via the INCLUDE chain (MemberLocator).
            // See DiagnosticProvider.validateClassInterfaceImplementation + the
            // server.ts await site.
            ...validateReturnStatements(tokens, document, structure),
            ...validateClassProperties(tokens, document),
            ...validateDiscardedReturnValuesForPlainCalls(tokens, document),
            ...validateCycleBreakOutsideLoop(tokens, document),
            // 6b40d7da Phase B (#115): undeclared-variable validator moved to the
            // async pass — needs SymbolFinderService for cross-file scope resolution
            // (Tier 5b/6/7). See `DiagnosticProvider.validateUndeclaredVariables`
            // and the await at server.ts:340+ next to `validateDiscardedReturnValues`.
            ...validateReservedKeywordLabels(tokens, document),
            ...validateUnicodeCharacters(document),
            ...validateAttributeApplicability(tokens, document, structure),
            ...validateItemizeBlocks(tokens, document),
            ...validateIndistinguishablePrototypes(tokens, document),
            ...validateByRefArguments(tokens, document),
        ];

        logger.perf(`🚀 Validation complete${caller ? ` (caller: ${caller})` : ''}`, {
            'time_ms': (performance.now() - perfStart).toFixed(2),
            'tokens': tokens.length,
            'diagnostics': diagnostics.length
        });

        return this.filterOmitted(diagnostics, tokens, document);
    }

    /**
     * #255 — drop diagnostics whose line is inside an unconditional OMIT block:
     * compiled-out code isn't in the active build, so flagging it is pure noise
     * (matches how C++ IDEs treat inactive `#if 0` regions). Conditional
     * OMIT/COMPILE stays live (defines aren't evaluated yet), and rename
     * deliberately still sees omitted code — this filter is diagnostics-only.
     * Applied at the facade so every validator (sync + async passes) is covered.
     */
    private static filterOmitted(diagnostics: Diagnostic[], tokens: Token[], document: TextDocument): Diagnostic[] {
        if (diagnostics.length === 0) return diagnostics;
        const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, document);
        if (blocks.length === 0) return diagnostics;
        // Diagnostics ON a directive start line are STRUCTURAL (e.g. "unterminated
        // OMIT") — they must survive even when that directive sits inside another
        // omitted range, or nesting problems would hide their own reports.
        const directiveStartLines = new Set(blocks.map(b => b.startLine));
        return diagnostics.filter(d =>
            directiveStartLines.has(d.range.start.line) ||
            !OmitCompileDetector.isLineOmittedWithBlocks(d.range.start.line, blocks));
    }

    /** Async pass: warn when dot-access method call discards a return value. Closes #61 */
    public static async validateDiscardedReturnValues(
        tokens: Token[],
        document: TextDocument,
        memberLocator: MemberLocatorService,
        getOpenDocumentContent?: (absPath: string) => string | null
    ): Promise<Diagnostic[]> {
        return this.filterOmitted(await _validateDiscardedReturnValues(tokens, document, memberLocator, getOpenDocumentContent), tokens, document);
    }

    /**
     * Async pass: warn when a CLASS implements an interface but omits one of its
     * methods — resolving the interface same-file or via the class file's INCLUDE
     * chain. Closes #165 (same-file) / #181 (cross-file).
     */
    public static async validateClassInterfaceImplementation(
        tokens: Token[],
        document: TextDocument,
        memberLocator: MemberLocatorService
    ): Promise<Diagnostic[]> {
        // #258: production callers pass cache tokens — reuse the cached structure.
        const structure = TokenCache.getInstance().getStructure(document);
        return this.filterOmitted(await _validateClassInterfaceImplementationAsync(tokens, document, memberLocator, structure), tokens, document);
    }

    /** Async pass: warn when a procedure implementation has no MAP declaration in the parent file. Closes #89 */
    public static async validateMissingMapDeclarations(
        tokens: Token[],
        document: TextDocument,
        getOpenDocumentContent?: (absPath: string) => string | null
    ): Promise<Diagnostic[]> {
        return this.filterOmitted(await validateMissingMapDeclarations(tokens, document, getOpenDocumentContent), tokens, document);
    }

    /** Async pass: warn when a MAP/MODULE declaration has no implementation in the referenced CLW. Closes #89 */
    public static async validateMissingImplementations(
        tokens: Token[],
        document: TextDocument,
        getOpenDocumentContent?: (absPath: string) => string | null
    ): Promise<Diagnostic[]> {
        return this.filterOmitted(await validateMissingImplementations(tokens, document, getOpenDocumentContent), tokens, document);
    }

    /** Async pass: warn when a variable's type is defined in an .inc not yet included. Closes #83 */
    public static async validateMissingIncludes(
        tokens: Token[],
        document: TextDocument
    ): Promise<Diagnostic[]> {
        return this.filterOmitted(await validateMissingIncludes(tokens, document), tokens, document);
    }

    /** Async pass: info when a variable's class requires Link/DLL project constants not yet defined. Closes #83 */
    public static async validateMissingConstants(
        tokens: Token[],
        document: TextDocument
    ): Promise<Diagnostic[]> {
        return this.filterOmitted(await validateMissingConstants(tokens, document), tokens, document);
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
        // #287 — in no-solution mode there is no cross-file symbol index, so `SymbolFinder` can't
        // resolve globals declared in other files (GlobalRequest, GlobalResponse, module/global data,
        // etc.). Every such legitimate cross-file global would then be flagged as undeclared. The
        // diagnostic's value depends on that index, so we suppress it entirely until a solution is
        // loaded (`SolutionManager.getInstance() === null` is the canonical no-solution signal).
        // Loading the solution restores full coverage; the off-switch setting remains for those who
        // want it disabled even with a solution.
        if (SolutionManager.getInstance() === null) {
            logger.info('[#287] undeclared-variable diagnostic skipped — no solution loaded (cross-file globals unresolvable)');
            return [];
        }
        return this.filterOmitted(await _validateUndeclaredVariablesAsync(tokens, document, symbolFinder), tokens, document);
    }
}
