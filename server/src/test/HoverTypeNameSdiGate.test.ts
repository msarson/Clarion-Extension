import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { StructureFieldResolver } from '../providers/hover/StructureFieldResolver';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { serverSettings } from '../serverSettings';

/**
 * #361 — resolveTypeNameHover's include walk (findTypeDeclarationInIncludes) does
 * a recursive fs.readFileSync + tokenize of every reachable INCLUDE. On the real
 * IBSCommon.clw a hover over a word that is NOT a type walked the whole
 * ABC/NetTalk/libsrc universe synchronously — a 38s frozen editor. The SDI is a
 * superset of the document's reachable includes, so the walk is gated on it: an
 * SDI miss returns null WITHOUT the walk; an SDI hit still walks (and finds the
 * type). These tests pin both directions using REAL SDI state (no singleton
 * stubbing — that leaks across the shared indexer into other suites).
 */
suite('HoverProvider - resolveTypeNameHover SDI gate (#361)', () => {

    let tmpDir: string;
    let docPath: string;
    let savedLibsrc: string[] = [];
    const indexer = StructureDeclarationIndexer.getInstance();

    function makeResolver(): StructureFieldResolver {
        // resolveTypeNameHover uses only tokenCache + the SDI; the three ctor
        // deps (formatter/method/variable resolvers) are unused on this path.
        return new StructureFieldResolver(undefined as never, undefined as never, undefined as never);
    }

    setup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hover-sdi-gate-361-'));
        // An include that genuinely declares MyType, so the walk WOULD find it.
        fs.writeFileSync(path.join(tmpDir, 'types.inc'),
            'MyType QUEUE,TYPE\nField  LONG\n       END\n');
        docPath = path.join(tmpDir, 'host.clw');
        fs.writeFileSync(docPath, `  MEMBER()\n  INCLUDE('types.inc')\n`);
        savedLibsrc = serverSettings.libsrcPaths;
        indexer.clearCache();
    });

    teardown(() => {
        serverSettings.libsrcPaths = savedLibsrc;
        indexer.clearCache();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    function hostDoc(): TextDocument {
        const uri = 'file:///' + docPath.replace(/\\/g, '/');
        return TextDocument.create(uri, 'clarion', 1, fs.readFileSync(docPath, 'utf8'));
    }

    test('SDI miss → include walk is skipped, hover is null even though an include declares the type', async () => {
        // Empty SDI (cleared in setup) → find('MyType') === []. The include DOES
        // declare MyType, so a pre-fix walk would find it; the gate must skip it.
        const hover = await makeResolver().resolveTypeNameHover('MyType', hostDoc());
        assert.strictEqual(hover, null,
            'on an SDI miss the walk must be skipped (the 38s freeze path)');
    });

});
