import { CompletionItem, CompletionItemKind, CompletionParams, InsertTextFormat } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { WordCompletionProvider } from './WordCompletionProvider';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { MemberEnumItem } from '../utils/ClassMemberResolver';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { PropertyService } from '../utils/PropertyService';
import { EventService } from '../utils/EventService';
import { Token } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("CompletionProvider");
logger.setLevel("error");

/**
 * Provides dot-triggered member completion for Clarion CLASS instances and SELF.
 *
 * Triggers on '.' and returns the members of the resolved class.
 * Handles:
 *   - SELF.   → resolves to the enclosing method's class
 *   - PARENT. → resolves to the parent class
 *   - VarName. → resolves the variable's type then enumerates members
 *   - ClassName. → direct class name lookup
 *
 * Inheritance is fully walked (child members shadow parent members).
 * PRIVATE/PROTECTED members are filtered based on call-site context.
 */
export class CompletionProvider {
    private tokenCache = TokenCache.getInstance();
    private memberLocator = new MemberLocatorService();
    private chainedResolver = new ChainedPropertyResolver();
    private propertyService = PropertyService.getInstance();
    private eventService = EventService.getInstance();
    private wordCompletion: WordCompletionProvider;

    constructor() {
        const solutionManager = SolutionManager.getInstance();
        const scopeAnalyzer = new ScopeAnalyzer(this.tokenCache, solutionManager);
        this.wordCompletion = new WordCompletionProvider(this.tokenCache, scopeAnalyzer);
    }

