import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { validateAttributeApplicability } from '../providers/diagnostics/AttributeDiagnostics';

/**
 * #842 — EXPORT is not in the Clarion help, but the compiler has accepted it since Clarion 6:
 * it puts the declaration in the export list of the DLL being built. Compiled on Clarion 10 and
 * 12, it is accepted on a MAP prototype (with or without NAME), a variable, a THREAD variable, a
 * GROUP, a QUEUE, a FILE and a CLASS; `FILE,...,EXPORTX` fails with "Invalid FILE attribute".
 * Hovering it showed nothing, and on a FILE it was still warned as not a known attribute.
 */
const CODE = [
    '  PROGRAM',                                                    // 0
    '  MAP',                                                        // 1
    "Proc1          PROCEDURE(LONG a),LONG,EXPORT",                 // 2
    "Proc2          PROCEDURE(LONG a),LONG,EXPORT,NAME('Proc2')",   // 3
    '  END',                                                        // 4
    'Gv             LONG,EXPORT',                                   // 5
    'Tv             STRING(20),THREAD,EXPORT',                      // 6
    'Grp            GROUP,EXPORT',                                  // 7
    'A                LONG',                                        // 8
    '               END',                                           // 9
    'Q              QUEUE,EXPORT',                                  // 10
    'B                LONG',                                        // 11
    '               END',                                           // 12
    "F              FILE,DRIVER('TOPSPEED'),EXPORT",                // 13
    'Rec              RECORD',                                      // 14
    'C                  LONG',                                      // 15
    '                 END',                                         // 16
    '               END',                                           // 17
    'Base           CLASS,TYPE,EXPORT',                             // 18
    'M                PROCEDURE',                                   // 19
    '               END',                                           // 20
    '  CODE',                                                       // 21
    '  RETURN',                                                     // 22
];

suite('EXPORT: a card, and accepted wherever the compiler accepts it (#842)', () => {

    async function hoverExport(line: number): Promise<string> {
        const tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
        const doc = TextDocument.create('test://export842.clw', 'clarion', 1, CODE.join('\n'));
        tokenCache.getTokens(doc);
        const at = CODE[line].indexOf('EXPORT');
        const hover = await new HoverProvider().provideHover(doc, Position.create(line, at + 1));
        tokenCache.clearAllTokens();
        if (!hover) return '';
        const c = hover.contents as { value?: string } | string;
        return typeof c === 'string' ? c : c.value ?? '';
    }

    // On a CLASS or a variable an attribute has no card yet; #843 adds one for every attribute there.
    for (const [line, what] of [[2, 'a MAP prototype'], [13, 'a FILE']] as [number, string][]) {
        test(`EXPORT on ${what} has its card`, async () => {
            const text = await hoverExport(line);
            assert.ok(/Attribute: EXPORT\b/.test(text), `line ${line}:\n${text}`);
            assert.ok(/export list/i.test(text), `line ${line}:\n${text}`);
        });
    }

    test('no attribute diagnostic on any of them; a misspelling on a FILE is still reported', () => {
        const diagnose = (lines: string[]) => {
            const text = lines.join('\n');
            return validateAttributeApplicability(new ClarionTokenizer(text).tokenize(),
                TextDocument.create('test://export842.clw', 'clarion', 1, text))
                .map(d => `${d.range.start.line}: ${d.message}`);
        };
        assert.deepStrictEqual(diagnose(CODE), []);
        const misspelt = CODE.map(l => l.replace("DRIVER('TOPSPEED'),EXPORT", "DRIVER('TOPSPEED'),EXPORTX"));
        assert.deepStrictEqual(diagnose(misspelt).filter(d => d.startsWith('13:')).length, 1, JSON.stringify(diagnose(misspelt)));
    });
});
