import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind } from 'vscode-languageserver/node';
import { CompletionProvider } from '../providers/CompletionProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * #592 — completion never offered a ROUTINE label.
 *
 * Routines were the one callable kind the word list left out: hover, F12,
 * Ctrl+F12 and CodeLens had resolved them since #264, but `collectProcedures`
 * handled only MapProcedure / GlobalProcedure / MethodDeclaration. After `DO`,
 * where a routine is the ONLY legal operand, completion answered with the entire
 * word list — several hundred keywords, built-ins, data types and variables, and
 * not one routine among them.
 *
 * Underneath that sat a second defect. `WordCompletionProvider` tested
 * `t.type === TokenType.Routine` in three places, but `handleRoutineToken`
 * classifies a ROUTINE keyword as `type: Keyword` and records its routine-ness in
 * `subType`. All three comparisons were therefore dead — including the
 * `inferredRoutine` fallback that is supposed to recover routine scope when the
 * ScopeAnalyzer has only partial context.
 */

const SOURCE_LINES = [
    "  MEMBER('prog.clw')",
    '',
    'AlphaProc    PROCEDURE()',
    'LocalOne       LONG',
    '  CODE',
    '  !<<CURSOR>>',
    '',
    'SyncDisplay  ROUTINE',
    '  CODE',
    '  LocalOne = 1',
    '',
    'ResetFields  ROUTINE',
    '  CODE',
    '  LocalOne = 0',
    '',
    'Grid::Refresh ROUTINE',
    '  CODE',
    '  LocalOne = 2',
    '',
    'BetaProc     PROCEDURE()',
    '  CODE',
    '  !<<CURSOR>>',
    '',
    'SyncDisplay  ROUTINE',
    '  CODE',
    '  RETURN',
    '',
    'OtherOnly    ROUTINE',
    '  CODE',
    '  RETURN',
    '',
];

/** Line index of the placeholder inside each procedure's CODE section. */
const ALPHA_CURSOR = 5;
const BETA_CURSOR = 21;

let counter = 0;

/**
 * Replaces the placeholder on `cursorLine` with `typed` and completes at its end.
 * Every case gets a fresh URI: TokenCache is a singleton keyed by URI.
 */
async function completeAt(cursorLine: number, typed: string) {
    const lines = SOURCE_LINES.slice();
    lines[cursorLine] = typed;
    const doc = TextDocument.create(
        `file:///C:/temp/routine592-${++counter}.clw`, 'clarion', 1, lines.join('\n'));
    const cache = TokenCache.getInstance();
    cache.clearAllTokens();
    cache.getTokens(doc);
    return await new CompletionProvider().onCompletion(
        { textDocument: { uri: doc.uri }, position: { line: cursorLine, character: typed.length } },
        doc
    );
}

const labelsOf = (items: { label: string | unknown }[]) => items.map(i => String(i.label));

