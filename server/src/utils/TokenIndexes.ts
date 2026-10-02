import { Token, TokenType } from '../tokenizer/TokenTypes';

/**
 * #711 — name-keyed indexes over one token array, each built on first use in one pass and kept as
 * long as the array lives (a cached array is never mutated after it is handed out; an edit builds a
 * new one, and the length check catches one that grew anyway).
 *
 * Every bucket keeps the array's order and holds a SUPERSET of what the original whole-array
 * predicate could accept, so `bucket.find(predicate)` returns exactly what `tokens.find(predicate)`
 * did. Hover on a `PREFIX:Field` name ran half a dozen such walks per file searched — the current
 * module, its MEMBER parent and every include — answering no in most of them.
 */
type Buckets = Map<string, Token[]>;
interface Indexes {
    length: number;
    byPrefix?: Buckets;
    structuresByLabel?: Buckets;
    topLabels?: Buckets;
    includes?: Token[];
    memberHeader?: { token: Token | undefined };
}
const memo = new WeakMap<Token[], Indexes>();
const NONE: Token[] = [];

function indexesOf(tokens: Token[]): Indexes {
    let ix = memo.get(tokens);
    if (!ix || ix.length !== tokens.length) {
        ix = { length: tokens.length };
        memo.set(tokens, ix);
    }
    return ix;
}

function bucket(map: Buckets, key: string, t: Token): void {
    const list = map.get(key);
    if (list) list.push(t); else map.set(key, [t]);
}

/** Tokens whose `structurePrefix` is `prefix` (any case). */
export function tokensWithPrefix(tokens: Token[], prefix: string): Token[] {
    const ix = indexesOf(tokens);
    if (!ix.byPrefix) {
        ix.byPrefix = new Map();
        for (const t of tokens) if (t.structurePrefix) bucket(ix.byPrefix, t.structurePrefix.toUpperCase(), t);
    }
    return ix.byPrefix.get(prefix.toUpperCase()) ?? NONE;
}

/** Structure tokens whose `label` is `label` (any case). */
export function structuresWithLabel(tokens: Token[], label: string): Token[] {
    const ix = indexesOf(tokens);
    if (!ix.structuresByLabel) {
        ix.structuresByLabel = new Map();
        for (const t of tokens) if (t.type === TokenType.Structure && t.label) bucket(ix.structuresByLabel, t.label.toUpperCase(), t);
    }
    return ix.structuresByLabel.get(label.toUpperCase()) ?? NONE;
}

/** Column-0 Label tokens with no parent whose value is `name` (any case): top-level declarations. */
export function topLevelLabels(tokens: Token[], name: string): Token[] {
    const ix = indexesOf(tokens);
    if (!ix.topLabels) {
        ix.topLabels = new Map();
        for (const t of tokens) {
            if (t.type === TokenType.Label && t.start === 0 && t.parent === undefined) bucket(ix.topLabels, t.value.toLowerCase(), t);
        }
    }
    return ix.topLabels.get(name.toLowerCase()) ?? NONE;
}

/** INCLUDE tokens that name a file. */
export function includeTokens(tokens: Token[]): Token[] {
    const ix = indexesOf(tokens);
    if (!ix.includes) ix.includes = tokens.filter(t => t.value?.toUpperCase() === 'INCLUDE' && t.referencedFile);
    return ix.includes;
}

/** The module's MEMBER('parent') header token (TokenHelper.findMemberHeaderToken's rule). */
export function memberHeaderToken(tokens: Token[]): Token | undefined {
    const ix = indexesOf(tokens);
    if (!ix.memberHeader) {
        ix.memberHeader = {
            token: tokens.find(t => t.value !== undefined && t.value.toUpperCase() === 'MEMBER' && t.referencedFile !== undefined),
        };
    }
    return ix.memberHeader.token;
}
