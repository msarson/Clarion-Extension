/**
 * #315 — reference-count lens follow-ups on #294.
 *
 * Mark's VM: `ThisGPF.Initialize` lens showed "3372 references" — the index
 * answered the solution-wide bare-name total for `initialize`, meaningless for
 * ubiquitous member names. And clicking a lens ran a full member FAR that read
 * every candidate file (7× ~15s handlers) before racing a timeout to null.
 *
 * Pins:
 *   1. getCount on a dotted symbol scopes the count to files that also mention
 *      the qualifier (class name co-occurrence) — not the solution-wide total.
 *   2. mayContain prunes only when it is SAFE: an indexed file with zero
 *      occurrences of the name. Unknown files, stoplist names, and the unbuilt
 *      state never prune.
 *   3. Member FAR consults mayContain before scanning a candidate file —
 *      indexed no-hit files are skipped entirely; true positives survive.
 *   4. formatApproximateReferenceCount marks index-derived titles as estimates.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferenceCountIndex } from '../services/ReferenceCountIndex';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { formatApproximateReferenceCount, buildCodeLenses } from '../providers/ClarionCodeLensProvider';
import { buildMultiFileFixture, teardownMultiFileFixture, MultiFileFixture } from './helpers/MultiFileFARFixture';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

function writeFixture(name: string, content: string): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content);
    return p;
}

suite('ReferenceCountIndex #315 — qualifier-scoped counts + FAR pruning', () => {

    let files: string[];

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refidx315_'));
        files = [
            // Two files where ThisGPF lives: 3 + 2 Initialize occurrences.
            writeFixture('gpf1.clw', [
                'ThisGPF CLASS',
                'Initialize PROCEDURE()',
                '  END',
                '  CODE',
                '  ThisGPF.Initialize()',
                '  Initialize()',
            ].join('\n')),
            writeFixture('gpf2.clw', [
                "  MEMBER('gpf1.clw')",
                '  CODE',
                '  ThisGPF.Initialize()',
                '  SomeOther.Initialize()',
            ].join('\n')),
            // A file full of unrelated Initialize mentions — no ThisGPF.
            writeFixture('other.clw', [
                '  CODE',
                '  A.Initialize()',
                '  B.Initialize()',
                '  C.Initialize()',
                '  D.Initialize()',
                '  E.Initialize()',
            ].join('\n')),
        ];
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => ReferenceCountIndex.getInstance().reset());

    test('dotted symbols count only files that also mention the qualifier', async () => {
        const idx = ReferenceCountIndex.getInstance();
        await idx.buildInBackground(files);

        assert.strictEqual(idx.getCount('Initialize'), 10, 'bare name stays solution-wide');
        assert.strictEqual(idx.getCount('ThisGPF.Initialize'), 5,
            'dotted symbol excludes files without the qualifier (3372-references bug)');
        assert.strictEqual(idx.getCount('NoSuchClass.Initialize'), 0,
            'unknown qualifier co-occurs nowhere');
    });

    test('mayContain: prunes indexed no-hit files; never prunes unknown/stoplist/unbuilt', async () => {
        const idx = ReferenceCountIndex.getInstance();
        assert.strictEqual(idx.mayContain(files[0], 'Initialize'), true, 'unbuilt index never prunes');

        await idx.buildInBackground(files);
        assert.strictEqual(idx.mayContain(files[2], 'ThisGPF'), false, 'indexed file, zero occurrences → prune');
        assert.strictEqual(idx.mayContain(files[0], 'thisgpf'), true, 'case-insensitive hit');
        assert.strictEqual(idx.mayContain(path.join(tmpDir, 'never-indexed.clw'), 'ThisGPF'), true,
            'unknown files are never pruned');
        assert.strictEqual(idx.mayContain(files[2], 'SELF'), true, 'stoplist names are never counted, never pruned');

        // URI forms (incl. encoded drive colon) normalize to the same index key.
        const asUri = `file:///${files[2].replace(/\\/g, '/')}`;
        const encoded = asUri.replace(/^file:\/\/\/([a-zA-Z]):/, 'file:///$1%3A');
        assert.strictEqual(idx.mayContain(asUri, 'ThisGPF'), false, 'file:/// URI form matches index keys');
        assert.strictEqual(idx.mayContain(encoded, 'ThisGPF'), false, 'encoded drive-colon URI form matches too');
    });

    test('mayContain: externally regenerated files are never pruned on stale counts', async () => {
        // Clarion app generation rewrites CLW files on disk with no editor event.
        // A zero-count prune decision must be mtime-verified — a regenerated file
        // whose new content HAS the name must be scanned, not silently skipped.
        const regen = writeFixture('regen.clw', '  CODE\n  Nothing()\n');
        const idx = ReferenceCountIndex.getInstance();
        await idx.buildInBackground([...files, regen]);
        assert.strictEqual(idx.mayContain(regen, 'ThisGPF'), false, 'pre-regen: provably absent');

        fs.writeFileSync(regen, '  CODE\n  ThisGPF.Initialize()\n');
        const bumped = new Date(Date.now() + 5_000);
        fs.utimesSync(regen, bumped, bumped); // force a distinct mtime regardless of fs granularity

        assert.strictEqual(idx.mayContain(regen, 'ThisGPF'), true,
            'post-regen: stale zero count must not prune the file');
        assert.strictEqual(idx.getCount('ThisGPF.Initialize'), 6,
            'self-healed entry feeds the qualifier-scoped count');
    });

    test('formatApproximateReferenceCount marks the count as an estimate', () => {
        assert.strictEqual(formatApproximateReferenceCount(5), '~5 references');
        assert.strictEqual(formatApproximateReferenceCount(1), '~1 reference');
    });

    test('getCountInFile: single-file counts for locally-declared class members', async () => {
        // CapeSoft GPF Reporter generates an IDENTICAL local ThisGPF class into
        // every app — qualifier co-occurrence still aggregated across all 40
        // apps. A class declared in the lens's own CLW is file-scoped by
        // Clarion's scope model, so its estimate must count in that file only.
        const idx = ReferenceCountIndex.getInstance();
        assert.strictEqual(idx.getCountInFile('ThisGPF.Initialize', files[0]), undefined, 'unbuilt → undefined');

        await idx.buildInBackground(files);
        assert.strictEqual(idx.getCountInFile('ThisGPF.Initialize', files[0]), 3, 'gpf1.clw only');
        assert.strictEqual(idx.getCountInFile('ThisGPF.Initialize', files[1]), 2, 'gpf2.clw only');
        assert.strictEqual(idx.getCountInFile('Absent', files[0]), 0, 'known file, absent name → 0');
        assert.strictEqual(idx.getCountInFile('ThisGPF.Initialize', path.join(tmpDir, 'unknown.clw')), undefined,
            'unknown file → undefined (caller syncs the live buffer and retries)');

        // URI form works like every other entry point.
        const asUri = `file:///${files[0].replace(/\\/g, '/')}`;
        assert.strictEqual(idx.getCountInFile('ThisGPF.Initialize', asUri), 3);
    });

    test('getCountInFiles: program-family sums for classes global in a PROGRAM CLW', async () => {
        // Mark's actual shape: ThisGPF is declared at GLOBAL scope in the app's
        // PROGRAM CLW — visible app-wide, so the estimate must cover the program
        // file plus its MEMBER modules (file-only would miss member callers),
        // while still excluding other applications.
        const idx = ReferenceCountIndex.getInstance();
        assert.strictEqual(idx.getCountInFiles('ThisGPF.Initialize', files), undefined, 'unbuilt → undefined');

        await idx.buildInBackground(files);
        assert.strictEqual(idx.getCountInFiles('ThisGPF.Initialize', [files[0], files[1]]), 5,
            'program + member sum, other apps excluded');
        assert.strictEqual(idx.getCountInFiles('ThisGPF.Initialize', [files[0], files[0], files[0]]), 3,
            'duplicate paths count once');
        const asUri = `file:///${files[1].replace(/\\/g, '/')}`;
        assert.strictEqual(idx.getCountInFiles('ThisGPF.Initialize', [files[0], asUri]), 5,
            'mixed path/URI forms normalize to the same keys');
        assert.strictEqual(idx.getCountInFiles('ThisGPF.Initialize', [path.join(tmpDir, 'nope.clw')]), undefined,
            'no known file in the list → undefined (caller falls back)');
    });
});

suite('ClarionCodeLensProvider #315 — locally-declared classes emit file-scoped lenses', () => {

    function lensesFor(uri: string, content: string) {
        const doc = TextDocument.create(uri, 'clarion', 1, content);
        const tokens = TokenCache.getInstance().getTokens(doc);
        return buildCodeLenses(uri, tokens);
    }

    teardown(() => TokenCache.getInstance().clearAllTokens());

    const LOCAL_CLASS_SOURCE = [
        "  MEMBER('main')",
        'ThisGPF              Class(GPFReporterClass)',
        'Initialize             PROCEDURE () ,VIRTUAL',
        '                     End',
        'ThisGPF.Initialize PROCEDURE()',
        '  CODE',
        '  RETURN',
    ].join('\n');

    test('method impl of a class declared in the same CLW → fileScoped', () => {
        const lenses = lensesFor('file:///c:/apps/ap1.clw', LOCAL_CLASS_SOURCE);
        const impl = lenses.map(l => l.data as { symbolName: string; fileScoped?: boolean })
            .find(d => d.symbolName === 'ThisGPF.Initialize');
        assert.ok(impl, 'method implementation lens exists');
        assert.strictEqual(impl!.fileScoped, true, 'local class member counts are file-scoped');

        const classLens = lenses.map(l => l.data as { symbolName: string; fileScoped?: boolean })
            .find(d => d.symbolName === 'ThisGPF');
        assert.ok(classLens, 'class lens exists');
        assert.strictEqual(classLens!.fileScoped, true, 'the local class itself is file-scoped too');
    });

    test('method impl of a class declared elsewhere (INC-shared) stays solution-scoped', () => {
        const lenses = lensesFor('file:///c:/libsrcish/stringtheory.clw', [
            "  MEMBER('')",
            'StringTheory.AddLine PROCEDURE(STRING s)',
            '  CODE',
            '  RETURN',
        ].join('\n'));
        const impl = lenses.map(l => l.data as { symbolName: string; fileScoped?: boolean })
            .find(d => d.symbolName === 'StringTheory.AddLine');
        assert.ok(impl, 'method implementation lens exists');
        assert.ok(!impl!.fileScoped, 'class not declared in this file → keep the wider estimate');
    });

    test('class declared in an INC is not file-scoped (usages live in includers)', () => {
        const lenses = lensesFor('file:///c:/apps/myclass.inc', [
            'MyShared             Class,Type',
            'DoIt                   PROCEDURE ()',
            '                     End',
        ].join('\n'));
        const classLens = lenses.map(l => l.data as { symbolName: string; fileScoped?: boolean })
            .find(d => d.symbolName === 'MyShared');
        assert.ok(classLens, 'class lens exists');
        assert.ok(!classLens!.fileScoped, 'INC-declared classes are shared — file-scoping would undercount');
    });
});

suite('ReferencesProvider #315 — inline class-instance receivers (ThisGPF shape)', () => {

    // Mark's lens click showed no call sites: `ThisGPF Class(GPFReporterClass)`
    // declares an inline class INSTANCE — its resolved "type" is `Class(...)`,
    // whose base extracted as 'class' matched neither the class family nor the
    // label, so `ThisGPF.Initialize()` call sites in the declaring file (the
    // app's global CODE — where GPF Reporter's calls live) were dropped. The
    // label of an inline class IS the class name (impls are Label.Method).

    let dir: string;
    let fixture: MultiFileFixture;

    const filesMap: { [rel: string]: string } = {
        'ap1.clw': [
            '  PROGRAM',                                        // 0
            '  MAP',                                            // 1
            '  END',                                            // 2
            'ThisGPF              Class(GPFReporterClass)',     // 3
            'Initialize             PROCEDURE () ,VIRTUAL',     // 4
            '                     End',                         // 5
            '  CODE',                                           // 6
            '  ThisGPF.Initialize()',                           // 7 — global-CODE call site
            'ThisGPF.Initialize PROCEDURE()',                   // 8 — impl (lens sits here)
            '  CODE',                                           // 9
            '  RETURN',                                         // 10
        ].join('\n'),
        'memb1.clw': [
            "  MEMBER('ap1.clw')",
            'SomeProc PROCEDURE',
            '  CODE',
            '  ThisGPF.Initialize()',                           // 3 — member-module call site
        ].join('\n'),
    };

    setup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refidx315gpf_'));
        for (const [rel, content] of Object.entries(filesMap)) {
            fs.writeFileSync(path.join(dir, rel), content);
        }
        fixture = buildMultiFileFixture({ files: filesMap, projectRoot: dir });
    });

    teardown(() => {
        teardownMultiFileFixture();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('lens click (impl-label cursor) finds the global-CODE call site', async () => {
        const provider = new ReferencesProvider();
        const doc = fixture.documents['ap1.clw'];
        // The lens passes {line: impl line, character: after the dot}.
        const refs = await provider.provideReferences(doc, { line: 8, character: 8 }, { includeDeclaration: true });

        assert.ok(refs, 'FAR must return references');
        const inAp1 = refs!.filter(r => r.uri.toLowerCase().endsWith('ap1.clw')).map(r => r.range.start.line);
        assert.ok(inAp1.includes(7),
            `global-CODE call site (line 7) must be found; got ap1 lines=[${inAp1.join(',')}]`);
        assert.ok(refs!.some(r => r.uri.toLowerCase().endsWith('memb1.clw')),
            'member-module call site still found');
    });

    test('decl cursor (class block) finds the global-CODE call site too', async () => {
        const provider = new ReferencesProvider();
        const doc = fixture.documents['ap1.clw'];
        const refs = await provider.provideReferences(doc, { line: 4, character: 0 }, { includeDeclaration: true });

        assert.ok(refs, 'FAR must return references');
        const inAp1 = refs!.filter(r => r.uri.toLowerCase().endsWith('ap1.clw')).map(r => r.range.start.line);
        assert.ok(inAp1.includes(7),
            `global-CODE call site (line 7) must be found; got ap1 lines=[${inAp1.join(',')}]`);
    });
});

suite('ReferencesProvider #315 — program-file cursor must not scan the whole solution', () => {

    // Mark's VM: clicking the lens "just shows finding all references and never
    // stops". getLocalClassSearchFiles only widened MEMBER→PROGRAM: when the
    // cursor document IS the program file (ThisGPF global in the app CLW),
    // getProgramFile returns nothing, so it fell through to "scan every project
    // in the solution" — 3,016 files cold-tokenized through the class-family
    // walk. The program's own MEMBER files ARE its family.

    const N = 25;
    let dir: string;
    let fixture: MultiFileFixture;
    let scannedFiles: string[];
    let origScan: (...args: unknown[]) => unknown;

    setup(() => {
        setServerInitialized(true);
        const filesMap: { [rel: string]: string } = {
            'ap1.clw': [
                '  PROGRAM',
                '  MAP',
                '  END',
                'ThisGPF              Class(GPFReporterClass)',
                'Initialize             PROCEDURE () ,VIRTUAL',
                '                     End',
                '  CODE',
                '  ThisGPF.Initialize()',
                'ThisGPF.Initialize PROCEDURE()',           // line 8 — lens
                '  CODE',
                '  RETURN',
            ].join('\n'),
            'memb1.clw': [
                "  MEMBER('ap1.clw')",
                'SomeProc PROCEDURE',
                '  CODE',
                '  ThisGPF.Initialize()',
            ].join('\n'),
        };
        // Unrelated files (another app's modules in the same solution). They
        // mention Initialize — the word-prune alone won't skip them; only
        // correct family scoping keeps them out of the search set.
        for (let i = 0; i < N; i++) {
            filesMap[`other${i}.clw`] = [
                "  MEMBER('apX.clw')",
                `OtherProc${i} PROCEDURE`,
                '  CODE',
                '  SomeObj.Initialize()',
            ].join('\n');
        }
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refidx315prog_'));
        for (const [rel, content] of Object.entries(filesMap)) {
            fs.writeFileSync(path.join(dir, rel), content);
        }
        fixture = buildMultiFileFixture({
            files: filesMap,
            projectRoot: dir,
            frg: { programFile: 'ap1.clw', memberFiles: ['memb1.clw'] }
        });

        scannedFiles = [];
        const proto = ReferencesProvider.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        origScan = proto['findMemberReferencesInFile'];
        proto['findMemberReferencesInFile'] = function (this: unknown, ...args: unknown[]) {
            scannedFiles.push(String(args[0]));
            return origScan.apply(this, args);
        };
    });

    teardown(() => {
        const proto = ReferencesProvider.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        proto['findMemberReferencesInFile'] = origScan;
        teardownMultiFileFixture();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('lens click on the PROGRAM file searches the app family, not other apps', async () => {
        const provider = new ReferencesProvider();
        const doc = fixture.documents['ap1.clw'];
        const refs = await provider.provideReferences(doc, { line: 8, character: 8 }, { includeDeclaration: true });

        assert.ok(refs && refs.length > 0, 'FAR must return references');
        assert.ok(refs!.some(r => r.uri.toLowerCase().endsWith('memb1.clw')),
            'member-module call site found (family widening works)');

        const otherScans = scannedFiles.filter(u => /other\d+\.clw$/i.test(u));
        assert.strictEqual(otherScans.length, 0,
            `unrelated apps' files must not be searched (scanned ${otherScans.length}/${N})`);
    });
});

suite('ReferencesProvider #315 — class-family walk stays transitive under the word-prune', () => {

    // Guard for the frontier-pruned family walk: SubB inherits SubA inherits
    // ThisGPF, and SubB's file never mentions "ThisGPF" — a naive one-round
    // prune by the root name would miss it. The walk must expand by rounds
    // (files mentioning ANY current family member).

    let dir: string;
    let fixture: MultiFileFixture;

    setup(async () => {
        setServerInitialized(true);
        const filesMap: { [rel: string]: string } = {
            'a.clw': [
                '  PROGRAM',
                '  MAP',
                '  END',
                'ThisGPF              Class(GPFReporterClass)',
                'Initialize             PROCEDURE () ,VIRTUAL',
                '                     End',
                '  CODE',
                'ThisGPF.Initialize PROCEDURE()',            // line 7 — lens
                '  CODE',
                '  RETURN',
            ].join('\n'),
            'b.clw': [
                "  MEMBER('a.clw')",
                'SubA                 Class(ThisGPF)',
                '                     End',
            ].join('\n'),
            'c.clw': [
                "  MEMBER('a.clw')",
                'SubB                 Class(SubA)',          // mentions SubA, never ThisGPF
                'Extra                  PROCEDURE ()',
                '                     End',
                'SubB.Extra PROCEDURE()',
                '  CODE',
                '  SELF.Initialize()',                       // line 6 — family reference
            ].join('\n'),
        };
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refidx315fam_'));
        for (const [rel, content] of Object.entries(filesMap)) {
            fs.writeFileSync(path.join(dir, rel), content);
        }
        fixture = buildMultiFileFixture({
            files: filesMap,
            projectRoot: dir,
            frg: { programFile: 'a.clw', memberFiles: ['b.clw', 'c.clw'] }
        });
        // Index BUILT — the prune is live; transitivity must survive it.
        const idx = ReferenceCountIndex.getInstance();
        idx.reset();
        await idx.buildInBackground(Object.keys(filesMap).map(r => path.join(dir, r)));
    });

    teardown(() => {
        ReferenceCountIndex.getInstance().reset();
        teardownMultiFileFixture();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('SELF.Initialize inside a grandchild subclass method is still found', async () => {
        const provider = new ReferencesProvider();
        const doc = fixture.documents['a.clw'];
        const refs = await provider.provideReferences(doc, { line: 7, character: 8 }, { includeDeclaration: true });

        assert.ok(refs, 'FAR must return references');
        const inC = refs!.filter(r => r.uri.toLowerCase().endsWith('c.clw')).map(r => r.range.start.line);
        assert.ok(inC.includes(6),
            `grandchild's SELF.Initialize (c.clw line 6) must be found; got c.clw lines=[${inC.join(',')}]`);
    });
});

suite('ReferencesProvider #315 — member FAR prunes indexed no-hit files', () => {

    const N = 40;
    let fixture: MultiFileFixture;
    let farDir: string;
    let scannedFiles: string[];
    let origScan: (...args: unknown[]) => unknown;

    suiteSetup(() => setServerInitialized(true));

    setup(async () => {
        const filesMap: { [rel: string]: string } = {
            // Mark's repro shape: the lens sits on the method declaration; the
            // click runs FAR from that declaration position.
            'class.clw': [
                "  MEMBER('main')",                    // line 0
                'MyWidget   CLASS,TYPE',                // line 1
                'DoIt         PROCEDURE(STRING)',       // line 2 — FAR cursor here
                '           END',                       // line 3
                "MyWidget.DoIt PROCEDURE(STRING s)",    // line 4 — impl
                '  CODE',
                '  RETURN',
            ].join('\n'),
            'caller.clw': [
                "  MEMBER('main')",
                'MainProc PROCEDURE',
                'wid  MyWidget',
                '  CODE',
                "  wid.DoIt('x')",                      // line 4 — cross-file caller
            ].join('\n'),
        };
        // N sibling modules that never mention DoIt — with the index built,
        // the member scan must not touch them at all.
        for (let i = 0; i < N; i++) {
            filesMap[`gen${i}.clw`] = [
                "  MEMBER('main')",
                `Proc${i} PROCEDURE`,
                '  CODE',
                '  RETURN',
            ].join('\n');
        }
        // Member lookup tier 0 reads declarations from disk — the fixture needs
        // real files, not just TokenCache entries (same constraint as #310/#314).
        farDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refidx315far_'));
        for (const [rel, content] of Object.entries(filesMap)) {
            fs.writeFileSync(path.join(farDir, rel), content);
        }
        fixture = buildMultiFileFixture({ files: filesMap, projectRoot: farDir });

        const idx = ReferenceCountIndex.getInstance();
        idx.reset();
        await idx.buildInBackground(Object.keys(filesMap).map(rel => path.join(farDir, rel)));

        // Spy: which files does the member scan actually visit?
        scannedFiles = [];
        const proto = ReferencesProvider.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        origScan = proto['findMemberReferencesInFile'];
        proto['findMemberReferencesInFile'] = function (this: unknown, ...args: unknown[]) {
            scannedFiles.push(String(args[0]));
            return origScan.apply(this, args);
        };
    });

    teardown(() => {
        const proto = ReferencesProvider.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        proto['findMemberReferencesInFile'] = origScan;
        ReferenceCountIndex.getInstance().reset();
        teardownMultiFileFixture();
        try { fs.rmSync(farDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    test('indexed no-hit siblings are skipped; true references survive', async () => {
        const provider = new ReferencesProvider();
        const doc = fixture.documents['class.clw'];
        // cursor on "DoIt" in the declaration (line 2) — the lens position.
        const refs = await provider.provideReferences(doc, { line: 2, character: 0 }, { includeDeclaration: true });

        assert.ok(refs && refs.length >= 1, 'member FAR still finds references');
        assert.ok(refs!.some(r => r.uri.toLowerCase() === fixture.uris['caller.clw'].toLowerCase()),
            'cross-file caller survives the prune');

        const genScans = scannedFiles.filter(u => /gen\d+\.clw$/i.test(u));
        assert.strictEqual(genScans.length, 0,
            `siblings with zero DoIt occurrences must be pruned before scanning (scanned ${genScans.length}/${N})`);
    });
});
