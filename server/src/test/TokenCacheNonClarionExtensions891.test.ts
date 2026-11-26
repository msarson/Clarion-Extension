import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TokenCache } from '../TokenCache';

/**
 * #891 (from #888's review) — a closed file of another language is never tokenized as Clarion.
 * #888 skipped `.a`, `.c`, `.cpp` and `.h`; the other usual C/C++ and assembler extensions still
 * reached the tokenizer, so their text could show up in Find All References, hover and the
 * index. Clarion's own source extensions are still read.
 */
suite('TokenCache does not read other languages\' sources as Clarion (#891)', () => {
    let dir = '';
    const TEXT = 'Code  LONG\r\n  CODE\r\n  Code = 1\r\n';
    setup(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce891-')); });
    teardown(() => { fs.rmSync(dir, { recursive: true, force: true }); });
    const tokensOf = (name: string): number => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, TEXT);
        const uri = 'file:///' + file.replace(/\\/g, '/');
        TokenCache.getInstance().clearTokens(uri);
        return TokenCache.getInstance().getTokensForClosedFile(uri).length;
    };

    for (const ext of ['cc', 'cxx', 'hpp', 'hh', 'hxx', 'asm', 's', 'CPP', 'ASM']) {
        test(`a .${ext} file gives no tokens`, () => {
            assert.strictEqual(tokensOf(`helper.${ext}`), 0);
        });
    }

    for (const ext of ['clw', 'inc', 'equ', 'int', 'trn', 'CLW']) {
        test(`a .${ext} file is still read as Clarion`, () => {
            assert.ok(tokensOf(`source.${ext}`) > 0);
        });
    }
});
