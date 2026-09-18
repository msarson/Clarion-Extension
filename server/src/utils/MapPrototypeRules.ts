/**
 * What may and may not be the NAME of a keyword-less prototype in a MAP body.
 *
 * A leaf module, imported by both places that have to make this judgement:
 * `DocumentStructure.processShorthandProcedures` for a MAP written in the file itself, and
 * `ScopeAnalyzer.getMapTokensWithIncludes` for prototypes an `INCLUDE(file,'SECTION')` carries into a
 * parent MAP (#593). They were separate judgements once, which is how the second one came to have no
 * judgement at all — the included file has no MAP of its own, so nothing classified it.
 *
 * Kept free of imports beyond the token types so either side can use it without a cycle, the same
 * reason `PrefixChain` is its own module.
 */

/** The block keywords that open a MAP or a MODULE — never a prototype name. */
export const MAP_STRUCTURE_KEYWORD = /^(MODULE|MAP)$/i;

/**
 * Words that cannot themselves be the NAME of a prototype in a MAP body — the block keywords plus
 * the procedure keywords, which introduce the OTHER form (`name PROCEDURE …`) rather than being a
 * name.
 */
export const MAP_PROTOTYPE_NON_NAME = /^(MODULE|MAP|END|PROCEDURE|FUNCTION)$/i;

/**
 * The shape of a legal prototype name: an identifier, optionally carrying `PRE:FIX:` segments or a
 * dotted qualifier. Colons are part of the name — a Clarion label may be prefixed — which is exactly
 * what #597 and #600 turned on.
 */
export const MAP_PROTOTYPE_NAME = /^[A-Za-z_][A-Za-z0-9_:.]*$/;

/**
 * Whether `name` could be the name of a keyword-less prototype, ignoring where it sits. Callers
 * still decide position (starts its line, inside the right section, at structure depth zero) —
 * this answers only "is this word allowed to be a name".
 */
export function isPrototypeName(name: string): boolean {
    return !!name
        && !name.startsWith('!')
        && !MAP_PROTOTYPE_NON_NAME.test(name)
        && MAP_PROTOTYPE_NAME.test(name);
}
