import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #141 B1 Option-A guardrail sentinel — cross-instance non-propagation
 * invariant pin (load-bearing for Mark's primary concern in the Option 1
 * three-layer storage design).
 *
 * **Why this test exists (the load-bearing invariant):**
 *
 * The #141 three-layer storage model (Q4) gives each VS Code instance an
 * isolated L2 (effective active version, in-memory) while L1 (default
 * version, settings.json User scope) is cross-instance shared by design.
 * Mark's primary concern was silent cross-contamination — if instance B
 * flips L1 while instance A has a solution loaded, instance A's L2 must
 * STAY PUT (its file-resolution surface should not silently rewind to the
 * other instance's choice).
 *
 * The invariant that makes this work is **absence-of-listener**: no
 * `onDidChangeConfiguration` handler in `client/src/` should react to the
 * L1 keys (`clarion.activeVersion` or `clarion.activePropertiesFile`). If
 * one is ever added, instance A would auto-re-pull L2 from L1 on instance
 * B's flip — breaking the bubble.
 *
 * This test pins by ABSENCE — it fails RED if any future PR introduces
 * such a handler. Negative-by-absence isn't elegant but it's the cleanest
 * regression sentinel for "wrong code path that should NEVER exist" in
 * vscode-API-free pure mocha (per `feedback_test_imports_vscode_api_free`).
 *
 * **Why not full L1/L2/L3 cross-layer isolation tests?**
 * Those require a real vscode runtime (workspace.getConfiguration + an
 * ExtensionContext + globalSettings module state isolation). Filed as
 * follow-up — the proper engineering investment is `@vscode/test-electron`
 * harness setup ~6-8hr; deferred from 0.9.7 polish window. In the interim:
 *   1. L3 pure-record immutability — pinned in `SolutionVersionMemory.test.ts`
 *   2. L1/L2 isolation contracts — code-review-enforced per Eve's docstrings
 *      on each SettingsStorageManager method
 *   3. Cross-instance non-propagation — this test
 *
 * **Documented isolation contracts** (mirror of Eve's `3eeb7ac` docstrings —
 * future reader of this file gets the layer model without chasing source):
 *
 * | Layer | API | Storage | Mutates |
 * |---|---|---|---|
 * | L1 (Default) | `setDefaultVersion` | settings.json User scope (`clarion.activeVersion`) | L1 only |
 * | L2 (Effective active, per-instance in-memory) | `setEffectiveActiveVersion` | `globals.globalClarionVersion` + `globalSettings.*` | L2 only |
 * | L3 (Per-solution memory) | `setSolutionVersion` / `clearSolutionVersion` | `ExtensionContext.globalState[SOLUTION_VERSION_MEMORY_KEY]` | L3 only |
 *
 * The Q5-baseline exception: when L1 is currently empty, `setEffectiveActiveVersion`
 * (via `globals.setActiveClarionVersion`) ALSO writes L1 — first-install
 * auto-set per Q5. This is the one documented cross-layer write in the model.
 */

const L1_KEYS = ['clarion.activeVersion', 'clarion.activePropertiesFile'];

/**
 * Find the project root by walking up from `__dirname` until a `package.json`
 * is found (at compile + run time, this test lives in `out/client/src/test/`;
 * the source TS files we're scanning live in `client/src/` from project root).
 */
function findProjectRoot(start: string): string {
    let dir = start;
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json')) && !fs.existsSync(path.join(dir, '..', 'package.json'))) {
            return dir;
        }
        // Fallback: stop at the first dir that has package.json AND a `client` subdir
        if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'client'))) {
            return dir;
        }
        dir = path.dirname(dir);
    }
    throw new Error(`Could not locate project root (no package.json + client/ subdir) walking up from ${start}`);
}

const PROJECT_ROOT = findProjectRoot(__dirname);
const CLIENT_SRC_ROOT = path.resolve(PROJECT_ROOT, 'client', 'src');

/**
 * Recursively collects `.ts` files under `dir`, excluding `test/` and
 * compiled `out/` directories.
 */
