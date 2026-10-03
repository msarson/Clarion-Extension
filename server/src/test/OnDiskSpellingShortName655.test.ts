import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { onDiskSpelling } from '../utils/UriUtils';

/**
 * #655 follow-up — a segment given by its short 8.3 name is spelled as the directory lists it.
 * Windows hands out short paths (%TEMP% itself is one on many machines), and none of them is
 * ever listed under its short name, so the segment-by-segment walk stopped there.
 */

/** The short 8.3 form of existing `p`, or undefined where the volume gives it none. */
function shortPathOf(p: string): string | undefined {
    if (process.platform !== 'win32') return undefined;
    try {
        const out = execSync(`for %I in ("${p}") do @echo %~sI`, { encoding: 'utf8' }).trim();
        return out.includes('~') ? out : undefined;
    } catch {
        return undefined;
    }
}

suite('#655 follow-up: onDiskSpelling expands short 8.3 path segments', () => {
    let root: string;
    let target: string;
    let shortTarget: string | undefined;

    setup(() => {
        root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'short655-')));
        fs.mkdirSync(path.join(root, 'LongFolderName', 'AnotherLongFolder'), { recursive: true });
        target = path.join(root, 'LongFolderName', 'AnotherLongFolder', 'Library.INC');
        fs.writeFileSync(target, '');
        shortTarget = shortPathOf(target);
    });

    teardown(() => fs.rmSync(root, { recursive: true, force: true }));

    test('a path given through short names comes back spelled as listed', function () {
        if (!shortTarget) this.skip(); // not Windows, or 8.3 names are off on this volume
        assert.strictEqual(onDiskSpelling(shortTarget!.toLowerCase()), target);
    });

    test('a short name above a missing segment still leaves the path as given', function () {
        if (!shortTarget) this.skip();
        const missing = path.join(path.dirname(shortTarget!), 'Gone.inc').toLowerCase();
        assert.strictEqual(onDiskSpelling(missing), missing);
    });

    test('a short name directly under a drive root is expanded too', function () {
        const programFiles = process.env.ProgramFiles;
        const shortProgramFiles = programFiles ? shortPathOf(programFiles) : undefined;
        if (!shortProgramFiles) this.skip();
        assert.strictEqual(onDiskSpelling(shortProgramFiles!.toLowerCase()).toLowerCase(), programFiles!.toLowerCase());
    });
});
