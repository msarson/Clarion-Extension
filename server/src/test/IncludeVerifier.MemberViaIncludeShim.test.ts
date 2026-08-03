import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { SolutionManager } from '../solution/solutionManager';

/**
 * Project convention: the real MEMBER('program') statement is not written directly in
 * every member module — it lives in a small shared shim file reached via
 * INCLUDE('member.clw'). MemberLocatorService.resolveMemberHeaderToken() already follows
 * that one INCLUDE hop for hover/F12/completion; IncludeVerifier.computeMemberParentDocument()
 * did not, so isClassIncluded() could never see the MEMBER parent's include chain for any
 * file using the shim — a class only reachable through the real PROGRAM file's includes was
 * reported as a missing-include false positive even though it compiles fine.
 */
suite('IncludeVerifier — MEMBER resolved via INCLUDE shim (member.clw convention)', () => {
    let tmpRoot = '';
    let savedSm: SolutionManager | null = null;

    const fileUri = (p: string) => `file:///${p.replace(/\\/g, '/')}`;

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'member-shim-'));
        // No-solution mode forces local-directory resolution.
        savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = null;
        IncludeVerifier.getInstance().clearCache();
        clearReachableSetBucket();

        // The shim: no CODE of its own, just the real MEMBER() statement.
        fs.writeFileSync(path.join(tmpRoot, 'member.clw'), [
            "  MEMBER('parent.clw')",
            '',
        ].join('\r\n'));

        // The real PROGRAM file — includes the class several hops down its own chain.
        fs.writeFileSync(path.join(tmpRoot, 'parent.clw'), [
            '  PROGRAM',
            "  INCLUDE('level1.inc'),ONCE",
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
            '',
        ].join('\r\n'));
        fs.writeFileSync(path.join(tmpRoot, 'level1.inc'), [
            "  INCLUDE('SharedThings.inc'),ONCE",
            '',
        ].join('\r\n'));
        fs.writeFileSync(path.join(tmpRoot, 'SharedThings.inc'), [
            'SomeClass   CLASS,TYPE',
            'DoIt          PROCEDURE(),LONG',
            '            END',
            '',
        ].join('\r\n'));

        // The member module under test: reaches its MEMBER only through the shim,
        // matching the real-world convention: SomeMember.clw -> INCLUDE('member.clw') -> MEMBER('...').
        fs.writeFileSync(path.join(tmpRoot, 'child.clw'), [
            "  INCLUDE('member.clw')",
            '  MAP',
            '  END',
            'MyProc PROCEDURE',
            '  CODE',
            '  RETURN',
            '',
        ].join('\r\n'));
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: SolutionManager | null }).instance = savedSm;
        savedSm = null;
        IncludeVerifier.getInstance().clearCache();
        clearReachableSetBucket();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const clearReachableSetBucket = () => {
        try { fs.rmSync(path.join(os.tmpdir(), 'clarion-extension-reachableset'), { recursive: true, force: true }); }
        catch { /* best-effort */ }
    };

    const childDoc = () => {
        const p = path.join(tmpRoot, 'child.clw');
        return TextDocument.create(fileUri(p), 'clarion', 1, fs.readFileSync(p, 'utf-8'));
    };

    test('a class reachable only through the shim-resolved MEMBER parent is found', async () => {
        const iv = IncludeVerifier.getInstance();
        assert.strictEqual(await iv.isClassIncluded('SharedThings.inc', childDoc()), true,
            "SharedThings.inc is only reachable via child.clw -> INCLUDE('member.clw') -> MEMBER('parent.clw') -> level1.inc; must resolve as included");
    });

    test('a class not reachable anywhere in the shim-resolved chain is still reported missing', async () => {
        const iv = IncludeVerifier.getInstance();
        assert.strictEqual(await iv.isClassIncluded('NotAnywhere.inc', childDoc()), false,
            'a genuinely unreachable class must still be reported as not included');
    });
});
