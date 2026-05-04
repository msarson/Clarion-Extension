import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as nodePath from 'path';
import { ClarionTokenizer, Token, TokenType } from '../../ClarionTokenizer';
import { ViewDescriptorParser } from '../../tokenizer/ViewDescriptorParser';
import { TokenCache } from '../../TokenCache';

interface StructureStackItem {
    token: Token;
    structureType: string;
    line: number;
    column: number;
}

interface ConditionalBlockStackItem {
    token: Token;
    blockType: string;   // 'OMIT' or 'COMPILE'
    terminator: string;  // The terminator string to look for
    line: number;
    column: number;
}

// ─── Private helpers ─────────────────────────────────────────────────────────

function requiresTerminator(structureType: string): boolean {
    return [
        'IF', 'LOOP', 'CASE', 'EXECUTE', 'BEGIN',
        'GROUP', 'QUEUE', 'RECORD', 'FILE',
        'CLASS', 'INTERFACE', 'MAP', 'MODULE',
        'WINDOW', 'REPORT', 'APPLICATION',
        'SHEET', 'TAB', 'OLE', 'OPTION', 'MENU', 'MENUBAR', 'TOOLBAR'
    ].includes(structureType);
}

function isSingleLineIfThen(tokens: Token[], ifTokenIndex: number): boolean {
    const ifToken = tokens[ifTokenIndex];
    const ifLine = ifToken.line;

    for (let i = ifTokenIndex + 1; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.line !== ifLine) break;
        if (token.type === TokenType.Operator && token.value === ';') continue;
        if (token.type === TokenType.Keyword && token.value.toUpperCase() === 'THEN') {
            for (let j = i + 1; j < tokens.length; j++) {
                const nextToken = tokens[j];
                if (nextToken.line !== ifLine) break;
                if (nextToken.type === TokenType.EndStatement && nextToken.value.toUpperCase() === 'END') return true;
                if (nextToken.type === TokenType.EndStatement && nextToken.value === '.') return true;
            }
            return false;
        }
    }
    return false;
}

function createUnterminatedStructureDiagnostic(
    structure: StructureStackItem,
    document: TextDocument
): Diagnostic {
    const line = structure.line;
    const lineText = document.getText({ start: { line, character: 0 }, end: { line, character: 1000 } });
    const keywordIndex = lineText.search(/\S/);
    const startPos = { line, character: keywordIndex >= 0 ? keywordIndex : 0 };
    const endPos = { line, character: startPos.character + structure.token.value.length };
    return {
        severity: DiagnosticSeverity.Error,
        range: { start: startPos, end: endPos },
        message: `${structure.structureType} statement is not terminated with END or .`,
        source: 'clarion'
    };
}

function createUnterminatedConditionalBlockDiagnostic(
    block: ConditionalBlockStackItem,
    document: TextDocument
): Diagnostic {
    const line = block.line;
    const lineText = document.getText({ start: { line, character: 0 }, end: { line, character: 1000 } });
    const keywordIndex = lineText.search(/\S/);
    const startPos = { line, character: keywordIndex >= 0 ? keywordIndex : 0 };
    const endPos = { line, character: startPos.character + block.token.value.length };
    return {
        severity: DiagnosticSeverity.Error,
        range: { start: startPos, end: endPos },
        message: `${block.blockType} block is not terminated with terminator string '${block.terminator}'`,
        source: 'clarion'
    };
}

function getConditionalBlockRanges(tokens: Token[], document: TextDocument): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const blockStack: Array<{ line: number; terminator: string }> = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === TokenType.Directive) {
            const directiveType = token.value.toUpperCase();
            if (directiveType === 'OMIT' || directiveType === 'COMPILE') {
                let terminatorString: string | null = null;
                for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                    if (tokens[j].type === TokenType.String) {
                        terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                        break;
                    }
                }
                if (terminatorString) {
                    blockStack.push({ line: token.line, terminator: terminatorString });
                }
            }
        }
    }

    const lineCount = document.lineCount;
    for (const block of blockStack) {
        for (let lineNum = block.line + 1; lineNum < lineCount; lineNum++) {
            const lineText = document.getText({
                start: { line: lineNum, character: 0 },
                end: { line: lineNum, character: 1000 }
            }).trim();
            if (lineText.includes(block.terminator)) {
                ranges.push({ start: block.line, end: lineNum });
                break;
            }
        }
    }

    return ranges;
}

