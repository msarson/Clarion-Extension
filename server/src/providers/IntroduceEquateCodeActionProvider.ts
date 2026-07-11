import { TextDocument, Range, CodeAction, CodeActionKind } from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as path from 'path';
import { TokenCache } from '../TokenCache';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { ScopeKind } from '../scope/ScopeTypes';
import { SolutionManager } from '../solution/solutionManager';
import { pathToCanonicalUri } from '../utils/UriUtils';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('IntroduceEquateCodeActionProvider');
logger.setLevel('error');

/** A candidate data section for the new EQUATE, with the 0-based line to insert before. */
export interface EquateScope {
    label: string;
    insertLine: number;
    /** When set, the EQUATE is inserted into THIS file (cross-file global into the PROGRAM). */
    uri?: string;
}

/**
 * The program named by a `MEMBER('name')` statement, or null for a bare `MEMBER`, `MEMBER()` or
 * `MEMBER('')` (no named program → no global scope can be offered). Exported for unit testing.
 */
export function extractMemberProgramName(tokens: Token[]): string | null {
    const member = tokens.find(t => t.value.toUpperCase() === 'MEMBER');
    if (!member) return null;
    const arg = tokens.find(t => t.line === member.line && t.type === TokenType.String && t.start > member.start);
    if (!arg) return null;
    const name = arg.value.replace(/^'/, '').replace(/'$/, '').trim();
    return name.length > 0 ? name : null;
}

/** The literal found under the cursor / selection. */
interface FoundLiteral {
    line: number;
    startChar: number;
    endChar: number;
    text: string;
}

/**
 * #281 — "Introduce EQUATE": extract a magic literal (`42`, `'Main'`) to a named Clarion `EQUATE`.
 *
 * The provider detects the literal under the cursor / selection and computes the candidate data
 * sections it could live in — routine-local (when the routine has a `DATA` section), the enclosing
 * procedure/method's local data, and the file-level section (module data in a `MEMBER`, global data
 * in a `PROGRAM`). It returns a single code action carrying those scopes to the client command
 * `clarion.introduceEquate`, which lets the user pick the scope (a quick pick — the "second choice",
 * mirroring Surround With) and name the constant. Insertion points come from `DocumentStructure`
 * (`executionMarker`), so scope detection stays on the structural side.
 */
export class IntroduceEquateCodeActionProvider {

    provideCodeActions(document: TextDocument, range: Range): CodeAction[] {
        const tokens = TokenCache.getInstance().getTokens(document);
        const literal = this.findLiteral(tokens, range);
        if (!literal) return [];

        const structure = TokenCache.getInstance().getStructure(document);
        const scopes = this.computeScopes(document, structure, tokens, literal.line);
        if (scopes.length === 0) return [];

        logger.info(`💡 Introduce EQUATE for "${literal.text}" → ${scopes.length} scope(s)`);

        return [{
            title: 'Introduce EQUATE',
            kind: CodeActionKind.RefactorExtract,
            command: {
                title: 'Introduce EQUATE',
                command: 'clarion.introduceEquate',
                arguments: [
                    document.uri,
                    { line: literal.line, startChar: literal.startChar, endChar: literal.endChar },
                    literal.text,
                    scopes
                ]
            }
        }];
    }

    /** The numeric / string literal token intersecting the cursor (empty range) or selection. */
    private findLiteral(tokens: Token[], range: Range): FoundLiteral | null {
        const line = range.start.line;
        if (range.end.line !== line) return null; // a literal is a single-line token
        const from = range.start.character;
        const to = range.end.character;

        for (const t of tokens) {
            if (t.line !== line) continue;
            if (t.type !== TokenType.String && t.type !== TokenType.Number) continue;
            const ts = t.start;
            const te = t.start + t.value.length;
            const hit = from === to
                ? (from >= ts && from <= te)   // cursor within the token
                : (ts < to && te > from);      // selection overlaps the token
            if (hit) {
                return { line, startChar: ts, endChar: te, text: t.value };
            }
        }
        return null;
    }

    /** The data sections the EQUATE could live in, innermost → outermost. */
    private computeScopes(
        document: TextDocument,
        structure: ReturnType<TokenCache['getStructure']>,
        tokens: Token[],
        line: number
    ): EquateScope[] {
        const scopes: EquateScope[] = [];
        const node = structure.getScopeResolver().resolveScopeAt(line);

        // Routine-local data — only when the routine actually has a DATA section.
        if (node.kind === ScopeKind.Routine && node.token?.hasLocalData && node.token.executionMarker) {
            scopes.push({ label: 'This routine (routine data)', insertLine: node.token.executionMarker.line });
        }

        // The enclosing procedure/method's local data.
        const procNode = node.kind === ScopeKind.Routine ? node.parent : node;
        if (procNode && (procNode.kind === ScopeKind.Procedure || procNode.kind === ScopeKind.Method)
            && procNode.token?.executionMarker) {
            scopes.push({ label: 'This procedure (local data)', insertLine: procNode.token.executionMarker.line });
        }

        // File-level: global data in a PROGRAM (same file), module data + (if the MEMBER names a
        // program) cross-file global into that PROGRAM file.
        scopes.push(...this.fileScopes(document, structure, tokens));
        return scopes;
    }

