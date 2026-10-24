import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import { resolutionEnvironmentKey, RESOLUTION_RULES } from '../solution/resolutionEnvironmentKey';

/**
 * #770 — the persisted reachable include-name set (#366) recorded only the files that resolved.
 * An include that did not resolve, and everything it includes, left no trace, so when it became
 * resolvable later (a resolver fix such as #769's masks, or the file appearing) with every recorded
 * file unchanged, the old set was reused and the chain past it stayed invisible: a type declared
 * there was reported "not included".
 *
 * Layout: Host.clw INCLUDEs Other.inc (resolves) and Mid.inc (missing at first); Mid.inc will
 * INCLUDE Leaf.inc.
 */
suite('A persisted reachable set is rebuilt when an unresolved include resolves (#770)', () => {
    let dir = '';

    function write(name: string, lines: string[]): string {
        const file = path.join(dir, name);
        fs.writeFileSync(file, lines.join('\r\n') + '\r\n');
        return file;
    }

    function docFor(file: string): TextDocument {
        const uri = 'file:///' + file.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
        return TextDocument.create(uri, 'clarion', 1, fs.readFileSync(file, 'utf-8'));
    }

    setup(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reachable770-'));
        IncludeVerifier.getInstance().clearCache();
    });

    teardown(() => {
        IncludeVerifier.getInstance().clearCache();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    });

    test('an include past one that has become resolvable is counted after a restart', async () => {
        write('Other.inc', ["OtherT  GROUP,TYPE", "x         LONG", "        END"]);
        const host = docFor(write('Host.clw', ["  MEMBER()", "  INCLUDE('Other.inc'),ONCE", "  INCLUDE('Mid.inc'),ONCE", "  MAP", "  END"]));
        const iv = IncludeVerifier.getInstance();
        assert.strictEqual(await iv.isClassIncluded('Leaf.inc', host), false, 'Mid.inc is missing: Leaf.inc is out of reach');

        write('Mid.inc', ["  INCLUDE('Leaf.inc'),ONCE"]);
        write('Leaf.inc', ["ILeaf  INTERFACE,TYPE", "      END"]);
        iv.clearCache(); // what a restart leaves: only the disk cache

        assert.strictEqual(await iv.isClassIncluded('Leaf.inc', host), true,
            'Mid.inc now resolves, so Leaf.inc is reachable; the persisted set from before must not be reused');
    });

    test('regression: the persisted set is still reused when nothing changed', async () => {
        write('Other.inc', ["OtherT  GROUP,TYPE", "x         LONG", "        END"]);
        const host = docFor(write('Host.clw', ["  MEMBER()", "  INCLUDE('Other.inc'),ONCE", "  INCLUDE('StillMissing.inc'),ONCE", "  MAP", "  END"]));
        const iv = IncludeVerifier.getInstance();
        // a name that is not a direct include, so the reachable set is consulted
        await iv.isClassIncluded('Elsewhere.inc', host);
        iv.clearCache();
        const before = iv.getReachableSetDiskReuseCount();
        assert.strictEqual(await iv.isClassIncluded('Elsewhere.inc', host), false);
        assert.strictEqual(iv.getReachableSetDiskReuseCount() - before, 1, 'an unchanged chain reuses the disk set');
    });

    test('the resolution environment key carries the resolution rules stamp', () => {
        assert.ok(resolutionEnvironmentKey().includes(`rules:${RESOLUTION_RULES}`), resolutionEnvironmentKey());
    });
});
