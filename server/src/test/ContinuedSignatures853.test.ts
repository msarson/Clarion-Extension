import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { CrossFileResolver } from '../utils/CrossFileResolver';
import { validateReturnStatements } from '../providers/diagnostics/ReturnValueDiagnostics';

/**
 * #853 — #851 read a `|`-continued MAP signature whole in the MAP checks; two other readers
 * still took the first line only.
 *
 * - The RETURN check (a procedure that declares a return type must return a value) looked for
 *   the `)` closing the parameters on the prototype's first line, so a continued prototype was
 *   never recorded, and it compared the implementation's first line, so a continued header
 *   never matched: either way the check silently skipped the procedure.
 * - Overload selection for a MAP declaration compared each declaration's first line, so a
 *   continued overload never matched and the first declaration was returned instead.
 */
suite('Signatures continued with | are read whole (#853)', () => {

    function returnDiagnostics(lines: string[]) {
        const text = lines.join('\r\n');
        const doc = TextDocument.create('file:///c%3A/t853/r.clw', 'clarion', 1, text);
        TokenCache.getInstance().clearAllTokens();
        return validateReturnStatements(TokenCache.getInstance().getTokens(doc), doc);
    }
    function returnChecks(lines: string[]): string[] {
        return returnDiagnostics(lines).map(d => String(d.message).match(/^Procedure '([\w.]+)'/)?.[1] ?? '?').sort();
    }

    const program = (map: string[], impls: string[]) =>
        ['  PROGRAM', '  MAP', ...map, '  END', '  CODE', '  RETURN', ...impls, ''];

    test('control: a one-line prototype and header with no RETURN warn', () => {
        assert.deepStrictEqual(returnChecks(program(
            ['Calc         PROCEDURE(LONG a, LONG b),LONG'],
            ['Calc         PROCEDURE(LONG a, LONG b)', '  CODE', '  a += b'])), ['Calc']);
    });

    test('a continued MAP prototype with no RETURN in its body warns', () => {
        assert.deepStrictEqual(returnChecks(program(
            ['Calc         PROCEDURE(LONG a, |', '                       LONG b),LONG'],
            ['Calc         PROCEDURE(LONG a, LONG b)', '  CODE', '  a += b'])), ['Calc']);
    });

    test('a continued implementation header with no RETURN warns', () => {
        assert.deepStrictEqual(returnChecks(program(
            ['Calc         PROCEDURE(LONG a, LONG b),LONG'],
            ['Calc         PROCEDURE(LONG a, |', '                       LONG b)', '  CODE', '  a += b'])), ['Calc']);
    });

    test('a continued CLASS method prototype with no RETURN warns', () => {
        assert.deepStrictEqual(returnChecks([
            '  PROGRAM',
            '  MAP',
            '  END',
            'Cls          CLASS',
            'Calc           PROCEDURE(LONG a, |',
            '                         LONG b),LONG',
            '             END',
            '  CODE',
            '  RETURN',
            'Cls.Calc     PROCEDURE(LONG a, LONG b)',
            '  CODE',
            '  a += b',
            '',
        ]), ['Cls.Calc']);
    });

    test('control: PROC on the continuation line still exempts it, and a RETURN satisfies it', () => {
        assert.deepStrictEqual(returnChecks(program(
            ['Calc         PROCEDURE(LONG a, |', '                       LONG b),LONG,|', '                       PROC',
             'Sum          PROCEDURE(LONG a, |', '                       LONG b),LONG'],
            ['Calc         PROCEDURE(LONG a, LONG b)', '  CODE', '  a += b',
             'Sum          PROCEDURE(LONG a, LONG b)', '  CODE', '  RETURN a + b'])), []);
    });

    test('a prototype with no parameter list declares a return too, with or without attributes', () => {
        assert.deepStrictEqual(returnChecks(program(
            ['Bare         PROCEDURE,LONG', "Named        PROCEDURE,NAME('Named'),LONG"],
            ['Bare         PROCEDURE', '  CODE', '  x# = 1', 'Named        PROCEDURE', '  CODE', '  x# = 1'])), ['Bare', 'Named']);
    });

    test('control: a prototype with no parameter list pairs only with an implementation with none', () => {
        // Only the overload with no parameters returns a value, and neither body returns one:
        // the warning belongs on line 7. Paired with the other body it would be on line 10.
        const lines = program(
            ['Foo          PROCEDURE,LONG', 'Foo          PROCEDURE(LONG n)'],
            ['Foo          PROCEDURE', '  CODE', '  x# = 1',             // 7
             'Foo          PROCEDURE(LONG n)', '  CODE', '  n += 1']);   // 10
        assert.deepStrictEqual(returnDiagnostics(lines).map(d => d.range.start.line), [7]);
    });

    test('control: DERIVED on a continued CLASS prototype still exempts it', () => {
        assert.deepStrictEqual(returnChecks([
            '  PROGRAM', '  MAP', '  END',
            'Cls          CLASS',
            'Calc           PROCEDURE(LONG a, |',
            '                         LONG b),LONG,|',
            '                         DERIVED',
            '             END',
            '  CODE', '  RETURN',
            'Cls.Calc     PROCEDURE(LONG a, LONG b)', '  CODE', '  a += b', '',
        ]), []);
    });

    suite('overload selection', () => {
        let tmpDir: string;
        const writeCrlf = (file: string, lines: string[]) =>
            fs.writeFileSync(path.join(tmpDir, file), lines.join('\r\n'), { encoding: 'latin1' });

        setup(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clw853_')); });
        teardown(() => {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
            TokenCache.getInstance().clearAllTokens();
        });

        test('a continued overload is picked by its whole signature', async () => {
            writeCrlf('parent.clw', [
                '  PROGRAM',                         // 0
                '  MAP',                             // 1
                "    MODULE('member')",              // 2
                'Alpha PROCEDURE(STRING s)',         // 3
                'Alpha PROCEDURE(LONG a, |',         // 4 the one asked for
                '                LONG b)',           // 5
                '    END',                           // 6
                '  END',                             // 7
                '  CODE',                            // 8
                '  RETURN',                          // 9
                '',
            ]);
            writeCrlf('member.clw', ["  MEMBER('parent')", '',
                'Alpha PROCEDURE(STRING s)', '  CODE', '  RETURN',
                'Alpha PROCEDURE(LONG a, LONG b)', '  CODE', '  RETURN', '']);
            const p = path.join(tmpDir, 'member.clw');
            const doc = TextDocument.create('file:///' + p.split(path.sep).join('/'), 'clarion', 1, fs.readFileSync(p, 'latin1'));
            TokenCache.getInstance().getTokens(doc);
            const result = await new CrossFileResolver(TokenCache.getInstance())
                .findMapDeclarationInMemberFile('Alpha', 'parent', doc, 'Alpha PROCEDURE(LONG a, LONG b)', undefined);
            assert.ok(result, 'resolves');
            assert.strictEqual(result!.line, 4);

            // The same choice through the declarant-graph fallback, which reaches its own copy of
            // the overload selection (searchDeclarantFileForMapDeclaration). It is private and
            // needs a built graph to be reached, so it is called directly here.
            // Graph edges carry the path lowercased; the file is then found among the open
            // documents (compared lowercased), so a case-sensitive file system is no obstacle.
            const parentPath = path.join(tmpDir, 'parent.clw');
            TokenCache.getInstance().getTokens(TextDocument.create(
                'file:///' + parentPath.split(path.sep).join('/'), 'clarion', 1, fs.readFileSync(parentPath, 'latin1')));
            const frgPath = parentPath.split(path.sep).join('/').toLowerCase();
            fs.unlinkSync(parentPath); // the open document, not the disk, answers on every platform
            const viaGraph = await (new CrossFileResolver(TokenCache.getInstance()) as any)
                .searchDeclarantFileForMapDeclaration(frgPath, 'member.clw', 'Alpha', 'Alpha PROCEDURE(LONG a, LONG b)');
            assert.ok(viaGraph, 'resolves through the declarant fallback');
            assert.strictEqual(viaGraph.line, 4);
        });
    });
});
