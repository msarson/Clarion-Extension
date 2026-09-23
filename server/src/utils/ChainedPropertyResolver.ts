import { Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { extractClassName } from './ClassNameUtils';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from './TokenHelper';
import { resolveEnclosingClassName } from './EnclosingClassResolver';
import { MemberLocatorService } from '../services/MemberLocatorService';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ChainedPropertyResolver");
logger.setLevel("error");

/** Same shape as MemberInfo in ClassMemberScan */
export interface ChainedMemberInfo {
    type: string;
    className: string;
    line: number;
    file: string;
}

const MAX_CHAIN_DEPTH = 10;

/** #552 — where a chain segment lives: a class, or an inline structure declared in a class body. */
interface InlineOwner { kind: 'inline'; file: string; line: number; className: string }
export type Owner = { kind: 'class'; name: string } | InlineOwner;
const INLINE_STRUCTURES = new Set(['GROUP', 'QUEUE', 'RECORD']);
/** A bare structure keyword, optionally with attributes (`GROUP`, `QUEUE,PRE(Q)`) — no type argument. */
const BARE_STRUCTURE_RE = /^(GROUP|QUEUE|RECORD)\s*(,.*)?$/i;

/**
 * Resolves chained dot-notation access like SELF.Order.MainKey or
 * SELF.Order.RangeList.Init where intermediate segments are CLASS, QUEUE,
 * or GROUP type references (e.g. Order  &SortOrder,PROTECTED).
 *
 * Usage:
 *   const resolver = new ChainedPropertyResolver();
 *   const info = await resolver.resolve(beforeDot, memberName, document, position);
 */
export class ChainedPropertyResolver {
    private tokenCache = TokenCache.getInstance();
    private memberLocator = new MemberLocatorService();

    /**
     * Extracts the rightmost member-access chain from a full line prefix.
     *
     * Anchors on SELF/PARENT when one is present, so an assignment expression
     * like "SELF.Order.X &= SELF.Primary" yields only "SELF.Primary" (the
     * rightmost chain).
     *
     * Without such an anchor the rightmost run of dot-separated identifiers is
     * taken instead, so a chain rooted on an ordinary typed variable survives
     * whatever statement context sits to its left ("rc = Obj.Prop" -> "Obj.Prop",
     * "Foo(Obj.Prop" -> "Obj.Prop"). Callers gate the chained-resolution path on
     * the result being a pure chain, so leaving that context attached silently
     * routes a multi-segment access to the single-segment fallback, where it
     * cannot resolve. The character class deliberately mirrors that caller-side
     * pure-chain test, so anything extracted here is guaranteed to satisfy it.
     *
     * Anchored at end-of-string and requiring an identifier start character, so a
     * prefix not ending in an identifier (e.g. "CLIP(a.b)") is returned unchanged
     * rather than mangled.
     */
    public static extractChain(rawBeforeDot: string): string {
        const matches = [...rawBeforeDot.matchAll(/\b(self|parent)\b/gi)];
        if (matches.length > 0) {
            return rawBeforeDot.substring(matches[matches.length - 1].index!);
        }
        const chain = rawBeforeDot.match(/[A-Za-z_][A-Za-z0-9_:]*(?:\.[A-Za-z_][A-Za-z0-9_:]*)*$/);
        return chain ? chain[0] : rawBeforeDot;
    }

    /**
     * Resolves a chained member access expression.
     *
     * @param beforeDot  Everything on the current line before the final dot,
     *                   e.g. "SELF.Order" or "SELF.Order.RangeList"
     * @param memberName The final member being accessed, e.g. "MainKey"
     * @param document   The text document
     * @param position   The cursor position (used to find current scope for SELF)
     * @param paramCount Optional parameter count for overload resolution
     * @returns MemberInfo for the resolved member, or null if unresolvable
     */
    public async resolve(
        beforeDot: string,
        memberName: string,
        document: TextDocument,
        position: Position,
        paramCount?: number
    ): Promise<ChainedMemberInfo | null> {
        // Steps 1-2: walk the chain to the owner of the final member — a class, or (#552)
        // an inline GROUP / QUEUE / RECORD declared in a class body.
        const owner = await this.resolveFinalOwner(beforeDot, document, position);
        if (!owner) return null;

        // Step 3: look up the final target member in the resolved owner
        const ownerLabel = owner.kind === 'class' ? owner.name : `inline structure at ${owner.file}:${owner.line}`;
        logger.info(`ChainedPropertyResolver: looking for final member "${memberName}" in "${ownerLabel}"`);
        const result = owner.kind === 'class'
            ? await this.memberLocator.findMemberInClass(owner.name, memberName, document, paramCount)
            : await this.findFieldInInlineStructure(owner, memberName);

        if (result) {
            logger.info(`ChainedPropertyResolver: ✅ resolved "${memberName}" in "${ownerLabel}" at ${result.file}:${result.line}`);
        } else {
            logger.info(`ChainedPropertyResolver: ❌ member "${memberName}" not found in "${ownerLabel}"`);
        }

        return result ?? null;
    }

    /**
     * #552 — a field of an inline structure: the GROUP / QUEUE / RECORD token on
     * `owner.line` of `owner.file` bounds the search; fields are its column-0 labels,
     * excluding those of structures nested deeper (which chain as their own owner).
     */
    private async findFieldInInlineStructure(owner: InlineOwner, fieldName: string): Promise<ChainedMemberInfo | null> {
        const filePath = decodeURIComponent(owner.file.replace(/^file:\/\/\//i, ''));
        const loaded = await this.memberLocator.loadDocumentForPath(filePath);
        if (!loaded) return null;
        const { doc, tokens } = loaded;
        const isStructure = (t: Token) => t.type === TokenType.Structure && INLINE_STRUCTURES.has(t.value.toUpperCase()) && t.finishesAt !== undefined;
        const structure = tokens.find(t => t.line === owner.line && isStructure(t));
        if (!structure) return null;
        const end = structure.finishesAt!;
        const nested = tokens
            .filter(t => isStructure(t) && t.line > owner.line && t.line < end)
            .map(t => ({ start: t.line, end: t.finishesAt! }));
        const inNested = (line: number) => nested.some(r => line > r.start && line < r.end);
        const lines = doc.getText().split(/\r?\n/);
        const wanted = fieldName.toUpperCase();
        for (const t of tokens) {
            if (t.line <= owner.line || t.line >= end) continue;
            if (t.start !== 0 || inNested(t.line)) continue;
            if (t.type !== TokenType.Label && t.type !== TokenType.Variable) continue;
            if (t.value.toUpperCase() !== wanted) continue;
            const type = (lines[t.line] ?? '').slice(t.value.length).replace(/!.*$/, '').trim();
            return { type, className: owner.className, line: t.line, file: owner.file };
        }
        return null;
    }

    /**
     * Resolves the chain `beforeDot` to the class that owns the FINAL member —
     * i.e. steps 1-2 of {@link resolve} without the final member lookup.
     *
     * Exposed for the callers that need the chain's final class rather than a member of it: the
     * argument-type classifier and Go to Definition's fallback for a chain
     * DottedAccessResolver does not name (#654; the resolver itself calls resolveFinalOwner).
     *
     * @returns the final class name, or null if the chain is unresolvable.
     */
    public async resolveFinalClassName(
        beforeDot: string,
        document: TextDocument,
        position: Position
    ): Promise<string | null> {
        const owner = await this.resolveFinalOwner(beforeDot, document, position);
        // An inline structure has no class name to give (#552); callers that need one — the
        // argument-classification overlay — simply skip, and resolve() handles the lookup.
        return owner?.kind === 'class' ? owner.name : null;
    }

    /** The owner of the final member: a class, or an inline structure in a class body (#552). */
    public async resolveFinalOwner(
        beforeDot: string,
        document: TextDocument,
        position: Position
    ): Promise<Owner | null> {
        const tokens = this.tokenCache.getTokens(document);

        // Split beforeDot by dots to get the chain segments.
        // e.g. "SELF.Order.RangeList" → ["SELF", "Order", "RangeList"]
        const segments = beforeDot.split('.').map(s => s.trim()).filter(Boolean);

        if (segments.length < 2) return null;

        const root = segments[0].toUpperCase();

        // Step 1: the root's class, read as a single-level receiver is (#652): SELF / PARENT / a
        // CLASS or a variable of a CLASS type, with the line to hand the first lookup (#650). A
        // root that is no class - a variable of a GROUP or QUEUE type - still takes its declared
        // type. Reading every root through resolveVariableType took a local CLASS for its parent
        // (#642) and SELF in the second of two same-named local classes for the first (#650).
        let currentClassName: string | null;
        let rootLine: number | undefined;
        const receiver = await this.memberLocator.resolveReceiverAt(segments[0], document, position.line);
        if (receiver) {
            currentClassName = receiver.className;
            rootLine = receiver.atLine;
        } else if (root === 'SELF' || root === 'PARENT') {
            currentClassName = null;
        } else {
            const typeInfo = await this.memberLocator.resolveVariableType(segments[0], tokens, document, position.line);
            if (!typeInfo) {
                logger.info(`ChainedPropertyResolver: root "${segments[0]}" not found as class variable`);
                return null;
            }
            currentClassName = typeInfo.typeName;
        }

        if (!currentClassName) {
            logger.info(`ChainedPropertyResolver: could not resolve ${root} class`);
            return null;
        }

        logger.info(`ChainedPropertyResolver: root=${root} → class="${currentClassName}", chain=[${segments.slice(1).join('.')}]`);

        // Step 2: walk each intermediate segment to get to the final owner
        const intermediateSegments = segments.slice(1); // drop SELF/PARENT
        let owner: Owner = { kind: 'class', name: currentClassName };

        for (let depth = 0; depth < intermediateSegments.length; depth++) {
            if (depth >= MAX_CHAIN_DEPTH) {
                logger.info('ChainedPropertyResolver: max chain depth exceeded');
                return null;
            }

            const segmentName = intermediateSegments[depth];
            const ownerLabel = owner.kind === 'class' ? owner.name : `inline structure at ${owner.file}:${owner.line}`;
            logger.info(`ChainedPropertyResolver: resolving segment "${segmentName}" in "${ownerLabel}"`);

            const memberInfo: ChainedMemberInfo | null = owner.kind === 'class'
                // #650: the root's own class may be a label declared in several procedures.
                ? await this.memberLocator.findMemberInClass(owner.name, segmentName, document, undefined, depth === 0 ? rootLine : undefined)
                : await this.findFieldInInlineStructure(owner, segmentName);

            if (!memberInfo) {
                logger.info(`ChainedPropertyResolver: member "${segmentName}" not found in "${ownerLabel}"`);
                return null;
            }

            // #552 — an inline GROUP / QUEUE / RECORD member is its own type: the next
            // segment is one of ITS fields, in the declaring file. A bare structure keyword
            // names no class, which is why this chain used to stop here.
            if (BARE_STRUCTURE_RE.test(memberInfo.type.trim())) {
                owner = { kind: 'inline', file: memberInfo.file, line: memberInfo.line, className: memberInfo.className };
                logger.info(`ChainedPropertyResolver: "${segmentName}" -> inline ${memberInfo.type} at ${memberInfo.file}:${memberInfo.line}`);
                continue;
            }

            const nextClass = extractClassName(memberInfo.type);
            if (!nextClass) {
                logger.info(`ChainedPropertyResolver: type "${memberInfo.type}" of "${segmentName}" is not navigable`);
                return null;
            }

            owner = { kind: 'class', name: nextClass };
            logger.info(`ChainedPropertyResolver: "${segmentName}" -> type="${memberInfo.type}" -> next class="${nextClass}"`);
        }

        return owner;
    }

    /** Extracts the class name the current scope belongs to (for SELF resolution). Public for CompletionProvider. */
    public resolveCurrentClassName(document: TextDocument, position: Position, tokens: Token[]): string | null {
        // #622: was one of six copies of this walk. Two of its own quirks went with it — it hopped
        // out of the scope on ANY subType rather than only a ROUTINE, and its line pattern was
        // 2-part, so a `Class.Interface.Method` implementation resolved to nothing here while the
        // copy in ClassMemberResolver handled it.
        return resolveEnclosingClassName(document, position.line, this.tokenCache.getStructure(document));
    }
}