function isInConditionalBlock(line: number, ranges: Array<{ start: number; end: number }>): boolean {
    return ranges.some(range => line > range.start && line <= range.end);
}

// ─── Exported validation functions ───────────────────────────────────────────

export function validateStructureTerminators(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const conditionalRanges = getConditionalBlockRanges(tokens, document);

    for (const token of tokens) {
        if (isInConditionalBlock(token.line, conditionalRanges)) continue;
        if (token.type !== TokenType.Structure) continue;

        const structureType = token.value.toUpperCase();
        if (!requiresTerminator(structureType)) continue;

        if (structureType === 'IF') {
            const tokenIndex = tokens.indexOf(token);
            if (isSingleLineIfThen(tokens, tokenIndex)) continue;
        }

        if (structureType === 'MODULE') {
            const classOnSameLine = tokens.find(t =>
                t.line === token.line &&
                t.value.toUpperCase() === 'CLASS' &&
                t.type === TokenType.Structure
            );
            if (classOnSameLine) continue;
        }

        if (token.finishesAt === undefined || token.finishesAt === null) {
            diagnostics.push(createUnterminatedStructureDiagnostic(
                { token, structureType, line: token.line, column: token.start },
                document
            ));
        }
    }

    return diagnostics;
}

export function validateConditionalBlocks(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const blockStack: ConditionalBlockStackItem[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === TokenType.Directive) {
            const directiveType = token.value.toUpperCase();
            if (directiveType === 'OMIT' || directiveType === 'COMPILE') {
                let terminatorString: string | null = null;
                for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
                    if (tokens[j].type === TokenType.String) {
                        terminatorString = tokens[j].value.replace(/^'(.*)'$/, '$1');
                        break;
                    }
                }
                if (terminatorString) {
                    blockStack.push({
                        token,
                        blockType: directiveType,
                        terminator: terminatorString,
                        line: token.line,
                        column: token.start
                    });
                }
            }
        }

        if (blockStack.length > 0) {
            const shouldCheckLine = i === 0 || tokens[i - 1].line !== token.line;
            if (shouldCheckLine) {
                const lineText = document.getText({
                    start: { line: token.line, character: 0 },
                    end: { line: token.line, character: 1000 }
                }).trim();

                for (let b = blockStack.length - 1; b >= 0; b--) {
                    const block = blockStack[b];
                    if (token.line === block.line) {
                        const fullLineText = document.getText({
                            start: { line: block.line, character: 0 },
                            end: { line: block.line, character: 1000 }
                        });
                        const directiveSubstring = fullLineText.substring(block.column);
                        const parenClose = directiveSubstring.indexOf(')');
                        if (parenClose !== -1) {
                            const lineAfterDirective = fullLineText.substring(block.column + parenClose + 1);
                            if (lineAfterDirective.includes(block.terminator)) {
                                blockStack.splice(b, 1);
                                break;
                            }
                        }
                        continue;
                    }
                    if (lineText.includes(block.terminator)) {
                        blockStack.splice(b, 1);
                        break;
                    }
                }
            }
        }
    }

    // Also check lines that have no tokens (e.g. comment-only lines with "***")
    if (blockStack.length > 0) {
        const lineCount = document.lineCount;
        for (let lineNum = 0; lineNum < lineCount; lineNum++) {
            const lineText = document.getText({
                start: { line: lineNum, character: 0 },
                end: { line: lineNum, character: 1000 }
            }).trim();

            for (let b = blockStack.length - 1; b >= 0; b--) {
                const block = blockStack[b];
                if (lineNum < block.line) continue;
                if (lineNum === block.line) {
                    const fullLineText = document.getText({
                        start: { line: block.line, character: 0 },
                        end: { line: block.line, character: 1000 }
                    });
                    const directiveSubstring = fullLineText.substring(block.column);
                    const parenClose = directiveSubstring.indexOf(')');
                    if (parenClose !== -1) {
                        const lineAfterDirective = fullLineText.substring(block.column + parenClose + 1);
                        if (!lineAfterDirective.includes(block.terminator)) continue;
                    } else {
                        continue;
                    }
                }
                if (lineText.includes(block.terminator)) {
                    blockStack.splice(b, 1);
                    break;
                }
            }

            if (blockStack.length === 0) break;
        }
    }

    for (const block of blockStack) {
        diagnostics.push(createUnterminatedConditionalBlockDiagnostic(block, document));
    }

    return diagnostics;
}

