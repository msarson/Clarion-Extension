import { Range, WorkspaceEdit, TextEdit, ResponseError, ErrorCodes } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import { TokenCache } from '../TokenCache';
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
