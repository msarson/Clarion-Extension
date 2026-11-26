/**
 * #879 guard — the server reads Clarion source through utils/SourceText (readSourceText /
 * readSourceTextAsync), never as plain UTF-8: an ANSI INCLUDE read with readFileSync(p, 'utf8')
 * comes out with U+FFFD where its accented or Cyrillic text was.
 *
 * The files below are the only ones the server may read as UTF-8, because they are UTF-8 by
 * definition: project and solution XML, package.json, and the server's own JSON caches. A new
 * reader of a source file fails this test; a new reader of such a file is added here, with the
 * text that identifies its line.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED: Record<string, string[]> = {
    'buildInfo.ts': ['pkgPath'],                                    // package.json
    'FileRelationshipGraph.ts': ['diskCachePath'],                  // its JSON cache
    'services/IncludeIndexDiskCache.ts': ['cacheFile('],            // JSON cache
    'services/ReferenceCountIndex.ts': ['diskCachePath'],           // JSON cache
    'solution/clarionProjectServer.ts': ['projectFile'],            // .cwproj
    'solution/ProjectDefines.ts': ['cwproj'],                       // .cwproj
    'solution/redirectionFileParserServer.ts': ['cwproj'],          // .cwproj
    'solution/solutionManager.ts': ['solutionFilePath', 'projectFilePath'], // .sln, .cwproj
    'utils/IncludeVerifier.ts': ['diskListsPath'],                  // JSON cache
    'utils/ProjectConstantsChecker.ts': ['projectFilePath'],        // .cwproj
    'utils/StructureDeclarationIndexer.ts': ['diskCachePath'],      // JSON cache
};

suite('Clarion source is never read as plain UTF-8 (#879)', () => {
    test('every UTF-8 file read in the server is of a file that is UTF-8 by definition', () => {
        const srcRoot = path.resolve(__dirname, '..', '..', '..', '..', 'server', 'src');
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'test') walk(full);
                    continue;
                }
                if (!entry.name.endsWith('.ts') || entry.name === 'SourceText.ts') continue;
                const rel = path.relative(srcRoot, full).replace(/\\/g, '/');
                const allowed = ALLOWED[rel] ?? [];
                fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
                    // A file read as text in a named encoding (UTF-8, Latin-1, binary), an encoding
                    // option, or a decoder of its own: each is a second rule for decoding a file.
                    const textRead = /readFile(Sync)?\([^;]*['"](utf-?8|latin1|binary|ascii)['"]/.test(line)
                        || /readFile(Sync)?\([^;]*\bencoding\s*:/.test(line)
                        || /new TextDecoder\b/.test(line);
                    if (textRead && !allowed.some(a => line.includes(a))) {
                        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
                    }
                });
            }
        };
        walk(srcRoot);
        assert.deepStrictEqual(offenders, [], 'read Clarion source with readSourceText from utils/SourceText');
    });
});
