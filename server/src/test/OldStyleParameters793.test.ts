import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { ProcedureSignatureUtils } from '../utils/ProcedureSignatureUtils';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * #793 — a procedure's implementation may name its parameters without their types: the Language
 * Reference (PROCEDURE, define a procedure) says the parameter list of a definition holds "the
 * data type of each parameter (optional) followed by the label of the parameter ... (required)".
 * So `Test PROCEDURE (q)` implements the prototype `Test (LONG)`; Clarion 10 and 12 compile and
 * link that pair. Both sides were flagged as a signature mismatch: a one-word parameter was read
 * as a type, which is right in a prototype (labels optional) but not in an implementation.
 */
suite('Old-style parameters: an implementation naming its parameters without types (#793)', () => {
    test('a one-word implementation parameter is a label: it matches any type', () => {
        assert.deepStrictEqual(ProcedureSignatureUtils.extractImplementationParameterTypes('Test  PROCEDURE (q)'), ['']);
        assert.deepStrictEqual(ProcedureSignatureUtils.extractImplementationParameterTypes('Test PROCEDURE(LONG a, b, <STRING s>)'), ['LONG', '', 'STRING']);
        // A built-in type alone keeps reading as the type, as before.
        assert.deepStrictEqual(ProcedureSignatureUtils.extractImplementationParameterTypes('Test PROCEDURE(LONG)'), ['LONG']);
        assert.ok(ProcedureSignatureUtils.parametersMatch([''], ['LONG']));
        assert.ok(ProcedureSignatureUtils.parametersMatch(['LONG', ''], ['LONG', '*STRING']));
        assert.ok(!ProcedureSignatureUtils.parametersMatch([''], ['LONG', 'LONG']), 'the count still has to match');
        // A prototype's one-word parameter is still its type.
        assert.deepStrictEqual(ProcedureSignatureUtils.extractParameterTypes('Test (LONG)'), ['LONG']);
    });

    suite('both sides of the reported pair', () => {
        let dir: string;
        const write = (name: string, lines: string[]) => fs.writeFileSync(path.join(dir, name), lines.join('\r\n'));
        const read = (p: string) => { try { return fs.readFileSync(p, 'latin1'); } catch { return null; } };
        async function mismatches(name: string): Promise<string[]> {
            const file = path.join(dir, name);
            const doc = TextDocument.create('file:///' + file.replace(/\\/g, '/'), 'clarion', 1, fs.readFileSync(file, 'latin1'));
            const tokens = new ClarionTokenizer(doc.getText()).tokenize();
            const all = [
                ...await DiagnosticProvider.validateMissingMapDeclarations(tokens, doc, read),
                ...await DiagnosticProvider.validateMissingImplementations(tokens, doc, read),
            ];
            return all.filter(d => /signature-mismatch/.test(String(d.code))).map(d => `${d.code}@${d.range.start.line}`);
        }

        setup(() => {
            setServerInitialized(true);
            TokenCache.getInstance().clearAllTokens();
            dir = fs.mkdtempSync(path.join(os.tmpdir(), 'old793-'));
            write('oldstyle.clw', [
                '               PROGRAM', '', '               MAP', "                 MODULE('oldstyle1.clw')",
                '                   Test (LONG)', '                 END', '               END', '', '  CODE', '  Test (0)', '  RETURN',
            ]);
        });
        teardown(() => { TokenCache.getInstance().clearAllTokens(); fs.rmSync(dir, { recursive: true, force: true }); });

        test('names only in the implementation: no mismatch on either side', async () => {
            write('oldstyle1.clw', ['', "               MEMBER('oldstyle.clw')", '', 'Test  PROCEDURE (q)', '  CODE', '  MESSAGE (q)', '  RETURN']);
            assert.deepStrictEqual(await mismatches('oldstyle1.clw'), []);
            assert.deepStrictEqual(await mismatches('oldstyle.clw'), []);
        });

        test('a typed parameter of another type is still a mismatch', async () => {
            write('oldstyle1.clw', ['', "               MEMBER('oldstyle.clw')", '', 'Test  PROCEDURE (STRING q)', '  CODE', '  RETURN']);
            assert.deepStrictEqual(await mismatches('oldstyle1.clw'), ['map-signature-mismatch@3']);
        });

        test('an overloaded procedure needs typed parameters: a label-only implementation still mismatches', async () => {
            // Compiler-verified (Clarion 10, 12): with Test (LONG) and Test (*STRING), Test PROCEDURE (q)
            // reads q as a type — "Label in prototype not defined: Q", "No matching prototype available".
            write('oldstyle.clw', [
                '               PROGRAM', '               MAP', "                 MODULE('oldstyle1.clw')",
                '                   Test (LONG)', '                   Test (*STRING)', '                 END', '               END', '  CODE',
            ]);
            write('oldstyle1.clw', ['', "               MEMBER('oldstyle.clw')", '', 'Test  PROCEDURE (q)', '  CODE', '  RETURN']);
            assert.ok((await mismatches('oldstyle.clw')).length > 0, 'the overloaded prototypes are not all matched');
            assert.ok(!ProcedureSignatureUtils.parametersMatch(ProcedureSignatureUtils.extractImplementationParameterTypes('Test PROCEDURE (q)', true), ['LONG']));
        });

        test('a different number of parameters is still a mismatch', async () => {
            write('oldstyle1.clw', ['', "               MEMBER('oldstyle.clw')", '', 'Test  PROCEDURE (q, r)', '  CODE', '  RETURN']);
            assert.deepStrictEqual(await mismatches('oldstyle1.clw'), ['map-signature-mismatch@3']);
        });
    });
});