export function validateFileStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const conditionalRanges = getConditionalBlockRanges(tokens, document);

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (isInConditionalBlock(token.line, conditionalRanges)) continue;

        if (token.type === TokenType.Structure && token.value.toUpperCase() === 'FILE') {
            // RECORD presence comes from the parent-child tree (token.children, populated
            // during DocumentStructure.process()). The flagged RECORD child is the only
            // place we ever cared about — no need to re-walk for it.
            const hasRecord = (token.children ?? []).some(c => c.isFileRecord === true);

            // DRIVER is an attribute, not a child structure, so we still need a forward
            // scan for it. Tightened to stop at the FILE declaration line's end, since
            // DRIVER must appear on the same logical line as the FILE keyword (with line
            // continuation tolerated by virtue of the token stream already being flat).
            let hasDriver = false;
            for (let j = i + 1; j < tokens.length; j++) {
                const nextToken = tokens[j];
                const upperValue = nextToken.value.toUpperCase();

                if (upperValue === 'DRIVER') { hasDriver = true; break; }

                if (upperValue === 'END' && nextToken.type === TokenType.EndStatement) break;
                if (nextToken.type === TokenType.Structure && nextToken.start === 0 && nextToken.line > token.line) break;
            }

            if (!hasDriver) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: token.line, character: token.start },
                        end: { line: token.line, character: token.start + token.value.length }
                    },
                    message: 'FILE declaration missing required DRIVER attribute',
                    source: 'clarion'
                });
            }

            if (!hasRecord) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: token.line, character: token.start },
                        end: { line: token.line, character: token.start + token.value.length }
                    },
                    message: 'FILE declaration missing required RECORD section',
                    source: 'clarion'
                });
            }
        }
    }

    return diagnostics;
}

export function validateCaseStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Reads `branches[]` populated by Gap G's `populateBranches` pass on each CASE
    // structure. The pass already filters out branches that belong to nested
    // CASE/IF blocks, so OROF-without-preceding-OF detection becomes a simple
    // ordering check on the array.
    for (const token of tokens) {
        if (token.type !== TokenType.Structure) continue;
        if (token.value.toUpperCase() !== 'CASE') continue;
        const branches = token.branches;
        if (!branches || branches.length === 0) continue;

        let sawOf = false;
        for (const branch of branches) {
            if (branch.kind === 'OF') {
                sawOf = true;
            } else if (branch.kind === 'OROF' && !sawOf) {
                const kw = branch.keywordToken;
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: {
                        start: { line: kw.line, character: kw.start },
                        end: { line: kw.line, character: kw.start + kw.value.length },
                    },
                    message: 'OROF must be preceded by an OF clause in CASE structure',
                    source: 'clarion'
                });
            }
        }
    }

    return diagnostics;
}

export function validateExecuteStructures(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.type === TokenType.Structure && token.value.toUpperCase() === 'EXECUTE') {
            const expressionToken = i + 1 < tokens.length ? tokens[i + 1] : null;
            if (expressionToken) {
                const expValue = expressionToken.value;
                if (expValue.startsWith("'") || expValue.startsWith('"')) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: {
                            start: { line: expressionToken.line, character: expressionToken.start },
                            end: { line: expressionToken.line, character: expressionToken.start + expValue.length }
                        },
                        message: 'EXECUTE expression should evaluate to a numeric value (found string literal)',
                        source: 'clarion'
                    });
                }
            }
        }
    }

    return diagnostics;
}