suite('Completion offers ROUTINE labels (#592)', function () {
    suiteSetup(() => setServerInitialized(true));

    suite('after DO', function () {
        test('returns the enclosing procedure routines and nothing else', async () => {
            const items = await completeAt(ALPHA_CURSOR, '  DO ');
            assert.deepStrictEqual(
                labelsOf(items).sort(),
                ['Grid::Refresh', 'ResetFields', 'SyncDisplay'],
                'DO should offer exactly the routines of the enclosing procedure'
            );
        });

        test('offers no keyword, built-in or variable — the reported symptom', async () => {
            const items = await completeAt(ALPHA_CURSOR, '  DO ');
            const labels = labelsOf(items).map(l => l.toUpperCase());
            for (const noise of ['IF', 'LOOP', 'CODE', 'STRING', 'LONG', 'MESSAGE', 'LOCALONE', 'BETAPROC']) {
                assert.ok(!labels.includes(noise),
                    `DO should not offer '${noise}' — it is not a legal DO operand`);
            }
        });

        test('never reaches another procedure routine', async () => {
            const items = await completeAt(ALPHA_CURSOR, '  DO ');
            assert.ok(!labelsOf(items).includes('OtherOnly'),
                'OtherOnly belongs to BetaProc and is not callable from AlphaProc');
        });

        test('resolves a repeated routine name to the enclosing procedure copy', async () => {
            // SyncDisplay is declared in BOTH procedures — legal, since routine
            // labels are procedure-local. Each side must see its own.
            const alpha = labelsOf(await completeAt(ALPHA_CURSOR, '  DO '));
            const beta = labelsOf(await completeAt(BETA_CURSOR, '  DO '));
            assert.ok(alpha.includes('SyncDisplay') && alpha.includes('ResetFields'));
            assert.deepStrictEqual(beta.sort(), ['OtherOnly', 'SyncDisplay']);
            assert.ok(!beta.includes('ResetFields'),
                'ResetFields belongs to AlphaProc only');
        });

        test('filters by the partial already typed, case-insensitively', async () => {
            assert.deepStrictEqual(labelsOf(await completeAt(ALPHA_CURSOR, '  DO Re')), ['ResetFields']);
            assert.deepStrictEqual(labelsOf(await completeAt(ALPHA_CURSOR, '  DO sy')), ['SyncDisplay']);
        });

        test('offers a generated Module::Name routine, and filters on the qualifier', async () => {
            assert.deepStrictEqual(labelsOf(await completeAt(ALPHA_CURSOR, '  DO Grid::')), ['Grid::Refresh']);
            assert.deepStrictEqual(labelsOf(await completeAt(ALPHA_CURSOR, '  DO Grid::Ref')), ['Grid::Refresh']);
        });

        test('marks each candidate as a routine', async () => {
            const items = await completeAt(ALPHA_CURSOR, '  DO ');
            for (const item of items) {
                assert.strictEqual(item.kind, CompletionItemKind.Method);
                assert.strictEqual(item.detail, 'ROUTINE');
                assert.strictEqual(item.documentation, 'Routine in AlphaProc',
                    'the owning procedure is named so a repeated label is identifiable');
            }
        });

        test('an empty list is the answer when the procedure declares no routine', async () => {
            const lines = [
                "  MEMBER('prog.clw')",
                '',
                'Lonely       PROCEDURE()',
                '  CODE',
                '  DO ',
            ];
            const doc = TextDocument.create(
                `file:///C:/temp/routine592-none-${++counter}.clw`, 'clarion', 1, lines.join('\n'));
            TokenCache.getInstance().clearAllTokens();
            TokenCache.getInstance().getTokens(doc);
            const items = await new CompletionProvider().onCompletion(
                { textDocument: { uri: doc.uri }, position: { line: 4, character: 5 } }, doc);
            assert.strictEqual(items.length, 0,
                'the word list is not a better answer than nothing — none of it is legal after DO');
        });

        test('does not hijack the DO inside a longer word', async () => {
            const items = await completeAt(ALPHA_CURSOR, '  UNDO ');
            assert.ok(items.length > 50,
                'UNDO is not DO — the general word list should still be returned');
        });

        test('does not fire while DO itself is still being typed', async () => {
            // No whitespace yet, so `DO` is the word being typed rather than a
            // statement with an operand: this must fall through to ordinary word
            // completion, which prefix-filters on "DO".
            const labels = labelsOf(await completeAt(ALPHA_CURSOR, '  DO'));
            assert.ok(labels.length > 0, 'word completion should still answer');
            assert.ok(labels.every(l => l.toUpperCase().startsWith('DO')),
                `word completion prefix-filters on the typed word; got ${labels.join(', ')}`);
            assert.ok(!labels.includes('SyncDisplay'),
                'the DO-operand list must not be substituted while DO is still being typed');
        });
    });

    suite('at a general position', function () {
        test('routines join the candidate list', async () => {
            const labels = labelsOf(await completeAt(ALPHA_CURSOR, '  '));
            assert.ok(labels.includes('SyncDisplay'), 'SyncDisplay should be a candidate');
            assert.ok(labels.includes('ResetFields'), 'ResetFields should be a candidate');
        });

        test('the rest of the word list is still there', async () => {
            const labels = labelsOf(await completeAt(ALPHA_CURSOR, '  ')).map(l => l.toUpperCase());
            assert.ok(labels.includes('LOCALONE'), 'locals must survive');
            assert.ok(labels.includes('IF'), 'keywords must survive');
            assert.ok(labels.includes('ALPHAPROC'), 'procedures must survive');
        });

        test('another procedure routine stays out of scope', async () => {
            const labels = labelsOf(await completeAt(ALPHA_CURSOR, '  '));
            assert.ok(!labels.includes('OtherOnly'));
        });

        test('a partial matches a routine', async () => {
            assert.ok(labelsOf(await completeAt(ALPHA_CURSOR, '  Sy')).includes('SyncDisplay'));
        });

        test('a generated Module::Name routine survives the qualifier filter', async () => {
            // A colon in the partial routes every candidate through the qualifier
            // branch, which filtered to Variable|Constant and so dropped routines.
            // That branch answers with the tail alone, as it does for a PRE field.
            const labels = labelsOf(await completeAt(ALPHA_CURSOR, '  Grid::'));
            assert.ok(labels.includes('Refresh'),
                'the Grid:: routine should be offered, shown as its trailing segment');
        });
    });
});
