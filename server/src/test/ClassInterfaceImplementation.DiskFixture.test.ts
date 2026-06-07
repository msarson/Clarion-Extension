import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { SolutionManager } from '../solution/solutionManager';
import { serverSettings } from '../serverSettings';
import { validateClassInterfaceImplementationAsync } from '../providers/diagnostics/ClassDiagnostics';

/**
 * Issues #165 / #181 — class-interface-implementation diagnostic, against the
 * REAL Clarion interface model (verified vs docs + shipping LibSrc, e.g.
 * CSocketConnection IMPLEMENTS(IConnection) in abapi.inc / abapi.clw):
 *
 *   - The INTERFACE declares the method prototypes (iconn.inc).
 *   - The implementing CLASS body holds only its OWN methods — NOT the interface
 *     methods. It just carries IMPLEMENTS(IConnection) + MODULE('conn.clw').
 *   - The interface methods are implemented in the MODULE .clw as three-part
 *     `Class.Interface.Method PROCEDURE` definitions.
 *
 * So the diagnostic must check the MODULE .clw for the three-part implementations,
 * NOT the class body. The earlier same-file/class-body approach (original #165 +
 * first #181 attempt) was based on a wrong model and false-positived on every
 * real interface implementation — that is exactly what the "complete" sentinel
 * below guards against.
 *
 * Bidirectional pin (feedback_bidirectional_pin_assertion):
 *   - Bug-pin: a class missing a three-part impl for one interface method → warns.
 *   - Regression sentinel: a class that implements ALL interface methods in its
 *     MODULE .clw → NO warning (the false-positive guard).
 *
 * Disk fixture (mirrors LibSrc layout): an INTERFACE .inc, a class-declaration
 * .inc that INCLUDEs it + carries MODULE('conn.clw'), and the implementation .clw.
 */

interface IfaceFixture {
    tmpRoot: string;
    declUri: string;
    declDoc: TextDocument;
}

let _savedSm: SolutionManager | null = null;
let _savedRedirectionFile = '';
let _savedLibsrcPaths: string[] = [];
let _active = false;

interface FixtureOpts {
    /** Omit this interface method's impl from the .clw (the bug-pin). */
    omitImpl?: 'CloseSocket' | 'Shutdown' | 'SendData';
    /** Make the class derive from a base class (CLASS(BaseConn),...). */
    derived?: boolean;
}

