import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SolutionManager } from '../solution/solutionManager';
import { ClarionProjectServer } from '../solution/clarionProjectServer';
import { serverSettings } from '../serverSettings';
import { applyConfigurationChange } from '../solution/ConfigurationChange';

/**
 * #564 — the server got the build configuration once, when the solution loaded. A switch in the
 * status bar or the Tools pane never reached it, so the redirection file's [Debug]/[Release]
 * sections kept resolving for the old configuration until a reload. `clarion/updateConfiguration`
 * now carries the change; `applyConfigurationChange` sets it and drops the resolved-path caches
 * that are keyed by file name alone (the per-project search-path cache is already keyed by
 * configuration, and the redirection lookup filters sections at lookup time).
 */
suite('A build configuration change reaches file resolution without a reload (#564)', () => {
    let tmpRoot = '';
    let savedSm: unknown;
    let savedConfiguration = '';
    let savedRedirectionFile = '';
    let savedLibsrc: string[] = [];
    let debugDir = '';
    let releaseDir = '';

    setup(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg564-'));
        const projDir = path.join(tmpRoot, 'Proj');
        debugDir = path.join(tmpRoot, 'debug-inc');
        releaseDir = path.join(tmpRoot, 'release-inc');
        for (const d of [projDir, debugDir, releaseDir]) fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(debugDir, 'Switch.inc'), '! debug copy\r\n');
        fs.writeFileSync(path.join(releaseDir, 'Switch.inc'), '! release copy\r\n');
        fs.writeFileSync(path.join(projDir, 'Clarion110.red'), [
            '[Debug]',
            `*.inc = ${debugDir}`,
            '[Release]',
            `*.inc = ${releaseDir}`,
            '[Common]',
            '*.clw = .',
            '',
        ].join('\r\n'));

        savedConfiguration = serverSettings.configuration;
        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrc = serverSettings.libsrcPaths;
        serverSettings.configuration = 'Debug';
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];

        const project = new ClarionProjectServer('Proj', 'app', projDir, '{CFG-564}');
        // Real prototype methods over a fixture instance: findFileWithExtension and its caches
        // are the code under test (same pattern as OwnerFirstCaches329).
        const sm = Object.create(SolutionManager.prototype);
        sm.solution = { projects: [project] };
        sm.fileCache = new Map();
        sm.negativeFindCache = new Map();
        sm.inflightFinds = new Map();
        savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = sm;
    });

    teardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
        serverSettings.configuration = savedConfiguration;
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.libsrcPaths = savedLibsrc;
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    const resolve = async () => {
        const sm = SolutionManager.getInstance()!;
        const found = await sm.findFileWithExtension('Switch.inc');
        return path.dirname(found.path).toLowerCase();
    };

    test('precondition: under Debug the [Debug] folder answers', async () => {
        assert.strictEqual(await resolve(), debugDir.toLowerCase());
    });

    test('bug-pin: after switching to Release, the same lookup answers from the [Release] folder', async () => {
        assert.strictEqual(await resolve(), debugDir.toLowerCase(), 'warm the cache under Debug');
        assert.strictEqual(applyConfigurationChange('Release'), true);
        assert.strictEqual(await resolve(), releaseDir.toLowerCase());
    });

    test('and back again', async () => {
        await resolve();
        applyConfigurationChange('Release');
        await resolve();
        applyConfigurationChange('Debug');
        assert.strictEqual(await resolve(), debugDir.toLowerCase());
    });

    test('a file graph rebuilt after the switch resolves the INCLUDE to the new section, not the disk cache', async () => {
        const { FileRelationshipGraph } = await import('../FileRelationshipGraph');
        const projDir = path.join(tmpRoot, 'Proj');
        const main = path.join(projDir, 'main.clw');
        fs.writeFileSync(main, "  PROGRAM\r\n  INCLUDE('Switch.inc'),ONCE\r\n  MAP\r\n  END\r\n  CODE\r\n");
        const sm = SolutionManager.getInstance() as unknown as { solution: { projects: Array<{ sourceFiles: unknown[] }> } };
        const project = sm.solution.projects[0] as unknown as ClarionProjectServer;
        const { ClarionSourcerFileServer } = await import('../solution/clarionSourceFileServer');
        project.sourceFiles.push(new ClarionSourcerFileServer('main.clw', 'main.clw', project));

        const graph = FileRelationshipGraph.getInstance();
        const includeTarget = () => graph.getForwardEdges(main).find(e => e.type === 'INCLUDE')?.toFile ?? '(none)';
        try {
            graph.reset();
            await graph.buildInBackground([main]);
            assert.strictEqual(path.dirname(includeTarget()), debugDir.toLowerCase().replace(/\\/g, '/'));

            applyConfigurationChange('Release');
            graph.reset();
            await graph.buildInBackground([main]);
            assert.strictEqual(path.dirname(includeTarget()), releaseDir.toLowerCase().replace(/\\/g, '/'));
        } finally {
            graph.reset();
        }
    });

    test('the same configuration in another spelling is not a change', () => {
        assert.strictEqual(applyConfigurationChange('Debug|Win32'), false);
        assert.strictEqual(applyConfigurationChange('debug'), false);
        assert.strictEqual(applyConfigurationChange(''), false);
        assert.strictEqual(serverSettings.configuration, 'Debug');
    });
});
