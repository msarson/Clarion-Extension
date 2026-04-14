import { CompletionItem, CompletionItemKind, CompletionParams, InsertTextFormat } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { MemberEnumItem } from '../utils/ClassMemberResolver';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
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

            // Ensure the trigger is actually '.'
            if (!lineText.trimEnd().endsWith('.')) return [];

            // Extract the chain before the dot (e.g. "SELF", "oKanban", "SELF.Order")
            const chain = this.extractChainBeforeDot(lineText);
            if (!chain) return [];

            logger.info(`CompletionProvider: chain="${chain}" at line ${position.line}`);

            const tokens = this.tokenCache.getTokens(document);

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
        // Extract the rightmost alphanumeric/dot chain (the completion target)
        const m = withoutDot.match(/([\w][\w.]*)\s*$/);
        return m ? m[1] : null;
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
        tokens: import('../ClarionTokenizer').Token[]
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

        // --- Chained SELF.Segment or PARENT.Segment ---
        if (chainUpper.startsWith('SELF.') || chainUpper.startsWith('PARENT.')) {
            return this.resolveChainedSegments(chain, document, position, tokens, callerClass);
        }

        // --- Plain word: variable or class name ---
        // Try variable type resolution first
        const typeInfo = await this.memberLocator.resolveVariableType(chain, tokens, document);
        if (typeInfo) {
            return { className: typeInfo.typeName, callerClass };
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
        tokens: import('../ClarionTokenizer').Token[],
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

        // Walk intermediate segments (all but the last)
        const memberResolver = new ClassMemberResolver();
        for (let i = 1; i < segments.length; i++) {
            const seg = segments[i];
            const memberInfo = await memberResolver.findMemberInNamedStructure(seg, currentClass, document);
            if (!memberInfo) return null;
            const nextClass = ClassMemberResolver.extractClassName(memberInfo.type);
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
        // Clarion comments start with '!'
        const commentIdx = lineText.indexOf('!');
        if (commentIdx !== -1 && commentIdx < lineText.length - 1) return true;
        // Basic string check: odd number of single quotes before cursor
        const singleQuotes = (lineText.match(/'/g) || []).length;
        if (singleQuotes % 2 !== 0) return true;
        return false;
    }

    // -------------------------------------------------------------------------
    // CompletionItem mapping
    // -------------------------------------------------------------------------

    private toCompletionItem(member: MemberEnumItem, _forClass: string): CompletionItem {
        const kind = member.kind === 'method'
            ? CompletionItemKind.Method
            : CompletionItemKind.Field;

        const item: CompletionItem = {
            label: member.name,
            kind,
            detail: member.type,
            documentation: member.fromClass !== _forClass
                ? `Inherited from ${member.fromClass}`
                : undefined,
            insertText: member.name,
            insertTextFormat: InsertTextFormat.PlainText
        };

        return item;
    }
}
