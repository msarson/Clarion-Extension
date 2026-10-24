import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateIndistinguishablePrototypes } from '../providers/diagnostics/IndistinguishablePrototypeDiagnostics';

/**
 * #761 — a keyword-less MAP prototype (`memcpy(*?, *?, UNSIGNED)`) read as having no
 * parameters, so every keyword-less overload pair was "callable with zero arguments".
 *
 * Each pair below was compiled in one MAP on Clarion 10.0.12567 and 12.0.14204; both
 * agree. `rejected` is the compiler's "Indistinguishable new prototype". Every pair is
 * checked in both prototype forms: keyword-less (indented) and with PROCEDURE (column 1).
 */
const COMPILED: { a: string; b: string; rejected: boolean }[] = [
    { a: "memcpy(*?, *?, UNSIGNED),*?,PROC,RAW,NAME('_memcpy')", b: "memcpy(LONG,LONG,UNSIGNED),LONG,PROC,NAME('_memcpy')", rejected: false },
    { a: 'P(*?)', b: 'P(LONG)', rejected: false },
    { a: 'P(*?)', b: 'P(*?,LONG)', rejected: false },
    { a: 'P(*LONG)', b: 'P(LONG)', rejected: false },
    { a: 'P(*STRING)', b: 'P(LONG)', rejected: false },
    { a: 'P(?)', b: 'P(LONG)', rejected: true },
    { a: 'P(LONG)', b: 'P(ULONG)', rejected: true },
    { a: 'P(LONG)', b: 'P(STRING)', rejected: true },
    { a: 'P(LONG)', b: 'P(LONG X)', rejected: true },
    { a: 'P(*?,*?,UNSIGNED)', b: 'P(*?,*?,UNSIGNED)', rejected: true },
];

/** `memcpy(...)` as `memcpy PROCEDURE(...)`, label at column 1. */
function withKeyword(proto: string): string {
    return proto.replace(/^(\w+)\(/, '$1 PROCEDURE(');
}

function flagged(a: string, b: string): boolean {
    const text = ['  PROGRAM', '  MAP', "    MODULE('')", a, b, '    END', '  END', '  CODE', '  RETURN'].join('\r\n');
    const doc = TextDocument.create('file:///c:/t761/t761.clw', 'clarion', 1, text);
    return validateIndistinguishablePrototypes(new ClarionTokenizer(text).tokenize(), doc).length > 0;
}

suite('Indistinguishable prototypes agree with the compiler, keyword or not (#761)', () => {
    for (const { a, b, rejected } of COMPILED) {
        test(`${a}  /  ${b}  ->  ${rejected ? 'rejected' : 'builds'}`, () => {
            assert.strictEqual(flagged('      ' + a, '      ' + b), rejected, 'keyword-less form');
            assert.strictEqual(flagged(withKeyword(a), withKeyword(b)), rejected, 'PROCEDURE form');
        });
    }
});
