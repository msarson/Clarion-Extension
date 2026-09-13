import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location, Hover } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer, inheritsMembersFromParent } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

/**
 * A field inherited through `QUEUE(ParentType)` / `GROUP(ParentType)` was
 * unresolvable on a chained access: hover and go-to-definition both returned
 * nothing for `SELF.records.alpha` when `alpha` is declared in the parent
 * GROUP rather than in the queue's own body, while a field declared directly
 * in that body (`SELF.records.ownField`) resolved fine.
 *
 * Root cause: both entry points to the parent walk gated the ascent on the
 * structure being a CLASS —
 *   `MemberLocatorService.walkParentChain`            (chained-hover path)
 *   `ClassMemberResolver.findMemberInNamedStructure`  (chained definition path)
 * — so a QUEUE/GROUP whose `parentName` the indexer had already recorded
 * correctly simply stopped at the child body. Everything downstream was
 * already structure-agnostic: the recursive `findMemberInParentChain` ascends
 * on `parentName` alone with no type check, and the body scans accept
 * CLASS/GROUP/QUEUE. Only the two gates disagreed.
 *
 * The declaration-side unwrap for these same types was fixed earlier (PR #383,
 * `extractClassName` unwrapping `GROUP(TypeName)`), so the producer understood
 * structured-type parents while these two consumers did not — the drift shape
 * that `inheritsMembersFromParent` now exists to prevent.
 *
 * Needs a disk fixture + mock solution for the same reason as
 * ChainedOverloadResolution.DiskFixture.test.ts: the chained path resolves
 * intermediate segments through the SDI, which only indexes on-disk files.
 */

interface DiskFixture {
    tmpRoot: string;
    callerUri: string;
    callerDoc: TextDocument;
}

let _savedSm: SolutionManager | null = null;
let _savedRedirectionFile = '';
let _savedLibsrcPaths: string[] = [];
let _active = false;

/** 0-based lines in myclasses.inc, asserted against by the definition tests. */
const INC_ALPHA_LINE = 1;           // in the parent GROUP body
const INC_BETA_LINE = 2;            // in the parent GROUP body
const INC_OWNFIELD_LINE = 6;        // in the QUEUE's own body
const INC_OWNGROUPFIELD_LINE = 10;  // in the derived GROUP's own body

/** 0-based call-site lines in caller.clw. */
const CALL_OWNFIELD = 5;
const CALL_ALPHA = 6;
const CALL_OWNGROUPFIELD = 7;
const CALL_BETA = 8;

