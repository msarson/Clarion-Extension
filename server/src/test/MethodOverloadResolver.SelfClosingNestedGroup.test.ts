/**
 * Regression coverage for MethodOverloadResolver.gatherIncludeMethodDeclarations —
 * the fourth sibling scanner sharing the class-body self-closing-GROUP bug also
 * covered (for the other three scanners) in
 * ClassMemberResolver.SelfClosingNestedGroup.test.ts.
 *
 * Before this fix, this scanner had NO nesting-depth tracking at all: it broke
 * the whole scan on the very first bare "END" line after the CLASS header,
 * making every method in any class that declares an inline GROUP/QUEUE/RECORD
 * member before its methods unreachable via this path. Once nesting-depth
 * tracking was added, a SELF-CLOSING single-line member (e.g.
 * "Foo GROUP(Type),DIM(2) END", or the period form "...,DIM(2).") still needed
 * its own net-no-op recognition — otherwise it permanently leaks the depth
 * counter exactly like the unclosed-multi-line case did.
 *
 * Two failure modes are covered here:
 *   1. Attributes between the type argument and the terminator (both the END
 *      and period spellings).
 *   2. A trailing comment on a CRLF-line-ended file — splitting on a bare '\n'
 *      leaves every line ending in '\r', which silently defeats the comment-
 *      strip regex's '$' anchor, so the comment is never stripped and the
 *      self-closing check never sees the line actually end in "END". An
 *      LF-only fixture would pass even under the OLD split('\n'), so this
 *      needs its own CRLF-joined fixture to actually pin the fix.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function makeDoc(dir: string, filename: string, content: string): TextDocument {
    const uri = `file:///${path.join(dir, filename).replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', 1, content);
}

suite('MethodOverloadResolver — self-closing nested GROUP with attrs/period terminator', () => {
    const tokenCache = TokenCache.getInstance();
    let resolver: MethodOverloadResolver;

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mor_selfclose_'));

        // OuterClass — a bare multi-line GROUP first (sanity baseline), then a
        // self-closing single-line GROUP with attributes AND the "END" terminator,
        // then the same shape with the period terminator, then a real method.
        fs.writeFileSync(path.join(tmpDir, 'OuterClass.inc'), [
            'OuterClass CLASS',
            'MultiLineGroup     GROUP',
            'InnerField           LONG',
            '                   END',
            'AttrEndGroup       GROUP(SmallType),DIM(2) END',
            'AttrPeriodGroup    GROUP(SmallType),DIM(2).',
            'AfterGroups        PROCEDURE(),LONG',
            'END',
        ].join('\n'));
    });

    suiteTeardown(() => {
        tokenCache.clearAllTokens();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    setup(() => {
        resolver = new MethodOverloadResolver();
    });

    test('finds a method declared after a same-line "attrs END" self-closing GROUP', () => {
        const doc = makeDoc(tmpDir, 'probe1.clw', `  INCLUDE('OuterClass.inc'),ONCE\n`);
        const tokens = tokenCache.getTokens(doc);
        const result = resolver.findMethodDeclaration('OuterClass', 'AfterGroups', doc, tokens);
        assert.ok(result, 'Should find AfterGroups past the self-closing GROUP forms');
        assert.ok(result!.signature.toUpperCase().includes('PROCEDURE'));
    });

    test('does NOT treat InnerField (inside the genuine multi-line GROUP) as a direct CLASS method', () => {
        const doc = makeDoc(tmpDir, 'probe2.clw', `  INCLUDE('OuterClass.inc'),ONCE\n`);
        const tokens = tokenCache.getTokens(doc);
        const result = resolver.findMethodDeclaration('OuterClass', 'InnerField', doc, tokens);
        assert.strictEqual(result, null, 'InnerField is nested inside MultiLineGroup, not a direct CLASS member');
    });

    // ---------------------------------------------------------------------------
    // CRLF pin — a self-closing GROUP with a trailing comment, on a file using
    // Windows CRLF line endings.
    // ---------------------------------------------------------------------------
    suite('CRLF file with a commented self-closing GROUP', () => {
        let crlfDir: string;

        suiteSetup(() => {
            crlfDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mor_selfclose_crlf_'));
            fs.writeFileSync(path.join(crlfDir, 'CrlfClass.inc'), [
                'CrlfClass CLASS',
                'AttrEndGroup       GROUP(SmallType),DIM(2) END  !trailing comment',
                'AfterGroup         PROCEDURE(),LONG',
                'END',
            ].join('\r\n'));
        });

        suiteTeardown(() => {
            try { fs.rmSync(crlfDir, { recursive: true, force: true }); } catch { /* ignore */ }
        });

        test('finds the method past a commented self-closing GROUP on a CRLF file', () => {
            const doc = makeDoc(crlfDir, 'probe.clw', `  INCLUDE('CrlfClass.inc'),ONCE\n`);
            const tokens = tokenCache.getTokens(doc);
            const result = resolver.findMethodDeclaration('CrlfClass', 'AfterGroup', doc, tokens);
            assert.ok(result, 'Should find AfterGroup past the commented self-closing GROUP on a CRLF file');
        });
    });
});
