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

// #306 — the sync pass costs ~1s on a 1,640-token generated module and blocks the
// loop at exactly the moment the user starts interacting; the aggregate number can't
// say which of the 16 validators is fat. Always-on perf channel, emits only when the
// pass is slow.
const perfLogger = LoggerManager.getLogger("DiagnosticProvider.Perf", "perf");
const SYNC_PASS_REPORT_THRESHOLD_MS = 300;

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

        // #181: class-interface-implementation and (6b40d7da/#115) undeclared-variable
        // validators live in the ASYNC pass — they resolve cross-file via
        // MemberLocator / SymbolFinderService. See the server.ts await sites.
        const syncValidators: Array<[string, () => Diagnostic[]]> = [
            ['structureTerminators', () => validateStructureTerminators(tokens!, document)],
            ['conditionalBlocks', () => validateConditionalBlocks(tokens!, document)],
            ['fileStructures', () => validateFileStructures(tokens!, document)],
            ['caseStructures', () => validateCaseStructures(tokens!, document)],
            ['executeStructures', () => validateExecuteStructures(tokens!, document)],
            ['returnStatements', () => validateReturnStatements(tokens!, document, structure)],
            ['classProperties', () => validateClassProperties(tokens!, document)],
            ['discardedReturnPlainCalls', () => validateDiscardedReturnValuesForPlainCalls(tokens!, document)],
            ['cycleBreakOutsideLoop', () => validateCycleBreakOutsideLoop(tokens!, document)],
            ['reservedKeywordLabels', () => validateReservedKeywordLabels(tokens!, document)],
            ['unicodeCharacters', () => validateUnicodeCharacters(document)],
            ['attributeApplicability', () => validateAttributeApplicability(tokens!, document, structure)],
            ['itemizeBlocks', () => validateItemizeBlocks(tokens!, document)],
            ['indistinguishablePrototypes', () => validateIndistinguishablePrototypes(tokens!, document)],
            ['byRefArguments', () => validateByRefArguments(tokens!, document)],
        ];

        const diagnostics: Diagnostic[] = [];
        const timings: Array<[string, number]> = [];
        for (const [name, run] of syncValidators) {
            const t0 = performance.now();
            diagnostics.push(...run());
            timings.push([name, performance.now() - t0]);
        }

        // #306 — name the fat validators when the sync pass is slow.
        const totalMs = performance.now() - perfStart;
        if (totalMs >= SYNC_PASS_REPORT_THRESHOLD_MS) {
            const top = timings
                .filter(([, ms]) => ms >= 25)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, ms]) => `${name}=${Math.round(ms)}`)
                .join(', ');
            perfLogger.perf("Sync validation pass slow", {
                total_ms: Math.round(totalMs),
                top: top || '(no single validator ≥25ms — cost is spread/tokenize)',
                token_count: tokens.length,
                caller: caller ?? 'unknown',
                uri: document.uri
            });
        }

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

    /**
     * Async pass: warn when a VIEW's PROJECT/JOIN names a field absent from the
     * FROM/JOIN file. Lived in the sync pass until #352 — its cold include-chain
     * walk blocked the onDidOpen handler ~4.4s on large solutions, before the
     * solution was even loaded. The #345 phase-4 memo makes repeat passes ~0ms;
     * this placement keeps the one cold build off the interactive path.
     */
    public static async validateViewProjectFields(
        tokens: Token[],
        document: TextDocument,
        getOpenDocumentContent?: (absPath: string) => string | null
    ): Promise<Diagnostic[]> {
        return this.filterOmitted(validateViewProjectFields(tokens, document, getOpenDocumentContent), tokens, document);
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
