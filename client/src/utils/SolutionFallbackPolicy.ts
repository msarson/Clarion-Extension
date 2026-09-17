import * as fs from 'fs';
import * as path from 'path';
/**
 * Pure decision policy for #146 + #104 contracts. Lives in its own file (no
 * vscode-API dependency) so unit tests can import the helper directly without
 * dragging in the workspace/ExtensionContext surface that `globals.ts` does
 * at module load time.
 *
 * Consumed by `globals.ts:initializeFromWorkspace`. Tested by
 * `client/src/test/SolutionAutoReopen.test.ts`.
 */

/**
 * Minimal shape of a solutions[] entry that the fallback policy reads.
 * Defined locally (instead of importing from `globals`) to keep this module
 * vscode-API-free. The real `ClarionSolutionSettings` interface (in
 * `globals.ts`) is structurally compatible.
 */
export interface SolutionFallbackEntry {
    solutionFile: string;
}

/**
 * WorkspaceState key (#146): set to `true` by `closeClarionSolution` when the
 * user explicitly closes a solution. Consumed (cleared) by
 * `initializeFromWorkspace` on the next activation — if `true`, the #104
 * `solutions[0]` fallback is suppressed so the closed solution does NOT
 * auto-reopen.
 */
export const SOLUTION_EXPLICITLY_CLOSED_KEY = "clarion.solutionExplicitlyClosed";

/**
 * Should `initializeFromWorkspace` fall back to `clarion.solutions[0]` when
 * `clarion.currentSolution` is empty (the #104 fallback)?
 *
 * Returns `true` only when:
 *   - `currentSolution` is empty (no explicit selection)
 *   - `solutions[]` has at least one entry
 *   - `explicitlyClosed` is `false` (user did NOT explicitly close — the
 *     #146 contract)
 */
export function shouldUseSolutionFallback(
    currentSolution: string,
    solutions: ReadonlyArray<SolutionFallbackEntry>,
    explicitlyClosed: boolean
): boolean {
    if (currentSolution) return false;
    if (explicitlyClosed) return false;
    if (solutions.length === 0) return false;
    return true;
}

/**
 * Why a solution is being closed:
 *   - 'user'   — the user ran "Close Solution"; the closed state should stick
 *                across restarts (the #146 sticky-until-explicit-open contract).
 *   - 'switch' — an internal close performed while opening/switching to another
 *                solution; the close is immediately followed by an open.
 */
export type SolutionCloseReason = 'user' | 'switch';

/**
 * #183 — should a close operation set the sticky `SOLUTION_EXPLICITLY_CLOSED_KEY`
 * flag? Only a user-initiated close should; an internal 'switch' close must NOT,
 * or the subsequent open ends with the flag stuck `true` and
 * `initializeFromWorkspace` suppresses auto-reopen on the next restart.
 *
 * Defaults to `'user'` so callers that omit the reason keep the conservative
 * (sticky) #146 behaviour.
 */
export function shouldMarkExplicitlyClosed(reason: SolutionCloseReason = 'user'): boolean {
    return reason === 'user';
}

/**
 * #169/#104 — should `ActivationManager.setupFolderDependentFeatures` attempt to
 * restore the last solution from `GlobalSolutionHistory` (the cross-folder-switch
 * auto-open path)?
 *
 * Returns `true` only when:
 *   - `explicitlyClosed` is `false` — a user "Close Solution" suppresses
 *     auto-restore across restarts (#146/#169; the parallel of
 *     {@link shouldUseSolutionFallback}'s flag guard, which the #169 regression
 *     was missing on this code path);
 *   - `globalSolutionFile` is empty — workspace settings don't already define a
 *     solution (if they do, that path handles the load; history isn't needed);
 *   - a workspace folder is open — history is keyed by folder path (#104, the
 *     after-folder-switch restore).
 */
export function shouldRestoreSolutionFromHistory(
    explicitlyClosed: boolean,
    globalSolutionFile: string,
    hasWorkspaceFolder: boolean
): boolean {
    if (explicitlyClosed) return false;
    if (globalSolutionFile) return false;
    return hasWorkspaceFolder;
}

/**
 * #498 — what the remembered solution settings amount to.
 *
 *   - 'none'          no solution is remembered: the no-solution UI (found solutions,
 *                     recent solutions, Open Solution) applies.
 *   - 'ready'         solution, ClarionProperties.xml and version are all known: the
 *                     loaded-solution UI applies and initialization may proceed.
 *   - 'needs-version' a solution is remembered but its Clarion version or properties
 *                     file is not (the folder was checked out elsewhere, or
 *                     `.vscode/settings.json` was deleted): the no-solution UI applies,
 *                     the remembered entry is marked, and Set Version is offered.
 *                     Initialization must NOT be attempted — it can only fail.
 */
export type RememberedSolutionState = 'none' | 'ready' | 'needs-version' | 'stale-version';

