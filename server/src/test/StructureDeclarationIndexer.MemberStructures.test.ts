import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { scanSourceForDeclarations, StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { StructureFieldResolver } from '../providers/hover/StructureFieldResolver';
import { TokenHelper } from '../utils/TokenHelper';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { serverSettings } from '../serverSettings';
import { HoverFormatter } from '../providers/hover/HoverFormatter';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { TokenCache } from '../TokenCache';

// A GROUP declared inside a CLASS body, or any structure nested in a `,TYPE` structure, is
// a member of its owner: it is reached through that owner, never by its bare name. The
// type scan indexed such members as global types, so an undeclared `Settings.` completed
// with some library class's `Settings` member fields, and the hover type walk then passed
// its SDI gate and reported the first column-0 `Settings` label in the include chain -
// a plain STRING field of a FILE record - as a TYPE with every later label as a "field".

const FAKE_FILE = 'test://members.inc';
const names = (src: string) => scanSourceForDeclarations(src, FAKE_FILE).map(r => r.name);

suite('StructureDeclarationIndexer - member structures are not global types', () => {

    test('a GROUP member of a CLASS body is not indexed; the CLASS is', () => {
        const n = names([
            'SomeWidgetClass   CLASS,TYPE,MODULE(\'widget.clw\')',
            'Settings            GROUP(SettingsType)',
            '                    END',
            'Init                PROCEDURE',
            '                  END',
        ].join('\n'));
        assert.deepStrictEqual(n, ['SomeWidgetClass']);
    });

    test('a GROUP nested in a GROUP,TYPE or QUEUE,TYPE is not indexed; the type is', () => {
        const n = names([
            'AddressType   GROUP,TYPE',
            'Street          STRING(40)',
            'Settings        GROUP',
            'Flags             LONG',
            '                END',
            '              END',
            'ItemQueueType QUEUE,TYPE',
            'Options         GROUP(OptionsType).',
            '              END',
        ].join('\n'));
        assert.deepStrictEqual(n, ['AddressType', 'ItemQueueType']);
    });

    test('a GROUP nested in a plain global GROUP is still indexed (unchanged)', () => {
        const n = names([
            'Globals       GROUP',
            'Settings        GROUP',
            'Flags             LONG',
            '                END',
            '              END',
        ].join('\n'));
        assert.deepStrictEqual(n, ['Globals', 'Settings']);
    });

    test('COMPILE/OMIT alternative CLASS headers share one body; later types still index', () => {
        const n = names([
            '   COMPILE(\'***\', _LibExternal_)',
            'RendererClass   CLASS,MODULE(\'runtime\'),EXTERNAL,DLL(1),TYPE',
            '   ***',
            '   OMIT(\'***\', _LibExternal_)',
            'RendererClass   CLASS,MODULE(\'render.clw\'),LINK(\'render.clw\'),TYPE',
            '   ***',
            'Options           GROUP(OptionsType)',
            '                  END',
            'Draw              PROCEDURE',
            '                END',
            'PainterClass    CLASS(RendererClass),TYPE',
            'Draw              PROCEDURE,DERIVED',
            '                END',
            'PaletteType     GROUP,TYPE',
            'Color             LONG',
            '                END',
        ].join('\n'));
        assert.deepStrictEqual(n, ['RendererClass', 'RendererClass', 'PainterClass', 'PaletteType']);
    });

    test('a structure closed on its own line does not swallow the types after it', () => {
        const n = names([
            'HolderClass   CLASS,TYPE',
            'Settings        GROUP(SettingsType) END',
            'Limits          GROUP(LimitType),PRE(LIM).',
            'Run             PROCEDURE',
            '              END',
            'AfterType     GROUP,TYPE',
            'Value           LONG',
            '              END',
        ].join('\n'));
        assert.deepStrictEqual(n, ['HolderClass', 'AfterType']);
    });

    test('an unterminated CLASS does not hide the next CLASS header', () => {
        assert.deepStrictEqual(names('FirstClass  CLASS\nOptions     GROUP\nSecondClass CLASS'), ['FirstClass', 'SecondClass']);
    });
});

suite('TokenHelper.findTypeDeclarationLabel', () => {
    const tokens = (src: string) => new ClarionTokenizer(src).tokenize();

    test('skips a same-named data field and finds the structure that declares the type', () => {
        const t = tokens([
            'Orders       FILE,DRIVER(\'TOPSPEED\'),PRE(ORD)',
            'Record         RECORD,PRE()',
            'Settings         STRING(200)',
            '               END',
            '             END',
            'Settings     GROUP,TYPE',
            'Flags          LONG',
            '             END',
        ].join('\n'));
        assert.strictEqual(TokenHelper.findTypeDeclarationLabel(t, 'settings')?.line, 5);
    });

    test('an EQUATE counts as a declaration; a label that only names data returns nothing', () => {
        const t = tokens('Limit     EQUATE(10)\nCounter   LONG');
        assert.strictEqual(TokenHelper.findTypeDeclarationLabel(t, 'Limit')?.line, 0);
        assert.strictEqual(TokenHelper.findTypeDeclarationLabel(t, 'Counter'), undefined);
    });
});

suite('HoverProvider - resolveTypeNameHover skips a same-named data field', () => {
    let tmpDir: string;
    let savedLibsrc: string[] = [];
    let savedRed = '';
    const indexer = StructureDeclarationIndexer.getInstance();

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-type-field-'));
        savedLibsrc = serverSettings.libsrcPaths;
        savedRed = serverSettings.redirectionFile;
        indexer.clearCache();
    });
    teardown(() => {
        serverSettings.libsrcPaths = savedLibsrc;
        serverSettings.redirectionFile = savedRed;
        indexer.clearCache();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('the walk passes a FILE field labelled like the type and reports the real GROUP,TYPE', async () => {
        // First include: a FILE whose record has a plain field labelled Settings.
        fs.writeFileSync(path.join(tmpDir, 'data.inc'), [
            'Orders       FILE,DRIVER(\'TOPSPEED\'),PRE(ORD)',
            'Record         RECORD,PRE()',
            'Settings         STRING(200)',
            'Notes            STRING(40)',
            '               END',
            '             END',
        ].join('\n'));
        // Second include: the real type.
        fs.writeFileSync(path.join(tmpDir, 'types.inc'), 'Settings     GROUP,TYPE\nFlags          LONG\n             END\n');
        const docPath = path.join(tmpDir, 'host.clw');
        fs.writeFileSync(docPath, `  PROGRAM\n  INCLUDE('data.inc')\n  INCLUDE('types.inc')\n`);
        // Put the SDI in the state a solution build leaves it in: it knows the type, so the
        // #361 gate lets the walk run.
        serverSettings.redirectionFile = 'test.red';   // getOrBuildIndex returns an empty index without one
        serverSettings.libsrcPaths = [tmpDir];
        await indexer.getOrBuildIndex(tmpDir);
        assert.ok(indexer.find('Settings', tmpDir).length > 0, 'precondition: the SDI knows Settings');

        const doc = TextDocument.create('file:///' + docPath.replace(/\\/g, '/'), 'clarion', 1, fs.readFileSync(docPath, 'utf8'));
        // Only the formatter's location link is used on this path; the other resolvers are not.
        const formatter = new HoverFormatter(new ScopeAnalyzer(TokenCache.getInstance(), undefined as never));
        const resolver = new StructureFieldResolver(formatter, undefined as never, undefined as never);
        const hover = await resolver.resolveTypeNameHover('Settings', doc);
        const md = hover ? String((hover.contents as { value: string }).value) : '';
        assert.ok(/GROUP Type/.test(md) && /types\.inc/.test(md), 'expected the GROUP in types.inc, got: ' + md);
        assert.ok(!/data\.inc/.test(md), 'the FILE field in data.inc must not be reported as the type');
    });
});
