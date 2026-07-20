/**
 * Regression coverage for a class-body-scanning bug shared by three independent
 * scanners in this file (scanClassBodyForAllMembers, scanClassBodyForMember, and
 * the INCLUDE-file scanner inside ClassMemberResolver.findClassMemberInIncludes)
 * — a fourth sibling scanner with the identical bug, in MethodOverloadResolver.ts,
 * has its own dedicated coverage in MethodOverloadResolver.SelfClosingNestedGroup.test.ts.
 *
 * An inline GROUP/QUEUE/RECORD class member that closes itself on the SAME line
 * (e.g. "Foo GROUP(Type),DIM(2) END", or the period form "...,DIM(2).") was
 * always treated as OPENING a nested scope that never closes, permanently
 * leaking the nesting-depth counter and hiding every member declared afterward.
 *
 * Three distinct failure modes are covered:
 *   1. Attributes between the type argument and the terminator (a combined
 *      regex trying to capture both together can let the attrs swallow the
 *      terminator — mirrors a real fix already shipped for this exact shape
 *      in ClarionAssistant's separate CodeGraph indexer).
 *   2. The period ('.') terminator form, which is fully interchangeable with
 *      END for closing any Clarion structure, but wasn't recognized at all.
 *   3. A trailing comment on a CRLF-line-ended file (the "CRLF file with a
 *      commented self-closing GROUP" suite below) — splitting on a bare '\n'
 *      leaves every line ending in '\r', which silently defeats the comment-
 *      strip regex's '$' anchor, so the comment is never stripped and the
 *      self-closing check never sees the line actually end in "END".
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    ClassMemberResolver,
    scanClassBodyForMember,
    scanClassBodyForAllMembers,
    selectBestMemberOverload,
} from '../utils/ClassMemberResolver';

let tmpDir: string;

function countParams(line: string): number {
    const match = line.match(/PROCEDURE\s*\(([^)]*)\)/i);
    if (!match || !match[1].trim()) return 0;
    let depth = 0, count = 0;
    for (const char of match[1]) {
        if (char === '(') depth++;
        else if (char === ')') depth--;
        else if (char === ',' && depth === 0) count++;
    }
    return count + 1;
}

suite('ClassMemberResolver — self-closing nested GROUP with attrs/period terminator', () => {

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scr_selfclose_'));

        // OuterClass — a bare multi-line GROUP first (sanity baseline), then a
        // self-closing single-line GROUP with attributes AND the "END" terminator,
        // then the same shape with the period terminator, then a real member.
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
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('scanClassBodyForMember finds a member declared after a same-line "attrs END" self-closing GROUP', () => {
        const result = scanClassBodyForMember(
            path.join(tmpDir, 'OuterClass.inc'),
            'OuterClass', 'AfterGroups', undefined, 'CLASS',
            countParams, selectBestMemberOverload
        );
        assert.ok(result, 'Should find AfterGroups past the self-closing GROUP forms');
        assert.ok(result!.type.toUpperCase().includes('PROCEDURE'));
    });

    test('scanClassBodyForAllMembers enumerates the member declared after both self-closing GROUP forms', () => {
        const results = scanClassBodyForAllMembers(
            path.join(tmpDir, 'OuterClass.inc'),
            'OuterClass', 'CLASS'
        );
        const names = results.map(r => r.name);
        assert.ok(names.includes('AfterGroups'), `Expected AfterGroups in [${names.join(', ')}]`);
    });

    test('scanClassBodyForAllMembers does NOT treat InnerField (inside the genuine multi-line GROUP) as a direct CLASS member', () => {
        const results = scanClassBodyForAllMembers(
            path.join(tmpDir, 'OuterClass.inc'),
            'OuterClass', 'CLASS'
        );
        const names = results.map(r => r.name);
        assert.ok(!names.includes('InnerField'), 'InnerField is nested inside MultiLineGroup, not a direct member');
    });

    test('ClassMemberResolver.findClassMemberInIncludes (the third scanner) finds a member past both self-closing GROUP forms', () => {
        const doc = TextDocument.create(
            `file:///${path.join(tmpDir, 'probe.clw').replace(/\\/g, '/')}`,
            'clarion', 1,
            `  INCLUDE('OuterClass.inc'),ONCE\n`
        );
        const resolver = new ClassMemberResolver();
        const result = resolver.findClassMemberInIncludes('OuterClass', 'AfterGroups', doc);
        assert.ok(result, 'Should find AfterGroups via the INCLUDE-file scanner');
        assert.ok(result!.type.toUpperCase().includes('PROCEDURE'));
    });

    // ---------------------------------------------------------------------------
    // CRLF pin — a self-closing GROUP with a trailing comment, on a file using
    // Windows CRLF line endings. This is the shape that actually broke: splitting
    // on a bare '\n' leaves a trailing '\r' on every line, and '\r' blocks the
    // comment-strip regex's '$' anchor from ever being reached, so the comment is
    // never stripped and the self-closing check never sees the line end in "END".
    // An LF-only fixture would pass even under the OLD split('\n'), so this needs
    // its own CRLF-joined fixture to actually pin the fix.
    // ---------------------------------------------------------------------------
    suite('CRLF file with a commented self-closing GROUP', () => {
        let crlfDir: string;

        suiteSetup(() => {
            crlfDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scr_selfclose_crlf_'));
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

        test('scanClassBodyForMember finds the member past a commented self-closing GROUP on a CRLF file', () => {
            const result = scanClassBodyForMember(
                path.join(crlfDir, 'CrlfClass.inc'),
                'CrlfClass', 'AfterGroup', undefined, 'CLASS',
                countParams, selectBestMemberOverload
            );
            assert.ok(result, 'Should find AfterGroup past the commented self-closing GROUP on a CRLF file');
        });

        test('ClassMemberResolver.findClassMemberInIncludes finds the member past a commented self-closing GROUP on a CRLF file', () => {
            const doc = TextDocument.create(
                `file:///${path.join(crlfDir, 'probe.clw').replace(/\\/g, '/')}`,
                'clarion', 1,
                `  INCLUDE('CrlfClass.inc'),ONCE\n`
            );
            const resolver = new ClassMemberResolver();
            const result = resolver.findClassMemberInIncludes('CrlfClass', 'AfterGroup', doc);
            assert.ok(result, 'Should find AfterGroup via the INCLUDE-file scanner on a CRLF file');
        });
    });
});
