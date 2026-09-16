import { Range, WorkspaceEdit, TextEdit, TextDocumentEdit, ResponseError, ErrorCodes, Location } from 'vscode-languageserver-protocol';
import { clarionSourceCandidates } from '../utils/ClarionSourceNaming';
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
import { MemberLocatorService } from '../services/MemberLocatorService';
import { serverSettings } from '../serverSettings';
import LoggerManager from '../logger';

/** #527 — what a rename left alone, for the client to show. */
export interface RenameReport {
    skipped: { file: string; count: number }[];
    message: string;
}

/** #527 — structural project surface for the generated-file lookup. */
interface ProjectLike {
    path: string;
    sourceFiles?: Array<{ relativePath?: string; generated?: boolean }>;
}

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
    private memberLocator: MemberLocatorService; // #547

    /**
     * #527 — what the last rename left alone: occurrences in generated files outside
     * the cursor's project, with the message the client should show. Null when
     * nothing was skipped.
     */
    private lastReport: RenameReport | null = null;

    public getLastRenameReport(): RenameReport | null {
        return this.lastReport;
    }

    constructor() {
        this.tokenCache = TokenCache.getInstance();
        const solutionManager = SolutionManager.getInstance();
        this.scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.symbolFinder = new SymbolFinderService(this.tokenCache, this.scopeAnalyzer);
        this.referencesProvider = new ReferencesProvider();
        this.memberLocator = new MemberLocatorService(); // #547
    }

    /**
     * Pre-flight check called before VS Code shows the rename input box.
     * Returns the word range to highlight, or throws a ResponseError to cancel.
     */
    public async prepareRename(
        document: TextDocument,
        position: { line: number; character: number }
    ): Promise<Range | null> {
        // #548 — rename is refused only where the edit would be lost because the code is
        // template-generated (#527/#528 below). Where the cursor sits (a libsrc folder),
        // what the prototype carries (,DLL) or whether its MODULE resolves are the
        // developer's business: a rename in hand-written code is theirs to own, and it
        // is a single undo. The libsrc / DLL / MODULE refusals that lived here are gone.
        const wordRange = TokenHelper.getWordRangeAtPosition(document, position);
        if (!wordRange) {
            throw new ResponseError(ErrorCodes.InvalidRequest, 'No symbol at cursor position.');
        }

        const word = document.getText(wordRange);
        if (!word || word.trim().length === 0) {
            throw new ResponseError(ErrorCodes.InvalidRequest, 'No symbol at cursor position.');
        }

        // #549 — never from a generated file.
        const cursorReason = this.generatedCursorRefusal(document, word);
        if (cursorReason) {
            throw new ResponseError(ErrorCodes.InvalidRequest, cursorReason);
        }

        // #547 — a dotted `Receiver.Method` resolves through the receiver's class first
        // (the hover / F12 path). The per-file symbol finder cannot see through an object
        // to a class declared elsewhere, and the references fallback can come back empty,
        // so the generic "symbol not found" fired for a method that was found perfectly
        // well. Found through the class = renameable (#548: wherever it is declared).
        let resolvedThroughClass = false;
        const lastDotIdx = word.lastIndexOf('.');
        if (lastDotIdx > 0) {
            const receiver = word.slice(0, lastDotIdx);
            const member = word.slice(lastDotIdx + 1);
            const info = await this.memberLocator.resolveDotAccess(receiver, member, document).catch(() => null);
            if (info?.file) resolvedThroughClass = true;
        }
        // #527/#528 — a generated file is owned by the templates: any edit is lost on the
        // next generate. The refusal keys on the DECLARATION's file (a hand-coded class
        // method renamed from a generated call site proceeds; a method declared in a
        // generated file is refused), so the reference set is gathered here and kept for
        // provideRename. After the cheap DLL / unresolvable check, which needs no search.
        const preflight = await this.gatherLocations(document, position);
        if (preflight) {
            const generatedReason = this.generatedRefusal(preflight, document, word);
            if (generatedReason) {
                throw new ResponseError(ErrorCodes.InvalidRequest, generatedReason);
            }
        }

        // Confirm symbol is known — rejects keywords, punctuation, etc.
        // SymbolFinder is per-file, so it misses cross-file procedure declarations
        // (e.g. F2 on a call site whose MAP/MODULE declaration lives in another file).
        // Fall back to ReferencesProvider, which is solution-aware via findProcedureReferences;
        // any non-empty result means provideRename will succeed, so the symbol is renameable.
        const symbolInfo = await this.symbolFinder.findSymbol(word, document, position);
        if (!symbolInfo) {
            // #195: includeDeclaration MUST be true — for a class method renamed at
            // its impl point with no external callers, the ONLY refs are the decl
            // (.inc) + impl (.clw). With includeDeclaration:false both are stripped →
            // 0 → false "not renameable", even though provideRename (which uses
            // includeDeclaration:true, line below) would succeed. The pre-flight must
            // not be stricter than the operation it gates.
            const locations = await this.referencesProvider.provideReferences(
                document, position, { includeDeclaration: true },
                undefined, { includeOmitted: true, crossProjectDll: false } // #255 pre-flight matches provideRename; #330: rename never touches generated consumer MAPs
            );
            // #547 — a method the class resolution found is renameable even when the
            // per-file finder and the references fallback both come back empty.
            if ((!locations || locations.length === 0) && !resolvedThroughClass) {
                throw new ResponseError(
                    ErrorCodes.InvalidRequest,
                    `Cannot rename '${word}': symbol not found or not renameable.`
                );
            }
        }

        // #195 part 2: rename targets the LAST dotted segment (the method/field name).
        // For a cursor on the after-dot segment, getWordRangeAtPosition returns the
        // full qualified `Class.Method` (correct for hover/definition/FAR, wrong for
        // rename — VS Code would seed the rename box with the whole dotted name and
        // rewrite the class prefix too). Narrow HERE, RenameProvider-locally — never in
        // the shared helper, which other consumers depend on. Cursor-on-class-part
        // already yields just the class (no dot), so this only fires past the dot and
        // the narrowed range always contains the cursor. provideRename is unaffected
        // (it recomputes from the position via FAR ranges, not from this range).
        const lastDot = word.lastIndexOf('.');
        if (lastDot >= 0) {
            return {
                start: { line: wordRange.start.line, character: wordRange.start.character + lastDot + 1 },
                end: wordRange.end,
            };
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

        // #549 — never from a generated file (again here, in case the client skipped prepareRename).
        const cursorReason = this.generatedCursorRefusal(document, oldName);
        if (cursorReason) {
            throw new ResponseError(ErrorCodes.InvalidRequest, cursorReason);
        }

        // Gather all reference locations (include declaration so it gets renamed too).
        // #255 — includeOmitted: rename must ALSO rewrite occurrences inside OMIT'd
        // blocks (deliberate deviation from the C++-IDE model): Clarion projects
        // routinely build multiple configurations from one source, and skipping
        // inactive regions silently breaks the other configurations.
        // #527 — cross-project ON: the family is the same one references shows. The #330
        // rule (generated consumer re-declarations are not rewritten; the durable edit
        // belongs in the .app, see #325) is applied per FILE below, from the .cwproj's
        // own `<Generated>` flag. The set is the one prepareRename just gathered when the
        // client went through the pre-flight (#528).
        const locations = await this.gatherLocations(document, position);

        if (!locations || locations.length === 0) {
            logger.debug(`[RENAME] No references found for "${oldName}"`);
            return null;
        }

        // #527/#528 — a generated file is never rewritten, whichever project it is in:
        // the generator owns it. Refused when the DECLARATION is generated (repeated here
        // for a client that skipped the pre-flight); otherwise occurrences in generated
        // files are skipped and reported after the edit is built.
        this.lastReport = null;
        const generatedReason = this.generatedRefusal(locations, document, oldName);
        if (generatedReason) {
            throw new ResponseError(ErrorCodes.InvalidRequest, generatedReason);
        }
        const { kept, skipped } = this.splitGenerated(locations);
        if (kept.length === 0) {
            throw new ResponseError(ErrorCodes.InvalidRequest,
                `Cannot rename '${oldName}': every occurrence is in generated code, which rename cannot alter. Make the change in the .app and regenerate.`);
        }

        logger.debug(`[RENAME] Renaming "${oldName}" → "${newName}" across ${locations.length} location(s)`);

        // #196: Group reference ranges by NORMALIZED file path — NOT by the raw URI
        // string. FAR can surface the same physical file under different URI spellings
        // (observed: the active impl came back as both `file:///f%3A/…` (encoded colon,
        // VS Code's canonical form) AND `file:///f:/…` (un-encoded, from the sourceFiles
        // disk walk)). Keyed by the raw string those look like two files, so we emitted
        // TWO documentChanges entries for the one `.clw`, each with the identical range.
        // VS Code resolves both URIs to the same resource → sees two edits at the same
        // span → OVERLAPPING edits → rejects that whole file's edits ("failed to apply
        // edits") while the single-edit `.inc` applied. That is the partial-rename bug.
        // Normalizing the key collapses the dupes into one group; dedupeRanges then folds
        // the identical ranges into a single edit.
        const groups = new Map<string, { uri: string; ranges: Range[] }>();
        for (const loc of kept) {
            const key = this.uriToPath(loc.uri).toLowerCase(); // Windows paths are case-insensitive
            const existing = groups.get(key);
            if (existing) {
                existing.ranges.push(loc.range);
                // Prefer the active document's exact URI spelling as the emit URI.
                if (loc.uri === document.uri) existing.uri = loc.uri;
            } else {
                groups.set(key, { uri: loc.uri, ranges: [loc.range] });
            }
        }

        // Emit `documentChanges` (modern, ordered per-file). The version is intentionally
        // `null` (UNVERSIONED — "apply without a version check"). Do NOT attach a concrete
        // document version: VS Code's internal text-model version (`model.getVersionId()`)
        // is a DIFFERENT counter from the LSP document version and the two diverge (notably
        // across undo/redo); a versioned edit whose number doesn't match VS Code's live
        // model is rejected. Null version is the LSP-correct way to say "this edit was
        // computed synchronously; just apply it."
        const documentChanges: TextDocumentEdit[] = [];
        for (const { uri, ranges } of groups.values()) {
            const edits = this.dedupeRanges(ranges).map(r => TextEdit.replace(r, newName));
            documentChanges.push(TextDocumentEdit.create({ uri, version: null }, edits));
        }
        if (skipped.length > 0) {
            const total = skipped.reduce((n, s) => n + s.count, 0);
            const list = skipped.map(s => `${path.basename(s.file)}: ${s.count}`).join(', ');
            this.lastReport = {
                skipped,
                message: `Renamed '${oldName}' in ${documentChanges.length} hand-coded file(s). ` +
                    `Rename cannot alter generated code: ${total} occurrence(s) in ${skipped.length} generated file(s) were left unchanged (${list}). ` +
                    `Update the .app and regenerate.`,
            };
            logger.debug(`[RENAME] #527 skipped generated: ${list}`);
        }
        return { documentChanges };
    }

    /**
     * Remove duplicate/overlapping ranges (#196). Sorted by start position, drop any
     * range whose start falls before the previous kept range's end — for rename, all
     * ranges span the same identifier length, so an overlap is effectively a duplicate.
     */
    private dedupeRanges(ranges: Range[]): Range[] {
        const sorted = [...ranges].sort((a, b) =>
            a.start.line - b.start.line ||
            a.start.character - b.start.character ||
            a.end.line - b.end.line ||
            a.end.character - b.end.character);
        const kept: Range[] = [];
        for (const r of sorted) {
            const prev = kept[kept.length - 1];
            if (prev && this.isBefore(r.start, prev.end)) continue; // overlaps/duplicates prev → drop
            kept.push(r);
        }
        return kept;
    }

    /** True when position `a` is strictly before position `b`. */
    private isBefore(a: { line: number; character: number }, b: { line: number; character: number }): boolean {
        return a.line < b.line || (a.line === b.line && a.character < b.character);
    }

    /** Converts a file:// URI to a normalised file-system path. */
    /** #528 — file text for a hit not open in the editor (disk read; null when unreadable). */
    private readFileTextForUri(uri: string): string | null {
        try {
            return fs.readFileSync(this.uriToPath(uri), 'utf-8');
        } catch {
            return null;
        }
    }

    /** #528 — the reference set gathered by the last pre-flight, reused by provideRename. */
    private preflight: { uri: string; version: number; line: number; character: number; locations: Location[] } | null = null;

    /**
     * #528 — the full reference family for the symbol at the cursor (cross-project on,
     * OMIT'd occurrences included), cached per document version and position so the
     * pre-flight and the rename share one search.
     */
    private async gatherLocations(document: TextDocument, position: { line: number; character: number }): Promise<Location[] | null> {
        const c = this.preflight;
        if (c && c.uri === document.uri && c.version === document.version && c.line === position.line && c.character === position.character) {
            return c.locations;
        }
        const locations = await this.referencesProvider.provideReferences(
            document, position, { includeDeclaration: true }, undefined, { includeOmitted: true, crossProjectDll: true });
        if (!locations || locations.length === 0) { this.preflight = null; return null; }
        this.preflight = { uri: document.uri, version: document.version, line: position.line, character: position.character, locations };
        return locations;
    }

    /** #528 — true when this hit is the symbol's declaration or implementation rather than a use. */
    private isDeclarationLike(loc: Location): boolean {
        const text = TokenCache.getInstance().getDocumentText(loc.uri) ?? this.readFileTextForUri(loc.uri);
        if (text === null) return false;
        const line = text.split(/\r?\n/)[loc.range.start.line] ?? '';
        const before = line.substring(0, loc.range.start.character);
        const after = line.substring(loc.range.end.character);
        // A label at column 0 (data, procedure, class member), a `Class.Method` implementation
        // label, or a name followed by PROCEDURE / FUNCTION (a class member declaration).
        if (before.length === 0) return true;
        if (/^[A-Za-z_][A-Za-z0-9_:]*\.$/.test(before)) return true;
        return /^\s+(PROCEDURE|FUNCTION)\b/i.test(after);
    }

    /** #527/#528 — the generated hits (skipped, counted per file) and the rest. */
    private splitGenerated(locations: Location[]): { kept: Location[]; skipped: { file: string; count: number }[] } {
        const skippedByFile = new Map<string, number>();
        const kept = locations.filter(loc => {
            const fsPath = this.uriToPath(loc.uri);
            const project = this.projectOf(fsPath);
            if (!project || !this.isGeneratedIn(project, fsPath)) return true;
            const key = fsPath.toLowerCase();
            skippedByFile.set(key, (skippedByFile.get(key) ?? 0) + 1);
            return false;
        });
        const skipped = [...skippedByFile.entries()].map(([file, count]) => ({ file, count }))
            .sort((a, b) => a.file.localeCompare(b.file));
        return { kept, skipped };
    }

    /**
     * #528 — the refusal text when the symbol's DECLARATION lives in a generated file
     * (every declaration-like hit is generated); with no declaration-like hit at all,
     * the cursor's own file decides (#527). Null when the rename may proceed.
     */
    /**
     * #549 — a rename never starts from a generated file, whatever the declaration.
     * #528 let a hand-coded method be renamed from a generated call site; the rule is
     * now "never in a generated module": the templates own that file, so the rename
     * belongs at the hand-written declaration. Checked before any lookup, in both
     * prepareRename and provideRename.
     */
    private generatedCursorRefusal(document: TextDocument, word: string): string | null {
        const fsPath = this.uriToPath(document.uri);
        const project = this.projectOf(fsPath);
        if (!project || !this.isGeneratedIn(project, fsPath)) return null;
        return `Cannot rename '${word}' here: ${path.basename(fsPath)} is generated by the Clarion templates. ` +
            `Rename from the hand-written declaration instead, or make the change in the .app and regenerate.`;
    }

    private generatedRefusal(locations: Location[], document: TextDocument, word: string): string | null {
        const generatedAt = (uri: string): boolean => {
            const fsPath = this.uriToPath(uri);
            const project = this.projectOf(fsPath);
            return !!project && this.isGeneratedIn(project, fsPath);
        };
        const decls = locations.filter(loc => this.isDeclarationLike(loc));
        const culprit = decls.length > 0
            ? (decls.every(d => generatedAt(d.uri)) ? decls[0].uri : null)
            : (generatedAt(document.uri) ? document.uri : null);
        if (!culprit) return null;
        const where = decls.length > 0 ? `its declaration in ${path.basename(this.uriToPath(culprit))}` : path.basename(this.uriToPath(culprit));
        return `Cannot rename '${word}': ${where} is generated by the Clarion templates and is rewritten on the next generate. ` +
            `Only non-generated code can be renamed safely; make the change in the .app and regenerate.`;
    }

    /** #527 — the project owning a path, by the solution's own lookup. */
    private projectOf(fsPath: string): ProjectLike | null {
        const sm = SolutionManager.getInstance();
        return (sm?.findProjectForFile?.(fsPath) as ProjectLike | undefined) ?? null;
    }

    /** #527 — true when the project's .cwproj marks this file `<Generated>true</Generated>`. */
    private isGeneratedIn(project: ProjectLike, fsPath: string): boolean {
        const norm = path.normalize(fsPath).toLowerCase();
        for (const sf of project.sourceFiles ?? []) {
            if (!sf?.relativePath) continue;
            const abs = path.isAbsolute(sf.relativePath) ? sf.relativePath : path.join(project.path, sf.relativePath);
            if (path.normalize(abs).toLowerCase() === norm) return sf.generated === true;
        }
        return false;
    }

    /** Converts a file:// URI to a normalised file-system path. */
    private uriToPath(uri: string): string {
        return decodeURIComponent(uri.replace(/^file:\/\/\//i, '').replace(/^file:\/\//i, ''))
            .replace(/\//g, '\\');
    }

}
