import { WorkspaceEdit, TextEdit, Range, Location, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenHelper } from '../utils/TokenHelper';
import { ReferencesProvider } from './ReferencesProvider';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("RenameProvider");
logger.setLevel("error");

/**
 * Provides textDocument/rename for Clarion symbols.
 *
 * Delegates to ReferencesProvider for symbol resolution and location finding,
 * then builds a WorkspaceEdit replacing the old name with the new name at every
 * reference site (including the declaration).
 */
export class RenameProvider {
    private referencesProvider: ReferencesProvider;

    constructor(referencesProvider: ReferencesProvider) {
        this.referencesProvider = referencesProvider;
    }

    /**
     * Validate that the position is renamable and return the range + current name.
     * Called by textDocument/prepareRename before the rename dialog opens.
     */
    public async prepareRename(
        document: TextDocument,
        position: Position
    ): Promise<{ range: Range; placeholder: string } | null> {
        const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
        if (!wordRange) {
            logger.info(`⚠️ prepareRename: no word at position ${position.line}:${position.character}`);
            return null;
        }

        const word = document.getText(wordRange);
        if (!word || word.length === 0) return null;

        // Clarion keywords should not be renamed. Check against a simple set
        // of common keywords. The server will also return null from references
        // for built-in symbols, so this is a fast-path rejection.
        if (isClarionKeyword(word)) {
            logger.info(`⚠️ prepareRename: "${word}" is a Clarion keyword, rejecting`);
            return null;
        }

        return { range: wordRange, placeholder: word };
    }

    /**
     * Perform the rename: find all references, build a WorkspaceEdit.
     */
    public async provideRenameEdits(
        document: TextDocument,
        position: Position,
        newName: string
    ): Promise<WorkspaceEdit | null> {
        const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
        if (!wordRange) return null;

        const oldName = document.getText(wordRange);
        if (!oldName || oldName.length === 0) return null;

        if (isClarionKeyword(oldName)) {
            logger.info(`⚠️ rename: "${oldName}" is a Clarion keyword, cannot rename`);
            return null;
        }

        logger.error(`🔄 [RENAME] "${oldName}" → "${newName}" at ${position.line}:${position.character} in ${document.uri}`);

        // Find all references including the declaration
        const references = await this.referencesProvider.provideReferences(
            document,
            position,
            { includeDeclaration: true }
        );

        if (!references || references.length === 0) {
            logger.info(`⚠️ rename: no references found for "${oldName}"`);
            return null;
        }

        logger.error(`🔄 [RENAME] Found ${references.length} reference(s) to rename`);

        // Build WorkspaceEdit: group TextEdits by file URI
        const changes: { [uri: string]: TextEdit[] } = {};

        for (const ref of references) {
            if (!changes[ref.uri]) {
                changes[ref.uri] = [];
            }
            changes[ref.uri].push(TextEdit.replace(ref.range, newName));
        }

        const fileCount = Object.keys(changes).length;
        const editCount = references.length;
        logger.error(`🔄 [RENAME] WorkspaceEdit: ${editCount} edit(s) across ${fileCount} file(s)`);

        return { changes };
    }
}

/**
 * Quick check for common Clarion keywords that should never be renamed.
 * This is not exhaustive — the references provider will also return null
 * for unresolvable symbols, providing a second line of defense.
 */
function isClarionKeyword(word: string): boolean {
    const upper = word.toUpperCase();
    return CLARION_KEYWORDS.has(upper);
}

const CLARION_KEYWORDS = new Set([
    'ACCEPT', 'BEGIN', 'BREAK', 'BY', 'CASE', 'CLASS', 'CODE', 'CYCLE',
    'DATA', 'DO', 'ELSE', 'ELSIF', 'END', 'EXECUTE', 'EXIT', 'FROM',
    'FUNCTION', 'GOTO', 'IF', 'INCLUDE', 'LOOP', 'MAP', 'MEMBER',
    'MODULE', 'NEW', 'OF', 'OMIT', 'OPEN', 'OROF', 'PARENT',
    'PROCEDURE', 'PROGRAM', 'RECORD', 'RETURN', 'ROUTINE', 'SECTION',
    'SELF', 'THEN', 'TO', 'UNTIL', 'WHILE',
    // Common built-in types
    'BYTE', 'SHORT', 'USHORT', 'LONG', 'ULONG', 'SIGNED', 'UNSIGNED',
    'SREAL', 'REAL', 'DECIMAL', 'PDECIMAL', 'STRING', 'CSTRING', 'PSTRING',
    'DATE', 'TIME', 'GROUP', 'QUEUE', 'FILE', 'KEY', 'INDEX', 'BLOB',
    'MEMO', 'ANY', 'LIKE', 'TYPE', 'EQUATE', 'ITEMIZE', 'INTERFACE',
    'VIRTUAL', 'DERIVED', 'PROTECTED', 'PRIVATE', 'THREAD',
    // Common built-in functions/statements
    'MESSAGE', 'CLEAR', 'FREE', 'CLOSE', 'CREATE', 'DESTROY', 'DISPLAY',
    'DISABLE', 'ENABLE', 'HIDE', 'UNHIDE', 'SELECT', 'POST', 'PROP',
    'TRUE', 'FALSE', 'NULL'
]);
