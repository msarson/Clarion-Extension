import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import * as fs from 'fs';
import * as nodePath from 'path';
import { ClarionTokenizer, Token, TokenType } from '../../ClarionTokenizer';
import { ViewDescriptorParser } from '../../tokenizer/ViewDescriptorParser';
import { TokenCache } from '../../TokenCache';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { getCrossFileEpoch } from '../../utils/crossFileEpoch';

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
// #345 phase 4 — the validator runs SYNC on every validation pass (open /
// change / sdiReady / crossFileUpdate: 4 passes at startup) and its FROM
// resolution re-tokenized the MEMBER parent each time (4.3s × 4 measured on
// IBSWorking). Result memo: same doc version + same cross-file epoch → same
// diagnostics. The #340 watcher bumps the epoch on any workspace change.
// NB: content is part of the identity (the #340/#344 lesson — same uri+version
// with different text must never serve a stale result; test fixtures and
// unsaved-buffer flows both hit this).
const viewDiagsMemo = new Map<string, { version: number; epoch: number; text: string; diags: Diagnostic[] }>();
let viewMemoEpoch = -1;
let viewComputeCount = 0;

/** Test observability — number of full (non-memoized) validator computations. */
export function getViewProjectFieldsComputeCount(): number {
    return viewComputeCount;
}

export function validateViewProjectFields(
    tokens: Token[],
    document: TextDocument,
    getOpenDocumentContent?: (absPath: string) => string | null
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    // Look for any VIEW first — bail before doing any cross-file work if the
    // document has no VIEWs at all (the common case).
    const hasView = tokens.some(t =>
        t.type === TokenType.Structure && t.value.toUpperCase() === 'VIEW'
    );
    if (!hasView) return diagnostics;

    const epoch = getCrossFileEpoch();
    if (epoch !== viewMemoEpoch) {
        viewDiagsMemo.clear();
        crossTokensMemo.clear();
        viewMemoEpoch = epoch;
    }
    const memoKey = document.uri.toLowerCase();
    const memoHit = viewDiagsMemo.get(memoKey);
    if (memoHit && memoHit.version === document.version && memoHit.epoch === epoch &&
        memoHit.text === document.getText()) {
        return memoHit.diags;
    }
    viewComputeCount++;

    const fileResolver = new FileResolver(tokens, document, getOpenDocumentContent);

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

        // PROJECT(...) field validation — each field is resolved against the file that
        // OWNS it: the JOIN's file when the PROJECT sits inside a JOIN ... END, and the
        // VIEW's FROM file otherwise (#464). Resolving every PROJECT against FROM
        // reported every joined field as missing.
        //
        // Owner resolution is cached: it is a cross-file lookup, and a generated browse
        // projects many fields from the same two or three files.
        // One walk serves both checks below (#473).
        const scopedFields = collectScopedViewFields(tokens, view, desc.from);

        const ownerCache = new Map<string, { label: string; fields: Set<string> } | null>();
        const resolveOwner = (name: string) => {
            const key = name.toUpperCase();
            if (ownerCache.has(key)) return ownerCache.get(key)!;
            const resolved = fileResolver.resolveFileOrPrefixed(name);
            const entry = resolved
                ? { label: resolved.fileLabel, fields: collectFieldNames(resolved.fileToken) }
                : null;
            ownerCache.set(key, entry);
            return entry;
        };

        if (desc.projectedFields.length > 0) {
            for (const scoped of scopedFields.projects) {
                const owner = resolveOwner(scoped.owner);
                // An unresolvable owner, or one we know no fields for, proves nothing —
                // stay silent rather than accuse a field of not existing.
                if (!owner || owner.fields.size === 0) continue;
                const fieldToken = scoped.token;
                // #467: a dotted field carries its own qualifier (`Customer.Name`).
                // Compare the member half - `collectFieldNames` holds bare and
                // PRE:-prefixed names, never the dotted form.
                const dotted = splitDottedReference(fieldToken.value);
                const comparable = (dotted ? dotted.member : fieldToken.value).toUpperCase();
                if (owner.fields.has(comparable)) continue;
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: {
                        start: { line: fieldToken.line, character: fieldToken.start },
                        end: { line: fieldToken.line, character: fieldToken.start + fieldToken.value.length }
                    },
                    message: `'${fieldToken.value}' is not a field on FILE '${owner.label}'.`,
                    source: 'clarion'
                });
            }
        }

        // JOIN(key, field...) field-argument validation (#473).
        //
        // These fields belong to the PARENT file - the VIEW's FROM file, or the enclosing
        // JOIN's file when nested - NOT to the file being joined. That is the opposite
        // of what this loop assumed for its whole life, and it never fired to prove it:
        // it resolved the JOIN's first argument with `resolve()`, but that argument is a
        // KEY reference (`CUS:CusKey`), never a bare FILE label, so it matched nothing.
        //
        // Compiler-verified on Clarion 10.0.12567 against test-programs/ViewJoinTest,
        // one line changed per case:
        //   JOIN(CUS:CusKey, ORD:NoSuchField) -> Field not found in parent FILE
        //   JOIN(CUS:CusKey, CUS:Name)        -> Field not found in parent FILE
        //   JOIN(CUS:CusKey, CUS:ID)          -> compiles
        //
        // The third is the trap that made the old premise look right: it passes only
        // because the PARENT (Orders) also has an `ID`, despite the argument carrying
        // the JOINED file's prefix. So the match is by field NAME with the prefix
        // IGNORED - hence bareFieldName rather than the PROJECT check's exact compare.
        for (const scoped of scopedFields.joinFields) {
            const owner = resolveOwner(scoped.owner);
            // Same silence contract as PROJECT: an unresolvable parent proves nothing.
            if (!owner || owner.fields.size === 0) continue;
            const fieldToken = scoped.token;
            if (owner.fields.has(bareFieldName(fieldToken.value))) continue;
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: {
                    start: { line: fieldToken.line, character: fieldToken.start },
                    end: { line: fieldToken.line, character: fieldToken.start + fieldToken.value.length }
                },
                message: `'${fieldToken.value}' is not a field on the parent FILE '${owner.label}'.`,
                source: 'clarion'
            });
        }
    }

    viewDiagsMemo.set(memoKey, { version: document.version, epoch, text: document.getText(), diags: diagnostics });
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

    // #349: dictionary-generated MS-SQL date/time splits nest fields in
    // GROUP,OVER(...) overlays inside the RECORD — those fields (and the
    // overlay's own label) are addressable as PRE:Name and valid PROJECT
    // targets. Recurse into nested structures; a nested group without its
    // own PRE() inherits the enclosing prefix.
    const walk = (parent: Token, prefixForChildren: string | undefined): void => {
        for (const child of parent.children ?? []) {
            if (child.type === TokenType.Label) {
                validFields.add(child.value.toUpperCase());
                const p = child.structurePrefix?.toUpperCase() ?? prefixForChildren;
                if (p) {
                    validFields.add(`${p}:${child.value.toUpperCase()}`);
                }
            } else if (child.type === TokenType.Structure) {
                if (child.label) {
                    validFields.add(child.label.toUpperCase());
                    if (prefixForChildren) {
                        validFields.add(`${prefixForChildren}:${child.label.toUpperCase()}`);
                    }
                }
                walk(child, child.structurePrefix?.toUpperCase() ?? prefixForChildren);
            }
        }
    };
    walk(record, fileToken.structurePrefix?.toUpperCase());
    return validFields;
}

