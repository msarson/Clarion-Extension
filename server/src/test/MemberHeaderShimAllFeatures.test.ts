import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { resolveMemberHeader } from '../utils/MemberHeaderResolver';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { validateMissingMapDeclarations } from '../providers/diagnostics/MapDeclarationDiagnostics';
import { createF12Resolver } from '../providers/diagnostics/UnresolvedProcedureCallDiagnostics';
import { validatePrivateProcedureCalls } from '../providers/diagnostics/PrivateProcedureDiagnostics';

/**
 * A module whose MEMBER sits in an INCLUDE'd shim (`INCLUDE('member.clw')` as its
 * first statement, the shim holding `MEMBER('mainprog')`) must reach its PROGRAM
 * through every feature, not only the ones that once had a shim fix of their own.
 *
 * Each feature used to read MEMBER with TokenHelper.findMemberHeaderToken, which
 * sees only the module's own tokens, so for a shim-headed module it found no
 * parent at all: Ctrl+F12 from a call site answered nothing, the hover card had
 * the MAP declaration but not the implementation, FAR from an implementation label
 * never found its MAP line, and the parent-MAP diagnostics went quiet. They now
 * share MemberHeaderResolver. The same fixture with a direct MEMBER is the control.
 *
 * The suite runs twice: with the shim (the bug) and with MEMBER written in the
 * module (the control, which passed before the fix too).
 */

function writeFile(dir: string, name: string, lines: string[]): string {
    const p = path.join(dir, name);
    fs.writeFileSync(p, lines.join('\r\n'));
    return p;
}

function openDoc(dir: string, name: string): TextDocument {
    const p = path.join(dir, name);
    return TextDocument.create('file:///' + p.split(path.sep).join('/'), 'clarion', 1, fs.readFileSync(p, 'utf8'));
}

function first(result: Location | Location[] | null | undefined): Location | null {
    if (!result) return null;
    return Array.isArray(result) ? result[0] ?? null : result;
}

function endsWith(uri: string, name: string): boolean {
    return decodeURIComponent(uri).toLowerCase().endsWith('/' + name);
}

suite('MemberHeaderResolver: the walk', () => {
    let dir: string;

    suiteSetup(() => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memberhdr_'));
        writeFile(dir, 'shim.clw', ['! banner comment', " MEMBER('mainprog')"]);
        writeFile(dir, 'outer.clw', [" INCLUDE('shim.clw')"]);
        writeFile(dir, 'loopa.clw', [" INCLUDE('loopb.clw')"]);
        writeFile(dir, 'loopb.clw', [" INCLUDE('loopa.clw')"]);
        writeFile(dir, 'notheader.inc', ['Thing LONG']);
    });

    suiteTeardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });
    teardown(() => TokenCache.getInstance().clearAllTokens());

    function headerOf(lines: string[]) {
        const p = writeFile(dir, 'mod.clw', lines);
        const tokens = TokenCache.getInstance().getTokens(openDoc(dir, 'mod.clw'));
        return { header: resolveMemberHeader(tokens, p), modPath: p };
    }

    test('a MEMBER written in the module is found there', () => {
        const { header, modPath } = headerOf([" MEMBER('mainprog')", 'Proc PROCEDURE()', '  CODE']);
        assert.strictEqual(header?.token.referencedFile, 'mainprog');
        assert.strictEqual(header?.hostFile, modPath);
    });

    test('a first-statement INCLUDE shim is followed, and names the shim as the host', () => {
        const { header } = headerOf(['! comment first', " INCLUDE('shim.clw'),ONCE", 'Proc PROCEDURE()', '  CODE']);
        assert.strictEqual(header?.token.referencedFile, 'mainprog');
        assert.ok(header && path.basename(header.hostFile).toLowerCase() === 'shim.clw', header?.hostFile);
    });

    test('a chained shim is followed', () => {
        const { header } = headerOf([" INCLUDE('outer.clw')", 'Proc PROCEDURE()', '  CODE']);
        assert.strictEqual(header?.token.referencedFile, 'mainprog');
    });

    test('an include cycle ends with no MEMBER', () => {
        assert.strictEqual(headerOf([" INCLUDE('loopa.clw')"]).header, undefined);
    });

    test('only the first statement can be a shim: a later INCLUDE is not followed', () => {
        const { header } = headerOf([" INCLUDE('notheader.inc')", " INCLUDE('shim.clw')", 'Proc PROCEDURE()', '  CODE']);
        assert.strictEqual(header, undefined);
    });

    test('a shim that cannot be found ends with no MEMBER', () => {
        assert.strictEqual(headerOf([" INCLUDE('nosuch.clw')"]).header, undefined);
    });
});