/**
 * Warns when a `VIEW(File)` structure has a `PROJECT(field)` clause naming a
 * field that doesn't exist on the FROM file's RECORD, and likewise for fields
 * named in `JOIN(JoinedFile, ...)` clauses.
 *
 * v2 (task `d4fe847b`): two extensions over the v1 single-document validator.
 *   1. **Cross-file FROM resolution.** When the FROM file isn't declared in
 *      the current document, walk the INCLUDE/MEMBER chain — tokens cached
 *      via `TokenCache.getTokensByUri` first, then disk fallback for files
 *      that haven't been opened yet. Includes are walked recursively (1 hop)
 *      to reach FILE declarations in `.inc` files included by the parent.
 *   2. **JOIN field validation.** `JOIN(JoinedFile, fieldRefs...)` clauses
 *      now validate every name token after the joined file against the
 *      joined file's RECORD fields, with the SAME cross-file resolution as
 *      the FROM lookup. Mirrors the PROJECT shape exactly.
 *
 * Both extensions degrade gracefully: if the joined/FROM file can't be
 * resolved (no INCLUDE chain reachable, build hasn't run, etc.) the
 * validator skips silently — same false-positive-trust contract as v1.
 *
 * Built on `ViewDescriptorParser` (Gap L) and the `isFileRecord` parent-child
 * marker (Gap M). Gap L follow-up; closes the validation half of issue
 * `7dedd7c8`.
 */
export function validateViewProjectFields(tokens: Token[], document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Look for any VIEW first — bail before doing any cross-file work if the
    // document has no VIEWs at all (the common case).
    const hasView = tokens.some(t =>
        t.type === TokenType.Structure && t.value.toUpperCase() === 'VIEW'
    );
    if (!hasView) return diagnostics;

    const fileResolver = new FileResolver(tokens, document);

    for (const view of tokens) {
        if (view.type !== TokenType.Structure) continue;
        if (view.value.toUpperCase() !== 'VIEW') continue;
        if (view.finishesAt === undefined) continue;

        // Reconstruct header (VIEW opener line) and body (lines strictly between
        // the opener and END) from the document text — same shape the parser was
        // designed for in DocumentStructure.populateViewDescriptors.
        const headerText = document.getText({
            start: { line: view.line, character: 0 },
            end: { line: view.line + 1, character: 0 }
        });
        const bodyText = view.finishesAt > view.line
            ? document.getText({
                start: { line: view.line + 1, character: 0 },
                end: { line: view.finishesAt, character: 0 }
            })
            : '';

        const desc = ViewDescriptorParser.parse(headerText, bodyText);
        if (!desc.from) continue;

        // PROJECT(...) field validation — fields are resolved against the FROM file.
        if (desc.projectedFields.length > 0) {
            const fromFile = fileResolver.resolve(desc.from);
            if (fromFile) {
                const validFields = collectFieldNames(fromFile.fileToken);
                if (validFields.size > 0) {
                    for (const fieldToken of collectProjectFieldTokens(tokens, view)) {
                        const value = fieldToken.value.toUpperCase();
                        if (validFields.has(value)) continue;
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range: {
                                start: { line: fieldToken.line, character: fieldToken.start },
                                end: { line: fieldToken.line, character: fieldToken.start + fieldToken.value.length }
                            },
                            message: `'${fieldToken.value}' is not a field on FILE '${fromFile.fileLabel}'.`,
                            source: 'clarion'
                        });
                    }
                }
            }
        }

        // JOIN(File, fieldRefs...) field validation — fields resolved against the
        // JOINED file. Same shape as PROJECT, using the cross-file resolver for
        // the joined file.
        for (const join of collectJoinClauses(tokens, view)) {
            if (!join.fileToken) continue;
            const joinedFile = fileResolver.resolve(join.fileToken.value);
            if (!joinedFile) continue; // joined file not reachable — skip silently
            const validFields = collectFieldNames(joinedFile.fileToken);
            if (validFields.size === 0) continue;
            for (const fieldToken of join.fieldTokens) {
                const value = fieldToken.value.toUpperCase();
                if (validFields.has(value)) continue;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: fieldToken.line, character: fieldToken.start },
                        end: { line: fieldToken.line, character: fieldToken.start + fieldToken.value.length }
                    },
                    message: `'${fieldToken.value}' is not a field on FILE '${joinedFile.fileLabel}'.`,
                    source: 'clarion'
                });
            }
        }
    }

    return diagnostics;
}

/**
 * Build the set of valid field names on a FILE structure's RECORD child —
 * both bare (`Id`) and prefix-form (`Cus:Id`) so the call site can address
 * either. Returns empty set if the FILE has no RECORD or no Label children.
 */
function collectFieldNames(fileToken: Token): Set<string> {
    const validFields = new Set<string>();
    const record = fileToken.children?.find(c => c.isFileRecord === true);
    if (!record) return validFields;
    for (const child of record.children ?? []) {
        if (child.type !== TokenType.Label) continue;
        validFields.add(child.value.toUpperCase());
        if (child.structurePrefix) {
            validFields.add(`${child.structurePrefix.toUpperCase()}:${child.value.toUpperCase()}`);
        }
    }
    return validFields;
}

