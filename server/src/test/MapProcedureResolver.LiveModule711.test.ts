import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { SolutionManager } from '../solution/solutionManager';
import { TokenCache } from '../TokenCache';
import { pathToCanonicalUri } from '../utils/UriUtils';

/**
 * #711 — resolving a MAP procedure to its implementation in MODULE('x.clw') read x.clw from DISK and
 * tokenized that text under x.clw's uri. With x.clw open and edited, that is the wrong text: F12 and
 * hover land on the line the implementation had at the last save, and the disk tokens replace the
 * live buffer's in the token cache, so the next request re-tokenizes the whole buffer again (every
 * hover after an edit, on a 60k-line module, cost two full tokenizations). The live text comes first.
 *
 * Same world as the #299 fixture: redirection resolves the source files, not the DLL.
 */
suite('#711 MODULE implementation lookup reads the open buffer, not disk', () => {

    let tmpDir: string;
    let savedInstance: unknown;

    const IMPL_ON_DISK = [
        "  MEMBER('acmutils.clw')",
        '',
        '  MAP',
        '  END',
        'InitializeProgram      FUNCTION(*iniclass exeIni),BYTE',   // 4 on disk
        '  CODE',
        '  RETURN 1',
    ];

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue711-'));
        fs.writeFileSync(path.join(tmpDir, 'acmutils.clw'), [
            '  PROGRAM',
            '',
            '  MAP',
            "    MODULE('ACMUTILS001.CLW')",
            'InitializeProgram      FUNCTION(*iniclass exeIni),BYTE',
            '    END',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(tmpDir, 'acmutils001.clw'), IMPL_ON_DISK.join('\n'), 'utf8');

        const fakeRedParser = {
            findFile: (filename: string) => {
                const candidate = path.join(tmpDir, filename.toLowerCase());
                return fs.existsSync(candidate) ? { path: candidate, source: 'test' } : null;
            }
        };
        const fakeSolution = {
            projects: [{
                name: 'ACMUtils',
                path: tmpDir,
                sourceFiles: [
                    { name: 'acmutils.clw', relativePath: 'acmutils.clw' },
                    { name: 'acmutils001.clw', relativePath: 'acmutils001.clw' },
                ],
                getRedirectionParser: () => fakeRedParser,
            }]
        };
        savedInstance = (SolutionManager as any).instance;
        (SolutionManager as any).instance = { solution: fakeSolution };
    });

    suiteTeardown(() => {
        (SolutionManager as any).instance = savedInstance;
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    test('bug-pin: F12 lands on the implementation line of the edited, unsaved buffer', async function () {
        this.timeout(10000);

        // acmutils001.clw is open, three lines inserted above the implementation, not saved.
        const liveText = [...IMPL_ON_DISK.slice(0, 4), '! one', '! two', '! three', ...IMPL_ON_DISK.slice(4)].join('\n');
        const liveDoc = TextDocument.create(pathToCanonicalUri(path.join(tmpDir, 'acmutils001.clw')), 'clarion', 5, liveText);
        const liveTokens = TokenCache.getInstance().getTokens(liveDoc);

        const mainCode = [
            '  PROGRAM',
            '',
            '  MAP',
            "    MODULE('ACMUTILS.DLL')",
            'InitializeProgram      FUNCTION(*iniclass exeIni),BYTE,DLL',   // 4 — F12 here
            '    END',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\n');
        const mainDoc = TextDocument.create('file:///test-711-main.clw', 'clarion', 1, mainCode);
        const tokens = new ClarionTokenizer(mainCode).tokenize();
        const docStructure = new DocumentStructure(tokens);
        docStructure.process();

        const result = await new MapProcedureResolver().findProcedureImplementation(
            'InitializeProgram', tokens, mainDoc, { line: 4, character: 2 }, mainCode.split('\n')[4], docStructure);

        assert.ok(result && result.uri.toLowerCase().includes('acmutils001.clw'), `expected acmutils001.clw; got ${result?.uri}`);
        assert.strictEqual(result!.range.start.line, 7,
            `the implementation is on line 7 of the open buffer (4 on disk); got ${result!.range.start.line}`);
        assert.strictEqual(TokenCache.getInstance().getTokens(liveDoc), liveTokens,
            "the live buffer's tokens are still the cached ones (the lookup did not replace them with disk's)");
    });
});