function buildDiskFixture(): DiskFixture {
    if (_active) {
        throw new Error('Structured-type parent-ascent fixture already active — teardown first');
    }
    _active = true;

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parent-ascent-'));

    const incContent = [
        'BaseFieldsGroupType GROUP,TYPE',        // 0
        'alpha               STRING(32)',        // 1  ← inherited target
        'beta                LONG',              // 2  ← inherited target
        '        END',                           // 3
        '',                                      // 4
        'DerivedQueueType    QUEUE(BaseFieldsGroupType),TYPE', // 5
        'ownField            LONG',              // 6  ← own-body control
        '        END',                           // 7
        '',                                      // 8
        'DerivedGroupType    GROUP(BaseFieldsGroupType),TYPE',  // 9
        'ownGroupField       LONG',              // 10 ← own-body control
        '        END',                           // 11
        '',                                      // 12
        'HolderClass CLASS,TYPE',                // 13
        'records     &DerivedQueueType',         // 14
        'layout      &DerivedGroupType',         // 15
        'DoIt        PROCEDURE',                 // 16
        '        END',                           // 17
        '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpRoot, 'myclasses.inc'), incContent);

    // Minimal redirection file — must exist + parse so the SDI gate passes; the
    // scanned dir itself comes from serverSettings.libsrcPaths.
    fs.writeFileSync(path.join(tmpRoot, 'test.red'), '[Copy]\n*.inc = .\n');

    const callerContent = [
        '  MEMBER()',                              // 0
        "  INCLUDE('myclasses.inc')",              // 1
        '',                                        // 2
        'HolderClass.DoIt PROCEDURE',              // 3
        '  CODE',                                  // 4
        '  SELF.records.ownField = 1',             // 5  own body, QUEUE
        "  SELF.records.alpha = 'x'",              // 6  inherited via QUEUE(parent)
        '  SELF.layout.ownGroupField = 2',         // 7  own body, GROUP
        '  SELF.layout.beta = 3',                  // 8  inherited via GROUP(parent)
        '  RETURN',                                // 9
    ].join('\n');
    const callerPath = path.join(tmpRoot, 'caller.clw');
    fs.writeFileSync(callerPath, callerContent);
    const callerUri = `file:///${callerPath.replace(/\\/g, '/')}`;

    _savedRedirectionFile = serverSettings.redirectionFile;
    _savedLibsrcPaths = serverSettings.libsrcPaths;
    serverSettings.redirectionFile = 'test.red';
    serverSettings.libsrcPaths = [tmpRoot];

    const fakeProject = {
        name: 'TestProj',
        path: tmpRoot,
        sourceFiles: [
            { relativePath: 'caller.clw', getAbsolutePath: () => callerPath }
        ],
        getRedirectionParser: () => ({ findFile: (_: string) => null })
    };
    const fakeSm = {
        solution: { projects: [fakeProject] },
        findProjectForFile: () => fakeProject,
        getProjectPathForFile: () => tmpRoot,
        getEquatesTokens: () => null,
        getEquatesPath: () => null
    } as unknown as SolutionManager;

    _savedSm = (SolutionManager as unknown as { instance: SolutionManager | null }).instance;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = fakeSm;

    StructureDeclarationIndexer.getInstance().clearCache();

    const callerDoc = TextDocument.create(callerUri, 'clarion', 1, callerContent);
    TokenCache.getInstance().getTokens(callerDoc);

    return { tmpRoot, callerUri, callerDoc };
}

function teardownDiskFixture(fix: DiskFixture | null): void {
    if (!_active) return;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = _savedSm;
    _savedSm = null;
    serverSettings.redirectionFile = _savedRedirectionFile;
    serverSettings.libsrcPaths = _savedLibsrcPaths;
    StructureDeclarationIndexer.getInstance().clearCache();
    if (fix) {
        TokenCache.getInstance().clearTokens(fix.callerUri);
        try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    _active = false;
}

function lineOf(result: Location | Location[] | null | undefined): number {
    if (!result) return -1;
    if (Array.isArray(result)) return result.length > 0 ? result[0].range.start.line : -1;
    return result.range.start.line;
}

function hoverText(h: Hover | null | undefined): string {
    if (!h) return '';
    const c = h.contents as unknown;
    if (typeof c === 'string') return c;
    if (c && typeof (c as { value?: string }).value === 'string') return (c as { value: string }).value;
    return '';
}

/** Cursor one char inside the field identifier at each call site. */
const CHAR_AFTER_RECORDS = 16; // "  SELF.records." is 15 chars; field starts at 15
const CHAR_AFTER_LAYOUT = 15;  // "  SELF.layout."  is 14 chars; field starts at 14

suite('Structured-type parent ascent — QUEUE(Parent) / GROUP(Parent) inherited fields', () => {

    let fix: DiskFixture | null = null;

    teardown(() => {
        teardownDiskFixture(fix);
        fix = null;
    });

    // ── the predicate itself ──────────────────────────────────────────────────
    test('inheritsMembersFromParent covers the field-inheriting structures only', () => {
        assert.strictEqual(inheritsMembersFromParent('CLASS'), true);
        assert.strictEqual(inheritsMembersFromParent('QUEUE'), true);
        assert.strictEqual(inheritsMembersFromParent('GROUP'), true);
        // VIEW(File) names a join's primary file, not an inherited layout.
        assert.strictEqual(inheritsMembersFromParent('VIEW'), false);
        assert.strictEqual(inheritsMembersFromParent('FILE'), false);
        assert.strictEqual(inheritsMembersFromParent(undefined), false);
    });

    // ── the indexer already had the parent link ───────────────────────────────
    test('indexer records the parenthesised parent for QUEUE and GROUP', async () => {
        fix = buildDiskFixture();
        const sdi = StructureDeclarationIndexer.getInstance();
        await sdi.getOrBuildIndex(fix.tmpRoot);
        const queueInfo = sdi.find('DerivedQueueType')[0];
        const groupInfo = sdi.find('DerivedGroupType')[0];
        assert.ok(queueInfo, 'DerivedQueueType must be indexed');
        assert.ok(groupInfo, 'DerivedGroupType must be indexed');
        assert.strictEqual(queueInfo.structureType, 'QUEUE');
        assert.strictEqual(queueInfo.parentName, 'BaseFieldsGroupType',
            'the parent link the ascent needs was always present — only the gate rejected it');
        assert.strictEqual(groupInfo.structureType, 'GROUP');
        assert.strictEqual(groupInfo.parentName, 'BaseFieldsGroupType');
    });

    // ── QUEUE(Parent): the reported shape ─────────────────────────────────────
    test('go-to-definition resolves a field inherited through QUEUE(Parent)', async () => {
        fix = buildDiskFixture();
        const provider = new DefinitionProvider();
        const line = lineOf(await provider.provideDefinition(
            fix.callerDoc, { line: CALL_ALPHA, character: CHAR_AFTER_RECORDS }));
        assert.strictEqual(line, INC_ALPHA_LINE,
            `SELF.records.alpha must resolve into the parent GROUP (.inc line ${INC_ALPHA_LINE}); got ${line}`);
    });

    test('hover resolves a field inherited through QUEUE(Parent)', async () => {
        fix = buildDiskFixture();
        const provider = new HoverProvider();
        const text = hoverText(await provider.provideHover(
            fix.callerDoc, { line: CALL_ALPHA, character: CHAR_AFTER_RECORDS }));
        assert.notStrictEqual(text, '', 'SELF.records.alpha must produce a hover, not nothing');
        assert.ok(/alpha/i.test(text), `hover must describe alpha; got: ${text}`);
    });

    // ── GROUP(Parent): the same gate, the commoner declaration form ───────────
    test('go-to-definition resolves a field inherited through GROUP(Parent)', async () => {
        fix = buildDiskFixture();
        const provider = new DefinitionProvider();
        const line = lineOf(await provider.provideDefinition(
            fix.callerDoc, { line: CALL_BETA, character: CHAR_AFTER_LAYOUT }));
        assert.strictEqual(line, INC_BETA_LINE,
            `SELF.layout.beta must resolve into the parent GROUP (.inc line ${INC_BETA_LINE}); got ${line}`);
    });

    test('hover resolves a field inherited through GROUP(Parent)', async () => {
        fix = buildDiskFixture();
        const provider = new HoverProvider();
        const text = hoverText(await provider.provideHover(
            fix.callerDoc, { line: CALL_BETA, character: CHAR_AFTER_LAYOUT }));
        assert.notStrictEqual(text, '', 'SELF.layout.beta must produce a hover, not nothing');
        assert.ok(/beta/i.test(text), `hover must describe beta; got: ${text}`);
    });

    // ── regression guards: own-body fields must keep resolving ────────────────
    test('a field in the QUEUE own body still resolves (regression guard)', async () => {
        fix = buildDiskFixture();
        const provider = new DefinitionProvider();
        const line = lineOf(await provider.provideDefinition(
            fix.callerDoc, { line: CALL_OWNFIELD, character: CHAR_AFTER_RECORDS }));
        assert.strictEqual(line, INC_OWNFIELD_LINE,
            `SELF.records.ownField must still resolve to the queue's own body (.inc line ${INC_OWNFIELD_LINE}); got ${line}`);
    });

    test('a field in the derived GROUP own body still resolves (regression guard)', async () => {
        fix = buildDiskFixture();
        const provider = new DefinitionProvider();
        const line = lineOf(await provider.provideDefinition(
            fix.callerDoc, { line: CALL_OWNGROUPFIELD, character: CHAR_AFTER_LAYOUT }));
        assert.strictEqual(line, INC_OWNGROUPFIELD_LINE,
            `SELF.layout.ownGroupField must still resolve to its own body (.inc line ${INC_OWNGROUPFIELD_LINE}); got ${line}`);
    });
});
