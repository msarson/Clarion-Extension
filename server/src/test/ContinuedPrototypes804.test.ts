import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateClassInterfaceImplementationAsync } from '../providers/diagnostics/ClassDiagnostics';

/**
 * #804 / #805 — a prototype continued with `|`, in two shapes taken from a real interface
 * declaration (an Excel library binding):
 * - the label alone on its line, `PROCEDURE` on the next, so long labels keep the keywords aligned;
 * - a parameter list spread over several lines.
 * #804: the Outline showed each label-alone prototype as an entry with no name, `| (SIGNED)`.
 * #805: the interface-implementation check reported such methods as not implemented, though the
 * class implements every one on a single line.
 */
const IFACE = [
    'xlFormat            INTERFACE',                                                    // 0
    'xlSetBorderDiagonalStyle |',                                                       // 1
    '                      PROCEDURE (SIGNED)          ! value is a BORDERSTYLE_* equate', // 2
    '',                                                                                 // 3
    'xlBorderDiagonalColor PROCEDURE (),SIGNED',                                        // 4
    'xlSetBorderDiagonalColor |',                                                       // 5
    '                      PROCEDURE (SIGNED)',                                         // 6
    'RGB                   PROCEDURE (SIGNED r, |',                                     // 7
    '                                 SIGNED g, |',                                     // 8
    '                                 SIGNED b),SIGNED  ! For use in the RGB mode',     // 9
    'RGB                   PROCEDURE (LONG rgb),SIGNED  ! For use in the RGB mode',     // 10
    '                    END',                                                          // 11
];

suite('#804 — Outline: a prototype continued with | keeps its name', () => {
    setup(() => setServerInitialized(true));

    function interfaceChildren(): ClarionDocumentSymbol[] {
        const source = ['  MEMBER()', ...IFACE].join('\r\n');
        const tokens = new ClarionTokenizer(source).tokenize();
        const symbols = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'test://xl.inc');
        const flat: ClarionDocumentSymbol[] = [];
        const walk = (list: ClarionDocumentSymbol[]) => list.forEach(s => { flat.push(s); walk((s.children ?? []) as ClarionDocumentSymbol[]); });
        walk(symbols);
        const iface = flat.find(s => /INTERFACE/.test(s.name) || /INTERFACE/.test(String(s.detail ?? '')));
        assert.ok(iface, `no INTERFACE symbol; got ${JSON.stringify(flat.map(s => s.name))}`);
        return (iface!.children ?? []) as ClarionDocumentSymbol[];
    }

    test('bug-pin: each method is one entry under its own label, none named "|"', () => {
        const names = interfaceChildren().map(s => s.name);
        assert.ok(!names.some(n => n.trim().startsWith('|') || n.trim() === ''), JSON.stringify(names));
        for (const label of ['xlSetBorderDiagonalStyle', 'xlBorderDiagonalColor', 'xlSetBorderDiagonalColor', 'RGB']) {
            assert.ok(names.some(n => n.startsWith(label)), `${label} missing: ${JSON.stringify(names)}`);
        }
        assert.strictEqual(names.length, 5, JSON.stringify(names));
    });
});

suite('#805 — interface implementation: a continued prototype is matched in full', () => {
    let n = 0;
    async function diags(lines: string[]) {
        const doc = TextDocument.create(`file:///continued-805-${++n}.clw`, 'clarion', 1, lines.join('\n'));
        return validateClassInterfaceImplementationAsync(TokenCache.getInstance().getTokens(doc), doc, new MemberLocatorService());
    }
    const PROGRAM = (impls: string[]) => [
        '  PROGRAM',
        '  MAP',
        '  END',
        ...IFACE,
        'XLClass             CLASS,TYPE,IMPLEMENTS(xlFormat)',
        '                    END',
        '  CODE',
        '  RETURN',
        ...impls.flatMap(i => [i, '  CODE', '  RETURN', '']),
    ];
    const ALL = [
        'XLClass.xlFormat.xlSetBorderDiagonalStyle PROCEDURE(SIGNED s)',
        'XLClass.xlFormat.xlBorderDiagonalColor PROCEDURE()',
        'XLClass.xlFormat.xlSetBorderDiagonalColor PROCEDURE(SIGNED c)',
        'XLClass.xlFormat.RGB PROCEDURE(SIGNED r, SIGNED g, SIGNED b)',
        'XLClass.xlFormat.RGB PROCEDURE(LONG rgb)',
    ];

    test('bug-pin: every method implemented on one line — no warning', async () => {
        const d = await diags(PROGRAM(ALL));
        assert.deepStrictEqual(d.map(x => x.message), []);
    });

    test('the three-parameter RGB left out — that one is reported, and only it', async () => {
        const d = await diags(PROGRAM(ALL.filter(i => !/SIGNED r, SIGNED g/.test(i))));
        assert.strictEqual(d.length, 1, JSON.stringify(d.map(x => x.message)));
        assert.match(String(d[0].message), /'xlFormat\.RGB'/);
    });

    test('a label-alone method left out — reported by its name', async () => {
        const d = await diags(PROGRAM(ALL.filter(i => !/xlSetBorderDiagonalColor/.test(i))));
        assert.strictEqual(d.length, 1, JSON.stringify(d.map(x => x.message)));
        assert.match(String(d[0].message), /'xlFormat\.xlSetBorderDiagonalColor'/);
    });
});