function collectTsFiles(dir: string, accumulator: string[] = []): string[] {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return accumulator;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'test' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
                continue;
            }
            collectTsFiles(full, accumulator);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            accumulator.push(full);
        }
    }
    return accumulator;
}

interface SuspectMatch {
    file: string;
    line: number;
    snippet: string;
    triggerKey: string;
}

/**
 * Scans `text` for `onDidChangeConfiguration` call sites. For each one,
 * checks the surrounding `windowSize` lines (after the call) for any L1 key.
 * Returns suspects — these are call sites that would break the cross-
 * instance non-propagation invariant if shipped.
 *
 * windowSize=80 catches both inline lambdas and listener-returning patterns
 * without sweeping in unrelated downstream code.
 */
function findOnConfigChangeWithL1Reference(
    file: string,
    text: string,
    windowSize: number = 80
): SuspectMatch[] {
    const lines = text.split(/\r?\n/);
    const suspects: SuspectMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('onDidChangeConfiguration')) {
            continue;
        }

        const windowEnd = Math.min(lines.length, i + windowSize);
        const window = lines.slice(i, windowEnd).join('\n');

        for (const l1Key of L1_KEYS) {
            // Match quoted occurrence (string literal in code), not comments
            // about it. A `' clarion.activeVersion '` pattern catches both
            // single and double quotes.
            const quotedPattern = new RegExp(`['"\`]${l1Key.replace(/\./g, '\\.')}['"\`]`);
            // Strip line-comment text from the window so doc-comments don't
            // false-positive.
            const codeOnly = window
                .split('\n')
                .map(ln => ln.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, ''))
                .join('\n');
            if (quotedPattern.test(codeOnly)) {
                suspects.push({
                    file: path.relative(CLIENT_SRC_ROOT, file),
                    line: i + 1,
                    snippet: lines[i].trim(),
                    triggerKey: l1Key,
                });
                break; // one suspect per onDidChangeConfiguration site is enough
            }
        }
    }
    return suspects;
}

suite('SettingsStorageManager guardrail sentinels (#141 B1 Option-A)', () => {

    test('L1 settings.json keys have NO onDidChangeConfiguration listener (cross-instance non-propagation invariant)', () => {
        const files = collectTsFiles(CLIENT_SRC_ROOT);
        assert.ok(
            files.length > 0,
            `Should find .ts files under ${CLIENT_SRC_ROOT}; check CLIENT_SRC_ROOT path`
        );

        const allSuspects: SuspectMatch[] = [];
        for (const file of files) {
            let text: string;
            try {
                text = fs.readFileSync(file, 'utf8');
            } catch {
                continue;
            }
            // Skip files that don't reference both — quick pre-filter
            if (!text.includes('onDidChangeConfiguration')) {
                continue;
            }
            if (!L1_KEYS.some(k => text.includes(k))) {
                continue;
            }
            const suspects = findOnConfigChangeWithL1Reference(file, text);
            allSuspects.push(...suspects);
        }

        if (allSuspects.length > 0) {
            const detail = allSuspects.map(s =>
                `  ${s.file}:${s.line} — ${s.snippet}\n    (triggered by L1 key "${s.triggerKey}")`
            ).join('\n');
            assert.fail(
                `Found ${allSuspects.length} onDidChangeConfiguration listener(s) that reference L1 keys:\n`
                + detail
                + `\n\n`
                + `This breaks the #141 Q4 cross-instance non-propagation invariant. L1 keys `
                + `(${L1_KEYS.join(', ')}) are cross-instance shared by design; an `
                + `onDidChangeConfiguration handler that reads them would auto-sync L2 (in-memory `
                + `effective active version) across instances, breaking the bubble isolation Mark `
                + `called for in #141 Q4.\n\n`
                + `If this listener is intentional, the #141 three-layer storage model needs `
                + `re-architecture — escalate before shipping. If accidental, remove the listener `
                + `or remove the L1 key reference from inside its scope.`
            );
        }
    });
});
