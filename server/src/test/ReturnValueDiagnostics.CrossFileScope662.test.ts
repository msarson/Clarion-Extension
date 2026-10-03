import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { __lastCrossFileFilesScannedForTest } from '../providers/diagnostics/ReturnValueDiagnostics';

/**
 * #662 — the discarded-return check's cross-file pass scanned every file in the token cache.
 * Anything a hover or F12 had tokenized joined the scan, so its cost grew with unrelated
 * activity, and a procedure declared in another project's file could produce a warning for a
 * call that can never bind to it. The pass now scans only cached files the validated file can
 * see: itself, its PROGRAM, that PROGRAM's modules, and whatever those INCLUDE (the #483 rule).
 * With no file graph for the document (no solution) the scope is unchanged.
 */
const PROG = 'c:\\app\\prog.clw';
const MEMBER = 'c:\\app\\member.clw';
const OTHER_PROG = 'c:\\other\\otherprog.clw';
const OTHER_MEMBER = 'c:\\other\\othermember.clw';

const uriOf = (p: string) => 'file:///' + p.replace(/\\/g, '/');
const doc = (p: string, code: string) => TextDocument.create(uriOf(p), 'clarion', 1, code);

const progCode = `
  PROGRAM
  MAP
TestProc  PROCEDURE(),LONG
  END
  CODE
`;
// Another project's program, declaring a procedure of the same name.
const otherProgCode = `
  PROGRAM
  MAP
TestProc  PROCEDURE(),LONG
  END
  CODE
`;
const memberCode = `
  MEMBER('prog.clw')
CallerProc  PROCEDURE()
  CODE
  TestProc()
`;

async function discardWarnings(memberDoc: TextDocument): Promise<string[]> {
    const tokens = TokenCache.getInstance().getTokens(memberDoc);
    const diags = await DiagnosticProvider.validateDiscardedReturnValues(tokens, memberDoc, new MemberLocatorService());
    return diags.map(d => String(d.message)).filter(m => /^Return value of '[A-Za-z_][A-Za-z0-9_:]*' is discarded/.test(m));
}

suite('Discarded-return cross-file scan covers only files the document can see (#662)', () => {
    setup(() => {
        TokenCache.getInstance().clearAllTokens();
        FileRelationshipGraph.getInstance().reset();
    });

    teardown(() => {
        TokenCache.getInstance().clearAllTokens();
        FileRelationshipGraph.getInstance().reset();
    });

    const seedTwoProjects = () => FileRelationshipGraph.getInstance().seedEdgesForTest([
        { type: 'MEMBER', fromFile: MEMBER, toFile: PROG, fromLine: 1 },
        { type: 'MEMBER', fromFile: OTHER_MEMBER, toFile: OTHER_PROG, fromLine: 1 },
    ]);

    test('bug-pin: another project\'s cached file is not scanned and does not produce a warning', async () => {
        seedTwoProjects();
        TokenCache.getInstance().getTokens(doc(OTHER_PROG, otherProgCode)); // tokenized by some hover

        const warnings = await discardWarnings(doc(MEMBER, memberCode));
        assert.deepStrictEqual(warnings, [], 'TestProc in another project cannot be what this call binds to');
        assert.strictEqual(__lastCrossFileFilesScannedForTest(), 0, 'the unrelated file is not part of the scan');
    });

    test('bug-pin: the scan size does not grow when unrelated files are tokenized', async () => {
        seedTwoProjects();
        TokenCache.getInstance().getTokens(doc(PROG, progCode));
        await discardWarnings(doc(MEMBER, memberCode));
        const before = __lastCrossFileFilesScannedForTest();

        TokenCache.getInstance().getTokens(doc(OTHER_PROG, otherProgCode));
        TokenCache.getInstance().getTokens(doc(OTHER_MEMBER, `\n  MEMBER('otherprog.clw')\n`));
        await discardWarnings(doc(MEMBER, memberCode));
        assert.strictEqual(__lastCrossFileFilesScannedForTest(), before);
        assert.strictEqual(before, 1, 'only the PROGRAM is scanned');
    });

    test('the file\'s own PROGRAM is still scanned and still warns', async () => {
        seedTwoProjects();
        TokenCache.getInstance().getTokens(doc(PROG, progCode));
        TokenCache.getInstance().getTokens(doc(OTHER_PROG, otherProgCode));

        const warnings = await discardWarnings(doc(MEMBER, memberCode));
        assert.strictEqual(warnings.length, 1);
        assert.ok(warnings[0].includes("'TestProc'"));
    });

    test('with no file graph for the document (no solution), every cached file is still scanned', async () => {
        // Graph left empty: the #294 no-solution behaviour is unchanged.
        TokenCache.getInstance().getTokens(doc(OTHER_PROG, otherProgCode));

        const warnings = await discardWarnings(doc(MEMBER, memberCode));
        assert.strictEqual(warnings.length, 1);
        assert.strictEqual(__lastCrossFileFilesScannedForTest(), 1);
    });
});
