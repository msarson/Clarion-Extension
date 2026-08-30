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
 * that one INCLUDE hop (plus normalizeMemberFilename's extension-less MEMBER target fix) for
 * hover/F12/completion; IncludeVerifier.computeMemberParentDocument() had neither, so
 * isClassIncluded() could never see the MEMBER parent's include chain for any file using the
 * shim — a class only reachable through the real PROGRAM file's includes was reported as a
 * missing-include false positive even though it compiles fine.
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

        // The shim: no CODE of its own, just the real MEMBER() statement — extension-less,
        // the idiomatic Clarion form (MEMBER('TargetProgram') style), which exercises the
        // normalizeMemberFilename fallback alongside the INCLUDE-hop fallback.
        fs.writeFileSync(path.join(tmpRoot, 'member.clw'), [
            "  MEMBER('parent')",
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

    test('a CHAINED shim (first-statement INCLUDE -> INCLUDE -> MEMBER) resolves', async () => {
        // Legal-but-rare: the shim's own first statement is another INCLUDE carrying the
        // MEMBER. Still one file read per hop, still first-statement-only.
        fs.writeFileSync(path.join(tmpRoot, 'member1.clw'), "  INCLUDE('member2.clw')\r\n");
        fs.writeFileSync(path.join(tmpRoot, 'member2.clw'), "  MEMBER('parent')\r\n");
        const p = path.join(tmpRoot, 'chained.clw');
        fs.writeFileSync(p, [
            "  INCLUDE('member1.clw')",
            'MyProc PROCEDURE',
            '  CODE',
            '  RETURN',
            '',
        ].join('\r\n'));
        const doc = TextDocument.create(fileUri(p), 'clarion', 1, fs.readFileSync(p, 'utf-8'));

        const iv = IncludeVerifier.getInstance();
        assert.strictEqual(await iv.isClassIncluded('SharedThings.inc', doc), true,
            'the MEMBER parent must resolve through a two-hop shim chain');
    });

    test('a MEMBER behind a NON-first-statement INCLUDE does NOT resolve (no all-includes sweep)', async () => {
        // The file's first statement is a data declaration, so it cannot be a member
        // module — MEMBER (or the shim INCLUDE carrying it) must be the FIRST statement
        // of the compiled token stream. An all-includes sweep would tokenize member.clw
        // and "find" the MEMBER anyway: wrong (the compiler rejects this file), and the
        // reason a plain definition include used to cost a cold tokenize of every
        // direct include instead of returning null instantly.
        const p = path.join(tmpRoot, 'notmember.clw');
        fs.writeFileSync(p, [
            'SomeVar  LONG',
            "  INCLUDE('member.clw')",
            'MyProc PROCEDURE',
            '  CODE',
            '  RETURN',
            '',
        ].join('\r\n'));
        const doc = TextDocument.create(fileUri(p), 'clarion', 1, fs.readFileSync(p, 'utf-8'));

        const iv = IncludeVerifier.getInstance();
        assert.strictEqual(await iv.isClassIncluded('SharedThings.inc', doc), false,
            'the shim INCLUDE is not the first statement — no MEMBER parent may be inferred');
    });

    test('a self-including shim terminates without resolving (cycle guard)', async () => {
        fs.writeFileSync(path.join(tmpRoot, 'member.clw'), "  INCLUDE('member.clw')\r\n");

        const iv = IncludeVerifier.getInstance();
        // Twofold: it returns at all (no infinite include loop), and finds nothing.
        assert.strictEqual(await iv.isClassIncluded('SharedThings.inc', childDoc()), false,
            'a cyclic shim chain must not resolve a MEMBER parent');
    });
});
