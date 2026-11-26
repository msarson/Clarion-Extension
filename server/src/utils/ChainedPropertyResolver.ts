import { Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token, TokenType } from '../ClarionTokenizer';
import { chainTargetClass, extractClassName } from './ClassNameUtils';
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

/**
 * Where a chain segment lives. A class (or a GROUP / QUEUE TYPE, or an INTERFACE) is named.
 * A structure is the GROUP / QUEUE declared on `line` of `file`: an inline GROUP in a class
 * body (#552), or a typed `Label GROUP(Type)` with fields of its own, whose type argument is
 * `base`. A structure has no name of its own to look up - several may share a label - so it
 * is pinned to its declaration. `className` is the class whose body declares it, or the
 * structure's own label when it is not in a class. `atLine` is the line asking: `base` may be
 * a TYPE each procedure of a module declares for itself (#829), and the lookup of its fields
 * takes the one that line sees.
 */
export interface StructureOwner { kind: 'structure'; file: string; line: number; className: string; base?: string; atLine?: number }
export interface ClassOwner { kind: 'class'; name: string }
export type Owner = ClassOwner | StructureOwner;
const INLINE_STRUCTURES = new Set(['GROUP', 'QUEUE', 'RECORD']);
/** A bare structure keyword, optionally with attributes (`GROUP`, `QUEUE,PRE(Q)`) — no type argument. */
const BARE_STRUCTURE_RE = /^(GROUP|QUEUE|RECORD)\s*(,.*)?$/i;
/** A structure keyword with a type argument (`GROUP(Type)`, `QUEUE(PRE:Type),PRE(Q)`). */
const TYPED_STRUCTURE_RE = /^(?:GROUP|QUEUE)\s*\(\s*([A-Za-z_][\w:]*)\s*\)/i;

