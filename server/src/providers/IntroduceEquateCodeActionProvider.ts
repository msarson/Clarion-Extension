import { TextDocument, Range, CodeAction, CodeActionKind } from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { Token, TokenType } from '../tokenizer/TokenTypes';
import { TokenHelper } from '../utils/TokenHelper';
import { ScopeKind } from '../scope/ScopeTypes';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('IntroduceEquateCodeActionProvider');
logger.setLevel('error');

/** A candidate data section for the new EQUATE, with the 0-based line to insert before. */
export interface EquateScope {
    label: string;
    insertLine: number;
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
        const scopes = this.computeScopes(structure, tokens, literal.line);
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
    private computeScopes(structure: ReturnType<TokenCache['getStructure']>, tokens: Token[], line: number): EquateScope[] {
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

        // File-level: global data in a PROGRAM, module data in a MEMBER.
        const fileScope = this.fileScope(structure, tokens);
        if (fileScope) scopes.push(fileScope);

        return scopes;
    }

    private fileScope(structure: ReturnType<TokenCache['getStructure']>, tokens: Token[]): EquateScope | null {
        let isProgram = false;
        let firstCodeLine = Number.MAX_SAFE_INTEGER;
        for (const t of tokens) {
            const v = t.value.toUpperCase();
            if (v === 'PROGRAM') isProgram = true;
            if (v === 'CODE' && t.line < firstCodeLine) firstCodeLine = t.line;
        }

        const procedures = structure.getAllProcedures();
        let firstProcLine = Number.MAX_SAFE_INTEGER;
        for (const p of procedures) if (p.line < firstProcLine) firstProcLine = p.line;

        if (isProgram) {
            // Global data sits before the PROGRAM's own CODE (which precedes any procedure).
            const insertLine = firstCodeLine < firstProcLine ? firstCodeLine : firstProcLine;
            if (insertLine === Number.MAX_SAFE_INTEGER) return null;
            return { label: 'Global', insertLine };
        }
        // MEMBER module data sits before the first procedure.
        if (firstProcLine === Number.MAX_SAFE_INTEGER) return null;
        return { label: 'This module', insertLine: firstProcLine };
    }
}
