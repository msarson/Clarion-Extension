/**
 * The SDI's search-path extraction must resolve RELATIVE redirection entries (`.`, `.\`,
 * `.\sub`) against the PROJECT directory — not against the directory holding the .red file.
 *
 * Real-world failure this guards: the active redirection file was the global fallback at
 * `%ClarionRoot%\bin\Clarion110.red`, whose `*.inc` line begins with `.\$$;  .\; <shared
 * library paths>; ...`. Resolving `.\` against the .red file's own folder pointed the scan
 * at the Clarion INSTALL's bin directory, so every one of the project's own `.inc` files —
 * the ordinary Clarion layout, includes sitting beside the .app — was silently absent from
 * the index. Only absolute shared-library entries indexed, which made the bug look
 * type-specific: a type with a duplicate declaration in one of those shared folders
 * resolved fine, while a type declared only in the project's own directory returned
 * "SDI KNOWS NOTHING ABOUT THIS NAME" forever.
 *
 * RedirectionFileParserServer already resolves relative entries this way (per Clarion 11.1
 * docs); this is the parallel implementation inside the indexer that had drifted.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';

suite('StructureDeclarationIndexer — relative .red search paths resolve against the project dir', () => {

    let projectDir: string;
    let redDir: string;
    let redFile: string;

    suiteSetup(() => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdi-searchpath-'));
        projectDir = path.join(root, 'MyProject');
        redDir = path.join(root, 'ClarionInstall', 'bin');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.mkdirSync(redDir, { recursive: true });
        redFile = path.join(redDir, 'Clarion110.red');
        fs.writeFileSync(redFile, '[Common]\n*.inc = .\\\n');
    });

    function extract(paths: string[], projectPath?: string): string[] {
        const sdi = StructureDeclarationIndexer.getInstance() as any;
        const entries = [{ extension: '*.inc', paths, redFile, stopsSearch: false }];
        return sdi.extractSearchPaths(entries, projectPath);
    }

    test('"." resolves to the project dir, not the .red file dir', () => {
        const resolved = extract(['.'], projectDir);
        assert.ok(
            resolved.some(p => path.normalize(p) === path.normalize(projectDir)),
            `expected the project dir in ${JSON.stringify(resolved)}`
        );
        assert.ok(
            !resolved.some(p => path.normalize(p) === path.normalize(redDir)),
            `the .red file's own dir must NOT be used as the base: ${JSON.stringify(resolved)}`
        );
    });

    test('".\\" (trailing separator, as written in a real .red) resolves to the project dir', () => {
        const resolved = extract(['.\\'], projectDir);
        assert.ok(
            resolved.some(p => path.normalize(p) === path.normalize(projectDir)),
            `expected the project dir in ${JSON.stringify(resolved)}`
        );
    });

    test('a relative SUBdirectory resolves under the project dir', () => {
        const sub = path.join(projectDir, 'classes');
        fs.mkdirSync(sub, { recursive: true });
        const resolved = extract(['.\\classes'], projectDir);
        assert.ok(
            resolved.some(p => path.normalize(p) === path.normalize(sub)),
            `expected ${sub} in ${JSON.stringify(resolved)}`
        );
    });

    test('absolute entries are unaffected', () => {
        const resolved = extract([redDir], projectDir);
        assert.ok(
            resolved.some(p => path.normalize(p) === path.normalize(redDir)),
            `absolute paths must pass through: ${JSON.stringify(resolved)}`
        );
    });

    test('falls back to the .red file dir when no project dir is supplied', () => {
        const resolved = extract(['.'], undefined);
        assert.ok(
            resolved.some(p => path.normalize(p) === path.normalize(redDir)),
            `expected the .red dir as fallback in ${JSON.stringify(resolved)}`
        );
    });
});