for (const shape of ['shim', 'direct'] as const) {
    suite(`A module with its MEMBER ${shape === 'shim' ? "in an INCLUDE'd shim" : 'written in it (control)'}`, () => {
        let dir: string;
        const header = shape === 'shim' ? " INCLUDE('member.clw'),ONCE" : " MEMBER('mainprog')";

        suiteSetup(() => {
            setServerInitialized(true);
            dir = fs.mkdtempSync(path.join(os.tmpdir(), `membershim_${shape}_`));
            writeFile(dir, 'mainprog.clw', [
                '  PROGRAM',                         // 0
                '  MAP',                             // 1
                "    MODULE('usage.clw')",           // 2
                'Caller       PROCEDURE()',          // 3
                '    END',                           // 4
                "    MODULE('other.clw')",           // 5
                'OtherProc    PROCEDURE()',          // 6
                '    END',                           // 7
                'Worker       PROCEDURE(),PROC',     // 8
                'Hidden       PROCEDURE(),PRIVATE',  // 9
                '  END',                             // 10
                'Thr LONG',                          // 11
                '  CODE',                            // 12
                '  Worker()',                        // 13
                '',                                  // 14
                'Worker PROCEDURE()',                // 15
                '  CODE',                            // 16
                '  RETURN',                          // 17
                '',                                  // 18
                'Hidden PROCEDURE()',                // 19
                '  CODE',                            // 20
                '  RETURN',                          // 21
            ]);
            writeFile(dir, 'member.clw', ['! shim: names the PROGRAM for every module that includes it', " MEMBER('mainprog')"]);
            writeFile(dir, 'other.clw', [header, 'OtherProc PROCEDURE()', '  CODE', '  RETURN']);
            writeFile(dir, 'usage.clw', [
                header,                              // 0
                'Caller PROCEDURE()',                // 1
                '  CODE',                            // 2
                '  Thr = START( Worker )',           // 3
                '  Worker()',                        // 4
                '  OtherProc()',                     // 5
                '  Hidden()',                        // 6
                '',                                  // 7
                'Undeclared PROCEDURE()',            // 8
                '  CODE',                            // 9
                '  RETURN',                          // 10
            ]);
        });

        suiteTeardown(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });
        teardown(() => TokenCache.getInstance().clearAllTokens());

        const usage = () => openDoc(dir, 'usage.clw');
        const usageTokens = () => { const d = usage(); return { d, t: TokenCache.getInstance().getTokens(d) }; };

        test('Ctrl+F12 on a START() argument goes to the body in the PROGRAM', async () => {
            const r = first(await new ImplementationProvider().provideImplementation(usage(), { line: 3, character: 15 }));
            assert.ok(r, 'no implementation');
            assert.ok(endsWith(r!.uri, 'mainprog.clw') && r!.range.start.line === 15, JSON.stringify(r));
        });

        test('Ctrl+F12 on a call goes to the body in another member module', async () => {
            const r = first(await new ImplementationProvider().provideImplementation(usage(), { line: 5, character: 3 }));
            assert.ok(r, 'no implementation');
            assert.ok(endsWith(r!.uri, 'other.clw') && r!.range.start.line === 1, JSON.stringify(r));
        });

        test('the hover card links both the MAP declaration and the implementation', async () => {
            const h = await new HoverProvider().provideHover(usage(), { line: 4, character: 3 });
            const text = h ? JSON.stringify(h.contents) : '';
            assert.ok(/mainprog\.clw:9\b/i.test(text), 'no declaration link: ' + text);
            assert.ok(/mainprog\.clw:16\b/i.test(text), 'no implementation link: ' + text);
        });

        test('F12 on a call goes to the MAP declaration', async () => {
            const r = first(await new DefinitionProvider().provideDefinition(usage(), { line: 4, character: 3 }) as Location | Location[] | null);
            assert.ok(r, 'no definition');
            assert.ok(endsWith(r!.uri, 'mainprog.clw') && r!.range.start.line === 8, JSON.stringify(r));
        });

        test('Find All References from an implementation label includes its MAP declaration', async () => {
            const refs = await new ReferencesProvider().provideReferences(usage(), { line: 1, character: 2 }, { includeDeclaration: true });
            const hits = (refs ?? []).map(l => `${path.basename(decodeURIComponent(l.uri))}:${l.range.start.line}`);
            assert.ok(hits.includes('mainprog.clw:3'), 'MAP declaration missing: ' + hits.join(', '));
        });

        test('an implementation with no MAP declaration in the PROGRAM is reported', async () => {
            const { d, t } = usageTokens();
            const messages = (await validateMissingMapDeclarations(t, d)).map(x => `${x.range.start.line}:${x.message}`);
            assert.strictEqual(messages.length, 1, messages.join(' | '));
            assert.ok(messages[0].startsWith('8:'), messages[0]);
        });

        test('a call to a procedure declared in the PROGRAM resolves for the unresolved-call check', async () => {
            const { d, t } = usageTokens();
            assert.strictEqual(await createF12Resolver(t, d)('Worker'), 'resolved');
        });

        test("a call to the PROGRAM's PRIVATE procedure is reported", async () => {
            const { d, t } = usageTokens();
            const lines = (await validatePrivateProcedureCalls(t, d)).map(x => x.range.start.line);
            assert.deepStrictEqual(lines, [6]);
        });
    });
}
