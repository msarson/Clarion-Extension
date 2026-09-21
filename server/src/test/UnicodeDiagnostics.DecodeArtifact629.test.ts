/**
 * #629 — U+FFFD is a decoding artefact, not file content.
 *
 * Clarion templates emit field-descriptor strings whose fields are separated by high-bit
 * bytes — 0xA6 between fields, 0xAB terminating each descriptor — chosen because they
 * cannot occur in real data. In Windows-1252 those are `¦` and `«`, both perfectly
 * representable in ANSI, and the files have compiled for years.
 *
 * When VS Code decodes such a file as UTF-8 the bytes are invalid, so the decoder replaces
 * each with U+FFFD. Walking the decoded text then finds a character with no ANSI encoding
 * and reports it — a finding about a character that is not in the file, with a message whose
 * every clause is wrong for the case, and a quick fix offering to DELETE it. Applied, that
 * silently strips every delimiter out of the generated strings.
 *
 * So U+FFFD must never be an `invalid-encoding` finding. What it warrants is its own report:
 * the file was decoded with the wrong encoding, and saving it in that state writes EF BF BD
 * over the original bytes for good.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { validateUnicodeCharacters } from '../providers/diagnostics/UnicodeDiagnostics';
import { UnicodeCodeActionProvider } from '../providers/UnicodeCodeActionProvider';

const doc = (text: string) => TextDocument.create('file:///t.clw', 'clarion', 1, text);
const diags = (text: string) => validateUnicodeCharacters(doc(text));

/** A descriptor line as it reaches us after VS Code has decoded the ANSI file as UTF-8. */
const R = '�';
const MANGLED = [
    '  TC_AddFieldsQueueData(QwQueue,QwDisabled,|',
    `      'The Company Number${R}0${R}GLE:CompanyID${R}@n2${R}1${R}2${R}1${R}${R}${R}${R}' & |`,
    `      'Posted${R}0${R}GLE:Posted${R}@n1${R}1${R}2${R}2${R}Posted${R}${R}${R}' & |`,
    "      '')",
].join('\r\n');

suite('U+FFFD is a decode artefact, not invalid encoding (#629)', () => {
    test('no invalid-encoding finding is raised for U+FFFD', () => {
        const bad = diags(MANGLED).filter(d => d.code === 'invalid-encoding');
        assert.deepStrictEqual(
            bad.map(d => `${d.range.start.line}:${String(d.message).slice(0, 40)}`), [],
            'U+FFFD is not a character in the file — it is the decoder reporting a byte it could not read'
        );
    });

    test('the file is reported once, not once per line, and the message names the real hazard', () => {
        const found = diags(MANGLED).filter(d => d.code === 'utf8-decode-artifact');
        assert.strictEqual(found.length, 1, `expected exactly one per-file report, got ${found.length}`);
        const m = String(found[0].message);
        assert.ok(/not valid UTF-?8/i.test(m), `must say the file is not valid UTF-8: ${m}`);
        assert.ok(/encoding/i.test(m), `must point at reopening with the right encoding: ${m}`);
        assert.ok(/sav/i.test(m), `must warn that saving destroys the bytes: ${m}`);
    });

    test('no destructive quick fix is offered for it', () => {
        const d = doc(MANGLED);
        const all = validateUnicodeCharacters(d);
        const actions = new UnicodeCodeActionProvider().provideCodeActions(
            d, { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, { diagnostics: all }
        );
        const destructive = actions.filter(a => /delete|replace/i.test(a.title));
        assert.deepStrictEqual(
            destructive.map(a => a.title), [],
            'deleting U+FFFD strips the real delimiters out of the generated strings'
        );
    });

    test('CONTROL: a genuinely unrepresentable character is still reported (#556 wording kept)', () => {
        const d = diags("S = '\u{1F600}'");
        assert.strictEqual(d.length, 1, 'an emoji in a correctly decoded file is still contamination');
        assert.strictEqual(d[0].code, 'invalid-encoding');
        assert.ok(String(d[0].message).includes('U+1F600'), String(d[0].message));
    });

    test('CONTROL: legitimate ANSI characters are still not flagged', () => {
        assert.deepStrictEqual(diags("S = '¦«éüñ'"), [], 'these are exactly the characters the file really holds');
    });
});