    private fileScopes(
        document: TextDocument,
        structure: ReturnType<TokenCache['getStructure']>,
        tokens: Token[]
    ): EquateScope[] {
        const isProgram = tokens.some(t => t.value.toUpperCase() === 'PROGRAM');
        if (isProgram) {
            const insertLine = this.globalInsertLine(tokens);
            return insertLine === null ? [] : [{ label: 'Global', insertLine }];
        }

        // MEMBER file: module data (this file), before the first procedure IMPLEMENTATION.
        const out: EquateScope[] = [];
        const firstProcLine = this.firstProcedureImplLine(structure);
        if (firstProcLine !== null) {
            out.push({ label: 'This module', insertLine: firstProcLine });
        }

        // Cross-file global: MEMBER('name') → the program is name.clw; a bare/empty MEMBER names no
        // program, so no global is offered. Only available when the program file can be resolved.
        const programName = extractMemberProgramName(tokens);
        if (programName) {
            const globalScope = this.crossFileGlobalScope(document, programName);
            if (globalScope) out.push(globalScope);
        }
        return out;
    }

    /** Resolve the PROGRAM file named by MEMBER and compute its global-data insertion point. */
    private crossFileGlobalScope(document: TextDocument, programName: string): EquateScope | null {
        try {
            const currentPath = decodeURIComponent(document.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
            const programPath = this.resolveProgramFile(programName, currentPath);
            if (!programPath) return null;

            const content = fs.readFileSync(programPath, 'utf8');
            const programUri = pathToCanonicalUri(programPath);
            const programDoc = TextDocument.create(programUri, 'clarion', 1, content);
            const programTokens = TokenCache.getInstance().getTokens(programDoc);
            // Sanity: the resolved file must actually be a PROGRAM.
            if (!programTokens.some(t => t.value.toUpperCase() === 'PROGRAM')) return null;

            const insertLine = this.globalInsertLine(programTokens);
            if (insertLine === null) return null;

            return { label: `Global (in ${path.basename(programPath)})`, insertLine, uri: programUri };
        } catch (err) {
            logger.error(`crossFileGlobalScope('${programName}') failed: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Resolve the program's `.clw` via the solution's redirection, then a sibling-directory fallback.
     * The MEMBER argument may be a bare program name (`MyApp`) or the full filename
     * (`MyApp.clw`, as AppGen-generated code emits) — only append `.clw` when it is missing.
     */
    private resolveProgramFile(programName: string, currentPath: string): string | null {
        const candidate = /\.clw$/i.test(programName) ? programName : `${programName}.clw`;
        const sm = SolutionManager.getInstance();
        if (sm?.solution) {
            for (const proj of sm.solution.projects) {
                const resolved = proj.getRedirectionParser().findFile(candidate);
                if (resolved?.path && fs.existsSync(resolved.path)) return resolved.path;
            }
        }
        const sibling = path.join(path.dirname(currentPath), candidate);
        return fs.existsSync(sibling) ? sibling : null;
    }

    /**
     * The global-data insertion line: before the PROGRAM's own CODE. The first `CODE` token in a
     * PROGRAM file is the program's main CODE, which sits AFTER the MAP (and any global data), so
     * inserting there keeps the EQUATE in the global data area — never inside the MAP structure
     * (a MAP prototype's line must NOT be used as the anchor).
     */
    private globalInsertLine(tokens: Token[]): number | null {
        let firstCodeLine = Number.MAX_SAFE_INTEGER;
        for (const t of tokens) {
            if (t.value.toUpperCase() === 'CODE' && t.line < firstCodeLine) firstCodeLine = t.line;
        }
        return firstCodeLine === Number.MAX_SAFE_INTEGER ? null : firstCodeLine;
    }

    /**
     * The first procedure IMPLEMENTATION line — the boundary for module data. `getAllProcedures`
     * also returns MAP/CLASS prototypes (which live inside those structures); anchoring module data
     * on one of those would insert it inside the MAP, so only implementations count here.
     */
    private firstProcedureImplLine(structure: ReturnType<TokenCache['getStructure']>): number | null {
        let first = Number.MAX_SAFE_INTEGER;
        for (const p of structure.getAllProcedures()) {
            if (p.subType === TokenType.GlobalProcedure || p.subType === TokenType.MethodImplementation) {
                if (p.line < first) first = p.line;
            }
        }
        return first === Number.MAX_SAFE_INTEGER ? null : first;
    }
}
