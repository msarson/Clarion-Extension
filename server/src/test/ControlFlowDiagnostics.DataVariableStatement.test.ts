import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, Token, TokenType } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { validateCycleBreakOutsideLoop } from '../providers/diagnostics/ControlFlowDiagnostics';

/**
 * A CODE-section statement that begins with a variable called `Data` (`data = ''`,
 * `Data.Field = 1`) took the tokenizer out of the CODE section for the rest of the
 * procedure. `codeSectionSetBy` treated any line STARTING with the word DATA as the
 * routine DATA-section header (`/^\s*(DATA|ROUTINE)\b/i`), so every execution structure
 * after it was skipped: the Structure pattern refused LOOP/IF outside CODE, the Variable
 * pattern excludes those keywords, and the next match began one character in (`LOOP`
 * became the variable `OOP`, `IF` became `F`). The LOOP then had no finishesAt, and each
 * BREAK/CYCLE in it was reported "used outside of a LOOP or ACCEPT structure".
 *
 * The DATA header stands alone on its line, like CODE: the same strict form the
 * routine-local scan (`/^\s*data\s*(!.*)?$/i`) already uses.
 *
 * Same trigger word as #618, which guarded the outline's own DATA check; this is the
 * tokenizer's section state that every other consumer reads.
 */

function createDocument(code: string): TextDocument {
    return TextDocument.create('file:///test/datavar.clw', 'clarion', 1, code);
}

function processed(code: string): Token[] {
    const tokens = new ClarionTokenizer(code).tokenize();
    new DocumentStructure(tokens).process();
    return tokens;
}

function messages(code: string): string[] {
    return validateCycleBreakOutsideLoop(processed(code), createDocument(code))
        .map(d => `${d.range.start.line}: ${d.message}`);
}

/** A class method taking a `*STRING data` parameter, the reported shape. `firstStatement` varies. */
function methodFixture(firstStatement: string): string {
    return [
        'Parser.NextItem PROCEDURE(LONG WantType, *STRING data)',   // 0
        'i      LONG,AUTO',                                         // 1
        'RetVal LONG(FALSE)',                                       // 2
        '  CODE',                                                   // 3
        '  IF ~SELF.Inited THEN RETURN(FALSE) .',                   // 4
        firstStatement,                                             // 5
        '  LOOP i = SELF.Cur+1 TO RECORDS(SELF.Q)',                 // 6
        '    GET(SELF.Q, i)',                                       // 7
        '    IF SELF.Q.Kind = 1',                                   // 8
        '      BREAK',                                              // 9
        '    END',                                                  // 10
        '    IF SELF.Q.Kind = 2',                                   // 11
        '      CYCLE',                                              // 12
        '    END',                                                  // 13
        '    RetVal = TRUE',                                        // 14
        '  END',                                                    // 15
        '  RETURN(RetVal)',                                         // 16
    ].join('\r\n');
}

suite('DATA as a variable at the start of a CODE-section statement', () => {

    const triggers = [
        "  data = ''",
        "  Data = 'x'",
        "  DATA = 'x'     ! upper case",
        '  data=1',
        "  Data.Field = 'x'",
        "  Data[1] = 'x'",
        '  data &= NULL',
    ];

    for (const trigger of triggers) {
        test(`BREAK/CYCLE inside LOOP — no warning after "${trigger.trim()}"`, () => {
            assert.deepStrictEqual(messages(methodFixture(trigger)), []);
        });
    }

    test('LOOP and IF keep their Structure tokens and ranges after "data = \'\'"', () => {
        const structural = (code: string) =>
            processed(code)
                .filter(t => t.type === TokenType.Structure)
                .map(t => `${t.value.toUpperCase()}@${t.line}:fin=${t.finishesAt}`);
        const control = structural(methodFixture("  x = ''"));
        assert.ok(control.some(s => s.startsWith('LOOP@6')), `control lost the LOOP: ${JSON.stringify(control)}`);
        assert.deepStrictEqual(structural(methodFixture("  data = ''")), control,
            'a statement assigning a variable called data must not change how later lines tokenize');
    });

    test('no keyword loses its first character after "data = \'\'"', () => {
        const mangled = processed(methodFixture("  data = ''"))
            .filter(t => t.type === TokenType.Variable && /^(OOP|F)$/i.test(t.value))
            .map(t => `${t.value}@${t.line}`);
        assert.deepStrictEqual(mangled, []);
    });

    test('a local declared as Data, assigned in CODE', () => {
        const code = [
            'Parser.ItemAt   PROCEDURE(LONG Pos)',
            'i     LONG,AUTO',
            'Data  STRING(520)',
            '  CODE',
            "  data = ''",
            '  LOOP i = 1 TO RECORDS(SELF.Q)',
            '    GET(SELF.Q, i)',
            '    IF SELF.Q.Kind = 1',
            '      BREAK',
            '    END',
            '  END',
            '  RETURN(Data)',
        ].join('\r\n');
        assert.deepStrictEqual(messages(code), []);
    });

    test('bidirectional: a BREAK really outside a LOOP is still flagged after "data = \'\'"', () => {
        const code = [
            'MyProc  PROCEDURE(*STRING data)',
            '  CODE',
            "  data = ''",
            '  LOOP',
            '    CYCLE',
            '  END',
            '  BREAK',
        ].join('\r\n');
        assert.deepStrictEqual(messages(code), ["6: 'BREAK' used outside of a LOOP or ACCEPT structure."]);
    });

    test('a ROUTINE DATA section still opens and closes', () => {
        for (const dataLine of ['  DATA', '  DATA        ! locals below', '  data']) {
            const code = [
                'MyProc  PROCEDURE()',
                '  CODE',
                '  DO MyRout',
                '',
                'MyRout  ROUTINE',
                dataLine,
                'RoutLocal   LONG',
                '  CODE',
                '  LOOP RoutLocal = 1 TO 3',
                '    BREAK',
                '  END',
            ].join('\r\n');
            const tokens = processed(code);
            const local = tokens.find(t => t.value === 'RoutLocal' && t.start === 0 && t.type === TokenType.Label);
            assert.ok(local, `RoutLocal declaration label not found under "${dataLine.trim()}"`);
            assert.strictEqual(local!.subType, TokenType.Variable,
                `routine-local under "${dataLine.trim()}" must be recognized as a variable`);
            assert.deepStrictEqual(validateCycleBreakOutsideLoop(tokens, createDocument(code)), [],
                `the routine's LOOP must own its BREAK under "${dataLine.trim()}"`);
        }
    });

    suite('codeSectionSetBy', () => {
        test('the DATA header line leaves the CODE section', () => {
            for (const line of ['DATA', '  DATA', '\tdata', '  DATA   ! locals', '  DATA\r']) {
                assert.strictEqual(ClarionTokenizer.codeSectionSetBy(line), false, JSON.stringify(line));
            }
        });

        test('a statement starting with a variable called Data changes nothing', () => {
            for (const line of ["  data = ''", '  Data.Field = 1', '  Data[2] = 1', '  data &= NULL', '  DATA = 1 ! c']) {
                assert.strictEqual(ClarionTokenizer.codeSectionSetBy(line), undefined, JSON.stringify(line));
            }
        });
    });
});
