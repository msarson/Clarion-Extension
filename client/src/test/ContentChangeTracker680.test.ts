import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ContentChangeTracker } from '../utils/ContentChangeTracker';

/**
 * #680 (from #659) — "Project file updated. Solution cache refreshed." appeared after a build with no
 * project file changed: the watcher reloaded the solution on any change event, and a file touched
 * without being changed raises one. A watched file now counts as changed only when its content did.
 */
function fakeFiles(initial: Record<string, string>) {
    const files = new Map(Object.entries(initial));
    return { files, read: (p: string) => files.get(p) ?? null };
}

suite('Watched files change only when their content does (#680)', () => {
    test('bug-pin: a touch (same content) is not a change', () => {
        const f = fakeFiles({ 'C:\\app\\App.cwproj': '<Project/>' });
        const t = new ContentChangeTracker(f.read);
        t.remember('C:\\app\\App.cwproj');
        assert.strictEqual(t.changed('C:\\app\\App.cwproj'), false);
    });

    test('an edit is a change, once', () => {
        const f = fakeFiles({ 'C:\\app\\App.cwproj': '<Project/>' });
        const t = new ContentChangeTracker(f.read);
        t.remember('C:\\app\\App.cwproj');
        f.files.set('C:\\app\\App.cwproj', '<Project><Item/></Project>');
        assert.strictEqual(t.changed('C:\\app\\App.cwproj'), true);
        assert.strictEqual(t.changed('C:\\app\\App.cwproj'), false, 'the new content is now the baseline');
    });

    test('paths compare case-insensitively (the watcher may report another spelling)', () => {
        const f = fakeFiles({ 'C:\\app\\App.cwproj': 'x' });
        const t = new ContentChangeTracker(p => f.read(p) ?? f.read('C:\\app\\App.cwproj'));
        t.remember('C:\\app\\App.cwproj');
        assert.strictEqual(t.changed('c:\\APP\\app.cwproj'), false);
    });

    test('a file never recorded, or that cannot be read, counts as changed (the safe side)', () => {
        const f = fakeFiles({ 'C:\\app\\New.cwproj': 'x' });
        const t = new ContentChangeTracker(f.read);
        assert.strictEqual(t.changed('C:\\app\\New.cwproj'), true);
        assert.strictEqual(t.changed('C:\\app\\Missing.cwproj'), true);
    });

    test('the solution, project and redirection watchers all check content', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'client', 'src', 'providers', 'FileWatcherManager.ts'))) dir = path.dirname(dir);
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'providers', 'FileWatcherManager.ts'), 'utf8');
        assert.ok((src.match(/watchedContent\.changed\(/g) ?? []).length >= 3, 'onDidChange handlers ask the tracker');
        assert.ok((src.match(/watchedContent\.remember\(/g) ?? []).length >= 3, 'watchers record the content they start from');
    });
});
