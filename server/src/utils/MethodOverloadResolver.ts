import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { SolutionManager } from '../solution/solutionManager';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { ClarionPatterns } from './ClarionPatterns';
import { TokenHelper } from './TokenHelper';
import { ArgClassification, CallSiteArgumentClassifier } from './CallSiteArgumentClassifier';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("MethodOverloadResolver");
logger.setLevel("error");

/**
 * Information about a method declaration with location details
 */
export interface MethodDeclarationInfo {
    signature: string;
    file: string;
    line: number;
    paramCount: number;
}

/**
 * Shared utility for resolving method overloads based on parameter count
 * Used by both HoverProvider and DefinitionProvider
 */
export class MethodOverloadResolver {
    
    /**
     * Finds the best matching method declaration for a method implementation or call
     * @param className The name of the class containing the method
     * @param methodName The name of the method
     * @param document The document to search in
     * @param tokens Tokens from the document
     * @param paramCount Optional parameter count for overload resolution
     * @param implementationSignature Optional full signature for type-based matching
     * @returns Method declaration info or null if not found
     */
    public findMethodDeclaration(
        className: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[],
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        logger.info(`Finding method declaration: ${className}.${methodName}${paramCount !== undefined ? ` with ${paramCount} parameters` : ''}`);

        const candidates = this.gatherCurrentFileMethodDeclarations(className, methodName, document, tokens);

        // Select best match from current file
        const bestMatch = this.selectBestOverload(candidates, paramCount, implementationSignature);
        if (bestMatch) {
            return bestMatch;
        }

        // If not found in current file, search INCLUDE files
        logger.info(`Method not found in current file, searching INCLUDEs`);
        return this.findMethodDeclarationInIncludes(className, methodName, document, paramCount, implementationSignature);
    }

    /**
     * #125 — return all current-file `className.methodName` declaration
     * candidates (no overload picking). Consumers do their own filtering
     * (e.g. providers layer `CallSiteArgumentClassifier` +
     * `findOverloadByArgClassifications` on top per the Pattern A
     * "providers filter above the substrate" design).
     *
     * Current-file scope only. Cross-file INCLUDE walking stays on
     * `findMethodDeclaration`'s INCLUDE path for now; providers fall back
     * to `findMethodDeclaration` when this returns empty.
     */
    public findAllMethodDeclarations(
        className: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[]
    ): MethodDeclarationInfo[] {
        return this.gatherCurrentFileMethodDeclarations(className, methodName, document, tokens);
    }

    /**
     * #127 — return all `className.methodName` declaration candidates from
     * BOTH the current file AND INCLUDE'd files (cross-file). Same shape as
     * `findAllMethodDeclarations` but covers Mark's real-world repro where
     * the CLASS is declared in an INCLUDE'd `.inc` (StringTheory in libsrc).
     * Used by Def/Hover/Impl arg-classify overlays for cross-file overload
     * resolution.
     */
    public findAllMethodDeclarationsIncludingIncludes(
        className: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[]
    ): MethodDeclarationInfo[] {
        return [
            ...this.gatherCurrentFileMethodDeclarations(className, methodName, document, tokens),
            ...this.gatherScopeMethodDeclarations(className, methodName, document),
        ];
    }

    /**
     * #182 — given an ALREADY-RESOLVED class + method + the call's line, classify
     * the call's arguments and return the single arg-matching overload
     * declaration. Shared glue behind the Def / Hover / Impl arg-classification
     * overlays for the SELF / PARENT / chained call shapes, where the caller has
     * already resolved the receiver's class and only needs to disambiguate
     * same-arity overloads by argument type.
     *
     * Returns null to signal "fall through to the paramCount-only path" when:
     *   - the call's name token isn't found on `callLine`,
     *   - the call's arguments can't be classified,
     *   - fewer than 2 candidates (nothing to disambiguate, or cross-file miss),
     *   - the resolver reports `matchedAll` / no match (un-disambiguatable —
     *     conservative fallback preserves existing UX).
     */
    public resolveOverloadDeclByArgs(
        className: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[],
        callLine: number
    ): MethodDeclarationInfo | null {
        const lowerMethod = methodName.toLowerCase();
        const callNameIdx = tokens.findIndex(t =>
            t.line === callLine && (
                t.value.toLowerCase() === lowerMethod ||
                t.value.toLowerCase().endsWith('.' + lowerMethod)
            ));
        if (callNameIdx < 0) return null;

        const args = new CallSiteArgumentClassifier().classifyArguments(tokens, callNameIdx);
        if (!args) return null;

        const candidates = this.findAllMethodDeclarationsIncludingIncludes(className, methodName, document, tokens);
        if (candidates.length < 2) return null;

        const { matchedIndex, matchedAll } = this.findOverloadByArgClassifications(
            args, candidates.map(c => c.signature));
        if (matchedAll || matchedIndex < 0) return null;

        return candidates[matchedIndex];
    }

