import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { TokenType } from '../tokenizer/TokenTypes';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';

/**
 * #771 — MODULE is a structure only as the first word of a statement (inside a MAP). A CLASS
 * declaration continued with `|` whose next line begins with MODULE('...') was read as a MODULE
 * structure opening, so it got "MODULE statement is not terminated with END or .". On a
 * continuation line MODULE is the CLASS's attribute.
 */
suite('A MODULE attribute on a continuation line is not a MODULE structure (#771)', () => {
    function moduleTokens(code: string) {
        return new ClarionTokenizer(code).tokenize().filter(t => t.value.trim().toUpperCase() === 'MODULE');
    }

    function unterminated(code: string): string[] {
        const doc = TextDocument.create('test://module771.inc', 'clarion', 1, code);
        return DiagnosticProvider.validateDocument(doc).map(d => String(d.message)).filter(m => /not terminated/.test(m));
    }

    const classWithModuleLine = [
        "ProgressDlg   CLASS(),TYPE,IMPLEMENTS(IHasProgress), |",
        "              MODULE('Progress.clw'),LINK('Progress.obj',1), |",
        "              DLL(0)",
        "Construct       PROCEDURE()",
        "              END",
        ""].join('\n');

    test('MODULE that begins a continuation line is an attribute', () => {
        const tokens = moduleTokens(classWithModuleLine);
        assert.strictEqual(tokens.length, 1);
        assert.strictEqual(tokens[0].type, TokenType.Attribute);
    });

    test('the CLASS is not reported unterminated, nor is the MODULE', () => {
        assert.deepStrictEqual(unterminated(classWithModuleLine), []);
    });

    test('a continuation followed by a comment still continues', () => {
        const code = classWithModuleLine.replace("IMPLEMENTS(IHasProgress), |", "IMPLEMENTS(IHasProgress), | ! the interface");
        assert.strictEqual(moduleTokens(code)[0].type, TokenType.Attribute);
        assert.deepStrictEqual(unterminated(code), []);
    });

    test('regression: a MAP\'s MODULE is still a structure', () => {
        const code = ["  MAP", "    MODULE('')", "      memcpy(*?, *?, UNSIGNED),*?,PROC,RAW,NAME('_memcpy')", "    END", "  END", ""].join('\n');
        assert.strictEqual(moduleTokens(code)[0].type, TokenType.Structure);
        assert.deepStrictEqual(unterminated(code), []);
    });

    test('regression: a | inside a string on the previous line is not a continuation', () => {
        const code = ["  MAP", "    Sep(STRING s='|')", "    MODULE('x')", "      Go()", "    END", "  END", ""].join('\n');
        assert.strictEqual(moduleTokens(code)[0].type, TokenType.Structure);
    });
});
