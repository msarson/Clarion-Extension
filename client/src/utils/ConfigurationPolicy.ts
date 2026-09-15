/**
 * #437 — the pure decision point for validating a stored build configuration
 * against the configurations a solution actually declares.
 *
 * Deliberately free of the `vscode` API (and of any I/O), mirroring the
 * `SolutionFallbackPolicy` / `SymbolFilter` pattern, so the interesting logic
 * can be unit-tested directly. `ConfigurationValidator.resolveValidConfiguration`
 * is the thin wrapper that reads the `.sln` and runs the prompt.
 */

import { normalizeConfigurationTo } from './ConfigurationPrecedence';

export type ConfigurationDecision =
    /** `current` is already one of the solution's declared configurations. */
    | { kind: 'valid'; configuration: string }
    /**
     * An old-style bare name matched exactly one platform-qualified
     * configuration, e.g. `Debug` against a solution declaring `Debug|Win32`.
     * Upgraded without asking — there is nothing for the user to decide.
     */
    | { kind: 'migrated'; configuration: string }
    /** Cannot be reconciled; the user must choose from `choices`. */
    | { kind: 'prompt'; choices: string[] };

/**
 * @param available Configurations declared by the solution, e.g.
 *   `["Debug|Win32", "Release|Win32"]`. Order is the solution's own.
 * @param current The stored configuration. May be empty (never configured).
 */
export function decideConfiguration(available: string[], current: string): ConfigurationDecision {
    if (available.includes(current)) {
        return { kind: 'valid', configuration: current };
    }

    // An empty configuration has nothing to migrate FROM (the guard is load-bearing:
    // `''` would match every entry). #530 — the match is on the configuration NAME,
    // platform ignored and case-insensitive, in both directions: a hand-written
    // `Debug|Win32` against a name-only list migrates to `Debug`, and `Debug`
    // against a full-form list migrates to `Debug|Win32` as before.
    if (current) {
        const migrated = normalizeConfigurationTo(current, available);
        if (migrated) {
            return { kind: 'migrated', configuration: migrated };
        }
    }

    return { kind: 'prompt', choices: available };
}