function buildFixture(opts: FixtureOpts): IfaceFixture {
    if (_active) {
        throw new Error('Iface impl fixture already active — teardown first');
    }
    _active = true;

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '181-iface-impl-'));

    // 1. INTERFACE declaration (its own .inc) — the method prototypes.
    fs.writeFileSync(path.join(tmpRoot, 'iconn.inc'), [
        'IConnection  INTERFACE,TYPE',
        'CloseSocket    PROCEDURE',
        'Shutdown       PROCEDURE,LONG',
        'SendData       PROCEDURE(*STRING buf),LONG',
        '             END',
        '',
    ].join('\n'));

    // 2. Class declaration .inc — INCLUDEs the interface, carries IMPLEMENTS +
    //    MODULE. The body has ONLY the class's own method (Init), never the
    //    interface methods (this is the canonical Clarion shape).
    const classHeader = opts.derived
        ? "CSock     CLASS(BaseConn),TYPE,MODULE('conn.clw'),IMPLEMENTS(IConnection)"
        : "CSock     CLASS,TYPE,MODULE('conn.clw'),IMPLEMENTS(IConnection)";
    fs.writeFileSync(path.join(tmpRoot, 'conn.inc'), [
        "  INCLUDE('iconn.inc'),ONCE",
        classHeader,
        'Init        PROCEDURE',
        '          END',
        '',
    ].join('\n'));

    // 3. Implementation .clw — three-part Class.Interface.Method definitions.
    const allImpls: Array<{ name: string; proto: string }> = [
        { name: 'CloseSocket', proto: 'CSock.IConnection.CloseSocket PROCEDURE' },
        { name: 'Shutdown', proto: 'CSock.IConnection.Shutdown PROCEDURE' },
        { name: 'SendData', proto: 'CSock.IConnection.SendData PROCEDURE(*STRING buf)' },
    ];
    const clwLines: string[] = ["  MEMBER()", "  INCLUDE('iconn.inc'),ONCE", ''];
    for (const impl of allImpls) {
        if (opts.omitImpl === impl.name) continue;
        clwLines.push(impl.proto, '  CODE', '  RETURN', '');
    }
    clwLines.push('CSock.Init PROCEDURE', '  CODE', '  RETURN', '');
    fs.writeFileSync(path.join(tmpRoot, 'conn.clw'), clwLines.join('\n'));

    // Minimal redirection file so the resolver/SDI gate passes.
    fs.writeFileSync(path.join(tmpRoot, 'test.red'), '[Copy]\n*.inc = .\n*.clw = .\n');

    _savedRedirectionFile = serverSettings.redirectionFile;
    _savedLibsrcPaths = serverSettings.libsrcPaths;
    serverSettings.redirectionFile = 'test.red';
    serverSettings.libsrcPaths = [tmpRoot];

    const fakeProject = {
        name: 'TestProj',
        path: tmpRoot,
        sourceFiles: [
            { relativePath: 'conn.clw', getAbsolutePath: () => path.join(tmpRoot, 'conn.clw') },
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

    const declPath = path.join(tmpRoot, 'conn.inc');
    const declUri = `file:///${declPath.replace(/\\/g, '/')}`;
    const declContent = fs.readFileSync(declPath, 'utf-8');
    const declDoc = TextDocument.create(declUri, 'clarion', 1, declContent);
    TokenCache.getInstance().getTokens(declDoc);

    return { tmpRoot, declUri, declDoc };
}

function teardownFixture(fix: IfaceFixture | null): void {
    if (!_active) return;
    (SolutionManager as unknown as { instance: SolutionManager | null }).instance = _savedSm;
    _savedSm = null;
    serverSettings.redirectionFile = _savedRedirectionFile;
    serverSettings.libsrcPaths = _savedLibsrcPaths;
    StructureDeclarationIndexer.getInstance().clearCache();
    if (fix) {
        TokenCache.getInstance().clearTokens(fix.declUri);
        try { fs.rmSync(fix.tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    _active = false;
}

suite('Issues #165/#181 — class-interface-implementation diagnostic (disk fixture, real model)', () => {

    let fix: IfaceFixture | null = null;

    teardown(() => {
        teardownFixture(fix);
        fix = null;
    });

    async function run(fixture: IfaceFixture) {
        const tokens = TokenCache.getInstance().getTokens(fixture.declDoc);
        const svc = new MemberLocatorService();
        return validateClassInterfaceImplementationAsync(tokens, fixture.declDoc, svc);
    }

    test('class implements ALL interface methods in its MODULE .clw — NO warning (false-positive guard)', async () => {
        fix = buildFixture({});
        const d = await run(fix);
        assert.strictEqual(d.length, 0,
            `a class that implements every interface method in its MODULE .clw must not warn; got: ${JSON.stringify(d.map(x => x.message))}`);
    });

    test('class missing a three-part impl for one interface method — warns and names it', async () => {
        fix = buildFixture({ omitImpl: 'SendData' });
        const d = await run(fix);
        assert.strictEqual(d.length, 1,
            `expected exactly one missing-implementation warning; got: ${JSON.stringify(d.map(x => x.message))}`);
        assert.ok(/SendData/i.test(d[0].message),
            `message should name the missing method SendData; got: ${d[0].message}`);
        assert.ok(/IConnection/i.test(d[0].message),
            `message should name the interface IConnection; got: ${d[0].message}`);
    });

    test('derived class is skipped (impl may be inherited from the base) — no warning', async () => {
        fix = buildFixture({ omitImpl: 'SendData', derived: true });
        const d = await run(fix);
        assert.strictEqual(d.length, 0,
            `derived CLASS(Base),IMPLEMENTS must be skipped (inherited impls); got: ${JSON.stringify(d.map(x => x.message))}`);
    });
});
