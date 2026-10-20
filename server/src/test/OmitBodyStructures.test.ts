import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { TokenType } from '../tokenizer/TokenTypes';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';

/**
 * The body of an unconditional OMIT block was read as code by DocumentStructure, so its
 * structures and ENDs paired with the code around the block. A generated module had
 *
 *     IF a
 *       OMIT('Cycle')
 *       IF b
 *         Cycle
 *     .
 *
 * The OMIT ends on the `Cycle` line, so the `.` after it is live and closes the outer IF: the
 * program builds. Read as code, the omitted IF took the `.`, the outer IF took the CASE's END,
 * the CASE took the ACCEPT's, and the ACCEPT never closed. Every CYCLE in the rest of the ACCEPT
 * was then "used outside of a LOOP or ACCEPT structure" (163 of them), with "CASE statement is
 * not terminated" on top.
 *
 * Compiler-verified (Clarion 12, MSBuild): REPORTED below builds; the same program without the
 * OMIT directive and its terminator line (the inner IF live) fails to compile.
 */
suite('The body of an OMIT block is not code to the structure parser', () => {

    let docVersion = 0;
    const createDocument = (code: string) =>
        TextDocument.create('file:///omit-body-structures.clw', 'clarion', ++docVersion, code);

    const tokensOf = (code: string) => TokenCache.getInstance().getTokens(createDocument(code));

    const messages = (code: string) =>
        DiagnosticProvider.validateDocument(createDocument(code)).map(d => `${d.range.start.line}: ${d.message}`);

    const structureAt = (code: string, line: number) =>
        tokensOf(code).find(t => t.type === TokenType.Structure && t.line === line)!;

    const program = (omitBody: string[]) => [
        '  PROGRAM',                       // 0
        '  MAP',                           // 1
        '  END',                           // 2
        'Flag  LONG',                      // 3
        '  CODE',                          // 4
        '  ACCEPT',                        // 5
        '    CASE EVENT()',                // 6
        '    OF 1',                        // 7
        '      IF Flag',                   // 8
        '        Flag = 0',                // 9
        ...omitBody,                       // 10..
        '      .',
        '    OF 2',
        '      CYCLE',
        '    END',
        '    CYCLE',
        '  END',
    ].join('\r\n');

    // The reported shape: the terminator text is also a keyword, and is on the OMIT line too.
    const REPORTED = program(["        OMIT('Cycle')", '        IF Flag', '          Flag = 2', '          Cycle']);
    // OMIT(...) on line 10, body 11-12, terminator line 13, `.` 14, OF 15, CYCLE 16, END 17, CYCLE 18, END 19.

    test('bug-pin: no CYCLE is reported outside the ACCEPT, and nothing is unterminated', () => {
        assert.deepStrictEqual(messages(REPORTED), []);
    });

    test('bug-pin: the `.` after the terminator closes the IF around the block, and each END its own structure', () => {
        assert.strictEqual(structureAt(REPORTED, 8).finishesAt, 14, 'outer IF');
        assert.strictEqual(structureAt(REPORTED, 6).finishesAt, 17, 'CASE');
        assert.strictEqual(structureAt(REPORTED, 5).finishesAt, 19, 'ACCEPT');
    });

    test('a structure left open in an OMIT body closes with the body', () => {
        assert.strictEqual(structureAt(REPORTED, 11).finishesAt, 12);
    });

    test('a structure that closes inside an OMIT body keeps its own END', () => {
        const code = program(["        OMIT('***')", '        LOOP', '          BREAK', '        END', '        ***']);
        assert.deepStrictEqual(messages(code), []);
        assert.strictEqual(structureAt(code, 11).finishesAt, 13, 'omitted LOOP');
        assert.strictEqual(structureAt(code, 8).finishesAt, 15, 'outer IF');
        assert.strictEqual(structureAt(code, 5).finishesAt, 20, 'ACCEPT');
    });

    test('an END alone in an OMIT body closes nothing around the block', () => {
        // Compiler-verified: builds; the same END live fails ("Invalid CYCLE statement").
        // OMIT 10, END 11, *** 12, `.` 13, CASE's END 16, ACCEPT's END 18.
        const code = program(["        OMIT('***')", '        END', '        ***']);
        assert.deepStrictEqual(messages(code), []);
        assert.strictEqual(structureAt(code, 8).finishesAt, 13, 'outer IF');
        assert.strictEqual(structureAt(code, 6).finishesAt, 16, 'CASE');
        assert.strictEqual(structureAt(code, 5).finishesAt, 18, 'ACCEPT');
    });

    test('sentinel: without the OMIT the inner IF is live, and the ACCEPT is left open', () => {
        // Compiler-verified: this program does not build. Lines: inner IF 10, `.` 12, CYCLE 14 and 16.
        const code = program(['        IF Flag', '          CYCLE']);
        assert.strictEqual(structureAt(code, 5).finishesAt, undefined, 'ACCEPT');
        assert.ok(messages(code).includes("16: 'CYCLE' used outside of a LOOP or ACCEPT structure."), messages(code).join('\n'));
    });

    test('sentinel: a conditional OMIT cannot be evaluated, so its body stays live', () => {
        const code = program(["        OMIT('Cycle',_WIDTH32_)", '        IF Flag', '          Flag = 2', '          Cycle']);
        assert.strictEqual(structureAt(code, 11).finishesAt, 14, 'the conditional body IF takes the `.`, as before');
    });
});
