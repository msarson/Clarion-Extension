import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer, TokenType, Token } from '../ClarionTokenizer';
import { CompletionProvider } from '../providers/CompletionProvider';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * Dot completion on a variable whose structure type argument is COLON-QUALIFIED —
 * `Settings GROUP(CFG:ConnectionSettingsType) END` — offered none of the type's
 * fields, falling back to the ambient word list. The same declaration written with
 * an unqualified type name worked.
 *
 * Root cause: `SymbolFinderService.extractTypeInfo` scans the structure keyword's
 * first (...) group for the type argument, accepting only `Label` / `Variable`
 * tokens. A colon-qualified name never arrives as either, in EITHER of the two
 * shapes the tokenizer produces for it — its PREFIX:Field pattern caps the prefix
 * at 8 characters:
 *
 *   prefix <= 8   `CFG:ConnectionSettingsType`     one StructurePrefix token
 *   prefix >= 9   `LONGPREFIX9:SomeGroupType`      Variable ':' Variable
 *
 * so the first shape dropped the argument outright (`GROUP`) and the second
 * truncated it to the bare prefix (`GROUP(LONGPREFIX9)`) — a confidently wrong
 * type name, which is the worse of the two.
 *
 * Downstream, `MemberLocatorService.extractTypeFromToken` matched the assembled
 * string with `\((\w+)\)`, which excludes ':' — so even a correctly assembled
 * `GROUP(CFG:...)` failed that match and fell through to the bare-keyword branch,
 * which resolves a Label-declared variable to ITS OWN NAME as its type. Member
 * enumeration then looked up a structure named after the variable, found nothing,
 * and completion silently returned an empty member list.
 *
 * The declaration side was never implicated: a colon-qualified `GROUP,TYPE` label
 * tokenizes as a single column-0 `Label`, and the `Structure` token carries it
 * verbatim as `.label` — so once the reference side assembles the same string, the
 * existing body scans match it unchanged. The equivalent unwrap on the CHAINED
 * access path (`ClassMemberResolver.extractClassName`) already allowed ':' — this
 * is the plain, single-segment path that did not.
 *
 * The fixture keeps the type in the SAME document as the variable: the cross-file
 * tier that finds a type declared in an INCLUDE is orthogonal to this fix and was
 * never broken.
 */

const SOURCE_LINES = [
    '  PROGRAM',
    '',
    'CFG:ConnectionSettingsType GROUP,TYPE',
    'Address                      STRING(64)',
    'Port                         LONG',
    '                           END',
    '',
    'LONGPREFIX9:SomeGroupType  GROUP,TYPE',
    'Alpha                        STRING(32)',
    'Beta                         LONG',
    '                           END',
    '',
    'PlainSettingsType          GROUP,TYPE',
    'Address                      STRING(64)',
    '                           END',
    '',
    'Settings     GROUP(CFG:ConnectionSettingsType) END',
    'Extended     GROUP(LONGPREFIX9:SomeGroupType) END',
    'Plain        GROUP(PlainSettingsType) END',
    '',
    '  CODE',
];

let n = 0;
async function complete(typed: string) {
    const lines = [...SOURCE_LINES, typed];
    const doc = TextDocument.create(`file:///C:/temp/colontypearg-${++n}.clw`, 'clarion', 1, lines.join('\n'));
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    cache.getTokens(doc);
    const isDot = typed.endsWith('.');
    const params = {
        textDocument: { uri: doc.uri },
        position: { line: SOURCE_LINES.length, character: typed.length },
        context: isDot ? { triggerKind: 2, triggerCharacter: '.' } : { triggerKind: 1 }
    } as any;
    return new CompletionProvider().onCompletion(params, doc);
}

function labelsOf(items: { label: unknown }[]): string[] {
    return items.map(i => String(i.label)).sort();
}

/** extractTypeInfo for the column-0 label declared on `line` of a one-off snippet. */
function typeInfoOf(declaration: string): string {
    const text = ['  PROGRAM', '', declaration, '', '  CODE', '  RETURN'].join('\n');
    const tokens: Token[] = new ClarionTokenizer(text).tokenize();
    const label = tokens.find(t => t.type === TokenType.Label && t.line === 2 && t.start === 0);
    assert.ok(label, `no column-0 label found in: ${declaration}`);
    return SymbolFinderService.extractTypeInfo(label!, tokens);
}

suite('Colon-qualified structure type argument — GROUP(CFG:SomeType)', () => {

    setup(() => setServerInitialized(true));

    // ── extractTypeInfo: the assembled type string ────────────────────────────
    test('a <=8-char prefix (one StructurePrefix token) keeps the whole type name', () => {
        assert.strictEqual(
            typeInfoOf('Settings     GROUP(CFG:ConnectionSettingsType) END'),
            'GROUP(CFG:ConnectionSettingsType)');
    });

    test('a >=9-char prefix (Variable \':\' Variable) is not truncated to the prefix', () => {
        assert.strictEqual(
            typeInfoOf('Extended     GROUP(LONGPREFIX9:SomeGroupType) END'),
            'GROUP(LONGPREFIX9:SomeGroupType)');
    });

    test('the same holds for CLASS and QUEUE', () => {
        assert.strictEqual(
            typeInfoOf('Handler      CLASS(CFG:BaseHandlerType) END'),
            'CLASS(CFG:BaseHandlerType)');
        assert.strictEqual(
            typeInfoOf('Rows         QUEUE(CFG:RowGroupType) END'),
            'QUEUE(CFG:RowGroupType)');
    });

    test('whitespace inside the parentheses is tolerated', () => {
        assert.strictEqual(
            typeInfoOf('Settings     GROUP( CFG:ConnectionSettingsType ) END'),
            'GROUP(CFG:ConnectionSettingsType)');
    });

    test('unqualified type arguments are unchanged (regression guard)', () => {
        assert.strictEqual(
            typeInfoOf('Plain        GROUP(PlainSettingsType) END'),
            'GROUP(PlainSettingsType)');
    });

    test('#486 PRE(...) is still not mistaken for a type argument (regression guard)', () => {
        // The group must IMMEDIATELY follow the keyword; PRE's argument is not it.
        assert.strictEqual(typeInfoOf('LineQ        QUEUE,PRE(LQ)'), 'QUEUE');
    });

    test('a bare structure keyword is unchanged (regression guard)', () => {
        assert.strictEqual(typeInfoOf('Settings     GROUP END'), 'GROUP');
    });

    // ── end to end: the reported symptom ──────────────────────────────────────
    test('a colon-qualified GROUP type offers its fields on dot', async () => {
        const items = await complete('  Settings.');
        assert.deepStrictEqual(labelsOf(items), ['Address STRING(64)', 'Port LONG']);
        // The label carries the declared type; the bare name is what gets inserted.
        assert.strictEqual(items.find(i => String(i.label).startsWith('Port'))?.insertText, 'Port');
    });

    test('a >=9-char prefix offers its fields too (the truncating shape)', async () => {
        const items = await complete('  Extended.');
        assert.deepStrictEqual(labelsOf(items), ['Alpha STRING(32)', 'Beta LONG']);
    });

    test('a typed partial narrows the same list', async () => {
        const items = await complete('  Settings.P');
        assert.deepStrictEqual(labelsOf(items), ['Port LONG']);
    });

    test('an unqualified type argument still offers its fields (regression guard)', async () => {
        const items = await complete('  Plain.');
        assert.deepStrictEqual(labelsOf(items), ['Address STRING(64)']);
    });
});
