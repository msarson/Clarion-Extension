import { Range, WorkspaceEdit, TextEdit, ResponseError, ErrorCodes } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import * as fs from 'fs';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../tokenizer/TokenTypes';
import { SolutionManager } from '../solution/solutionManager';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { TokenHelper } from '../utils/TokenHelper';
import { ReferencesProvider } from './ReferencesProvider';
import { serverSettings } from '../serverSettings';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("RenameProvider");
logger.setLevel("error");

/**
 * Provides Rename Symbol (F2) for Clarion.
 *
 * Uses a two-step LSP flow:
 *   1. prepareRename  — validates the symbol is renameable and rejects with a clear
 *                       message if the cursor is in a library/non-project file.
 *   2. provideRename  — delegates to ReferencesProvider to find all locations, then
 *                       builds a WorkspaceEdit replacing the old name everywhere.
 */
export class RenameProvider {
    private tokenCache: TokenCache;
    private scopeAnalyzer: ScopeAnalyzer;
    private symbolFinder: SymbolFinderService;
    private referencesProvider: ReferencesProvider;

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.symbolFinder = new SymbolFinderService(this.tokenCache, this.scopeAnalyzer);
        this.referencesProvider = new ReferencesProvider();
    }

    /**
     * Pre-flight check called before VS Code shows the rename input box.
     * Returns the word range to highlight, or throws a ResponseError to cancel.
     */
    public async prepareRename(
        document: TextDocument,
        position: { line: number; character: number }
    ): Promise<Range | null> {
        const filePath = this.uriToPath(document.uri);

        // Reject if the file is in a Clarion library source directory
        const libsrcReason = this.getLibsrcRejectionReason(filePath);
        if (libsrcReason) {
            throw new ResponseError(ErrorCodes.InvalidRequest, libsrcReason);
        }

        const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
        if (!wordRange) {
            throw new ResponseError(ErrorCodes.InvalidRequest, 'No symbol at cursor position.');
        }

        const word = document.getText(wordRange);
        if (!word || word.trim().length === 0) {
            throw new ResponseError(ErrorCodes.InvalidRequest, 'No symbol at cursor position.');
        }

        // Reject if the symbol is a MAP procedure declared in an external DLL or
        // a MODULE whose source file cannot be resolved within the solution.
        const dllReason = this.getDllOrUnresolvableRejectionReason(document, position.line, word);
        if (dllReason) {
            throw new ResponseError(ErrorCodes.InvalidRequest, dllReason);
        }

        // Confirm symbol is known — rejects keywords, punctuation, etc.
        const symbolInfo = await this.symbolFinder.findSymbol(word, document, position);
        if (!symbolInfo) {
            throw new ResponseError(
                ErrorCodes.InvalidRequest,
                `Cannot rename '${word}': symbol not found or not renameable.`
            );
        }

        return wordRange;
    }

    /**
     * Performs the rename: finds all references and builds a WorkspaceEdit.
     */
    public async provideRename(
        document: TextDocument,
        position: { line: number; character: number },
        newName: string
    ): Promise<WorkspaceEdit | null> {
        if (!newName || newName.trim().length === 0) return null;

        const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
        if (!wordRange) return null;

        const oldName = document.getText(wordRange);
        if (!oldName) return null;

        // Gather all reference locations (include declaration so it gets renamed too)
        const locations = await this.referencesProvider.provideReferences(
            document,
            position,
            { includeDeclaration: true }
        );

        if (!locations || locations.length === 0) {
            logger.error(`[RENAME] No references found for "${oldName}"`);
            return null;
        }

        logger.error(`[RENAME] Renaming "${oldName}" → "${newName}" across ${locations.length} location(s)`);

        // Build WorkspaceEdit: group TextEdits by file URI
        const changes: { [uri: string]: TextEdit[] } = {};
        for (const loc of locations) {
            if (!changes[loc.uri]) changes[loc.uri] = [];
            changes[loc.uri].push(TextEdit.replace(loc.range, newName));
        }

        return { changes };
    }

    // -------------------------------------------------------------------------

    /**
     * Returns a rejection reason if the symbol at the given line is a MAP procedure
     * that is declared with the ,DLL attribute (external library) or whose MODULE
     * target cannot be resolved within the solution. Returns null if rename is safe.
     */
    private getDllOrUnresolvableRejectionReason(
        document: TextDocument,
        line: number,
        name: string
    ): string | null {
        const tokens = this.tokenCache.getTokensByUri(document.uri);
        if (!tokens) return null;

        // Find a MapProcedure token on or near the cursor line matching the symbol name
        const mapProc = tokens.find(t =>
            t.subType === TokenType.MapProcedure &&
            t.label?.toUpperCase() === name.toUpperCase() &&
            Math.abs(t.line - line) <= 1
        );

        if (!mapProc) return null;

        // Check for ,DLL attribute on the declaration line
        const docLine = document.getText({
            start: { line: mapProc.line, character: 0 },
            end: { line: mapProc.line, character: 1000 }
        });
        if (/,\s*DLL\b/i.test(docLine)) {
            return `Cannot rename '${name}': procedure is declared with ,DLL and may be defined in an external project. Rename the source manually.`;
        }

        // Check whether the parent MODULE's target file is resolvable.
        //   - Bare MODULE keyword (no parenthesised filename) → referencedFile undefined → reject.
        //   - MODULE('Foo.clw') with a solution loaded → look the filename up via every
        //     project's redirection parser; reject when no project finds a real on-disk file.
        //   - MODULE('Foo.clw') with no solution loaded → skip the check (no graph to consult).
        const parentModule = mapProc.parent;
        if (
            parentModule?.type === TokenType.Structure &&
            parentModule.value.toUpperCase() === 'MODULE'
        ) {
            const refFile = parentModule.referencedFile;
            const solutionManager = SolutionManager.getInstance();
            const unresolvable = !refFile
                ? true
                : (solutionManager?.solution ? !this.resolvesViaRedirection(solutionManager, refFile) : false);

            if (unresolvable) {
                const display = refFile || '(no filename)';
                return `Cannot rename '${name}': the source file '${display}' could not be resolved within the current solution. Rename the source manually.`;
            }
        }

        return null;
    }

    /**
     * Returns true if `refFile` resolves to a real on-disk path via any project's
     * redirection parser. Mirrors MapProcedureResolver's resolution pattern.
     */
    private resolvesViaRedirection(solutionManager: SolutionManager, refFile: string): boolean {
        for (const proj of solutionManager.solution.projects) {
            const redirectionParser = proj.getRedirectionParser?.();
            if (!redirectionParser) continue;
            const resolved = redirectionParser.findFile(refFile);
            if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                return true;
            }
        }
        return false;
    }

    /** Converts a file:// URI to a normalised file-system path. */
    private uriToPath(uri: string): string {
        return decodeURIComponent(uri.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, ''))
            .replace(/\//g, '\\');
    }

    /**
     * Returns a human-readable rejection reason if `filePath` is inside a known
     * Clarion library source directory, or null if the file is safe to rename.
     */
    private getLibsrcRejectionReason(filePath: string): string | null {
        const normalised = filePath.toLowerCase();

        for (const libDir of serverSettings.libsrcPaths) {
            if (normalised.startsWith(libDir.toLowerCase())) {
                return `Cannot rename: '${path.basename(filePath)}' is part of the Clarion standard library (${libDir}).`;
            }
        }

        return null;
    }
}
