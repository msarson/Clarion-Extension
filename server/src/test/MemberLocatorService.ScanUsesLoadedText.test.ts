/**
 * MemberLocatorService — the member-enumeration fallback scans the loaded text, not the disk.
 *
 * findAllMembersInClass tries the document's tokens first and falls back to a line scan of the
 * class body (scanClassBodyForAllMembers) when the tokens yield nothing. That fallback re-read
 * the file from disk by path — three times per class, once per structure type — so for an open
 * document with unsaved edits it scanned stale content instead of the buffer, and for every
 * file visited by the include-chain walk it paid three readFileSync calls that the token pass
 * had already paid once. Both sites now pass the text they already hold as contentOverride.
 *
 * The include-chain site is a pure cost change (the loaded text there is what was read from
 * disk), so the behavioural test targets the open-document tier: a buffer that declares a class
 * the file on disk does not contain must still enumerate that class.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { setServerInitialized } from '../serverState';

let tmpDir: string;

const HEADER = ['  PROGRAM', '  MAP', '  END'];
const CLASS_DECL = [
    'Widget   CLASS,TYPE',
    'Name       STRING(20)',
    'Size       LONG',
    'Refresh    PROCEDURE()',
    '         END',
];
const FOOTER = ['  CODE'];

function writeDisk(filename: string, lines: string[]): string {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, lines.join('\r\n'));
    return filePath;
}

function bufferDoc(filePath: string, lines: string[], version: number): TextDocument {
    const uri = `file:///${filePath.replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', version, lines.join('\r\n'));
}

/**
 * The token tier normally finds a class declared in the buffer on its own; the line-scan
 * fallback exists for the shapes it does not. Simulate that gap so the test exercises the
 * fallback itself rather than the token tier.
 */
function serviceWithTokenTierDisabled(): MemberLocatorService {
    const service = new MemberLocatorService();
    (service as any).extractMembersFromTokens = () => [];
    return service;
}

suite('MemberLocatorService — enumeration fallback scans the loaded text', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mlsScanLoaded_'));
    });
    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    test('a class declared only in the unsaved buffer is enumerated from the buffer', async () => {
        // Disk: no class. Buffer (a later version of the same document): the class.
        const filePath = writeDisk('Unsaved.clw', [...HEADER, ...FOOTER]);
        const doc = bufferDoc(filePath, [...HEADER, ...CLASS_DECL, ...FOOTER], 2);

        const members = await serviceWithTokenTierDisabled().enumerateMembersInClass('Widget', doc);

        assert.deepStrictEqual(
            members.map(m => m.name).sort(),
            ['Name', 'Refresh', 'Size'],
            'the fallback must scan the document text; scanning the file on disk finds no class at all'
        );
    });

    test('control: the same class saved to disk enumerates identically', async () => {
        const filePath = writeDisk('Saved.clw', [...HEADER, ...CLASS_DECL, ...FOOTER]);
        const doc = bufferDoc(filePath, [...HEADER, ...CLASS_DECL, ...FOOTER], 1);

        const members = await serviceWithTokenTierDisabled().enumerateMembersInClass('Widget', doc);

        assert.deepStrictEqual(members.map(m => m.name).sort(), ['Name', 'Refresh', 'Size']);
    });
});
