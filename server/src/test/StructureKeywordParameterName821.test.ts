import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';

/**
 * #821 — a structure keyword used as a parameter NAME inside a prototype's parentheses
 * (`LONG option`) is not a structure opener. On one line the parenthesis depth already
 * caught it; on a `|`-continued line the parenthesis was opened on an earlier line, so the
 * per-line depth read 0 and OPTION opened a structure: the MAP was reported unterminated
 * and the MODULE's END was taken as closing OPTION.
 */
suite('A structure keyword as a prototype parameter name opens nothing (#821)', () => {
    const KEYWORDS = ['option', 'group', 'queue', 'itemize', 'menu', 'sheet', 'tab', 'window', 'report', 'file', 'menubar', 'toolbar'];

    function structureTokens(code: string) {
        return new ClarionTokenizer(code).tokenize().filter(t => t.type === TokenType.Structure);
    }

    function unterminated(code: string): string[] {
        const doc = TextDocument.create('test://kw821.clw', 'clarion', 1, code);
        return DiagnosticProvider.validateDocument(doc).map(d => String(d.message)).filter(m => /not terminated|END/i.test(m));
    }

    function continued(kw: string): string {
        return [
            "  PROGRAM",
            "  MAP",
            "    MODULE('')",
            "HTTPQueryInfo   PROCEDURE(LONG hRequest, |",
            `                          LONG ${kw}, |`,
            "                          LONG buffer),SIGNED,PASCAL",
            "    END",
            "  END",
            "  CODE",
            ""].join('\n');
    }

    function oneLine(kw: string): string {
        return [
            "  PROGRAM",
            "  MAP",
            "    MODULE('')",
            `HTTPQueryInfo   PROCEDURE(LONG hRequest, LONG ${kw}, LONG buffer),SIGNED,PASCAL`,
            "    END",
            "  END",
            "  CODE",
            ""].join('\n');
    }

    for (const kw of KEYWORDS) {
        test(`continued prototype: ${kw} is not a structure`, () => {
            const code = continued(kw);
            const names = structureTokens(code).map(t => t.value.trim().toUpperCase());
            assert.deepStrictEqual(names, ['MAP', 'MODULE']);
            assert.deepStrictEqual(unterminated(code), []);
        });

        test(`one-line prototype: ${kw} is not a structure`, () => {
            const code = oneLine(kw);
            const names = structureTokens(code).map(t => t.value.trim().toUpperCase());
            assert.deepStrictEqual(names, ['MAP', 'MODULE']);
            assert.deepStrictEqual(unterminated(code), []);
        });
    }

    test('the parameter name is the first word of its continuation line', () => {
        const code = [
            "  PROGRAM",
            "  MAP",
            "    MODULE('')",
            "Go   PROCEDURE(LONG a, LONG b, |",
            "               option, |",
            "               LONG c)",
            "    END",
            "  END",
            "  CODE",
            ""].join('\n');
        assert.deepStrictEqual(structureTokens(code).map(t => t.value.trim().toUpperCase()), ['MAP', 'MODULE']);
    });

    test('regression: a real OPTION after a continued, closed attribute list still opens', () => {
        const code = [
            "  PROGRAM",
            "  MAP",
            "  END",
            "Win WINDOW('x'),AT(0,0, |",
            "        100,100)",
            "      OPTION('Pick'),AT(1,1,50,50),USE(?Opt), |",
            "        BOXED",
            "        RADIO('A'),AT(2,2,10,10)",
            "      END",
            "    END",
            "  CODE",
            ""].join('\n');
        const names = structureTokens(code).map(t => t.value.trim().toUpperCase());
        assert.deepStrictEqual(names, ['MAP', 'WINDOW', 'OPTION']);
        assert.deepStrictEqual(unterminated(code), []);
    });

    test('regression: a parenthesis inside a string on a continued line is not carried', () => {
        const code = [
            "  PROGRAM",
            "  MAP",
            "  END",
            "Win WINDOW('x ('),AT(0,0,100,100), |",
            "        SYSTEM",
            "      OPTION('Pick'),USE(?Opt)",
            "      END",
            "    END",
            "  CODE",
            ""].join('\n');
        assert.deepStrictEqual(structureTokens(code).map(t => t.value.trim().toUpperCase()), ['MAP', 'WINDOW', 'OPTION']);
    });
});
