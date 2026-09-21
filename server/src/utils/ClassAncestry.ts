/**
 * #624 (#609 phase 3 step B2) — one upward walk of the `CLASS(Parent)` chain.
 *
 * Six places ascended the inheritance chain, each with its own cycle guard and its own
 * idea of how to resolve the next ancestor. They are five different reductions over one
 * traversal — first match, collect all, first fitting overload, collect interfaces, and
 * "is A an ancestor of B?". The traversal lives here; the reductions stay with their
 * callers.
 *
 * Resolution is the caller's job, because it differs legitimately: the member lookups
 * can consult the open document before the index, while a pure index question cannot.
 * What must NOT differ is that every hop is scoped to the asking file's project
 * (`findFor`, #571) — resolving one hop unscoped is what #624 was.
 */

/** The shape this walk needs of a resolved class declaration. */
export interface HasParentName {
    parentName?: string;
    isType?: boolean;
}

/**
 * Picks the declaration to follow when a name resolves to several.
 *
 * A `,TYPE` declaration is a shape, not an instance; where both exist the non-TYPE
 * entry is the one a member lookup means. Callers were split between doing this and
 * forgetting to, so it lives here.
 */
export function pickDeclaration<T extends HasParentName>(infos: readonly T[]): T | null {
    if (!infos || infos.length === 0) return null;
    return infos.find(d => !d.isType) ?? infos[0] ?? null;
}

/**
 * Yields the ancestors of `startName`, nearest first, never yielding `startName`
 * itself and never yielding the same class twice (a `CLASS(Self)` cycle, or a loop
 * through two files, terminates instead of hanging).
 *
 * `resolve` answers with every declaration of a name; `pickDeclaration` chooses.
 */
export function* ancestorNames<T extends HasParentName>(
    startName: string,
    resolve: (name: string) => readonly T[]
): Generator<{ name: string; info: T | null }> {
    const seen = new Set<string>([startName.toLowerCase()]);
    let current = pickDeclaration(resolve(startName))?.parentName;

    while (current) {
        const key = current.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        const info = pickDeclaration(resolve(current));
        yield { name: current, info };
        current = info?.parentName;
    }
}

/**
 * The class itself, then each ancestor, nearest first — resolved by the caller, cycle-safe.
 *
 * Lazy on purpose. Resolving a class can read a file, and the consumers stop at different
 * points: the member lookups stop at the first hit, and a structure that does not inherit
 * its parent's members stops the ascent entirely. A consumer just `break`s and the next
 * class is never resolved.
 *
 * `info` is null when the name resolves to nothing. That is yielded rather than skipped,
 * because it means different things to different callers — "not indexed, try the document"
 * to one, "cannot answer, abort" to another — and the walk cannot ascend past it either
 * way, so it stops after yielding.
 */
export async function* ancestorChain<T extends HasParentName>(
    startName: string,
    resolve: (name: string) => Promise<T | null>
): AsyncGenerator<{ name: string; info: T | null; depth: number }> {
    const seen = new Set<string>();
    let current: string | undefined = startName;
    let depth = 0;

    while (current) {
        const key = current.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);

        const info = await resolve(current);
        yield { name: current, info, depth };
        if (!info) return;

        current = info.parentName;
        depth++;
    }
}

/**
 * True when `ancestorName` appears in `descendantName`'s parent chain.
 *
 * Strict: a class is not its own ancestor, so the caller decides separately what
 * same-class access means.
 */
export function isAncestorOf<T extends HasParentName>(
    ancestorName: string,
    descendantName: string,
    resolve: (name: string) => readonly T[]
): boolean {
    const target = ancestorName.toLowerCase();
    for (const { name } of ancestorNames(descendantName, resolve)) {
        if (name.toLowerCase() === target) return true;
    }
    return false;
}
