import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { buildQuickOpenItems, isExcluded, DirEntry } from '../navigation/QuickOpenList';

/**
 * #532 — the Clarion Quick Open list honours the exclude settings, keeps same-named
 * files apart, and covers every workspace root.
 *
 * Mark's case: `"files.exclude": { "**\/Archive": true }`; typing `ui3d` listed the
 * Archive copy of UI_3D_Placements.clw and not the Src\UI one.
 */
describe('QuickOpenList (#532)', () => {
    const R1 = path.win32.join('E:', 'Dev', 'TSI-Est');
    const R2 = path.win32.join('E:', 'Dev', 'Tools');
    const RED = path.win32.join('C:', 'Clarion11', 'Accessory', 'libsrc', 'win');

    // In-memory tree: dir → entries
    const tree = new Map<string, DirEntry[]>([
        [R1, [{ name: 'Src', isDirectory: true }, { name: 'Archive', isDirectory: true }, { name: 'b47.sln', isDirectory: false }]],
        [path.join(R1, 'Src'), [{ name: 'UI', isDirectory: true }]],
        [path.join(R1, 'Src', 'UI'), [{ name: 'UI_3D_Placements.clw', isDirectory: false }, { name: 'UI_3D_Elevation.clw', isDirectory: false }, { name: 'notes.txt', isDirectory: false }]],
        [path.join(R1, 'Archive'), [{ name: 'Restored Over', isDirectory: true }]],
        [path.join(R1, 'Archive', 'Restored Over'), [{ name: 'UI_3D_Placements.clw', isDirectory: false }]],
        [R2, [{ name: 'Lib', isDirectory: true }]],
        [path.join(R2, 'Lib'), [{ name: 'Helper.clw', isDirectory: false }]],
        [RED, [{ name: 'StringTheory.inc', isDirectory: false }]],
    ]);
    const readDir = (dir: string): DirEntry[] => {
        const hit = [...tree.entries()].find(([k]) => k.toLowerCase() === dir.toLowerCase());
        if (!hit) throw new Error('ENOENT ' + dir);
        return hit[1];
    };
    const base = {
        projectFiles: [{ name: 'UI_3D_Elevation.clw', fullPath: path.join(R1, 'Src', 'UI', 'UI_3D_Elevation.clw'), project: 'b47' }],
        roots: [{ name: 'TSI-Est', path: R1 }, { name: 'Tools', path: R2 }],
        redirectionPaths: [RED, path.join(R1, 'Src')],
        allowedExtensions: ['.clw', '.inc'],
        readDir,
    };
    const byName = (items: { label: string; description: string; path: string }[], name: string) =>
        items.filter(i => path.basename(i.path).toLowerCase() === name.toLowerCase());

    it('honours files.exclude: the Archive copy is absent and the Src\\UI copy is listed', () => {
        const items = buildQuickOpenItems({ ...base, excludeGlobs: new Map([[R1.toLowerCase(), ['**/Archive']]]) });
        const hits = byName(items, 'UI_3D_Placements.clw');
        assert.strictEqual(hits.length, 1, JSON.stringify(hits));
        assert.ok(hits[0].path.includes('Src'), hits[0].path);
        assert.strictEqual(hits[0].description, `TSI-Est • ${path.join('Src', 'UI')}`);
    });

    it('without an exclude, both same-named files are listed and told apart by their folder', () => {
        const items = buildQuickOpenItems({ ...base, excludeGlobs: new Map() });
        const hits = byName(items, 'UI_3D_Placements.clw');
        assert.strictEqual(hits.length, 2, 'no base-name dedupe');
        assert.deepStrictEqual(hits.map(h => h.description).sort(), [
            `TSI-Est • ${path.join('Archive', 'Restored Over')}`,
            `TSI-Est • ${path.join('Src', 'UI')}`,
        ]);
    });

    it('a .cwproj item is listed once, under its project, not again from the folder scan', () => {
        const items = buildQuickOpenItems({ ...base, excludeGlobs: new Map() });
        const hits = byName(items, 'UI_3D_Elevation.clw');
        assert.strictEqual(hits.length, 1);
        assert.strictEqual(hits[0].description, 'b47');
    });

    it('every workspace root is scanned, labelled with its folder name', () => {
        const items = buildQuickOpenItems({ ...base, excludeGlobs: new Map() });
        const helper = byName(items, 'Helper.clw');
        assert.strictEqual(helper.length, 1);
        assert.strictEqual(helper[0].description, `Tools • Lib`);
    });

    it('redirection paths outside the roots are scanned; those inside are not scanned twice', () => {
        const items = buildQuickOpenItems({ ...base, excludeGlobs: new Map() });
        const st = byName(items, 'StringTheory.inc');
        assert.strictEqual(st.length, 1);
        assert.ok(st[0].description.startsWith('Redirection:'), st[0].description);
        assert.strictEqual(byName(items, 'UI_3D_Elevation.clw').length, 1, 'Src is inside a root: no second entry');
    });

    it('only allowed extensions are listed', () => {
        const items = buildQuickOpenItems({ ...base, excludeGlobs: new Map() });
        assert.strictEqual(byName(items, 'notes.txt').length, 0);
        assert.strictEqual(byName(items, 'b47.sln').length, 0);
    });

    it('isExcluded matches a folder anywhere in the path, like VS Code', () => {
        assert.strictEqual(isExcluded('Archive/Restored Over/x.clw', ['**/Archive']), true);
        assert.strictEqual(isExcluded('Src/Archive/x.clw', ['**/Archive']), true);
        assert.strictEqual(isExcluded('Src/UI/x.clw', ['**/Archive']), false);
        assert.strictEqual(isExcluded('Src/UI/x.clw', ['**/*.clw']), true);
        assert.strictEqual(isExcluded('obj/x.clw', ['**/obj/**']), true);
    });
});