interface ResolvedFile {
    fileToken: Token;
    fileLabel: string;
}

interface JoinClause {
    fileToken?: Token;        // first arg of JOIN(...) — the joined file name
    fieldTokens: Token[];     // subsequent name args — fields to validate against the joined file
}

/**
 * Resolves Clarion FILE-structure tokens by their label name, with cross-file
 * fallback. Constructed once per `validateViewProjectFields` call to amortise
 * INCLUDE chain walking across multiple VIEWs in the same document.
 *
 * Lookup order:
 *   1. FILE structures declared in the current document.
 *   2. FILE structures in INCLUDE / MEMBER targets (1-hop): for each `INCLUDE`
 *      / `MEMBER` token in the current document with a `referencedFile` set,
 *      load the target's tokens (cached or via disk read) and search.
 *   3. Recursively, INCLUDE chains 1 hop deeper from the included files.
 *      Bounded depth — keeps this O(includeFanout × tokensPerFile).
 *
 * Token loading uses `TokenCache.getDocumentText` first (covers open files
 * with unsaved edits), then `fs.readFileSync` for unopened files. Failures
 * are swallowed silently — the validator's contract is "no false positives
 * if cross-file resolution fails".
 */
class FileResolver {
    private filesByName = new Map<string, ResolvedFile>();
    private visitedUris = new Set<string>();
    private currentClwDir: string;
    private tokenCache = TokenCache.getInstance();

