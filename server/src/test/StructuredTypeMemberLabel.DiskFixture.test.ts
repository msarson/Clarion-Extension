import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { describeMemberOwner } from '../providers/hover/HoverFormatter';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

/**
 * Hover described every resolved member as a "Class Property" / "Class Method",
 * including members of a QUEUE or GROUP — so `SELF.records.queueField` reported
 * "Class Property · StandaloneQueueType", naming a queue field as a property of
 * a class.
 *
 * Root cause: `MemberInfo` — the shape every member lookup returns — carried no
 * record of the kind of structure the member was found in, only `className` and
 * an `isInterface?` flag. `HoverFormatter` therefore had a binary choice,
 * `info.isInterface ? 'Interface' : 'Class'`, and everything that was not an
 * INTERFACE fell through to "Class".
 *
 * The kind was known at every producer: `scanClassBodyForMember` matches the
 * declaration with a `(CLASS|QUEUE|GROUP|INTERFACE)` capture,
 * `findClassMemberInIncludes` captures the same keyword, and
 * `findMemberFromTokens` matches the structure token BY the requested kind. It
 * was simply dropped on the way out.
 *
 * Fix: `MemberInfo.structureType` carries the kind that was actually matched,
 * and `describeMemberOwner` turns it into the right pair of words — "Field" for
 * QUEUE/GROUP members, matching the noun hover already uses for structure
 * members elsewhere (`**<Type> Field:**` in StructureFieldResolver).
 *
 * The fixture deliberately uses fields declared in each structure's OWN body, so
 * it exercises the labelling alone and does not depend on parent-type ascent.
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

/** 0-based call-site lines in caller.clw. */
const CALL_QUEUE_FIELD = 5;
const CALL_GROUP_FIELD = 6;
const CALL_CLASS_PROP = 7;
const CALL_CLASS_METHOD = 8;

/** Cursor one char inside the member identifier at each call site. */
const CHAR_AFTER_RECORDS = 16;  // "  SELF.records." → member starts at 15
const CHAR_AFTER_LAYOUT = 15;   // "  SELF.layout."  → member starts at 14
const CHAR_AFTER_SELF = 8;      // "  SELF."         → member starts at 7

function buildDiskFixture(): DiskFixture {
    if (_active) {
        throw new Error('Member-label fixture already active — teardown first');
    }
    _active = true;

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'member-label-'));

    const incContent = [
        'StandaloneQueueType QUEUE,TYPE',       // 0
        'queueField          LONG',             // 1
        '        END',                          // 2
        '',                                     // 3
        'StandaloneGroupType GROUP,TYPE',       // 4
        'groupField          STRING(16)',       // 5
        '        END',                          // 6
        '',                                     // 7
        'HolderClass CLASS,TYPE',               // 8
        'records     &StandaloneQueueType',     // 9
        'layout      &StandaloneGroupType',     // 10
        'counter     LONG',                     // 11
        'DoIt        PROCEDURE',                // 12
        'Helper      PROCEDURE(LONG p)',        // 13
        '        END',                          // 14
        '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpRoot, 'myclasses.inc'), incContent);

    // Minimal redirection file — must exist + parse so the SDI gate passes.
    fs.writeFileSync(path.join(tmpRoot, 'test.red'), '[Copy]\n*.inc = .\n');

    const callerContent = [
        '  MEMBER()',                        // 0
        "  INCLUDE('myclasses.inc')",        // 1
        '',                                  // 2
        'HolderClass.DoIt PROCEDURE',        // 3
        '  CODE',                            // 4
        '  SELF.records.queueField = 1',     // 5  QUEUE own body  → Queue Field
        "  SELF.layout.groupField = 'x'",    // 6  GROUP own body  → Group Field
        '  SELF.counter = 2',                // 7  CLASS property  → Class Property
        '  SELF.Helper(1)',                  // 8  CLASS method    → Class Method
        '  RETURN',                          // 9
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

function hoverText(h: Hover | null | undefined): string {
    if (!h) return '';
    const c = h.contents as unknown;
    if (typeof c === 'string') return c;
    if (c && typeof (c as { value?: string }).value === 'string') return (c as { value: string }).value;
    return '';
}

suite('Structured-type member labelling — a QUEUE/GROUP member is a field, not a Class Property', () => {

    let fix: DiskFixture | null = null;

    teardown(() => {
        teardownDiskFixture(fix);
        fix = null;
    });

    // ── the mapping itself ────────────────────────────────────────────────────
    test('describeMemberOwner names each owner kind correctly', () => {
        assert.deepStrictEqual(describeMemberOwner('QUEUE', undefined, false), { category: 'Queue', noun: 'Field' });
        assert.deepStrictEqual(describeMemberOwner('GROUP', undefined, false), { category: 'Group', noun: 'Field' });
        assert.deepStrictEqual(describeMemberOwner('CLASS', undefined, false), { category: 'Class', noun: 'Property' });
        assert.deepStrictEqual(describeMemberOwner('CLASS', undefined, true), { category: 'Class', noun: 'Method' });
        assert.deepStrictEqual(describeMemberOwner('INTERFACE', undefined, true), { category: 'Interface', noun: 'Method' });
    });

    test('describeMemberOwner keeps the previous wording when the owner kind is unknown', () => {
        // Producers that do not set structureType must be unaffected.
        assert.deepStrictEqual(describeMemberOwner(undefined, undefined, false), { category: 'Class', noun: 'Property' });
        assert.deepStrictEqual(describeMemberOwner(undefined, undefined, true), { category: 'Class', noun: 'Method' });
        assert.deepStrictEqual(describeMemberOwner(undefined, true, true), { category: 'Interface', noun: 'Method' });
    });

    // ── the reported shape ────────────────────────────────────────────────────
    test('a QUEUE member is labelled "Queue Field", not "Class Property"', async () => {
        fix = buildDiskFixture();
        const text = hoverText(await new HoverProvider().provideHover(
            fix.callerDoc, { line: CALL_QUEUE_FIELD, character: CHAR_AFTER_RECORDS }));
        assert.ok(/Queue Field/.test(text), `expected "Queue Field"; got: ${text}`);
        assert.ok(!/Class Property/.test(text), `must not call a queue field a Class Property; got: ${text}`);
    });

    test('a GROUP member is labelled "Group Field", not "Class Property"', async () => {
        fix = buildDiskFixture();
        const text = hoverText(await new HoverProvider().provideHover(
            fix.callerDoc, { line: CALL_GROUP_FIELD, character: CHAR_AFTER_LAYOUT }));
        assert.ok(/Group Field/.test(text), `expected "Group Field"; got: ${text}`);
        assert.ok(!/Class Property/.test(text), `must not call a group field a Class Property; got: ${text}`);
    });

    // ── regression guards: CLASS wording must not change ──────────────────────
    test('a CLASS property is still labelled "Class Property" (regression guard)', async () => {
        fix = buildDiskFixture();
        const text = hoverText(await new HoverProvider().provideHover(
            fix.callerDoc, { line: CALL_CLASS_PROP, character: CHAR_AFTER_SELF }));
        assert.ok(/Class Property/.test(text), `expected "Class Property"; got: ${text}`);
    });

    test('a CLASS method is still labelled "Class Method" (regression guard)', async () => {
        fix = buildDiskFixture();
        const text = hoverText(await new HoverProvider().provideHover(
            fix.callerDoc, { line: CALL_CLASS_METHOD, character: CHAR_AFTER_SELF }));
        assert.ok(/Class Method/.test(text), `expected "Class Method"; got: ${text}`);
    });
});
