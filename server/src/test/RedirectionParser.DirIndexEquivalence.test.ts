import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RedirectionFileParserServer } from '../solution/redirectionFileParserServer';
import { DirectoryFileIndex } from '../solution/DirectoryFileIndex';
import { serverSettings } from '../serverSettings';

/**
 * #288 — `findFile(name, dirIndex)` must return EXACTLY what `findFile(name)` returns; the index
 * only changes how existence is checked (one cached readdir per dir vs a stat per candidate).
 * Covers each resolution tier: RED-entry hit, project-root hit (Tier 2), pathed filename, miss.
 */
suite('#288 findFile dirIndex equivalence', () => {
    let tmpRoot: string;
    let projDir: string;
    let savedRedirectionFile = '';
    let savedLibsrcPaths: string[] = [];
    let savedConfiguration = '';

    const RED =
        '[Common]\n' +
        '*.clw = .\\src\n' +
        '*.inc = .\\includes\n';

    setup(() => {
        savedRedirectionFile = serverSettings.redirectionFile;
        savedLibsrcPaths = serverSettings.libsrcPaths;
        savedConfiguration = serverSettings.configuration;
        serverSettings.redirectionFile = 'Clarion110.red';
        serverSettings.libsrcPaths = [];
        serverSettings.configuration = 'Release';

        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'red-dfi-288-'));
        projDir = path.join(tmpRoot, 'Proj');
        fs.mkdirSync(path.join(projDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(projDir, 'includes'), { recursive: true });
        fs.writeFileSync(path.join(projDir, 'Clarion110.red'), RED);
        fs.writeFileSync(path.join(projDir, 'src', 'Main.clw'), '! src');
        fs.writeFileSync(path.join(projDir, 'includes', 'Utils.inc'), '! inc');
        fs.writeFileSync(path.join(projDir, 'AtRoot.clw'), '! root');

        DirectoryFileIndex.getInstance().clear();
    });

    teardown(() => {
        serverSettings.redirectionFile = savedRedirectionFile;
        serverSettings.libsrcPaths = savedLibsrcPaths;
        serverSettings.configuration = savedConfiguration;
        DirectoryFileIndex.getInstance().clear();
        try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    function freshParser(): RedirectionFileParserServer {
        const parser = new RedirectionFileParserServer();
        parser.parseRedFile(projDir);
        return parser;
    }

    test('identical results with and without the index across all tiers', () => {
        const parser = freshParser();
        const idx = DirectoryFileIndex.getInstance();
        const cases = [
            'Main.clw',                        // RED-entry hit (.\src)
            'Utils.inc',                       // RED-entry hit (.\includes)
            'AtRoot.clw',                      // Tier 2 project-root hit
            'Missing.clw',                     // miss
            path.join('src', 'Main.clw'),      // pathed → project-root join
            path.join(projDir, 'AtRoot.clw'),  // absolute
        ];
        for (const name of cases) {
            const plain = parser.findFile(name);
            const indexed = parser.findFile(name, idx);
            assert.deepStrictEqual(
                indexed,
                plain,
                `findFile('${name}') diverged: plain=${JSON.stringify(plain)} indexed=${JSON.stringify(indexed)}`
            );
        }
        assert.ok(idx.stats().lookups > 0, 'the indexed calls actually consulted the index');
    });

    test('index absorbs repeat lookups: many files resolved with few directory reads', () => {
        const parser = freshParser();
        const idx = DirectoryFileIndex.getInstance();
        for (let i = 0; i < 30; i++) fs.writeFileSync(path.join(projDir, 'src', `Gen${i}.clw`), '!');
        idx.clear(); // pick up the new files, then measure
        for (let i = 0; i < 30; i++) {
            const r = parser.findFile(`Gen${i}.clw`, idx);
            assert.ok(r?.path.toLowerCase().endsWith(`gen${i}.clw`), `Gen${i}.clw resolves`);
        }
        const s = idx.stats();
        assert.ok(s.dirsRead <= 3, `30 files should need at most a few readdirs, got ${s.dirsRead}`);
    });
});
