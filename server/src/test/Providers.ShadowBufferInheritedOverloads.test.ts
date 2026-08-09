import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SignatureHelpProvider } from '../providers/SignatureHelpProvider';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { setServerInitialized } from '../serverState';

/**
 * #369 — Shadow-buffer inherited-overload regression (Clarion Assistant PWEE embeditor).
 *
 * A `SELF._CallErrorTrap(` call inside `WebClient.PageReceived`, where
 * `WebClient CLASS(NetWebClient)` and `_CallErrorTrap`'s 3 overloads live on the
 * NetWebClient ancestor. Signature help must enumerate all 3 overloads.
 *
 * Two forms of the SAME caller document exercise this:
 *   - REAL: the on-disk MEMBER module — has the method IMPLEMENTATION only;
 *     `WebClient CLASS(NetWebClient)` (no local `_CallErrorTrap`) lives in an
 *     INCLUDE'd .inc. Substrate current-file scan finds nothing → the
 *     inheritance-aware enumeration runs → 3 overloads.
 *   - SHADOW: the PWEE-expanded buffer that the embed host pushes over the SAME
 *     module path via didChange. It explicitly re-declares the inherited
 *     `_CallErrorTrap ...,DERIVED` inside WebClient's own body. That single local
 *     declaration must NOT collapse the visible overload set to 1.
 *
 * Pre-fix: the shadow buffer returns 1 signature; the real module returns 3.
 */

const NETWEB_INC = [
    'NetWebClient  CLASS,TYPE',                              // line 0
    '_CallErrorTrap  PROCEDURE(LONG errCode),VIRTUAL',       // line 1
    '_CallErrorTrap  PROCEDURE(STRING errMsg),VIRTUAL',      // line 2
    '_CallErrorTrap  PROCEDURE(),VIRTUAL',                   // line 3
    '              END',                                     // line 4
].join('\n');

const WEBCLIENT_INC = [
    'WebClient  CLASS(NetWebClient),TYPE',                   // line 0 — no local _CallErrorTrap
    'PageReceived  PROCEDURE(),DERIVED',                     // line 1
    '           END',                                        // line 2
].join('\n');

/** REAL on-disk MEMBER module: implementation only, class decl reached via INCLUDE. */
function realModuleSource(): string[] {
    return [
        "  MEMBER('prog.clw')",                              // line 0
        "  INCLUDE('webclient.inc')",                        // line 1
        "  INCLUDE('netweb.inc')",                           // line 2
        '',                                                  // line 3
        'WebClient.PageReceived  PROCEDURE()',               // line 4
        '  CODE',                                            // line 5
        '  SELF._CallErrorTrap(',                            // line 6 — CALL SITE
    ];
}

/** SHADOW PWEE buffer over the SAME path: re-declares the inherited method as DERIVED. */
function shadowBufferSource(): string[] {
    return [
        "  MEMBER('prog.clw')",                              // line 0
        "  INCLUDE('webclient.inc')",                        // line 1
        "  INCLUDE('netweb.inc')",                           // line 2
        '',                                                  // line 3
        'WebClient  CLASS(NetWebClient),TYPE',               // line 4 — PWEE re-expands the class body
        '_CallErrorTrap  PROCEDURE(LONG errCode),DERIVED',   // line 5 — single DERIVED re-declaration
        'PageReceived    PROCEDURE(),DERIVED',               // line 6
        '             END',                                  // line 7
        '',                                                  // line 8
        'WebClient.PageReceived  PROCEDURE()',               // line 9
        '  CODE',                                            // line 10
        '  SELF._CallErrorTrap(',                            // line 11 — CALL SITE
    ];
}

let tmpDir: string;
let origFind: typeof StructureDeclarationIndexer.prototype.find;
let origBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;

function write(name: string, content: string): string {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, content);
    return p;
}

async function countSignatures(moduleFileName: string, lines: string[], callLine: number): Promise<number | null> {
    const p = write(moduleFileName, lines.join('\n'));
    const uri = `file:///${p.replace(/\\/g, '/')}`;
    const doc = TextDocument.create(uri, 'clarion', 1, lines.join('\n'));
    TokenCache.getInstance().getTokens(doc);
    const provider = new SignatureHelpProvider();
    const cursor = { line: callLine, character: lines[callLine].length };
    const r = await provider.provideSignatureHelp(doc, cursor);
    TokenCache.getInstance().clearTokens(uri);
    return r ? r.signatures.length : null;
}

suite('SignatureHelpProvider — inherited overloads survive a didChange shadow buffer', () => {

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-ovl-'));
        write('netweb.inc', NETWEB_INC);
        write('webclient.inc', WEBCLIENT_INC);
    });

    suiteTeardown(() => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    setup(() => {
        origFind = StructureDeclarationIndexer.prototype.find;
        origBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        StructureDeclarationIndexer.prototype.getOrBuildIndex =
            (async () => ({})) as unknown as typeof origBuild;
        StructureDeclarationIndexer.prototype.find = ((name: string): StructureDeclarationInfo[] => {
            const lower = name.toLowerCase();
            if (lower === 'webclient') {
                return [{
                    name: 'WebClient', filePath: path.join(tmpDir, 'webclient.inc'), line: 0,
                    structureType: 'CLASS', isType: false, parentName: 'NetWebClient',
                    lineContent: 'WebClient CLASS(NetWebClient),TYPE',
                } as StructureDeclarationInfo];
            }
            if (lower === 'netwebclient') {
                return [{
                    name: 'NetWebClient', filePath: path.join(tmpDir, 'netweb.inc'), line: 0,
                    structureType: 'CLASS', isType: false,
                    lineContent: 'NetWebClient CLASS,TYPE',
                } as StructureDeclarationInfo];
            }
            return [];
        }) as typeof origFind;
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.find = origFind;
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origBuild;
        TokenCache.getInstance().clearAllTokens();
    });

    test('REAL on-disk module — enumerates all 3 inherited overloads', async () => {
        const src = realModuleSource();
        const count = await countSignatures('real001.clw', src, src.length - 1);
        assert.strictEqual(count, 3, `real module must show 3 overloads, got ${count}`);
    });

    test('SHADOW PWEE buffer — inherited overloads survive the local DERIVED re-declaration', async () => {
        const src = shadowBufferSource();
        const count = await countSignatures('shadow001.clw', src, src.length - 1);
        assert.strictEqual(count, 3,
            `shadow buffer must still show all 3 overloads, got ${count}. ` +
            `A single local DERIVED re-declaration must not collapse the inherited overload set.`);
    });
});