    /**
     * Main entry point — called by connection.onCompletion.
     */
    async onCompletion(params: CompletionParams, document: TextDocument): Promise<CompletionItem[]> {
        try {
            const position = params.position;

            // Guard: don't complete inside comments or strings
            const lineText = document.getText({
                start: { line: position.line, character: 0 },
                end: { line: position.line, character: position.character }
            });
            if (this.isInCommentOrString(lineText)) return [];

            // PROP: / PROPPRINT: completion — fires when user types the colon or a partial name after it
            const propCompletions = this.handlePropCompletion(lineText);
            if (propCompletions) return propCompletions;

            // EVENT: completion
            const eventCompletions = this.handleEventCompletion(lineText);
            if (eventCompletions) return eventCompletions;

            // Ensure the trigger is actually '.'
            if (!lineText.trimEnd().endsWith('.')) {
                const partialMatch = lineText.match(/[\w:]+$/);
                const partial = partialMatch ? partialMatch[0] : '';
                logger.info(`CompletionProvider: word trigger, partial="${partial}"`);
                return await this.wordCompletion.provide(document, position, partial);
            }

            // Extract the chain before the dot (e.g. "SELF", "oKanban", "SELF.Order")
            const chain = this.extractChainBeforeDot(lineText);
            if (!chain) return [];

            logger.info(`CompletionProvider: chain="${chain}" at line ${position.line}`);

            const tokens = this.tokenCache.getTokens(document);

            // Dot after a structure label with PRE(prefix) should surface the same
            // prefixed field set as qualifier completion (e.g. TestGloGroup. -> TGLO:*).
            const structurePrefixItems = await this.completePrefixedStructureDot(chain, document, position, tokens);
            if (structurePrefixItems) return structurePrefixItems;

            // Resolve the final class name for this chain
            const resolved = await this.resolveChainToClassName(chain, document, position, tokens);
            if (!resolved) {
                logger.info(`CompletionProvider: could not resolve chain "${chain}"`);
                return [];
            }

            const { className, callerClass } = resolved;
            logger.info(`CompletionProvider: "${chain}" → class="${className}", caller="${callerClass ?? 'external'}"`);

            // Enumerate all members (with inheritance + access filtering)
            const members = await this.memberLocator.enumerateMembersInClass(
                className, document, callerClass
            );

            if (members.length === 0) {
                logger.info(`CompletionProvider: no members found for "${className}"`);
                return [];
            }

            logger.info(`CompletionProvider: returning ${members.length} completion items for "${className}"`);
            return members.map(m => this.toCompletionItem(m, className));
        } catch (err) {
            logger.error(`CompletionProvider error: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    // -------------------------------------------------------------------------
    // PROP: / PROPPRINT: completion
    // -------------------------------------------------------------------------

    /**
     * Returns completion items if the line ends with PROP: or PROPPRINT: (or a partial
     * name after either prefix), otherwise returns null to fall through to dot-completion.
     *
     * Matches patterns like:
     *   ?ctrl{PROP:          → all PROP: entries
     *   ?ctrl{PROP:En        → PROP: entries starting with "PROP:EN"
     *   PRINTER{PROPPRINT:   → all PROPPRINT: entries
     */
    private handlePropCompletion(lineBeforeCursor: string): CompletionItem[] | null {
        const m = lineBeforeCursor.match(/(PROPPRINT:|PROP:)(\w*)$/i);
        if (!m) return null;

        const prefix = m[1].toUpperCase() as 'PROP:' | 'PROPPRINT:';
        const partial = m[2].toUpperCase();

        const entries = this.propertyService.getAllByPrefix(prefix).filter(e =>
            e.name.toUpperCase().startsWith(prefix + partial)
        );

        return entries.map(e => {
            const item: CompletionItem = {
                label: e.name,
                kind: CompletionItemKind.Property,
                // Insert only the part after the prefix already typed
                insertText: e.name.slice(prefix.length),
                detail: e.description
                    ? (e.readOnly ? `(read-only) ${e.description.slice(0, 60)}…` : e.description.slice(0, 70) + (e.description.length > 70 ? '…' : ''))
                    : (e.readOnly ? '(read-only)' : undefined),
                documentation: e.description
                    ? { kind: 'markdown', value: e.description }
                    : undefined,
            };
            return item;
        });
    }

    // -------------------------------------------------------------------------
    // EVENT: completion
    // -------------------------------------------------------------------------

    /**
     * Returns completion items if the line ends with EVENT: (or a partial name after it),
     * otherwise returns null to fall through to dot-completion.
     *
     * Matches patterns like:
     *   OF EVENT:          → all EVENT: entries
     *   OF EVENT:Cl        → EVENT: entries starting with "EVENT:CL"
     */
    private handleEventCompletion(lineBeforeCursor: string): CompletionItem[] | null {
        const m = lineBeforeCursor.match(/EVENT:(\w*)$/i);
        if (!m) return null;

        const partial = m[1].toUpperCase();
        const prefix = 'EVENT:';

        const entries = this.eventService.getAllByPrefix(prefix).filter(e =>
            e.name.toUpperCase().startsWith(prefix + partial)
        );

        return entries.map(e => {
            const item: CompletionItem = {
                label: e.name,
                kind: CompletionItemKind.Event,
                insertText: e.name.slice(prefix.length),
                detail: e.description
                    ? `(${e.category}) ${e.description.slice(0, 60)}${e.description.length > 60 ? '…' : ''}`
                    : `(${e.category})`,
                documentation: e.description
                    ? { kind: 'markdown', value: e.description }
                    : undefined,
            };
            return item;
        });
    }

    // -------------------------------------------------------------------------
    // Chain extraction
    // -------------------------------------------------------------------------

    /**
     * Extracts the word or dotted chain immediately before the trailing dot.
     * Examples:
     *   "  SELF."         → "SELF"
     *   "  oKanban."      → "oKanban"
     *   "  SELF.Order."   → "SELF.Order"
     *   "x = SELF."       → "SELF"  (rightmost chain)
     */
    private extractChainBeforeDot(lineBeforeCursor: string): string | null {
        const withoutDot = lineBeforeCursor.trimEnd().slice(0, -1); // remove trailing '.'
        // Extract the rightmost alphanumeric/colon/dot chain (the completion target).
        // Includes prefixed variables like TGLO:Pictionary.
        const m = withoutDot.match(/([\w][\w.:]*)\s*$/);
        return m ? m[1] : null;
    }

    /**
     * Resolve the class/type name for a prefixed structure field token like
     * `TGLO:Pictionary` by reading its declaration line type.
     */
    private resolvePrefixedFieldType(prefixedName: string, tokens: Token[]): string | null {
        const colonIdx = prefixedName.indexOf(':');
        if (colonIdx <= 0) return null;

        const qualifier = prefixedName.substring(0, colonIdx).toUpperCase();
        const fieldName = prefixedName.substring(colonIdx + 1).toUpperCase();

        const fieldToken = tokens.find(t =>
            t.isStructureField === true &&
            !!t.structurePrefix &&
            t.structurePrefix.toUpperCase() === qualifier &&
            t.value.toUpperCase() === fieldName
        );
        if (!fieldToken) return null;

        const sameLine = tokens
            .filter(t => t.line === fieldToken.line)
            .sort((a, b) => a.start - b.start);
        const idx = sameLine.findIndex(t => t.start === fieldToken.start && t.value === fieldToken.value);
        if (idx < 0 || idx + 1 >= sameLine.length) return null;

        const next = sameLine[idx + 1];
        if (next.type === TokenType.ReferenceVariable) {
            return next.value.replace(/^&\s*/, '');
        }
        if (next.type === TokenType.Type || next.type === TokenType.Variable || next.type === TokenType.Label) {
            return next.value;
        }
        return null;
    }

    /**
     * For `StructureLabel.` where StructureLabel is a PRE(...) structure declaration
     * in scope, return the same prefix-qualified field list as `PREFIX:`.
     */
    private async completePrefixedStructureDot(
        chain: string,
        document: TextDocument,
        position: { line: number; character: number },
        tokens: Token[]
    ): Promise<CompletionItem[] | null> {
        if (!chain || chain.includes('.')) return null;

        const chainUpper = chain.toUpperCase();
        const structureKinds = new Set(['GROUP', 'QUEUE', 'RECORD']);
        let best: Token | undefined;

        for (const t of tokens) {
            if (t.type !== TokenType.Structure || !t.structurePrefix) continue;
            if (!structureKinds.has(t.value.toUpperCase())) continue;
            if (t.line > position.line) continue;

            const lineTokens = tokens
                .filter(x => x.line === t.line)
                .sort((a, b) => a.start - b.start);
            const idx = lineTokens.findIndex(x => x === t);
            if (idx <= 0) continue;
            const nameToken = lineTokens[idx - 1];
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/i.test(nameToken.value)) continue;
            if (nameToken.value.toUpperCase() !== chainUpper) continue;

            if (!best || t.line > best.line) best = t;
        }

        if (!best) return null;
        const items = await this.wordCompletion.provide(document, position, `${best.structurePrefix}:`);
        return items.length > 0 ? items : null;
    }

    // -------------------------------------------------------------------------
    // Chain → class name resolution
    // -------------------------------------------------------------------------

    /**
     * Resolves a chain string to a class name.
     * Returns { className, callerClass } where callerClass is the class the
     * cursor is currently inside (used for access filtering).
     */
    private async resolveChainToClassName(
        chain: string,
        document: TextDocument,
        position: { line: number; character: number },
        tokens: Token[]
    ): Promise<{ className: string; callerClass?: string } | null> {
        const chainUpper = chain.toUpperCase();

        // Determine the caller's class (for access filtering)
        const callerClass = this.chainedResolver.resolveCurrentClassName(document, position, tokens) ?? undefined;

        // --- SELF or PARENT (single segment) ---
        if (chainUpper === 'SELF') {
            if (!callerClass) return null;
            return { className: callerClass, callerClass };
        }
        if (chainUpper === 'PARENT') {
            // resolveCurrentClassName gives us the class; we need its parent
            if (!callerClass) return null;
            const parentClass = await this.resolveParentOf(callerClass, document);
            if (!parentClass) return null;
            return { className: parentClass, callerClass };
        }

        // --- Chained expression (SELF/PARENT/variable chains) ---
        if (chain.includes('.')) {
            return this.resolveChainedSegments(chain, document, position, tokens, callerClass);
        }

        // --- Plain word: variable or class name ---
        // Try variable type resolution first
        const typeInfo = await this.memberLocator.resolveVariableType(chain, tokens, document);
        if (typeInfo) {
            return { className: typeInfo.typeName, callerClass };
        }

        // Prefixed field references (e.g. TGLO:Pictionary) are tokenized as
        // structure fields and are not resolved by MemberLocator's plain-variable
        // lookup path. Resolve the declared type directly from the token stream.
        const prefixedTypeName = this.resolvePrefixedFieldType(chain, tokens);
        if (prefixedTypeName) {
            return { className: prefixedTypeName, callerClass };
        }

        // Fallback: treat as direct class name (e.g. "ThisWindow." used outside any method)
        return { className: chain, callerClass };
    }

    /**
     * Resolves a chained expression like "SELF.Order" to the type of the last segment.
     * Uses ChainedPropertyResolver for intermediate resolution.
     */
    private async resolveChainedSegments(
        chain: string,
        document: TextDocument,
        position: { line: number; character: number },
        tokens: Token[],
        callerClass: string | undefined
    ): Promise<{ className: string; callerClass?: string } | null> {
        const segments = chain.split('.').map(s => s.trim()).filter(Boolean);
        if (segments.length < 2) return null;

        // Use ChainedPropertyResolver to walk all but the last segment
        // We treat the last segment as the "member" and want its type
        const root = segments[0].toUpperCase();
        let currentClass: string | null;

        if (root === 'SELF') {
            currentClass = this.chainedResolver.resolveCurrentClassName(document, position, tokens);
        } else if (root === 'PARENT') {
            currentClass = callerClass
                ? await this.resolveParentOf(callerClass, document)
                : null;
        } else {
            const typeInfo = await this.memberLocator.resolveVariableType(root, tokens, document);
            currentClass = typeInfo?.typeName ?? null;
        }

        if (!currentClass) return null;

        // Walk each segment and carry the current structure type forward.
        for (let i = 1; i < segments.length; i++) {
            const seg = segments[i];
            const members = await this.memberLocator.enumerateMembersInClass(currentClass, document, callerClass);
            const member = members.find(m => m.name.toUpperCase() === seg.toUpperCase());
            if (!member) return null;

            const nextClass = ClassMemberResolver.extractClassName(member.type);
            if (!nextClass) return null;
            currentClass = nextClass;
        }

        return { className: currentClass, callerClass };
    }

    /** Finds the parent class of a given class (via ClassDefinitionIndexer). */
    private async resolveParentOf(className: string, document: TextDocument): Promise<string | null> {
        // Quick scan in document text
        const lines = document.getText().split('\n');
        const pattern = new RegExp(`^${className}\\s+CLASS\\s*\\((\\w+)\\)`, 'i');
        for (const line of lines) {
            const m = line.match(pattern);
            if (m) return m[1];
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // Guard helpers
    // -------------------------------------------------------------------------

    /** Returns true if the cursor appears to be inside a Clarion comment or string. */
    private isInCommentOrString(lineText: string): boolean {
        // Walk the text to correctly handle '!' / '|' inside string literals.
        // '!' starts a line comment; '|' is line-continuation — everything after it is a comment.
        let inString = false;
        for (const ch of lineText) {
            if (inString) {
                if (ch === "'") inString = false;
            } else {
                if (ch === "'") inString = true;
                else if (ch === '!' || ch === '|') return true;
            }
        }
        return inString;
    }

    /**
     * Deduplicates members by name (case-insensitive), keeping the first occurrence.
     * Overloads are collapsed to a single entry; signature help shows all overloads
     * once the user types '(' after selecting.
     */
    private deduplicateByName(members: MemberEnumItem[]): MemberEnumItem[] {
        const seen = new Set<string>();
        return members.filter(m => {
            const key = m.name.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    // -------------------------------------------------------------------------
    // CompletionItem mapping
    // -------------------------------------------------------------------------

    private toCompletionItem(member: MemberEnumItem, _forClass: string): CompletionItem {
        const kind = member.kind === 'method'
            ? CompletionItemKind.Method
            : CompletionItemKind.Field;

        const { paramDetail, returnDescription } = this.parseTypeForLabel(member.type, member.kind);

        // For methods, embed params in the label so overloads are distinct entries
        const label = member.kind === 'method'
            ? (paramDetail ? `${member.name}${paramDetail}` : member.name)
            : (returnDescription ? `${member.name} ${returnDescription}` : member.name);

        // Show return type (or property type) in the detail column
        const detail = returnDescription || undefined;

        // Build documentation: full declaration + inherited-from note
        let docs = `\`${member.signature}\``;
        if (member.fromClass !== _forClass) {
            docs += `\n\nInherited from \`${member.fromClass}\``;
        }

        const item: CompletionItem = {
            label,
            kind,
            detail,
            documentation: docs,
            insertText: member.name,
            insertTextFormat: InsertTextFormat.PlainText
        };

        return item;
    }

    /**
     * Parses a Clarion type string into the parts used by CompletionItemLabelDetails.
     *
     * Examples:
     *   "PROCEDURE(LONG pVal),LONG"  → detail="(LONG pVal)",  description="LONG"
     *   "PROCEDURE()"                → detail="()",            description=""
     *   "PROCEDURE"                  → detail="()",            description=""
     *   "LONG"                       → detail="",              description="LONG"
     *   "STRING(20)"                 → detail="",              description="STRING(20)"
     */
    private parseTypeForLabel(
        typeStr: string,
        kind: 'method' | 'property'
    ): { paramDetail: string; returnDescription: string } {
        if (kind === 'property') {
            return { paramDetail: '', returnDescription: typeStr };
        }

        // Method — extract params from PROCEDURE(...)
        const procMatch = typeStr.match(/^(?:PROCEDURE|FUNCTION)\s*(\([^)]*\))?(?:\s*,\s*(.+))?$/i); // #247
        if (procMatch) {
            const params = procMatch[1] ?? '()';
            const ret = (procMatch[2] ?? '').trim();
            return { paramDetail: params, returnDescription: ret };
        }

        // Fallback: treat the whole thing as a return type
        return { paramDetail: '', returnDescription: typeStr };
    }
}
