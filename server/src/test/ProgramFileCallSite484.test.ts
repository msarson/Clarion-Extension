/**
 * #484 — first hover / F12 / FAR on a call site INSIDE a PROGRAM file took ~1s
 * (definition 1.7s, references 2.6s on ap1.clw). Three separate costs, each
 * pinned here:
 *
 *  1. MapProcedureResolver expanded the MAP's INCLUDEs — tokenising every header
 *     the MAP pulls in (ap1's MAP INCLUDEs `CTSQW10.CLW`, 5,992 lines) — to find
 *     a prototype and its MODULE block that are BOTH in the document's own
 *     tokens. Direct tokens first; the include expansion only when the name is
 *     not declared in the document.
 *
 *  2. The file-relationship graph created MODULE edges to BINARIES:
 *     `MODULE('vuFT3.dll')` resolved through the `*.dll` redirection rule to the
 *     real DLL (39 such edges on ap1.sln), so FAR's file set for a module-scoped
 *     procedure included a DLL, and the closed-file token cache read it as text
 *     and tokenised 20,917 garbage tokens in 2.5s. A MODULE naming a library is a
 *     link dependency, not a source relationship (Language Reference, MODULE:
 *     "names a Clarion language MEMBER module or an external library file").
 *
 *  3. Belt and braces for 2: the closed-file token cache never tokenises a file
 *     whose extension says it is not Clarion source.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { MapProcedureResolver } from '../utils/MapProcedureResolver';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';

suite('PROGRAM-file call site cost (#484)', () => {
    let tmpDir: string;
    let savedInstance: unknown;

    // A PROGRAM whose MAP INCLUDEs a header AND declares its procedures in MODULE
    // blocks — the generated-app shape. The header is deliberately present on
    // disk so the include expansion, if it runs, has something to load.
    const PROG = [
        '  PROGRAM',                                        // 0
        '  MAP',                                            // 1
        "    INCLUDE('bigheader.inc'),ONCE",                // 2
        "    MODULE('prog001.clw')",                        // 3
        'Forms1099Misc PROCEDURE',                          // 4 — MODULE-wrapped prototype
        '    END',                                          // 5
        'BareProto PROCEDURE(LONG x)',                      // 6 — prototype directly in the MAP
        '  END',                                            // 7
        '  CODE',                                           // 8
        '  Forms1099Misc',                                  // 9 — call site
        '  BareProto(1)',                                   // 10
        '',                                                 // 11
        'BareProto PROCEDURE(LONG x)',                      // 12 — same-file implementation
        '  CODE',                                           // 13
        '  RETURN',                                         // 14
    ].join('\n');

    suiteSetup(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue484-'));
        fs.writeFileSync(path.join(tmpDir, 'prog.clw'), PROG, 'utf8');
        fs.writeFileSync(path.join(tmpDir, 'prog001.clw'), [
            "  MEMBER('prog.clw')",                         // 0
            '  MAP',                                        // 1
            '  END',                                        // 2
            'Forms1099Misc PROCEDURE',                      // 3 — implementation
            '  CODE',                                       // 4
            '  RETURN',                                     // 5
        ].join('\n'), 'utf8');
        fs.writeFileSync(path.join(tmpDir, 'bigheader.inc'), [
            "  MODULE('other.clw')",
            'Unrelated PROCEDURE',
            '  END',
        ].join('\n'), 'utf8');
        // A "DLL": bytes that are not Clarion source, at a path the MAP references.
        fs.writeFileSync(path.join(tmpDir, 'vendor.dll'), Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x0a, 0x21, 0x27, 0x28, 0x0a, 0xff, 0xfe, 0x0a, 0x7b, 0x7d]));

        const fakeRedParser = {
            findFile: (filename: string) => {
                const candidate = path.join(tmpDir, filename.toLowerCase());
                return fs.existsSync(candidate) ? { path: candidate, source: 'test' } : null;
            }
        };
        const fakeSolution = {
            projects: [{
                name: 'Prog',
                path: tmpDir,
                sourceFiles: [
                    { name: 'prog.clw', relativePath: 'prog.clw' },
                    { name: 'prog001.clw', relativePath: 'prog001.clw' },
                ],
                getRedirectionParser: () => fakeRedParser,
            }]
        };
        savedInstance = (SolutionManager as unknown as { instance: unknown }).instance;
        (SolutionManager as unknown as { instance: unknown }).instance = { solution: fakeSolution };
    });

    suiteTeardown(() => {
        (SolutionManager as unknown as { instance: unknown }).instance = savedInstance;
        FileRelationshipGraph.getInstance().reset();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    /** Wraps the resolver's include expansion so a test can count how often it ran. */
    function countingResolver(): { resolver: MapProcedureResolver; calls: () => number } {
        const resolver = new MapProcedureResolver();
        const sa = (resolver as unknown as { scopeAnalyzer: { getMapTokensWithIncludes: (...a: unknown[]) => unknown } }).scopeAnalyzer;
        const original = sa.getMapTokensWithIncludes.bind(sa);
        let n = 0;
        sa.getMapTokensWithIncludes = (...args: unknown[]) => { n++; return original(...args); };
        return { resolver, calls: () => n };
    }

    function progDoc() {
        const doc = TextDocument.create(`file:///${path.join(tmpDir, 'prog.clw').replace(/\\/g, '/')}`, 'clarion', 1, PROG);
        const tokens = new ClarionTokenizer(PROG).tokenize();
        const structure = new DocumentStructure(tokens);
        structure.process();
        return { doc, tokens, structure };
    }

    test('findMapDeclaration resolves a prototype in the document\'s own MAP without expanding INCLUDEs', () => {
        const { doc, tokens } = progDoc();
        const { resolver, calls } = countingResolver();
        const loc = resolver.findMapDeclaration('Forms1099Misc', tokens, doc, 'Forms1099Misc');
        assert.ok(loc, 'declaration must be found');
        assert.strictEqual(loc!.range.start.line, 4);
        assert.strictEqual(calls(), 0, `the MAP's INCLUDEs must not be expanded for a prototype the document itself declares; expanded ${calls()}×`);
    });

    test('findMapDeclaration still expands INCLUDEs for a name the document does not declare', () => {
        const { doc, tokens } = progDoc();
        const { resolver, calls } = countingResolver();
        const loc = resolver.findMapDeclaration('Unrelated', tokens, doc, 'Unrelated');
        assert.ok(loc, 'a prototype that lives only in the INCLUDEd header must still be found');
        assert.ok(loc!.uri.toLowerCase().includes('bigheader.inc'), `got ${loc!.uri}`);
        assert.ok(calls() >= 1, 'the include expansion is the only way to reach it');
    });

    test('findProcedureImplementation follows an in-document MODULE block without expanding INCLUDEs', async () => {
        const { doc, tokens, structure } = progDoc();
        const { resolver, calls } = countingResolver();
        const loc = await resolver.findProcedureImplementation('Forms1099Misc', tokens, doc, { line: 4, character: 0 }, PROG.split('\n')[4], structure);
        assert.ok(loc, 'implementation must be found');
        assert.ok(loc!.uri.toLowerCase().includes('prog001.clw'), `got ${loc!.uri}`);
        assert.strictEqual(loc!.range.start.line, 3);
        assert.strictEqual(calls(), 0, `the MODULE block is in the document's own tokens; expanded ${calls()}×`);
    });

    test('findProcedureImplementation finds a same-file implementation for a bare MAP prototype without expanding INCLUDEs', async () => {
        const { doc, tokens, structure } = progDoc();
        const { resolver, calls } = countingResolver();
        const loc = await resolver.findProcedureImplementation('BareProto', tokens, doc, { line: 6, character: 0 }, PROG.split('\n')[6], structure);
        assert.ok(loc, 'implementation must be found');
        assert.strictEqual(loc!.range.start.line, 12);
        assert.strictEqual(calls(), 0, `a prototype outside any MODULE is implemented in this source module (Language Reference, MODULE); expanded ${calls()}×`);
    });

    test('the file graph creates no MODULE edge to a binary named by MODULE(\'x.dll\')', async () => {
        const dllProg = path.join(tmpDir, 'dllprog.clw');
        fs.writeFileSync(dllProg, [
            '  PROGRAM',
            '  MAP',
            "    MODULE('vendor.dll')",
            'VendorProc PROCEDURE(),DLL',
            '    END',
            "    MODULE('prog001.clw')",
            'Forms1099Misc PROCEDURE',
            '    END',
            '  END',
            '  CODE',
        ].join('\n'), 'utf8');
        const graph = FileRelationshipGraph.getInstance();
        graph.reset();
        await graph.buildInBackground([dllProg, path.join(tmpDir, 'prog001.clw')]);
        const edges = graph.getForwardEdges(dllProg.toLowerCase().replace(/\\/g, '/')).filter(e => e.type === 'MODULE');
        assert.ok(edges.some(e => e.toFile.endsWith('prog001.clw')), `the source MODULE edge must exist; got [${edges.map(e => e.toFile).join(', ')}]`);
        assert.ok(!edges.some(e => /\.(dll|lib|exe|obj)$/i.test(e.toFile)), `no edge may point at a binary; got [${edges.map(e => e.toFile).join(', ')}]`);
    });

    test('the closed-file token cache returns no tokens for a binary and does not read it', () => {
        const dll = path.join(tmpDir, 'vendor.dll');
        const uri = `file:///${dll.replace(/\\/g, '/')}`;
        const before = fs.statSync(dll).atimeMs;
        const tokens = TokenCache.getInstance().getTokensForClosedFile(uri);
        assert.deepStrictEqual(tokens, [], `a .dll must never be tokenised; got ${tokens.length} token(s)`);
        void before; // atime is unreliable on Windows; the token assertion is the contract
    });
});
