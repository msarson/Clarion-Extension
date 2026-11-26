import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';
import { SolutionManager } from '../solution/solutionManager';

/**
 * #890 — Find All References on a structure field resolves each `.Field` access's receiver, and
 * every resolve walks INCLUDE chains through resolveFilePath: redirection lookup and existsSync
 * for the same names from the same file, again and again (2.5 s of existsSync on a 265-hit
 * search). The answer is remembered until the cross-file epoch bumps, which every watched-file
 * change does (a file created, changed or deleted), as the #373 walk memo is.
 */
suite('MemberLocatorService remembers where an INCLUDE resolves (#890)', () => {
    let dir = '';
    const svc = new MemberLocatorService() as unknown as {
        resolveFilePath(filename: string, fromDir: string, fromFile?: string): string | null;
    };
    setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce890-')); bumpCrossFileEpoch(); });
    teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); bumpCrossFileEpoch(); });

    test('a repeated lookup does not touch the disk again', () => {
        fs.writeFileSync(path.join(dir, 'a.inc'), '');
        const first = svc.resolveFilePath('a.inc', dir);
        assert.ok(first && first.toLowerCase().endsWith('a.inc'), String(first));
        // Gone from disk, but no watcher event yet: the answer comes from memory, not a new check.
        fs.rmSync(path.join(dir, 'a.inc'));
        for (let i = 0; i < 3; i++) assert.strictEqual(svc.resolveFilePath('a.inc', dir), first, 'answered from memory');
        bumpCrossFileEpoch(); // the watcher reports the deletion
        assert.strictEqual(svc.resolveFilePath('a.inc', dir), null);
    });

    test('"not found" is remembered until a file change bumps the epoch, then the new file is found', () => {
        assert.strictEqual(svc.resolveFilePath('late.inc', dir), null);
        fs.writeFileSync(path.join(dir, 'late.inc'), '');
        assert.strictEqual(svc.resolveFilePath('late.inc', dir), null, 'remembered until the watcher reports the file');
        bumpCrossFileEpoch(); // what onDidChangeWatchedFiles does for the created file
        const found = svc.resolveFilePath('late.inc', dir);
        assert.ok(found && found.toLowerCase().endsWith('late.inc'), String(found));
    });

    test('an answer from before the solution loaded is not served after its projects change', () => {
        assert.strictEqual(svc.resolveFilePath('loaded.inc', dir), null);
        fs.writeFileSync(path.join(dir, 'loaded.inc'), '');
        // The solution's projects are assigned (no watched-file event, so the epoch stays).
        const sm = Object.create(SolutionManager.prototype) as SolutionManager;
        (sm as unknown as { projectsChanged(): void }).projectsChanged();
        const found = svc.resolveFilePath('loaded.inc', dir);
        assert.ok(found && found.toLowerCase().endsWith('loaded.inc'), String(found));
    });

    test('the same name from another directory or file is its own lookup', () => {
        const sub = path.join(dir, 'sub');
        fs.mkdirSync(sub);
        fs.writeFileSync(path.join(sub, 'b.inc'), '');
        assert.strictEqual(svc.resolveFilePath('b.inc', dir), null);
        const inSub = svc.resolveFilePath('b.inc', sub);
        assert.ok(inSub && inSub.toLowerCase().endsWith(path.join('sub', 'b.inc').toLowerCase()), String(inSub));
    });
});

suite('SolutionManager remembers a file no project holds (#890)', () => {
    type Spy = { n: number };
    type FakeFile = { name: string; relativePath: string; getAbsolutePath: () => string };
    const mkFile = (spy: Spy, root: string, rel: string): FakeFile => ({
        name: path.basename(rel), relativePath: rel,
        getAbsolutePath: () => { spy.n++; return path.join(root, rel); }
    });
    function makeSm(spy: Spy): { sm: SolutionManager; p1: { sourceFiles: FakeFile[] } } {
        const p1 = { name: 'P1', path: 'C:\\proj\\p1', sourceFiles: [mkFile(spy, 'C:\\proj\\p1', 'a.clw')] };
        const sm = Object.create(SolutionManager.prototype) as SolutionManager;
        (sm as unknown as { solution: unknown }).solution = { projects: [p1, { name: 'P2', path: 'C:\\proj\\p2', sourceFiles: [mkFile(spy, 'C:\\proj\\p2', 'c.clw')] }] };
        return { sm, p1 };
    }
    setup(() => bumpCrossFileEpoch());

    test('an INCLUDEd file in no project scans the projects once, not on every lookup', () => {
        const spy = { n: 0 };
        const { sm } = makeSm(spy);
        assert.strictEqual(sm.findProjectForFile('C:\\libs\\equates.inc'), undefined);
        const afterFirst = spy.n;
        assert.ok(afterFirst >= 2, 'the first lookup scans');
        for (let i = 0; i < 5; i++) assert.strictEqual(sm.findProjectForFile('C:\\libs\\equates.inc'), undefined);
        assert.strictEqual(spy.n, afterFirst, `getAbsolutePath ran ${spy.n}x, expected ${afterFirst}`);
    });

    test('a file added to a project in place is found after the .cwproj change bumps the epoch', () => {
        const spy = { n: 0 };
        const { sm, p1 } = makeSm(spy);
        assert.strictEqual(sm.findProjectForFile('C:\\proj\\p1\\new.clw'), undefined);
        p1.sourceFiles.push(mkFile(spy, 'C:\\proj\\p1', 'new.clw')); // Add Source File
        bumpCrossFileEpoch(); // the .cwproj write is a watched-file change
        assert.strictEqual(sm.findProjectForFile('C:\\proj\\p1\\new.clw')?.name, 'P1');
    });

    test('a miss is dropped when the projects are reassigned', () => {
        const spy = { n: 0 };
        const { sm, p1 } = makeSm(spy);
        assert.strictEqual(sm.findProjectForFile('C:\\proj\\p1\\late.clw'), undefined);
        p1.sourceFiles.push(mkFile(spy, 'C:\\proj\\p1', 'late.clw'));
        (sm as unknown as { projectsChanged(): void }).projectsChanged();
        assert.strictEqual(sm.findProjectForFile('C:\\proj\\p1\\late.clw')?.name, 'P1');
    });
});