export function rememberedSolutionState(
    solutionFile: string,
    propertiesFile: string,
    version: string,
    registeredVersions?: ReadonlyArray<string> | null
): RememberedSolutionState {
    if (!solutionFile) return 'none';
    if (!propertiesFile || !version) return 'needs-version';
    // #535 — 'stale-version': the name is remembered but the selected
    // ClarionProperties.xml no longer registers it (the IDE was updated, a beta
    // build replaced another). Treated like a missing version everywhere: the
    // string being non-empty must not pose as a usable install. A registry that
    // could not be read (null / omitted) does not judge the name.
    if (registeredVersions && !registeredVersions.some(n => n.toLowerCase() === version.toLowerCase())) {
        return 'stale-version';
    }
    return 'ready';
}

/**
 * #535 — the Win32 version names a ClarionProperties.xml registers: the `name`
 * of every `<Properties>` directly under `<Properties name="Clarion.Versions">`,
 * Clarion.NET entries skipped. Regex on the XML text, so it stays free of the
 * XML parser and can be called synchronously wherever the state is decided.
 */
export function registeredVersionNamesFromXml(xml: string): string[] {
    // Walk <Properties ...> / </Properties> tags with a depth counter from the
    // Clarion.Versions start tag: the version entries are its DIRECT children, and
    // each carries nested <Properties> of its own, so a lazy regex to the first
    // </Properties> stops too early.
    const startTag = /<Properties\s+name="Clarion\.Versions"\s*\/?>/i.exec(xml);
    if (!startTag) return [];
    if (startTag[0].endsWith('/>')) return [];
    const names: string[] = [];
    const tag = /<Properties\b([^>]*?)(\/?)>|<\/Properties\s*>/g;
    tag.lastIndex = startTag.index + startTag[0].length;
    let depth = 1;
    let m: RegExpExecArray | null;
    while ((m = tag.exec(xml)) !== null) {
        if (m[0].startsWith('</')) {
            depth--;
            if (depth === 0) break;
            continue;
        }
        const selfClosing = m[2] === '/';
        if (depth === 1) {
            const nameAttr = /\bname="([^"]+)"/.exec(m[1] ?? '');
            const name = nameAttr?.[1];
            if (name && /^Clarion\b/i.test(name) && !/^Clarion\.NET\b/i.test(name) && !names.includes(name)) names.push(name);
        }
        if (!selfClosing) depth++;
    }
    return names;
}

const registryCache = new Map<string, { mtimeMs: number; names: string[] }>();

/**
 * #535 — the registered version names of a ClarionProperties.xml on disk, mtime-cached;
 * null when the file cannot be read (then the remembered name is not judged).
 */
export function readRegisteredVersionNames(propertiesFile: string): string[] | null {
    if (!propertiesFile) return null;
    try {
        const mtimeMs = fs.statSync(propertiesFile).mtimeMs;
        const cached = registryCache.get(propertiesFile);
        if (cached && cached.mtimeMs === mtimeMs) return cached.names;
        const names = registeredVersionNamesFromXml(fs.readFileSync(propertiesFile, 'utf8'));
        registryCache.set(propertiesFile, { mtimeMs, names });
        return names;
    } catch {
        return null;
    }
}

/**
 * #535 — the Actions view's Clarion row: a stale name says so instead of posing as
 * a usable version; a registered one shows plainly, with the default when it differs.
 */
export function versionRowLabel(effectiveVersion: string, defaultVersion: string, registered: ReadonlyArray<string> | null): string {
    if (!effectiveVersion) return 'Not set — use Set Version';
    if (registered && !registered.some(n => n.toLowerCase() === effectiveVersion.toLowerCase())) {
        return `${effectiveVersion} — not registered, use Set Version`;
    }
    if (defaultVersion && defaultVersion !== effectiveVersion) return `${effectiveVersion} (default: ${defaultVersion})`;
    return effectiveVersion;
}

/**
 * Whether the settings a folder remembers for a solution can be reused as they are when
 * the solution is opened from the Solution View (`SmartSolutionOpener.openDetectedSolution`).
 * Invalid settings send the opener on to its installation/version picker.
 */
export function validateRememberedSettings(
    solutionPath: string,
    propertiesFile: string,
    version: string
): { valid: boolean; reason?: string } {
    if (!fs.existsSync(propertiesFile)) {
        return { valid: false, reason: `Properties file not found: ${propertiesFile}` };
    }
    if (!fs.existsSync(solutionPath)) {
        return { valid: false, reason: `Solution file not found: ${solutionPath}` };
    }
    if (!version || version.trim() === '') {
        return { valid: false, reason: 'Version is empty' };
    }
    // #566 — a name the properties file no longer registers (#535) cannot load; left
    // valid, the open reported success and initializeSolution then stopped silently.
    if (rememberedSolutionState(solutionPath, propertiesFile, version, readRegisteredVersionNames(propertiesFile)) === 'stale-version') {
        return { valid: false, reason: `${version} is no longer registered in ${path.basename(propertiesFile)}` };
    }
    return { valid: true };
}