    /**
     * #126 — pick the active overload for `SignatureHelp` from partial-arg
     * classifications (the user is mid-typing — `partialArgs` may be shorter
     * than any candidate's full signature). Score each candidate by per-
     * position `scoreArgParam` over the prefix; skip candidates whose
     * `paramTypes.length < partialArgs.length` (can't accept this many args).
     *
     * Returns `{ activeIndex: 0, ambiguous: true }` when:
     *   - no candidates,
     *   - partialArgs is empty (no signal to disambiguate),
     *   - no candidate has enough param slots,
     *   - top two scored candidates tie (caller falls back to 0).
     *
     * Otherwise returns `{ activeIndex: <best>, ambiguous: false }`. Pure
     * composition over `extractParameterTypes` + `scoreArgParam` — no new
     * primitive logic.
     */
    public findActiveOverloadByPartialArgs(
        partialArgs: ArgClassification[],
        candidateSignatures: string[]
    ): { activeIndex: number; ambiguous: boolean } {
        if (candidateSignatures.length === 0) return { activeIndex: 0, ambiguous: true };
        if (partialArgs.length === 0) return { activeIndex: 0, ambiguous: true };

        const scored = candidateSignatures
            .map((sig, idx) => ({ idx, paramTypes: this.extractParameterTypes(sig) }))
            .filter(c => c.paramTypes.length >= partialArgs.length)
            .map(c => ({
                idx: c.idx,
                score: partialArgs.reduce((acc, arg, k) =>
                    acc + this.scoreArgParam(arg, c.paramTypes[k]), 0),
            }));

        if (scored.length === 0) return { activeIndex: 0, ambiguous: true };

        scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
        if (scored.length >= 2 && scored[0].score === scored[1].score) {
            // #243: ambiguous among the top scorers — highlight the FIRST of them (lowest index),
            // not a global index 0. When the args narrow it to a family (e.g. the QUEUE overloads
            // of GET), this keeps the highlight inside that family instead of falling back to an
            // unrelated overload (the FILE-first GET signature at index 0).
            return { activeIndex: scored[0].idx, ambiguous: true };
        }
        return { activeIndex: scored[0].idx, ambiguous: false };
    }

    /**
     * #128 — gather all `className.methodName` candidates by walking Clarion's
     * compilation-model file graph: MEMBER → PROGRAM → recursive INCLUDE BFS.
     *
     * Mark's real-world repro shape: a MEMBER file (`MyNextProcedure.clw`)
     * calls `st.SetValue('Hello World')`, but StringTheory is declared in
     * `stringtheory.inc` reached only via the PROGRAM's INCLUDE chain
     * (possibly transitive: PROGRAM → `Global.inc` → `StringTheory.inc`).
     *
     * Algorithm:
     *   1. Canonical-path the current doc URI.
     *   2. Detect MEMBER directive in the top ~10 lines.
     *   3. scan-root = `FRG.getProgramFile(currentDoc)` when MEMBER (fallback
     *      to current doc if FRG hasn't tracked the MEMBER edge); else current doc.
     *   4. BFS from scan-root via `FRG.getForwardEdges(file).type==='INCLUDE'`.
     *   5. Pre-add current doc to visited (token-based scan already covers it).
     *
     * FRG-not-ready soft fallback: when `frg.isBuilt === false`, falls back to
     * the legacy `gatherIncludeMethodDeclarations` direct-INCLUDE walk and
     * emits `logger.warn` for telemetry.
     *
     * Cycle protection: canonical-path visited-set (lowercased / forward-slash
     * to match FRG's `normalizePath`).
     */
    private gatherScopeMethodDeclarations(
        className: string,
        methodName: string,
        document: TextDocument
    ): MethodDeclarationInfo[] {
        const frg = FileRelationshipGraph.getInstance();
        const canonicalPath = decodeURIComponent(document.uri.replace('file:///', ''));
        const currentDocEdges = frg.getForwardEdges(canonicalPath);

        if (!frg.isBuilt || currentDocEdges.length === 0) {
            logger.warn(`[#128] FRG not built — falling back to direct-INCLUDE walk for ${className}.${methodName}`);
            return this.gatherIncludeMethodDeclarations(className, methodName, document);
        }

        const currentDocKey = this.normalizeFilePath(canonicalPath);

        const topLines = document.getText().split('\n').slice(0, 10);
        const hasMember = topLines.some(l => /^\s*MEMBER\s*\(\s*['"][^'"]+['"]\s*\)/i.test(l));

        const scanRoot = hasMember
            ? (frg.getProgramFile(canonicalPath) ?? canonicalPath)
            : canonicalPath;

        const visited = new Set<string>([currentDocKey]);
        const queue: string[] = [];

        // Seed queue: skip scanning the current doc (token-based pass covers it),
        // but push its INCLUDE neighbours so cross-file decls remain reachable.
        if (this.normalizeFilePath(scanRoot) === currentDocKey) {
            for (const e of frg.getForwardEdges(scanRoot).filter(e => e.type === 'INCLUDE')) {
                queue.push(e.toFile);
            }
        } else {
            queue.push(scanRoot);
        }

        const candidates: MethodDeclarationInfo[] = [];
        while (queue.length > 0) {
            const file = queue.shift()!;
            const key = this.normalizeFilePath(file);
            if (visited.has(key)) continue;
            visited.add(key);

            candidates.push(...this.scanFileForClassMethods(file, className, methodName));

            for (const e of frg.getForwardEdges(file).filter(e => e.type === 'INCLUDE')) {
                queue.push(e.toFile);
            }
        }
        return candidates;
    }

    /**
     * #128 — read a single file from disk and return all `className.methodName`
     * declarations found inside. Empty result on read failure / no match —
     * caller composes results across the BFS frontier.
     */
    private scanFileForClassMethods(
        filePath: string,
        className: string,
        methodName: string
    ): MethodDeclarationInfo[] {
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf8');
        } catch {
            return [];
        }
        const lines = content.split('\n');
        const candidates: MethodDeclarationInfo[] = [];

