import * as assert from 'assert';
import {
    SOLUTION_VERSION_MEMORY_KEY,
    SolutionVersionMemoryRecord,
    getRecordedVersion,
    withRecordedVersion
} from '../utils/SolutionVersionMemory';

/**
 * Pure-record-manipulation tests for `SolutionVersionMemory` (#141 B1 L3 layer).
 *
 * Mirrors `SolutionFallbackPolicy.ts` test pattern from #146 (Eve) — vscode-
 * API-free unit suite that pins the pure-logic invariants of the L3 storage
 * layer (per-solution version memory, keyed by solution path, stored in
 * `ExtensionContext.globalState`).
 *
 * Pair-model RED→GREEN: tests written against Eve's substrate API shape
 * (from her 2026-05-12 #141 dispatch). RED until her commit lands
 * `client/src/utils/SolutionVersionMemory.ts`; converges GREEN against it.
 *
 * Load-bearing invariants pinned here:
 *   - L3 lookup hit (returns recorded version)
 *   - L3 lookup miss (returns undefined)
 *   - Immutable update: `withRecordedVersion` returns NEW record, does NOT
 *     mutate input
 *   - Overwrite: same solutionPath gets latest version, not first-write wins
 *   - SOLUTION_VERSION_MEMORY_KEY constant value (so consumers across the
 *     codebase use the same globalState key string; mismatched keys would
 *     produce silent-miss reads against the wrong storage slot)
 */

suite('SolutionVersionMemory pure-record API (#141 B1 L3)', () => {

    test('SOLUTION_VERSION_MEMORY_KEY is "clarion.solutionVersionMemory"', () => {
        assert.strictEqual(
            SOLUTION_VERSION_MEMORY_KEY,
            'clarion.solutionVersionMemory',
            'globalState key string must be the agreed value (#141 Q10) — '
            + 'mismatched keys produce silent-miss reads against the wrong slot'
        );
    });

    test('getRecordedVersion returns recorded version for known solution path', () => {
        const record: SolutionVersionMemoryRecord = {
            'C:\\path\\to\\solA.sln': 'C6',
            'C:\\path\\to\\solB.sln': 'C11'
        };

        assert.strictEqual(
            getRecordedVersion(record, 'C:\\path\\to\\solA.sln'),
            'C6'
        );
        assert.strictEqual(
            getRecordedVersion(record, 'C:\\path\\to\\solB.sln'),
            'C11'
        );
    });

    test('getRecordedVersion returns undefined for unknown solution path', () => {
        const record: SolutionVersionMemoryRecord = {
            'C:\\path\\to\\solA.sln': 'C6'
        };

        assert.strictEqual(
            getRecordedVersion(record, 'C:\\path\\to\\solB.sln'),
            undefined,
            'unknown solution path must return undefined — never a fallback to '
            + 'first/last entry, never an empty string'
        );
    });

    test('getRecordedVersion on empty record returns undefined for any path', () => {
        const record: SolutionVersionMemoryRecord = {};

        assert.strictEqual(
            getRecordedVersion(record, 'C:\\path\\to\\anything.sln'),
            undefined
        );
    });

    test('withRecordedVersion adds new entry without mutating input', () => {
        const input: SolutionVersionMemoryRecord = {
            'C:\\existing.sln': 'C6'
        };
        const inputFingerprint = JSON.stringify(input);

        const result = withRecordedVersion(input, 'C:\\new.sln', 'C11');

        // Bidirectional pin:
        // (1) Positive — result has the new entry AND preserves the old one
        assert.strictEqual(result['C:\\new.sln'], 'C11');
        assert.strictEqual(result['C:\\existing.sln'], 'C6');

        // (2) Negative — input record IS untouched (immutable update contract).
        // This is load-bearing: callers reading `input` after the call must
        // see the unchanged state. Silent-mutation here would surface as
        // race-condition-style bugs in cross-instance refresh paths.
        assert.strictEqual(
            JSON.stringify(input),
            inputFingerprint,
            'withRecordedVersion must NOT mutate input record (immutable update contract)'
        );
    });

    test('withRecordedVersion overwrites existing entry for same solution path', () => {
        const input: SolutionVersionMemoryRecord = {
            'C:\\sol.sln': 'C6'
        };

        const result = withRecordedVersion(input, 'C:\\sol.sln', 'C11');

        // Latest-write-wins semantics per Q3 — mid-session manual version
        // switches update the per-solution record. The contract is
        // "what you were last using on this solution," not "first version ever
        // recorded."
        assert.strictEqual(
            result['C:\\sol.sln'],
            'C11',
            'overwrite must succeed — latest-write-wins semantics per Q3'
        );

        // Input still preserved (immutability)
        assert.strictEqual(input['C:\\sol.sln'], 'C6');
    });

    test('withRecordedVersion on empty record creates singleton record', () => {
        const input: SolutionVersionMemoryRecord = {};

        const result = withRecordedVersion(input, 'C:\\first.sln', 'C6');

        assert.deepStrictEqual(result, {
            'C:\\first.sln': 'C6'
        });

        // Input still empty (immutability)
        assert.deepStrictEqual(input, {});
    });

    test('withRecordedVersion preserves siblings when overwriting one entry', () => {
        const input: SolutionVersionMemoryRecord = {
            'C:\\sol1.sln': 'C6',
            'C:\\sol2.sln': 'C11',
            'C:\\sol3.sln': 'C10'
        };

        const result = withRecordedVersion(input, 'C:\\sol2.sln', 'C12');

        // The overwritten entry changed; siblings untouched.
        assert.strictEqual(result['C:\\sol1.sln'], 'C6');
        assert.strictEqual(result['C:\\sol2.sln'], 'C12');
        assert.strictEqual(result['C:\\sol3.sln'], 'C10');
    });
});
