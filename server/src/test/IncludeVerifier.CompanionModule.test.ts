import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { SolutionManager } from '../solution/solutionManager';

/**
 * Issue #191 — missing-include false positive for split-class layouts.
 *
 * A `CLASS,TYPE` declared in a definition `.inc` references another class via a
 * reference member (`helper &HelperClass`). The INCLUDE for the referenced class
 * lives only in the *implementation* module (the `.clw` named by the class's
 * `MODULE('...clw')` attribute), NOT in the `.inc` itself — a perfectly valid
 * Clarion split-class layout that compiles.
 *
 * `IncludeVerifier.isClassIncluded` previously checked only the current file, its
 * transitive includes, and its MEMBER parent. A definition `.inc` has no MEMBER
 * parent, so the implementing `.clw`'s include chain was never consulted →
 * `missing-include` fired a false positive on the member's type.
 *
 * The fix consults the companion implementation `.clw` (via the `MODULE()`
 * attribute on the file's CLASS declarations) and its include chain.
 */

let tmpRoot = '';
let savedSm: SolutionManager | null = null;

function fileUri(p: string): string {
    return `file:///${p.replace(/\\/g, '/')}`;
}

function incDocument(): TextDocument {
    const p = path.join(tmpRoot, 'MyClass.inc');
    return TextDocument.create(fileUri(p), 'clarion', 1, fs.readFileSync(p, 'utf-8'));
}

suite('Issue #191 — missing-include companion .clw module', () => {

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '191-clw-include-'));

        // No-solution mode forces local-directory include resolution.
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = null;
        IncludeVerifier.getInstance().clearCache();

        // The dependency class definition.
        fs.writeFileSync(path.join(tmpRoot, 'HelperClass.inc'), [
            'HelperClass   CLASS,TYPE',
            'DoWork          PROCEDURE(),LONG',
            '              END',
            '',
        ].join('\r\n'));

        // The definition .inc: references HelperClass by reference, names its
        // implementation module via MODULE(), and does NOT include HelperClass.inc.
        fs.writeFileSync(path.join(tmpRoot, 'MyClass.inc'), [
            "MyClass   CLASS,TYPE,MODULE('MyClass.clw'),LINK('MyClass.clw')",
            'helper      &HelperClass',
            '          END',
            '',
        ].join('\r\n'));

        // The implementation module — this is where the dependency is included.
        fs.writeFileSync(path.join(tmpRoot, 'MyClass.clw'), [
            '  MEMBER',
            '',
            "  INCLUDE('MyClass.inc'),ONCE",
            "  INCLUDE('HelperClass.inc'),ONCE",
            '',
            '  MAP',
            '  END',
            '',
        ].join('\r\n'));
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        savedSm = null;
        IncludeVerifier.getInstance().clearCache();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('type included only by the implementing .clw is treated as included (no false positive)', async () => {
        const iv = IncludeVerifier.getInstance();
        const included = await iv.isClassIncluded('HelperClass.inc', incDocument());
        assert.strictEqual(included, true,
            'HelperClass.inc is included by the companion implementation module MyClass.clw — must not warn');
    });

    test('type not included anywhere still reports as missing (no blanket suppression)', async () => {
        const iv = IncludeVerifier.getInstance();
        const included = await iv.isClassIncluded('NotAnywhere.inc', incDocument());
        assert.strictEqual(included, false,
            'NotAnywhere.inc is included by neither the .inc nor its companion .clw — must still report missing');
    });
});