    constructor(currentTokens: Token[], private document: TextDocument) {
        this.indexFiles(currentTokens);
        // Resolve the URI to a directory so include filenames can be resolved
        // relative to the current CLW. Mirrors the same-dir-first approach in
        // MapDeclarationDiagnostics.ts.
        const filePath = decodeURIComponent(this.document.uri.replace(/^file:\/\/\//i, ''));
        this.currentClwDir = nodePath.dirname(filePath.replace(/\//g, nodePath.sep));
        this.visitedUris.add(this.document.uri);
        // Walk include chain lazily — only when resolve() is called for a name
        // that doesn't hit the in-doc index. Prevents unnecessary disk reads
        // for documents whose VIEW FROM/JOIN files are all locally declared.
        this.pendingExpansion = currentTokens;
    }

    private pendingExpansion?: Token[];

    public resolve(name: string): ResolvedFile | undefined {
        const upper = name.toUpperCase();
        const local = this.filesByName.get(upper);
        if (local) return local;

        if (this.pendingExpansion) {
            // First miss — walk the include chain and try again. If still no
            // hit, the FILE genuinely isn't reachable from this document.
            this.expandIncludes(this.pendingExpansion);
            this.pendingExpansion = undefined;
        }
        return this.filesByName.get(upper);
    }

    private indexFiles(tokens: Token[]): void {
        for (const t of tokens) {
            if (t.type === TokenType.Structure && t.value.toUpperCase() === 'FILE' && t.label) {
                const key = t.label.toUpperCase();
                if (!this.filesByName.has(key)) {
                    this.filesByName.set(key, { fileToken: t, fileLabel: t.label });
                }
            }
        }
    }

    private expandIncludes(tokens: Token[], depth: number = 0): void {
        if (depth > 1) return; // 1-hop fan-out — depth 0 = current doc, 1 = its includes/members.
        for (const t of tokens) {
            const isInclude = t.type === TokenType.Directive && t.value.toUpperCase() === 'INCLUDE';
            const isMember = t.type === TokenType.ClarionDocument && t.value.toUpperCase() === 'MEMBER';
            if (!isInclude && !isMember) continue;
            if (!t.referencedFile) continue;
            const targetTokens = this.loadTokensForFile(t.referencedFile);
            if (!targetTokens) continue;
            this.indexFiles(targetTokens);
            // 1 hop deeper — INCLUDEs declared inside the included file.
            this.expandIncludes(targetTokens, depth + 1);
        }
    }

    private loadTokensForFile(referencedFile: string): Token[] | undefined {
        // Same-dir-first lookup matches MapDeclarationDiagnostics.ts; falls back
        // to absolute path if the referencedFile is itself absolute.
        const sameDir = nodePath.join(this.currentClwDir, referencedFile);
        const candidate = fs.existsSync(sameDir)
            ? sameDir
            : (nodePath.isAbsolute(referencedFile) && fs.existsSync(referencedFile)
                ? referencedFile
                : undefined);
        if (!candidate) return undefined;

        const uri = 'file:///' + candidate.replace(/\\/g, '/');
        if (this.visitedUris.has(uri)) return undefined;
        this.visitedUris.add(uri);

        // Prefer cached tokens if the file is open in another editor pane —
        // they already reflect unsaved edits. Fall through to disk read.
        const cachedTokens = this.tokenCache.getTokensByUri(uri);
        if (cachedTokens) return cachedTokens;

        try {
            const content = this.tokenCache.getDocumentText(uri) ?? fs.readFileSync(candidate, 'utf8');
            return new ClarionTokenizer(content).tokenize();
        } catch {
            return undefined;
        }
    }
}

/**
 * Walks the body of a VIEW structure and returns every JOIN clause — the
 * joined-file name token (first arg) and any field-name tokens after it.
 * Mirrors the structure of `collectProjectFieldTokens` but separated because
 * JOIN args have positional meaning (first = file; rest = fields) while
 * PROJECT args are flat field references.
 */
function collectJoinClauses(tokens: Token[], view: Token): JoinClause[] {
    const result: JoinClause[] = [];
    if (view.finishesAt === undefined) return result;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.line <= view.line || t.line >= view.finishesAt) continue;
        // JOIN keyword can appear with an optional INNER/OUTER prefix — the
        // bare JOIN token is what we look for; the prefix sits on the same
        // line and isn't tokenized as part of JOIN itself.
        if (t.value.toUpperCase() !== 'JOIN') continue;

        let j = i + 1;
        if (j >= tokens.length || tokens[j].value !== '(') continue;
        j++;

        const clause: JoinClause = { fieldTokens: [] };
        let depth = 1;
        let isFirstArg = true;
        let argStarted = false;
        while (j < tokens.length && depth > 0) {
            const inner = tokens[j];
            if (inner.value === '(') {
                depth++;
            } else if (inner.value === ')') {
                depth--;
                if (depth === 0) break;
            } else if (inner.value === ',') {
                if (isFirstArg) isFirstArg = false;
                argStarted = false;
            } else if (inner.type !== TokenType.Comment) {
                // Skip operators inside an arg (e.g. `Cus:Id = Other:Id` — only
                // the first name token of the arg is captured for diagnostics).
                if (argStarted) { j++; continue; }
                if (
                    inner.type === TokenType.StructurePrefix ||
                    inner.type === TokenType.Variable ||
                    inner.type === TokenType.Label ||
                    inner.type === TokenType.StructureField
                ) {
                    if (isFirstArg) {
                        clause.fileToken = inner;
                    } else {
                        clause.fieldTokens.push(inner);
                    }
                    argStarted = true;
                }
            }
            j++;
        }
        result.push(clause);
    }
    return result;
}

/**
 * Walks the body of a VIEW structure and returns every name token that sits
 * inside a PROJECT(...) argument list. Used by validateViewProjectFields to
 * place diagnostic ranges on the offending field token (not the PROJECT
 * keyword) and to ignore non-PROJECT references inside JOIN clauses.
 */
function collectProjectFieldTokens(tokens: Token[], view: Token): Token[] {
    const result: Token[] = [];
    if (view.finishesAt === undefined) return result;

    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.line <= view.line || t.line >= view.finishesAt) continue;
        if (t.value.toUpperCase() !== 'PROJECT') continue;

        let j = i + 1;
        if (j >= tokens.length || tokens[j].value !== '(') continue;
        j++;
        let depth = 1;
        while (j < tokens.length && depth > 0) {
            const inner = tokens[j];
            if (inner.value === '(') {
                depth++;
            } else if (inner.value === ')') {
                depth--;
                if (depth === 0) break;
            } else if (inner.value !== ',' && inner.type !== TokenType.Comment) {
                if (
                    inner.type === TokenType.StructurePrefix ||
                    inner.type === TokenType.Variable ||
                    inner.type === TokenType.Label ||
                    inner.type === TokenType.StructureField
                ) {
                    result.push(inner);
                }
            }
            j++;
        }
    }
    return result;
}
