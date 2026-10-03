import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { shadowedSignatures, allKept, ClarionSettingsStore } from '../utils/SolutionSettingsScope';

/**
 * #686 (from #659) — in the #669 dialog "Clarion settings disagree between this workspace file and
 * the folder settings", Keep as is did the same as Cancel and the question came back at every
 * start. Keep as is now remembers each disagreement it was shown (key and both values), and the
 * question returns only for one not kept: a changed value, or another key. Cancel still asks next
 * time. Remembered per key, not as a whole, because the solution load can itself bring one key
 * into agreement (it writes the configuration to both files) while the others still differ.
 */
function store(values: Record<string, { folder?: unknown; workspace?: unknown }>): ClarionSettingsStore {
    return {
        hasWorkspaceFile: true,
        inspect: <T>(key: string) => (values[key]
            ? { key, workspaceFolderValue: values[key].folder as T, workspaceValue: values[key].workspace as T }
            : undefined) as any,
        get: <T>(_key: string, fallback: T) => fallback,
        update: async () => { /* not used */ },
    };
}
const config = (folder: string, workspace: string) => ({ configuration: { folder, workspace } });
const exts = (folder: string[], workspace: string[]) => ({ fileSearchExtensions: { folder, workspace } });

suite('Keep as is is remembered (#686)', () => {
    test('the same disagreement is kept', () => {
        const kept = shadowedSignatures(store(config('Release', 'Debug|Win32')), ['configuration']);
        assert.strictEqual(allKept(shadowedSignatures(store(config('Release', 'Debug|Win32')), ['configuration']), kept), true);
    });

    test('a changed value on either side is not kept', () => {
        const kept = shadowedSignatures(store(config('Release', 'Debug|Win32')), ['configuration']);
        assert.strictEqual(allKept(shadowedSignatures(store(config('Release|Win32', 'Debug|Win32')), ['configuration']), kept), false);
        assert.strictEqual(allKept(shadowedSignatures(store(config('Release', 'Debug')), ['configuration']), kept), false);
    });

    test('another key disagreeing is not kept', () => {
        const kept = shadowedSignatures(store(config('Release', 'Debug|Win32')), ['configuration']);
        const now = store({ ...config('Release', 'Debug|Win32'), ...exts(['.clw'], ['.clw', '.equ']) });
        assert.strictEqual(allKept(shadowedSignatures(now, ['configuration', 'fileSearchExtensions']), kept), false);
    });

    test('bug-pin: a key the load brought into agreement does not make the rest ask again', () => {
        const before = store({ ...config('Release', 'Debug|Win32'), ...exts(['.clw'], ['.clw', '.equ']) });
        const kept = shadowedSignatures(before, ['configuration', 'fileSearchExtensions']);
        const after = store({ ...config('Release|Win32', 'Release|Win32'), ...exts(['.clw'], ['.clw', '.equ']) });
        assert.strictEqual(allKept(shadowedSignatures(after, ['fileSearchExtensions']), kept), true);
    });

    test('bug-pin: Keep as is stores the disagreements and kept ones skip the question', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'client', 'src', 'solution', 'SolutionInitializer.ts'))) dir = path.dirname(dir);
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'solution', 'SolutionInitializer.ts'), 'utf8');
        const offer = src.slice(src.indexOf('async function offerToRemoveShadowedFolderSettings'));
        assert.match(offer, /workspaceState\.get<string\[\]>\(KEPT_SHADOWED_SETTINGS_KEY/, 'reads the remembered choice');
        assert.match(offer, /allKept\(signatures, kept\)/, 'skips when every disagreement is kept');
        assert.match(offer, /choice === 'Keep as is'[\s\S]*?workspaceState\.update\(KEPT_SHADOWED_SETTINGS_KEY/, 'Keep as is remembers them');
    });
});