        for (let j = 0; j < lines.length; j++) {
            if (!new RegExp(`^${className}\\s+CLASS`, 'i').test(lines[j])) continue;

            for (let k = j + 1; k < lines.length; k++) {
                const methodLine = lines[k];
                if (/^\s*END\s*$/i.test(methodLine) || /^END\s*$/i.test(methodLine)) break;

                if (new RegExp(`^\\s*(${methodName})\\s+(?:PROCEDURE|FUNCTION)`, 'i').test(methodLine)) {
                    const signature = methodLine.trim();
                    const declParamCount = ClarionPatterns.countParameters(signature);
                    const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
                    candidates.push({ signature, file: fileUri, line: k, paramCount: declParamCount });
                }
            }
        }
        return candidates;
    }

    /** Match FRG's `normalizePath` shape so visited-set keys dedupe correctly across path forms. */
    private normalizeFilePath(p: string): string {
        return p.toLowerCase().replace(/\\/g, '/');
    }

    private gatherCurrentFileMethodDeclarations(
        className: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[]
    ): MethodDeclarationInfo[] {
        const candidates: MethodDeclarationInfo[] = [];
        const classTokens = TokenHelper.findClassStructures(tokens);

        for (const classToken of classTokens) {
            if (classToken.label?.toLowerCase() !== className.toLowerCase()) continue;
            const lines = document.getText().split('\n');
            const children = classToken.children ?? [];
            for (const childToken of children) {
                if (TokenHelper.isProcedureOrFunction(childToken) &&
                    childToken.subType === TokenType.MethodDeclaration &&
                    childToken.label?.toLowerCase() === methodName.toLowerCase()) {

                    const signature = lines[childToken.line]?.trim() ?? '';
                    const declParamCount = ClarionPatterns.countParameters(signature);

                    candidates.push({
                        signature,
                        file: document.uri,
                        line: childToken.line,
                        paramCount: declParamCount,
                    });
                }
            }
        }
        return candidates;
    }

    /**
     * Finds the declaration of a method within an INTERFACE body.
     * Used for 3-part method implementations (Class.Interface.Method PROCEDURE).
     */
    public findInterfaceMethodDeclaration(
        interfaceName: string,
        methodName: string,
        document: TextDocument,
        tokens: Token[],
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        logger.info(`Finding interface method declaration: ${interfaceName}.${methodName}`);

        const candidates: MethodDeclarationInfo[] = [];
        const content = document.getText();
        const lines = content.split('\n');

        // Search current file tokens for InterfaceMethod under the matching interface
        for (const token of tokens) {
            if (token.subType === TokenType.InterfaceMethod &&
                token.label?.toLowerCase() === methodName.toLowerCase() &&
                token.parent?.label?.toLowerCase() === interfaceName.toLowerCase()) {
                const signature = lines[token.line]?.trim() ?? '';
                const declParamCount = ClarionPatterns.countParameters(signature);
                candidates.push({ signature, file: document.uri, line: token.line, paramCount: declParamCount });
                logger.info(`Found interface method candidate at line ${token.line}`);
            }
        }

        const bestMatch = this.selectBestOverload(candidates, paramCount, implementationSignature);
        if (bestMatch) return bestMatch;

        // Search INCLUDE files
        return this.findInterfaceMethodInIncludes(
            interfaceName, methodName,
            decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'),
            new Set(), paramCount, implementationSignature
        );
    }

    /**
     * Recursively searches INCLUDE files for a method declaration within an INTERFACE body.
     */
    private findInterfaceMethodInIncludes(
        interfaceName: string,
        methodName: string,
        fromPath: string,
        visited: Set<string>,
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        if (visited.has(fromPath.toLowerCase())) return null;
        visited.add(fromPath.toLowerCase());

        let content: string;
        try { content = fs.readFileSync(fromPath, 'utf8'); } catch { return null; }

        const lines = content.split('\n');
        const candidates: MethodDeclarationInfo[] = [];

        const includePattern = /INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/gi;
        let m: RegExpExecArray | null;

        while ((m = includePattern.exec(content)) !== null) {
            const includeFileName = m[1];
            let resolvedPath: string | null = null;

            const solutionManager = SolutionManager.getInstance();
            if (solutionManager?.solution) {
                for (const project of solutionManager.solution.projects) {
                    const resolved = project.getRedirectionParser().findFile(includeFileName);
                    if (resolved?.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }

            if (!resolvedPath) {
                const currentDir = path.dirname(fromPath);
                const relativePath = path.join(currentDir, includeFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                }
            }

            if (resolvedPath && !path.isAbsolute(resolvedPath)) {
                resolvedPath = path.resolve(path.dirname(fromPath), resolvedPath);
            }

            if (!resolvedPath) continue;

            logger.info(`Searching INCLUDE for interface method: ${resolvedPath}`);
            let includeContent: string;
            try { includeContent = fs.readFileSync(resolvedPath, 'utf8'); } catch { continue; }

            const includeLines = includeContent.split('\n');
            let foundInThis = false;

            for (let j = 0; j < includeLines.length; j++) {
                const ifaceMatch = includeLines[j].match(new RegExp(`^(${interfaceName})\\s+INTERFACE`, 'i'));
                if (!ifaceMatch) continue;

                logger.info(`Found INTERFACE ${interfaceName} at line ${j} in ${resolvedPath}`);
                foundInThis = true;
                for (let k = j + 1; k < includeLines.length; k++) {
                    if (/^\s*END\s*$/i.test(includeLines[k]) || /^END\s*$/i.test(includeLines[k])) break;
                    const methodMatch = includeLines[k].match(new RegExp(`^\\s*(${methodName})\\s+(?:PROCEDURE|FUNCTION)`, 'i'));
                    if (methodMatch) {
                        const signature = includeLines[k].trim();
                        const declParamCount = ClarionPatterns.countParameters(signature);
                        const fileUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
                        candidates.push({ signature, file: fileUri, line: k, paramCount: declParamCount });
                        logger.info(`Found interface method in INCLUDE at line ${k}`);
                    }
                }
            }

            // If not found in this file, recurse into its includes
            if (!foundInThis) {
                const nested = this.findInterfaceMethodInIncludes(
                    interfaceName, methodName, resolvedPath, visited, paramCount, implementationSignature
                );
                if (nested) return nested;
            }
        }

        return this.selectBestOverload(candidates, paramCount, implementationSignature);
    }

    /**
     * Searches for method declaration in INCLUDE files
     */
    private findMethodDeclarationInIncludes(
        className: string,
        methodName: string,
        document: TextDocument,
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        const candidates = this.gatherIncludeMethodDeclarations(className, methodName, document);
        return this.selectBestOverload(candidates, paramCount, implementationSignature);
    }

    /**
     * #127 — gather all `className.methodName` declaration candidates from
     * INCLUDE'd files. Reads via `fs.readFileSync` (cross-file disk I/O —
     * see `feedback_red_fixture_matches_user_repro.md` for the Mark-reported
     * gap that drove this primitive's extraction). Used by both legacy
     * `findMethodDeclarationInIncludes` (auto-picks via selectBestOverload)
     * and `findAllMethodDeclarationsIncludingIncludes` (no auto-pick;
     * providers do their own arg-classify filtering on top).
     */
    private gatherIncludeMethodDeclarations(
        className: string,
        methodName: string,
        document: TextDocument
    ): MethodDeclarationInfo[] {
        const filePath = decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\');
        const content = document.getText();
        const lines = content.split('\n');

        const candidates: MethodDeclarationInfo[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"](.+?)['"]\s*\)/i);
            if (!includeMatch) continue;

            const includeFileName = includeMatch[1];
            let resolvedPath: string | null = null;

            // Try solution-wide redirection
            const solutionManager = SolutionManager.getInstance();
            if (solutionManager && solutionManager.solution) {
                for (const project of solutionManager.solution.projects) {
                    const redirectionParser = project.getRedirectionParser();
                    const resolved = redirectionParser.findFile(includeFileName);
                    if (resolved && resolved.path && fs.existsSync(resolved.path)) {
                        resolvedPath = resolved.path;
                        break;
                    }
                }
            }

            // Fallback to relative path
            if (!resolvedPath) {
                const currentDir = path.dirname(filePath);
                const relativePath = path.join(currentDir, includeFileName);
                if (fs.existsSync(relativePath)) {
                    resolvedPath = path.resolve(relativePath);
                }
            }

            if (resolvedPath && !path.isAbsolute(resolvedPath)) {
                const currentDir = path.dirname(filePath);
                resolvedPath = path.resolve(currentDir, resolvedPath);
            }

            if (!resolvedPath) continue;

            const includeContent = fs.readFileSync(resolvedPath, 'utf8');
            const includeLines = includeContent.split('\n');

            for (let j = 0; j < includeLines.length; j++) {
                const classMatch = includeLines[j].match(new RegExp(`^${className}\\s+CLASS`, 'i'));
                if (!classMatch) continue;

                for (let k = j + 1; k < includeLines.length; k++) {
                    const methodLine = includeLines[k];
                    if (methodLine.match(/^\s*END\s*$/i) || methodLine.match(/^END\s*$/i)) break;

                    const methodMatch = methodLine.match(new RegExp(`^\\s*(${methodName})\\s+(?:PROCEDURE|FUNCTION)`, 'i'));
                    if (methodMatch) {
                        const signature = methodLine.trim();
                        const declParamCount = ClarionPatterns.countParameters(signature);
                        const fileUri = `file:///${resolvedPath.replace(/\\/g, '/')}`;
                        candidates.push({
                            signature,
                            file: fileUri,
                            line: k,
                            paramCount: declParamCount,
                        });
                    }
                }
            }
        }

        return candidates;
    }
    
    /**
     * Selects the best overload match based on parameter count and types
     */
    private selectBestOverload(
        candidates: MethodDeclarationInfo[],
        paramCount?: number,
        implementationSignature?: string
    ): MethodDeclarationInfo | null {
        if (candidates.length === 0) return null;

        // 1. No parameter count provided → return first candidate
        if (paramCount === undefined) {
            logger.info(`Returning first candidate (no param matching needed)`);
            return candidates[0];
        }

        // 2. Exact count match
        const exactCountMatches = candidates.filter(c => c.paramCount === paramCount);

        if (implementationSignature && exactCountMatches.length > 1) {
            logger.info(`Multiple overloads with ${paramCount} parameters, attempting type matching`);
            const implParams = this.extractParameterTypes(implementationSignature);

            for (const candidate of exactCountMatches) {
                const declParams = this.extractParameterTypes(candidate.signature);
                if (this.parametersMatch(implParams, declParams)) {
                    logger.info(`Found exact type match with signature: ${candidate.signature}`);
                    return candidate;
                }
            }

            logger.info(`No exact type match found, returning first candidate with matching count`);
        }

        if (exactCountMatches.length > 0) {
            logger.info(`Found exact match with ${paramCount} parameters`);
            return exactCountMatches[0];
        }

        // 3. Compatible match: callArgs within [paramCount - defaultCount, paramCount]
        const compatibleCandidates = candidates
            .filter(c => {
                const defaults = ClarionPatterns.countDefaultParams(c.signature);
                return paramCount >= (c.paramCount - defaults) && paramCount <= c.paramCount;
            })
            .sort((a, b) => (a.paramCount - paramCount) - (b.paramCount - paramCount));

        if (compatibleCandidates.length > 0) {
            logger.info(`Selected compatible overload with ${compatibleCandidates[0].paramCount} parameters (call had ${paramCount})`);
            return compatibleCandidates[0];
        }

        // 4. Fallback: closest absolute distance, prefer higher param count on tie
        const bestMatch = candidates.reduce((best, curr) => {
            const bestDiff = Math.abs(best.paramCount - paramCount);
            const currDiff = Math.abs(curr.paramCount - paramCount);

            if (currDiff === bestDiff) {
                return curr.paramCount > best.paramCount ? curr : best;
            }

            return currDiff < bestDiff ? curr : best;
        });

        logger.info(`Selected overload with ${bestMatch.paramCount} parameters (implementation had ${paramCount})`);
        return bestMatch;
    }
    
    /**
     * Extracts parameter types from a method signature
     * Returns array of normalized parameter types (e.g., ['STRING', '*STRING', 'LONG']).
     * `applyComplexRefNormalization` (default true) toggles the rule-6 `*COMPLEX` ≡
     * `COMPLEX` collapsing — used by `isComplexRefDuplicate` to detect rule-3
     * duplicates by comparing pre- and post-normalization shapes.
     */
    private extractParameterTypes(signature: string, applyComplexRefNormalization: boolean = true): string[] {
        const match = signature.match(/(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i);
        if (!match) return [];

        const paramList = match[1].trim();
        if (paramList === '') return [];

        // Split by commas at depth 0 (respecting nested parens and angle brackets)
        const params: string[] = [];
        let currentParam = '';
        let depth = 0;
        let angleDepth = 0;

        for (let i = 0; i < paramList.length; i++) {
            const char = paramList[i];

            if (char === '(') {
                depth++;
                currentParam += char;
            } else if (char === ')') {
                depth--;
                currentParam += char;
            } else if (char === '<') {
                angleDepth++;
                currentParam += char;
            } else if (char === '>') {
                angleDepth--;
                currentParam += char;
            } else if (char === ',' && depth === 0 && angleDepth === 0) {
                params.push(currentParam.trim());
                currentParam = '';
            } else {
                currentParam += char;
            }
        }

        if (currentParam.trim()) {
            params.push(currentParam.trim());
        }

        // Extract just the type from each parameter (remove variable names and defaults)
        return params.map(param => this.extractParameterType(param, applyComplexRefNormalization));
    }
    
    /**
     * Extracts the type from a single parameter string
     * Examples:
     *   "STRING s" -> "STRING"
     *   "*STRING pStr" -> "*STRING"
     *   "<LONG lOpt>" -> "LONG"
     *   "LONG lVal=0" -> "LONG"
     */
    private extractParameterType(param: string, applyComplexRefNormalization: boolean = true): string {
        // Remove angle brackets for omittable parameters
        let normalized = param.replace(/^<\s*/, '').replace(/\s*>$/, '');

        // Remove default values (=something)
        normalized = normalized.replace(/\s*=.+$/, '');

        // Strip CONST and REF qualifiers (prototype-only modifiers, not part of the type)
        normalized = normalized.replace(/\bCONST\s+/gi, '').replace(/\bREF\s+/gi, '');

        // Extract type - everything before the last word (which is the variable name)
        // Handle special cases like *STRING, &STRING, etc.
        const words = normalized.trim().split(/\s+/);

        if (words.length === 0) return '';

        let result: string;
        if (words.length === 1) {
            result = words[0].toUpperCase();
        } else {
            // If last word is a valid type, it's the type (no variable name given)
            // Otherwise, everything except last word is the type
            const lastWord = words[words.length - 1];

            // #130 — if the last word starts with a letter, treat it as the
            // variable name. The previous heuristic also required mixed-case
            // OR length > 1 to "protect single-letter all-uppercase TYPES"
            // (e.g. `LONG X` was read as a 2-word type), but the probe found
            // that defensive case is hypothetical: Clarion has no single-letter
            // scalar types (every member of `isStringType`/`isNumericType`
            // at line 1066-1076 is multi-letter), and user-defined single-letter
            // types in no-name param shapes hit the `words.length === 1` branch
            // above. `LONG X` / `STRING N` / `BYTE I` are now correctly read.
            if (lastWord.match(/^[a-z]/i)) {
                result = words.slice(0, -1).join(' ').toUpperCase();
            } else {
                result = words.join(' ').toUpperCase();
            }
        }

        // Rule 6 (#121): `*` is implicit for complex types — `*Foo` ≡ `Foo` when Foo
        // is NOT scalar. Scalar `*X` ≠ `X` discriminator preserved (rule 4).
        // Skip when caller needs raw form (isComplexRefDuplicate rule-2/rule-3 disambiguation).
        if (applyComplexRefNormalization && result.startsWith('*')) {
            const base = result.slice(1).trim();
            if (base && !this.isStringType(base) && !this.isNumericType(base)) {
                return base;
            }
        }
        return result;
    }
    
    /**
     * Compares two parameter type arrays to see if they match
     * Handles reference indicators like *, &, etc.
     */
    private parametersMatch(implParams: string[], declParams: string[]): boolean {
        if (implParams.length !== declParams.length) {
            return false;
        }

        for (let i = 0; i < implParams.length; i++) {
            const implType = implParams[i];
            const declType = declParams[i];

            // Normalize for comparison (remove extra spaces)
            const normalizedImpl = implType.replace(/\s+/g, ' ').trim();
            const normalizedDecl = declType.replace(/\s+/g, ' ').trim();

            if (normalizedImpl !== normalizedDecl) {
                return false;
            }
        }

        return true;
    }

    /**
     * Compares two `PROCEDURE(...)` signature strings for type-shape
     * equivalence. Composes `extractParameterTypes` + `parametersMatch`
     * (both private) so external callers (e.g. ReferencesProvider's
     * plain-symbol path under fe254d6f) don't have to know about either.
     *
     * Inherits the transformation behaviors of `extractParameterType`:
     * CONST/REF stripped, default values stripped, omittable angle brackets
     * stripped, types upcased. Scalar reference indicators (`*STRING`,
     * `*LONG`, etc.) are preserved — `*STRING` ≠ `STRING` (Mark-reported
     * discriminator that 35019583 / fe254d6f depend on). Complex-type `*`
     * is normalized away per #121 rule 6 — `*StringTheory` ≡ `StringTheory`.
     */
    public signaturesMatch(sigA: string, sigB: string): boolean {
        const typesA = this.extractParameterTypes(sigA);
        const typesB = this.extractParameterTypes(sigB);
        return this.parametersMatch(typesA, typesB);
    }

    /**
     * #121 — true when two declarations are structurally identical at the
     * prototype level (same param types, same positions, after documentary
     * labels stripped + complex-type `*` normalized per rule 6). Used by the
     * indistinguishable-prototype diagnostic walker to flag duplicate decls.
     *
     * Semantic alias of `signaturesMatch` once rule-6 normalization lives in
     * `extractParameterType`; kept as a separate public API so call sites can
     * name their intent (decl-vs-decl duplicate detection vs FAR-family
     * type-shape comparison).
     */
    public arePrototypesIdentical(sigA: string, sigB: string): boolean {
        return this.signaturesMatch(sigA, sigB);
    }

    /**
     * #121 — true when both declarations are callable with zero arguments
     * (each has 0 mandatory params — every param is defaulted or the param
     * list is empty). Used by the indistinguishable-prototype diagnostic to
     * flag rule-1 collisions (e.g. `Func PROCEDURE()` + `Func PROCEDURE(SHORT=10)`
     * → both invokable as `Func` with no args).
     */
    public areZeroArityCompatible(sigA: string, sigB: string): boolean {
        const isZeroArityCallable = (sig: string): boolean => {
            const paramCount = this.extractParameterTypes(sig).length;
            const defaults = ClarionPatterns.countDefaultParams(sig);
            return paramCount - defaults === 0;
        };
        return isZeroArityCallable(sigA) && isZeroArityCallable(sigB);
    }

    /**
     * #121 — true when sigA and sigB are equivalent prototypes ONLY due to
     * rule-6 complex-type `*` normalization (e.g. `Foo(MyClass)` and
     * `Foo(*MyClass)`). Used by the indistinguishable-prototype diagnostic
     * walker to pick between rule-2 message (raw structural identity) and
     * rule-3 message (`*COMPLEX` ≡ `COMPLEX` redundancy).
     *
     * Returns false when:
     *   - The signatures don't match at all (even post-rule-6).
     *   - The signatures match raw without needing rule 6 (true rule-2 dupes).
     */
    public isComplexRefDuplicate(sigA: string, sigB: string): boolean {
        if (!this.signaturesMatch(sigA, sigB)) return false;
        const rawA = this.extractParameterTypes(sigA, false);
        const rawB = this.extractParameterTypes(sigB, false);
        return !this.parametersMatch(rawA, rawB);
    }

    /**
     * #123 — true when sigA and sigB have the same arity AND every position
     * pair is scalar (string or numeric family) on BOTH sides. Used by the
     * indistinguishable-prototype walker's rule-4 dispatch: scalar value-
     * parameters are interchangeable per Mark's 2026-05-11 empirical verdict
     * on the Clarion compiler — both same-family pairs (LONG + SHORT) and
     * cross-family pairs (LONG + STRING) produce compile errors.
     *
     * Returns false when:
     *   - Arities differ (handled by absence of rule-2 match upstream).
     *   - Either side is empty (handled by rule 1).
     *   - Any position pair has a non-scalar type (complex types like
     *     classes/groups/queues are distinguishable per rule 6 + Mark's
     *     `SetValue(StringTheory)` distinguisher).
     *   - Any position pair has a reference marker (`*LONG`, `*STRING`) —
     *     the fe254d6f scalar by-ref discriminator distinguishes those.
     */
    public areScalarPair(sigA: string, sigB: string): boolean {
        const typesA = this.extractParameterTypes(sigA);
        const typesB = this.extractParameterTypes(sigB);
        if (typesA.length === 0 || typesA.length !== typesB.length) return false;
        for (let i = 0; i < typesA.length; i++) {
            const a = typesA[i];
            const b = typesB[i];
            if (!(this.isStringType(a) || this.isNumericType(a))) return false;
            if (!(this.isStringType(b) || this.isNumericType(b))) return false;
        }
        return true;
    }


    /**
     * Counts parameters in a method declaration
     * Extracts parameter list from PROCEDURE(...) 
     * Handles omittable parameters like <LONG SomeVar> and default values LONG SomeVar=1
     */
    /**
     * Given a declaration signature and an array of candidate implementation signatures,
     * returns the index of the best matching implementation.
     * Matches first by parameter count, then by parameter types (e.g. STRING vs *STRING).
     */
    public findBestMatchingImplementation(declarationSignature: string, candidateSignatures: string[]): number {
        if (candidateSignatures.length <= 1) return 0;

        const declParamCount = ClarionPatterns.countParameters(declarationSignature);

        const countMatches = candidateSignatures
            .map((sig, idx) => ({ sig, idx, count: ClarionPatterns.countParameters(sig) }))
            .filter(c => c.count === declParamCount);

        if (countMatches.length === 0) return 0;
        if (countMatches.length === 1) return countMatches[0].idx;

        // Multiple candidates with same count — use type-based matching
        const declTypes = this.extractParameterTypes(declarationSignature);
        for (const candidate of countMatches) {
            const implTypes = this.extractParameterTypes(candidate.sig);
            if (this.parametersMatch(declTypes, implTypes)) {
                return candidate.idx;
            }
        }

        return countMatches[0].idx;
    }

    /**
     * Counts parameters in a procedure declaration
     * @deprecated Use ClarionPatterns.countParameters() instead
     */
    public countParametersInDeclaration(line: string): number {
        return ClarionPatterns.countParameters(line);
    }

    // ─── P2b — call-site → declaration overload resolution (10ea5a80) ─────
    //
    // The seam between `CallSiteArgumentClassifier` (call-site shape inference)
    // and `MethodOverloadResolver` (decl-side overload picking). The classifier
    // produces `ArgClassification[]`; this method consumes them against
    // candidate declaration signatures and applies Mark's locked overload-
    // resolution rule (see project_clarion_overload_resolution_rule).
    //
    // Mark's three picks (locked 2026-05-10) are honoured here:
    //   (a) Standalone classifier — this method is the documented seam.
    //   (b) Match-all fallback — when no candidate type-matches, return
    //       `matchedAll=true` so the consumer keeps the call site (silent-
    //       failure-pushback bias for F2-rename safety).
    //   (c) Strict-mode flag — `options.strictRefMatching` (default `false`)
    //       toggles whether un-inferable args are allowed to match a `*TYPE`
    //       parameter. Default: allow (match-all). Strict: drop.

    /**
     * Outcome of `findOverloadByArgClassifications`.
     *
     * - `matchedIndex >= 0` and `matchedAll === false`: a single overload was
     *   uniquely selected; the index points into the input `candidateSignatures`
     *   array. Caller should keep the call site iff the selected index equals
     *   the cursor's overload index.
     * - `matchedIndex === -1` and `matchedAll === true`: no candidate could be
     *   uniquely selected (zero compatible candidates after type filtering, OR
     *   the classifier had no inferable types to disambiguate with). Caller
     *   should INCLUDE the call site (conservative — false-positive over
     *   false-negative for silent F2-rename safety).
     */
    public findOverloadByArgClassifications(
        argClassifications: ArgClassification[],
        candidateSignatures: string[],
        options?: { strictRefMatching?: boolean }
    ): { matchedIndex: number; matchedAll: boolean } {
        const strict = options?.strictRefMatching ?? false;

        if (candidateSignatures.length === 0) {
            return { matchedIndex: -1, matchedAll: true };
        }

        // Step 1: arity filter (default-aware — mirror selectBestOverload:367-372).
        // Strict equality misses N-arg calls against (N+defaults)-param decls — #120 root cause.
        const arityCompatible = candidateSignatures
            .map((sig, idx) => ({ idx, sig, paramTypes: this.extractParameterTypes(sig) }))
            .filter(c => {
                const defaults = ClarionPatterns.countDefaultParams(c.sig);
                return argClassifications.length >= (c.paramTypes.length - defaults)
                    && argClassifications.length <= c.paramTypes.length;
            });

        if (arityCompatible.length === 0) {
            return { matchedIndex: -1, matchedAll: true };
        }

        // Step 2: per-position type compatibility filter (Mark's locked rule + strict mode).
        // Iterate over argClassifications (not paramTypes) — trailing default-omitted positions
        // are unconstrained when defaults take effect.
        const typeCompatible = arityCompatible.filter(c =>
            argClassifications.every((argClass, i) =>
                this.argMatchesParam(argClass, c.paramTypes[i], strict))
        );

        if (typeCompatible.length === 0) {
            // All candidates dropped by type filter → match-all fallback (Mark pick (b)).
            return { matchedIndex: -1, matchedAll: true };
        }
        if (typeCompatible.length === 1) {
            return { matchedIndex: typeCompatible[0].idx, matchedAll: false };
        }

        // Step 3: rank surviving candidates by specificity (most-specific wins).
        // Iterate over argClassifications to bound by call-arg count under default-aware arity.
        const scored = typeCompatible.map(c => ({
            ...c,
            score: argClassifications.reduce((acc, argClass, i) =>
                acc + this.scoreArgParam(argClass, c.paramTypes[i]), 0)
        }));
        scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

        // If top two tied, no unique winner → match-all fallback (consistent with pick (b)).
        if (scored.length >= 2 && scored[0].score === scored[1].score) {
            return { matchedIndex: -1, matchedAll: true };
        }
        return { matchedIndex: scored[0].idx, matchedAll: false };
    }

    /**
     * Per-position compatibility check between one classified call-site arg and
     * one declaration parameter type. Implements Mark's locked overload-resolution
     * rule (project_clarion_overload_resolution_rule).
     */
    private argMatchesParam(arg: ArgClassification, paramType: string, strict: boolean): boolean {
        const paramIsRef = paramType.startsWith('*');
        const paramBase = paramIsRef ? paramType.slice(1).trim() : paramType;

        switch (arg.kind) {
            case 'literal_string':
            case 'literal_picture':
                // Cross-family permitted per Clarion's bidirectional implicit conversion;
                // natural-family preference is enforced via scoreArgParam bias.
                if (paramIsRef) return false;
                return this.isStringType(paramBase) || this.isNumericType(paramBase);

            case 'literal_numeric':
                if (paramIsRef) return false;
                return this.isNumericType(paramBase) || this.isStringType(paramBase);

            case 'variable':
            case 'dotted_var':
            case 'prefixed_var':
            case 'control_equate': {
                if (!arg.inferredType && !arg.structureKind) {
                    // Type unknown — default match-all; strict drops `*TYPE`.
                    return strict ? !paramIsRef : true;
                }
                // #243: match by type NAME (user param `*MyQueueType`) OR by structure KIND
                // (builtin param typed `QUEUE`/`GROUP`/`FILE`). Either is a valid match.
                if (arg.inferredType && this.typesMatch(this.normalizeBaseType(arg.inferredType), paramBase)) {
                    return true;
                }
                if (arg.structureKind && this.normalizeBaseType(arg.structureKind) === paramBase) {
                    return true;
                }
                return false;
            }

            case 'call_result':
                // Call result is not addressable (no inferable type yet in v1).
                // Default mode: match-all. Strict: drop `*TYPE` because result has no address.
                return strict ? !paramIsRef : true;

            case 'expression':
            case 'unknown':
                // Default mode: match-all. Strict: drop `*TYPE` (cannot prove addressable).
                return strict ? !paramIsRef : true;
        }
    }

    /**
     * Specificity score for a (arg, param) pairing. Higher = more specific.
     * Used as a tiebreaker when multiple candidates pass the compatibility filter.
     *
     * Scoring matrix (variable arg with inferredType):
     *   exact-base non-ref   = 3   (e.g. STRING var → STRING param — most specific)
     *   exact-base ref       = 2   (e.g. STRING var → *STRING param — addressable, less specific)
     *   compatible non-ref   = 1   (e.g. STRING(20) var → CSTRING param)
     *   compatible ref       = 0   (e.g. STRING(20) var → *CSTRING param)
     *
     * Literals: non-ref = 2 (only valid path), ref = 0 (filtered out, defensive).
     * Un-inferable kinds: 1 (neutral).
     */
    private scoreArgParam(arg: ArgClassification, paramType: string): number {
        const paramIsRef = paramType.startsWith('*');
        const paramBase = paramIsRef ? paramType.slice(1).trim() : paramType;

        switch (arg.kind) {
            case 'literal_string':
            case 'literal_picture':
                // Natural=3, cross-family=1: bias preserves rule-1 natural-family preference
                // while permitting cross-family matches per argMatchesParam relaxation.
                if (paramIsRef) return 0;
                return this.isStringType(paramBase) ? 3 : 1;

            case 'literal_numeric':
                if (paramIsRef) return 0;
                return this.isNumericType(paramBase) ? 3 : 1;

            case 'variable':
            case 'dotted_var':
            case 'prefixed_var':
            case 'control_equate': {
                if (!arg.inferredType && !arg.structureKind) return 1;
                if (arg.inferredType) {
                    const argBase = this.normalizeBaseType(arg.inferredType);
                    const exactMatch = argBase === this.normalizeBaseType(paramBase);
                    if (exactMatch) return paramIsRef ? 2 : 3;
                    if (this.typesMatch(argBase, paramBase)) return paramIsRef ? 0 : 1;
                }
                // #243: structure-kind match (e.g. QUEUE arg → `QUEUE` param) — as specific as an
                // exact type-name match.
                if (arg.structureKind && this.normalizeBaseType(arg.structureKind) === paramBase) {
                    return paramIsRef ? 2 : 3;
                }
                return 0;
            }

            default:
                return 1; // call_result / expression / unknown — neutral
        }
    }

    /**
     * Strip parameterized-type decoration (`STRING(20)` → `STRING`) and uppercase.
     * Keeps reference markers off (this method receives base types only).
     */
    private normalizeBaseType(t: string): string {
        const s = t.trim().toUpperCase();
        const parenIdx = s.indexOf('(');
        return (parenIdx > 0 ? s.slice(0, parenIdx) : s).trim();
    }

    /**
     * Compatible-class match for Clarion base types. Same-name match always
     * wins; numeric and string families are compatible within their family.
     */
    private typesMatch(argBase: string, paramBase: string): boolean {
        const a = this.normalizeBaseType(argBase);
        const p = this.normalizeBaseType(paramBase);
        if (a === p) return true;
        if (this.isStringType(a) && this.isStringType(p)) return true;
        if (this.isNumericType(a) && this.isNumericType(p)) return true;
        return false;
    }

    private isStringType(t: string): boolean {
        const s = this.normalizeBaseType(t);
        return s === 'STRING' || s === 'CSTRING' || s === 'PSTRING' || s === 'ASTRING';
    }

    private isNumericType(t: string): boolean {
        const s = this.normalizeBaseType(t);
        return s === 'LONG' || s === 'SHORT' || s === 'BYTE' || s === 'ULONG' || s === 'USHORT' ||
               s === 'SIGNED' || s === 'UNSIGNED' || s === 'REAL' || s === 'SREAL' ||
               s === 'DECIMAL' || s === 'PDECIMAL' || s === 'DATE' || s === 'TIME';
    }
}
