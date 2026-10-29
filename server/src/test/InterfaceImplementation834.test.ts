import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { setServerInitialized } from '../serverState';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { validateClassInterfaceImplementationAsync } from '../providers/diagnostics/ClassDiagnostics';
import { TokenType } from '../tokenizer/TokenTypes';

/**
 * #834 — the interface-implementation check reported implemented methods as missing:
 * - a method with the same label as a field of the implementing class (`Proxy` / `proxy`);
 * - a method labelled like a keyword (`Data`);
 * - a method whose colon-typed reference parameters are continued over several lines with `|`.
 */
const IFACES = [
    'Net:Query           INTERFACE',
    'Clear                 PROCEDURE()',
    '                    END',
    'Net:Answer          INTERFACE',
    'Data                  PROCEDURE(),STRING',
    'Status                PROCEDURE(),LONG',
    '                    END',
    'Net:Session         INTERFACE',
    'Proxy                 PROCEDURE(STRING host)',
    'Query                 PROCEDURE(STRING url, |',
    '                                *Net:Query request, |',
    '                                *Net:Answer answer, |',
    '                                <LONG timeout>),SIGNED',
    'Close                 PROCEDURE()',
    '                    END',
];

const CLASSES = [
    'NetSession          CLASS,TYPE,IMPLEMENTS(Net:Session)',
    'host                  STRING(80)',
    'proxy                 &STRING',
    'timeout               LONG',
    'Init                  PROCEDURE()',
    '                    END',
    'NetAnswer           CLASS,TYPE,IMPLEMENTS(Net:Answer)',
    'body                  &STRING',
    '                    END',
];

const IMPLS: Record<string, string[]> = {
    init: ['NetSession.Init PROCEDURE()'],
    proxy: ['NetSession.Net:Session.Proxy PROCEDURE(STRING host)'],
    query: [
        'NetSession.Net:Session.Query PROCEDURE(STRING url, |',
        '                                   *Net:Query request, |',
        '                                   *Net:Answer answer, |',
        '                                   <LONG timeout>)',
    ],
    close: ['NetSession.Net:Session.Close PROCEDURE()'],
    data: ['NetAnswer.Net:Answer.Data PROCEDURE()'],
    status: ['NetAnswer.Net:Answer.Status PROCEDURE()'],
};

suite('#834 — interface implementation: field-named, keyword-named and continued colon-typed methods', () => {
    setup(() => setServerInitialized(true));

    let n = 0;
    async function messages(skip: string[] = []): Promise<string[]> {
        const impls = Object.entries(IMPLS).filter(([k]) => !skip.includes(k)).map(([, v]) => v);
        const lines = [
            '  PROGRAM',
            '  MAP',
            '  END',
            ...IFACES,
            ...CLASSES,
            '  CODE',
            '  RETURN',
            ...impls.flatMap(i => [...i, '  CODE', '  RETURN', '']),
        ];
        const doc = TextDocument.create(`file:///iface-834-${++n}.clw`, 'clarion', 1, lines.join('\r\n'));
        const d = await validateClassInterfaceImplementationAsync(TokenCache.getInstance().getTokens(doc), doc, new MemberLocatorService());
        return d.filter(x => x.code === 'unimplemented-interface-method').map(x => String(x.message));
    }

    test('bug-pin: every method implemented — no warning', async () => {
        assert.deepStrictEqual(await messages(), []);
    });

    test('a method named Data or Code is a method implementation; DATA and CODE alone stay markers', () => {
        const src = ["  MEMBER('x')", 'Cls.Data PROCEDURE()', '  DATA', 'n LONG', '  CODE', 'Cls.Net:Answer.Code PROCEDURE()', '  CODE'].join('\r\n');
        const tokens = TokenCache.getInstance().getTokens(TextDocument.create(`file:///iface-834-${++n}.clw`, 'clarion', 1, src));
        const procs = tokens.filter(t => t.type === TokenType.Procedure).map(t => `${t.label}/${TokenType[t.subType as TokenType]}`);
        assert.deepStrictEqual(procs, ['Cls.Data/MethodImplementation', 'Cls.Net:Answer.Code/MethodImplementation']);
        const markers = tokens.filter(t => t.type === TokenType.ExecutionMarker).map(t => `${t.line}:${t.value}`);
        assert.deepStrictEqual(markers, ['2:DATA', '4:CODE', '6:CODE']);
    });

    for (const [key, name] of [['proxy', 'Net:Session.Proxy'], ['query', 'Net:Session.Query'], ['data', 'Net:Answer.Data'], ['close', 'Net:Session.Close']]) {
        test(`control: ${name} really missing — reported, and only it`, async () => {
            const m = await messages([key]);
            assert.strictEqual(m.length, 1, JSON.stringify(m));
            assert.ok(m[0].includes(`'${name}'`), m[0]);
        });
    }
});
