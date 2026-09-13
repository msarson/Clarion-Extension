import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { UnreachableCodeProvider } from '../providers/UnreachableCodeProvider';

/**
 * #445 — a statement split across physical lines with Clarion's `|` continuation
 * character had its continuation lines greyed out as unreachable code.
 *
 * `provideUnreachableRanges` walks PHYSICAL lines. A `RETURN` spanning four lines
 * registered a procedure-level terminator on the first of them, and the remaining
 * three still carried tokens — so the walk read them as statements occurring after
 * a return and marked them. They are the return.
 *
 * Reported against 1.0.2 on real source: a long formatted expression as a
 * procedure's final statement, which is idiomatic Clarion rather than a corner
 * case. Nothing functional broke; the decoration was simply wrong, on a construct
 * that appears throughout real codebases.
 *
 * The tests below are deliberately paired. The bug-pin (the reported procedure)
 * and the mid-procedure case would both pass if the detector were simply switched
 * off, so the sentinel — genuine code after a RETURN — has to fail loudly if the
 * fix is ever widened into "ignore terminators near continuations".
 */
suite('UnreachableCodeProvider — continued statements (#445)', () => {

    let docVersion = 0;
    const createDocument = (code: string) =>
        TextDocument.create('file:///continued.clw', 'clarion', ++docVersion, code);

    const flagged = (code: string) =>
        UnreachableCodeProvider.provideUnreachableRanges(createDocument(code))
            .map(r => r.start.line)
            .sort((a, b) => a - b);

    test('bug-pin: the reported VitTimer.Duration procedure flags nothing', () => {
        // Verbatim from the report. The RETURN is the final statement, split over
        // four physical lines; lines 2-4 were being dimmed.
        const code = [
            'VitTimer.Duration             Procedure() !,STRING',
            '',
            'L:Days     LONG,AUTO',
            'L:Hours    LONG,AUTO',
            'L:Mins     LONG,AUTO',
            'L:Duration LONG,AUTO',
            '',
            '  CODE',
            "    if ~self.StartTime then return('????').",
            '',
            '    if ~self.EndTime then self.Stop().',
            '',
            '    L:Days = self.EndDate - self.StartDate',
            '    L:Duration = self.EndTime - self.StartTime',
            '',
            '    LOOP while L:Duration < 0',
            '        L:Duration += 8640000        ! add a day',
            '        L:Days -= 1',
            '    end',
            '',
            '    if ~L:Days and ~L:Duration       ! GCR 25Feb2014',
            "        return('Too fast to measure')",
            '    end',
            '',
            '    L:Hours    = L:Duration / 360000',
            '    L:Duration = L:Duration % 360000 ! keep remainder after removing hours',
            '    L:Mins     = L:Duration / 6000',
            '    L:Duration = L:Duration % 6000   ! keep remainder after removing minutes',
            '',
            "    Return( clip(choose(~L:Days, '',L:Days  & ' day'    & choose(L:Days  < 2, ' ', 's ')) & |",
            "                 choose(~L:Hours,'',L:Hours & ' hour'   & choose(L:Hours < 2, ' ', 's ')) & |",
            "                 choose(~L:Mins, '',L:Mins  & ' minute' & choose(L:Mins  < 2, ' ', 's ')) & |",
            "                 choose(~L:Duration, '',L:Duration/100  & ' second' & choose(L:Duration = 100, '' , 's'))))",
            ''
        ].join('\n');

        assert.deepStrictEqual(flagged(code), [],
            'nothing in this procedure is unreachable — the RETURN is its final statement');
    });

    test('regression guard: the same RETURN on one physical line still flags nothing', () => {
        // Establishes that the bug was specific to the continuation, not to RETURN
        // with a complex expression.
        const code = [
            'MyProc PROCEDURE()',
            'L:A LONG,AUTO',
            '  CODE',
            '    L:A = 1',
            "    RETURN( clip(choose(~L:A, '', 'x')) )",
            ''
        ].join('\n');

        assert.deepStrictEqual(flagged(code), []);
    });

    test('sentinel: genuine code after a RETURN is still flagged', () => {
        // If this ever goes quiet, the fix has been widened too far and the
        // detector has stopped working rather than stopped misfiring.
        const code = [
            'MyProc PROCEDURE()',
            '  CODE',
            '    RETURN',
            "    MESSAGE('unreachable')",
            ''
        ].join('\n');

        assert.deepStrictEqual(flagged(code), [3]);
    });

    test('a continued RETURN mid-procedure: its own lines are clean, what follows is not', () => {
        // The discriminating case. Line 5 is the RETURN's continuation and must be
        // left alone; line 6 genuinely is unreachable and must still be marked.
        const code = [
            'MyProc PROCEDURE()',           // 0
            'L:A LONG,AUTO',                // 1
            '  CODE',                       // 2
            '    L:A = 1',                  // 3
            "    RETURN( choose(~L:A, |",   // 4
            "                   'a', 'b') )", // 5  <- continuation, not unreachable
            "    MESSAGE('truly unreachable')", // 6 <- genuinely after the RETURN
            ''
        ].join('\n');

        assert.deepStrictEqual(flagged(code), [6],
            'the continuation line must be spared and the following statement must not be');
    });

    test('trailing text after the `|` is a comment and does not defeat detection', () => {
        // Clarion allows text after the continuation character on the same line;
        // it is treated as a comment. So the line does NOT end with `|`, and any
        // implementation that tests the trimmed text for a trailing pipe would
        // miss the continuation and mark line 5 unreachable again.
        //
        // The tokenizer folds that trailing text into the LineContinuation token's
        // own value (`"|  trailing text here"`), which is why detection matches on
        // the token type rather than on `value === '|'`.
        const code = [
            'MyProc PROCEDURE()',                     // 0
            'L:A LONG,AUTO',                          // 1
            '  CODE',                                 // 2
            '    L:A = 1',                            // 3
            '    RETURN( choose(~L:A, |  trailing text here', // 4
            "                   'a', 'b') )",         // 5  <- still a continuation
            "    MESSAGE('truly unreachable')",       // 6
            ''
        ].join('\n');

        assert.deepStrictEqual(flagged(code), [6],
            'a comment after the continuation character must not turn line 5 back into unreachable code');
    });

    test('a continued non-terminator statement before a RETURN is unaffected', () => {
        // Continuations are common outside RETURN too; skipping them must not
        // disturb ordinary reachability accounting.
        const code = [
            'MyProc PROCEDURE()',
            'L:A LONG,AUTO',
            '  CODE',
            '    L:A = 1 + |',
            '          2',
            '    RETURN',
            "    MESSAGE('unreachable')",
            ''
        ].join('\n');

        assert.deepStrictEqual(flagged(code), [6]);
    });
});
