import { Token } from '../tokenizer/TokenTypes';

/**
 * Issue #233 — canonical scope model types.
 *
 * These describe the deterministic, doc-cited scope structure that ScopeResolver
 * computes from DocumentStructure metadata. See ScopeResolver for the rule wiring.
 */

/** The kind of a scope. Mirrors the Clarion tier chain. */
export enum ScopeKind {
    Global = 'global',
    Module = 'module',
    Procedure = 'procedure',
    Method = 'method',
    Routine = 'routine',
}

/**
 * Tier ordering per the Clarion docs:
 *   GLOBAL > MODULE > PROCEDURE > Procedure-ROUTINE
 *   PROCEDURE > CLASS > METHOD > Method-ROUTINE
 * Lower number = broader / leftmost = referenceable from everything to its right.
 * (Class = 3 is reserved for a future stage; no CLASS-body scope node is emitted yet.)
 */
export enum ScopeTier {
    Global = 0,
    Module = 1,
    Procedure = 2,
    Class = 3,
    Method = 4,
    Routine = 5,
}

/** An inclusive line range. */
export interface LineRange {
    /** First line of the range (0-based). */
    startLine: number;
    /** Last line of the range (0-based), inclusive. */
    endLine: number;
}

/**
 * A resolved scope. `token` is the PROCEDURE / METHODIMPL / ROUTINE / MODULE token that
 * defines the scope, or null for the synthetic Global scope. `dataExtent` is where that
 * scope's own declarations live (searched for symbol/prefix resolution); `codeExtent` is
 * its executable region (Rule 1 aware).
 */
export interface ScopeNode {
    kind: ScopeKind;
    tier: ScopeTier;
    token: Token | null;
    /** Enclosing scope in the visible chain (innermost → outermost). */
    parent: ScopeNode | null;
    codeExtent: LineRange;
    dataExtent: LineRange;
    /** For a Method node: the procedure whose LOCAL data declared its CLASS (Rule 4). */
    declaringProcedure?: ScopeNode;
}
