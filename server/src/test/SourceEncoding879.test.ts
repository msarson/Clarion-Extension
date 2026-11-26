/**
 * #879 — a Clarion source the server reads from disk is decoded as the editor decodes it.
 *
 * VS Code decodes an open file with `files.encoding`; the server read every file it opened itself
 * as UTF-8, so a Windows-1251 INCLUDE's Cyrillic comment came out garbled in the hover, and each
 * invalid byte became U+FFFD. The rule (Owner's decision): a UTF-8 BOM or bytes that are valid
 * UTF-8 are read as UTF-8; anything else with the encoding VS Code uses for Clarion files.
 * Plain ASCII reads the same either way.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { decodeSource, readSourceText, setSourceEncoding } from '../utils/SourceText';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';

// "Сумма документа" ("document total") in Windows-1251 bytes, and the same text in UTF-8.
const SUMMA_1251 = Buffer.from([0xD1, 0xF3, 0xEC, 0xEC, 0xE0, 0x20, 0xE4, 0xEE, 0xEA, 0xF3, 0xEC, 0xE5, 0xED, 0xF2, 0xE0]);
const SUMMA = 'Сумма документа';

suite('Clarion sources read from disk keep their encoding (#879)', () => {
    teardown(() => setSourceEncoding(undefined));

    suite('decodeSource', () => {
        test('Windows-1251 bytes decode with the configured encoding', () => {
            setSourceEncoding('windows1251');
            assert.strictEqual(decodeSource(Buffer.concat([Buffer.from('  ! '), SUMMA_1251])), '  ! ' + SUMMA);
        });

        test('valid UTF-8 stays UTF-8 whatever the setting', () => {
            setSourceEncoding('windows1251');
            assert.strictEqual(decodeSource(Buffer.from('  ! ' + SUMMA, 'utf8')), '  ! ' + SUMMA);
        });

        test('a UTF-8 BOM is read as UTF-8, and kept as a UTF-8 read keeps it', () => {
            setSourceEncoding('windows1251');
            const text = '﻿  PROGRAM ! ' + SUMMA;
            assert.strictEqual(decodeSource(Buffer.from(text, 'utf8')), text);
        });

        test('plain ASCII is the same under any setting', () => {
            for (const enc of [undefined, 'utf8', 'windows1251', 'windows1252', 'cp866']) {
                setSourceEncoding(enc);
                assert.strictEqual(decodeSource(Buffer.from("  MESSAGE('Hi')\r\n")), "  MESSAGE('Hi')\r\n");
            }
        });

        test('with the setting left at UTF-8, an ANSI file reads as Windows-1252, as the editor shows it', () => {
            setSourceEncoding('utf8');
            assert.strictEqual(decodeSource(Buffer.from([0x43, 0x61, 0x66, 0xE9])), 'Café');
        });

        test('an unknown encoding name falls back to Windows-1252 rather than failing', () => {
            setSourceEncoding('no-such-encoding');
            assert.strictEqual(decodeSource(Buffer.from([0xE9])), 'é');
        });

        test('readSourceText reads a file with the same rule', () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce879-'));
            try {
                const p = path.join(dir, 'a.inc');
                fs.writeFileSync(p, SUMMA_1251);
                setSourceEncoding('windows1251');
                assert.strictEqual(readSourceText(p), SUMMA);
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
    });

    suite('the hover on a field declared in a Windows-1251 INCLUDE', () => {
        let dir: string;
        let savedSm: unknown;
        setup(() => {
            savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
            (SolutionManager as unknown as { instance: unknown }).instance = null;
            StructureDeclarationIndexer.getInstance().clearCache();
            TokenCache.getInstance().clearAllTokens();
            dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce879h-'));
        });
        teardown(() => {
            fs.rmSync(dir, { recursive: true, force: true });
            (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
            StructureDeclarationIndexer.getInstance().clearCache();
            TokenCache.getInstance().clearAllTokens();
        });

        test('shows the Cyrillic comment as written', async () => {
            setSourceEncoding('windows1251');
            fs.writeFileSync(path.join(dir, 'fields.inc'), Buffer.concat([
                Buffer.from('Totals               GROUP,PRE(TOT)\r\nAmount                 DECIMAL(9,2)   ! '),
                SUMMA_1251,
                Buffer.from('\r\n                     END\r\n'),
            ]));
            const src = [
                '  PROGRAM',
                "  INCLUDE('fields.inc'),ONCE",
                '  MAP',
                '  END',
                '  CODE',
                '  TOT:Amount = 1',
            ].join('\r\n');
            const mainPath = path.join(dir, 'main.clw');
            fs.writeFileSync(mainPath, src);
            const uri = 'file:///' + mainPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, (_m, d) => d + '%3A');
            const doc = TextDocument.create(uri, 'clarion', 1, src);
            TokenCache.getInstance().getTokens(doc);
            const hover = await new HoverProvider().provideHover(doc, Position.create(5, 7));
            const c = (hover as { contents: unknown } | null)?.contents;
            const text = typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '');
            assert.ok(text.includes('Amount'), `a card for the field; got: ${text}`);
            assert.ok(text.includes(SUMMA), `the comment as written; got: ${text}`);
            assert.ok(!text.includes('�'), `no replacement characters; got: ${text}`);
        });
    });
});