interface ResolvedFile {
    fileToken: Token;
    fileLabel: string;
}

/**
 * Split a dotted VIEW reference into its file qualifier and the name after the
 * dot - `Customer.CusKey` -> `{ file: 'Customer', member: 'CusKey' }`. Returns
 * undefined when there is no usable dot, so callers fall through to their
 * existing colon/literal handling unchanged.
 *
 * #467. Both halves are needed, and by different callers: `FileResolver`
 * resolves a JOIN target from the `file` half, while the PROJECT field check
 * compares the `member` half against its scope owner's field set. The whole
 * dotted token matches neither the bare (`NAME`) nor the prefixed (`CUS:NAME`)
 * form that `collectFieldNames` builds, which is why the unsplit value produced
 * a warning on code the compiler accepts.
 *
 * The qualifier is deliberately NOT required to match the owner. Compiling
 * `PROJECT(Orders.Total)` inside `JOIN(Customer.CusKey, ...)` fails with
 * `Field not found in parent FILE` - so the compiler checks the member against
 * the enclosing scope's file and ignores the qualifier, exactly as this does.
 */
export function splitDottedReference(name: string): { file: string; member: string } | undefined {
    const dot = name.indexOf('.');
    // A leading dot has no file half; a trailing one is a period terminator.
    if (dot <= 0 || dot === name.length - 1) return undefined;
    return { file: name.slice(0, dot), member: name.slice(dot + 1) };
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
    private filesByPrefix = new Map<string, ResolvedFile>();
    private visitedUris = new Set<string>();
    private currentClwDir: string;
    private tokenCache = TokenCache.getInstance();

    constructor(
        currentTokens: Token[],
        private document: TextDocument,
        private getOpenDocumentContent?: (absPath: string) => string | null
    ) {
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

    /**
     * Resolve a VIEW/JOIN target that may be a FILE name (`Invoice`), a dotted
     * reference to one (`Customer.CusKey`) or a prefixed one (`CUS:Key` - a KEY,
     * which is what a JOIN actually names). The literal name is tried first, so
     * files whose label contains neither separator are unaffected.
     */
    public resolveFileOrPrefixed(name: string): ResolvedFile | undefined {
        const direct = this.resolve(name);
        if (direct) return direct;
        // #467: dot notation names the file outright - `Customer.CusKey` is the
        // CusKey KEY on FILE Customer. Legal Clarion, and compiler-verified in
        // test-programs/ViewJoinTest.
        const dotted = splitDottedReference(name);
        if (dotted) {
            const byDottedFile = this.resolve(dotted.file);
            if (byDottedFile) return byDottedFile;
        }
        const colon = name.indexOf(':');
        if (colon <= 0) return undefined;
        const prefix = name.slice(0, colon).toUpperCase();
        const byPrefix = this.filesByPrefix.get(prefix);
        if (byPrefix) return byPrefix;
        if (this.pendingExpansion) {
            this.expandIncludes(this.pendingExpansion);
            this.pendingExpansion = undefined;
        }
        return this.filesByPrefix.get(prefix);
    }

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
                // Also index by PRE() prefix: a JOIN names a KEY, not a file --
                // JOIN(CUS:Key, ...) -- so scoping a JOIN's fields needs prefix -> file.
                const pre = t.structurePrefix?.toUpperCase();
                if (pre && !this.filesByPrefix.has(pre)) {
                    this.filesByPrefix.set(pre, { fileToken: t, fileLabel: t.label });
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

        // #117 B1: shared cache-first/disk-fallback content load (was an inline
        // `getDocumentText(uri) ?? fs.readFileSync` here). Downstream stays exactly
        // as before — sync direct tokenize, undefined on any failure.
        // #199: thread live-doc resolver for JOIN/FROM cross-file loads so OPEN+DIRTY
        // include targets use the editor buffer instead of stale saved disk.
        const content = CrossFileResolver.loadExternalFileContent(
            this.tokenCache,
            uri,
            candidate,
            this.getOpenDocumentContent ?? undefined
        );
        if (content === undefined) return undefined;
        // #345 phase 4: this ran a FRESH tokenize of the MEMBER parent (68k
        // tokens, ~2.5s) on EVERY validation pass. Content-compared memo —
        // identical text is identical tokens; a changed file mismatches and
        // re-tokenizes naturally. Cleared on cross-file epoch bumps.
        const memo = crossTokensMemo.get(uri.toLowerCase());
        if (memo && memo.content === content) return memo.tokens;
        try {
            const fresh = new ClarionTokenizer(content).tokenize();
            if (crossTokensMemo.size > 200) crossTokensMemo.clear();
            crossTokensMemo.set(uri.toLowerCase(), { content, tokens: fresh });
            return fresh;
        } catch {
            return undefined;
        }
    }
}

// #345 phase 4 — cross-file tokenize memo for the FileResolver (see
// loadTokensForFile). Module-level so it survives across validation passes;
// cleared alongside viewDiagsMemo on epoch bumps.
const crossTokensMemo = new Map<string, { content: string; tokens: Token[] }>();

/**
 * Walks the body of a VIEW structure and returns every JOIN clause — the
 * joined-file name token (first arg) and any field-name tokens after it.
 * Mirrors the structure of `collectScopedProjectFieldTokens` but separated because
 * JOIN args have positional meaning (first = file; rest = fields) while
 * PROJECT args are flat field references.
 */
/**
 * PROJECT fields inside a VIEW, each paired with the file that OWNS it (#464).
 *
 * A PROJECT nested in a `JOIN(Key, ...) ... END` projects fields of the JOINED file,
 * not of the VIEW's FROM file, and nested JOINs nest their ownership.
 *
 * The walk counts openers against ENDs itself rather than using token ranges, because
 * neither is usable here: JOIN is tokenized as a Function and carries no `finishesAt`,
 * and a VIEW containing a JOIN reports a `finishesAt` pointing at the JOIN's END rather
 * than its own.
 */
function collectScopedProjectFieldTokens(
    tokens: Token[],
    view: Token,
    primaryFile: string
): Array<{ token: Token; owner: string }> {
    return collectScopedViewFields(tokens, view, primaryFile).projects;
}

/**
 * One walk, two answers (#473). Both PROJECT fields and a JOIN's field arguments need
 * the same owner stack, but they read it at different moments, which is the whole
 * subtlety:
 *
 *   PROJECT fields    belong to the CURRENT owner — the JOINed file when nested inside
 *                     a JOIN, the VIEW's FROM file otherwise (#464).
 *   JOIN field args   belong to the owner the JOIN is declared IN — its PARENT — read
 *                     BEFORE the JOIN pushes its own file onto the stack.
 *
 * The parent rule is compiler-verified, not inferred; see `validateViewProjectFields`
 * and `test-programs/ViewJoinTest/README.md` for the three variants that establish it.
 */
function collectScopedViewFields(
    tokens: Token[],
    view: Token,
    primaryFile: string
): { projects: Array<{ token: Token; owner: string }>; joinFields: Array<{ token: Token; owner: string }> } {
    const result: Array<{ token: Token; owner: string }> = [];
    const joinFields: Array<{ token: Token; owner: string }> = [];

    const viewIndex = tokens.findIndex(t => t === view);
    if (viewIndex === -1) return { projects: result, joinFields };

    // Owner stack: the VIEW's FROM file, then one entry per enclosing JOIN.
    const owners: string[] = [primaryFile];
    let depth = 1; // the VIEW itself is open

    for (let i = viewIndex + 1; i < tokens.length && depth > 0; i++) {
        const t = tokens[i];
        const upper = t.value.toUpperCase();

        if (t.type === TokenType.EndStatement) {
            depth--;
            if (depth === 0) break;          // the VIEW's own END
            if (owners.length > 1) owners.pop();
            continue;
        }

        if (upper === 'JOIN' && tokens[i + 1]?.value === '(') {
            // The first argument names the join target - a KEY, whose prefix resolves
            // to the file. An unresolvable one still pushes, so the matching END pops
            // the right entry and ownership downstream is not shifted by one.
            const args = namesInsideParens(tokens, i + 1);
            // #473: the remaining arguments are fields of the PARENT - the owner this
            // JOIN is declared in - so they must be read BEFORE the push below.
            const parentOwner = owners[owners.length - 1];
            for (const field of args.slice(1)) {
                joinFields.push({ token: field, owner: parentOwner });
            }
            owners.push(args[0]?.value ?? parentOwner);
            depth++;
            continue;
        }

        // Any other structure opener inside a VIEW keeps the stack balanced.
        if (t.type === TokenType.Structure) {
            depth++;
            owners.push(owners[owners.length - 1]);
            continue;
        }

        if (upper === 'PROJECT' && tokens[i + 1]?.value === '(') {
            const owner = owners[owners.length - 1];
            for (const field of namesInsideParens(tokens, i + 1)) {
                result.push({ token: field, owner });
            }
        }
    }

    return { projects: result, joinFields };
}

/**
 * The field name a qualifier-agnostic comparison uses — `CUS:Name`, `Customer.Name` and
 * `Name` all reduce to `NAME` (#473).
 *
 * A JOIN's field list is matched by NAME with the prefix IGNORED, which is not how the
 * PROJECT check works and is not a shortcut: `JOIN(CUS:CusKey, CUS:ID)` compiles against
 * a parent that has an `ID`, even though the argument carries the JOINED file's prefix.
 * Comparing the written form would reject it.
 */
function bareFieldName(value: string): string {
    const dotted = splitDottedReference(value);
    const afterQualifier = dotted ? dotted.member : value;
    const colon = afterQualifier.lastIndexOf(':');
    return (colon >= 0 ? afterQualifier.slice(colon + 1) : afterQualifier).toUpperCase();
}

/** Name tokens inside the parenthesised argument list starting at `openIndex`. */
function namesInsideParens(tokens: Token[], openIndex: number): Token[] {
    const names: Token[] = [];
    let depth = 1;
    for (let j = openIndex + 1; j < tokens.length && depth > 0; j++) {
        const inner = tokens[j];
        if (inner.value === '(') { depth++; continue; }
        if (inner.value === ')') { depth--; if (depth === 0) break; continue; }
        if (inner.value === ',' || inner.type === TokenType.Comment) continue;
        if (
            inner.type === TokenType.StructurePrefix ||
            inner.type === TokenType.Variable ||
            inner.type === TokenType.Label ||
            inner.type === TokenType.StructureField
        ) {
            names.push(inner);
        }
    }
    return names;
}

/** The first name token inside the argument list starting at `openIndex`, if any. */
function firstNameInsideParens(tokens: Token[], openIndex: number): string | undefined {
    return namesInsideParens(tokens, openIndex)[0]?.value;
}

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