/** A located member as the chain walk sees it; `isInterface` marks `SELF.IFace` (#773). */
type ChainMember = ChainedMemberInfo & { isInterface?: boolean };

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
     * The rightmost run of dot-separated identifiers is taken, so "SELF.Order.X
     * &= SELF.Primary" yields "SELF.Primary", and a chain rooted on an ordinary
     * typed variable survives whatever statement context sits to its left ("rc = Obj.Prop" -> "Obj.Prop",
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
        const chain = rawBeforeDot.match(/[A-Za-z_][A-Za-z0-9_:]*(?:\.[A-Za-z_][A-Za-z0-9_:]*)*$/);
        // #774: a complete chain at the end wins over a SELF further left, which belongs to an
        // earlier operand ("SELF.List {PROP:Text} = glo" -> "glo"). The anchor is kept for a
        // chain broken by a subscript ("SELF.Q[i].Field"), where the regex sees only "Field".
        if (chain && rawBeforeDot.charAt(chain.index! - 1) !== '.') return chain[0];
        const matches = [...rawBeforeDot.matchAll(/\b(self|parent)\b/gi)];
        if (matches.length > 0) {
            return rawBeforeDot.substring(matches[matches.length - 1].index!);
        }
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
        const ownerLabel = ChainedPropertyResolver.describe(owner);
        logger.info(`ChainedPropertyResolver: looking for final member "${memberName}" in "${ownerLabel}"`);
        const result = await this.findMemberInOwner(owner, memberName, document, paramCount);

        if (result) {
            logger.info(`ChainedPropertyResolver: ✅ resolved "${memberName}" in "${ownerLabel}" at ${result.file}:${result.line}`);
        } else {
            logger.info(`ChainedPropertyResolver: ❌ member "${memberName}" not found in "${ownerLabel}"`);
        }

        return result ?? null;
    }

    /** A log label for an owner. */
    private static describe(owner: Owner): string {
        return owner.kind === 'class' ? owner.name : `structure at ${owner.file}:${owner.line}`;
    }

    /**
     * The member `memberName` of `owner`: a class's member (or, #779, the method of an INTERFACE a
     * `SELF.IFace` segment led to), or a structure's field. `atLine` is the line to hand a class
     * lookup whose label the module may declare in several procedures (#650).
     */
    public async findMemberInOwner(
        owner: Owner,
        memberName: string,
        document: TextDocument,
        paramCount?: number,
        atLine?: number
    ): Promise<ChainMember | null> {
        if (owner.kind === 'structure') return this.findFieldInStructure(owner, memberName, document, paramCount);
        return await this.memberLocator.findMemberInClass(owner.name, memberName, document, paramCount, atLine)
            ?? await this.memberLocator.findMemberInInterface(owner.name, memberName, document, paramCount);
    }

    /**
     * The owner the member `member` leads to - the one step of every chain walk. An inline GROUP /
     * QUEUE / RECORD is its own type: the next segment is one of ITS fields (#552). A typed
     * `GROUP(Type)` is too, with the type's fields behind its own: going straight to the type lost
     * the own fields. Anything else leads to the class its type names (`&Cls`, `LIKE(T)`,
     * `SELF.IFace`, #779), or nowhere for a primitive.
     */
    public nextOwner(member: ChainMember, atLine?: number): Owner | null {
        const type = member.type.trim();
        if (BARE_STRUCTURE_RE.test(type)) {
            return { kind: 'structure', file: member.file, line: member.line, className: member.className, atLine };
        }
        const typed = type.match(TYPED_STRUCTURE_RE);
        if (typed) {
            return { kind: 'structure', file: member.file, line: member.line, className: member.className, base: typed[1], atLine };
        }
        const name = chainTargetClass(member);
        return name ? { kind: 'class', name } : null;
    }

    /**
     * #552 — a field of a structure: the GROUP / QUEUE / RECORD token on `owner.line` of
     * `owner.file` bounds the search; fields are its column-0 labels, excluding those of
     * structures nested deeper (which chain as their own owner). A field it does not declare
     * itself comes from its type argument `owner.base`, looked up from `document`.
     */
    private async findFieldInStructure(
        owner: StructureOwner,
        fieldName: string,
        document: TextDocument,
        paramCount?: number
    ): Promise<ChainedMemberInfo | null> {
        const own = await this.findOwnFieldInStructure(owner, fieldName);
        if (own || !owner.base) return own;
        return this.memberLocator.findMemberInClass(owner.base, fieldName, document, paramCount, owner.atLine);
    }

    private async findOwnFieldInStructure(owner: StructureOwner, fieldName: string): Promise<ChainedMemberInfo | null> {
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
        if (!owner) return null;
        if (owner.kind === 'class') return owner.name;
        // A structure has no class name to give (#552); callers that need one — the
        // argument-classification overlay — simply skip, and resolve() handles the lookup.
        // A typed one answers with its type argument, the class these callers were given
        // for it before its own fields were read.
        return owner.base ?? null;
    }

    /** The owner of the final member: a class, or a structure (#552). */
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
        const rooted = await this.resolveRoot(segments[0], document, position.line, tokens);
        if (!rooted) {
            logger.info(`ChainedPropertyResolver: could not resolve root ${root}`);
            return null;
        }
        let owner: Owner | null = rooted.owner;
        const rootLine = rooted.atLine;

        logger.info(`ChainedPropertyResolver: root=${root} → ${ChainedPropertyResolver.describe(owner)}, chain=[${segments.slice(1).join('.')}]`);

        // Step 2: walk each intermediate segment to get to the final owner
        const intermediateSegments = segments.slice(1); // drop SELF/PARENT

        for (let depth = 0; depth < intermediateSegments.length; depth++) {
            if (depth >= MAX_CHAIN_DEPTH) {
                logger.info('ChainedPropertyResolver: max chain depth exceeded');
                return null;
            }

            const segmentName = intermediateSegments[depth];
            const ownerLabel: string = ChainedPropertyResolver.describe(owner);
            logger.info(`ChainedPropertyResolver: resolving segment "${segmentName}" in "${ownerLabel}"`);

            const memberInfo: ChainMember | null = await this.findMemberInOwner(
                owner, segmentName, document, undefined, depth === 0 ? rootLine : undefined);
            if (!memberInfo) {
                logger.info(`ChainedPropertyResolver: member "${segmentName}" not found in "${ownerLabel}"`);
                return null;
            }

            owner = this.nextOwner(memberInfo, position.line);
            if (!owner) {
                logger.info(`ChainedPropertyResolver: type "${memberInfo.type}" of "${segmentName}" is not navigable`);
                return null;
            }
            logger.info(`ChainedPropertyResolver: "${segmentName}" -> type="${memberInfo.type}" -> ${ChainedPropertyResolver.describe(owner)}`);
        }

        return owner;
    }

    /**
     * The owner a single receiver word names at `line` - the root of a chain, or the whole
     * receiver of `word.`: SELF / PARENT / a CLASS or a variable of a CLASS type, read as
     * resolveReceiverAt reads it (#651); a typed GROUP / QUEUE label, which is its own structure
     * with the type's fields behind its own; else the declared type of a variable, parameter or
     * structure label. Null when the word names nothing.
     */
    public async resolveRootOwner(word: string, document: TextDocument, line: number): Promise<Owner | null> {
        return (await this.resolveRoot(word, document, line))?.owner ?? null;
    }

    /**
     * resolveRootOwner, with the line to hand the first member lookup: SELF and a local CLASS may
     * be a label the module declares in several procedures (#650), and so may a GROUP / QUEUE read
     * by its own label (#829); PARENT's class is not (undefined).
     */
    private async resolveRoot(
        word: string,
        document: TextDocument,
        line: number,
        tokens?: Token[]
    ): Promise<{ owner: Owner; atLine: number | undefined } | null> {
        const receiver = await this.memberLocator.resolveReceiverAt(word, document, line);
        if (receiver) return { owner: { kind: 'class', name: receiver.className }, atLine: receiver.atLine };
        if (/^(self|parent)$/i.test(word)) return null;

        // One declaration walk answers both: a typed GROUP / QUEUE label, else the declared type.
        const declared = await this.memberLocator.resolveVariableOrTypedStructure(
            word, tokens ?? this.tokenCache.getTokens(document), document, line);
        if (!declared) return null;
        if ('structure' in declared) {
            const { file, line: declLine, base } = declared.structure;
            return { owner: { kind: 'structure', file, line: declLine, className: word, base, atLine: line }, atLine: line };
        }
        return { owner: { kind: 'class', name: declared.type.typeName }, atLine: line };
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
