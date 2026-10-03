import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { TokenCache } from '../TokenCache';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { MethodOverloadResolver } from '../utils/MethodOverloadResolver';
import { onDiskSpelling } from '../utils/UriUtils';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { NoSolutionFixture, buildNoSolutionFixture, cursorPositionOf, teardownNoSolutionFixture } from './helpers/NoSolutionFixture';

/**
 * #655 — the argument-type overload pick walks the INCLUDE chain through the file graph, whose
 * paths are lower-cased map keys. The declaration it picked came back under that key, so a
 * library class's hover link and Go to Definition target read `abwindow.inc` for ABWINDOW.INC.
 * The location must carry the file's spelling on disk.
 */

const CLASS_INC = [
    "StringTheory CLASS,TYPE",
    "SetValue PROCEDURE(STRING newValue, LONG pClip=0),VIRTUAL",
    "SetValue PROCEDURE(StringTheory newValue),VIRTUAL",
    "        END",
].join('\n');

const PROGRAM_CLW = [
    "  PROGRAM",
    "  INCLUDE('StringTheory.INC')",
    "  MAP",
    "  END",
    "  CODE",
    "  RETURN",
].join('\n');

const CALLER_CLW = [
    "  MEMBER('MixedProg.clw')",
    "",
    "TestProc PROCEDURE()",
    "st &StringTheory",
    "  CODE",
    "  st &= NEW(StringTheory)",
    "  st.SetValue('Hello World')",
    "  RETURN",
].join('\n');

suite('#655 overload pick keeps the on-disk spelling of the declaring file', () => {
    let root: string;
    let libDir: string;
    let incPath: string;
    let callerDoc: TextDocument;

    setup(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'ovl655-'));
        libDir = path.join(root, 'LibSrc', 'Win');
        fs.mkdirSync(libDir, { recursive: true });
        incPath = path.join(libDir, 'StringTheory.INC');
        fs.writeFileSync(incPath, CLASS_INC, 'utf8');
        const progPath = path.join(root, 'MixedProg.clw');
        fs.writeFileSync(progPath, PROGRAM_CLW, 'utf8');
        const callerPath = path.join(root, 'Caller.clw');
        fs.writeFileSync(callerPath, CALLER_CLW, 'utf8');
        callerDoc = TextDocument.create('file:///' + callerPath.replace(/\\/g, '/'), 'clarion', 1, CALLER_CLW);
        TokenCache.getInstance().getTokens(callerDoc);
        // seedEdgesForTest lower-cases both ends, exactly as the production build keys them.
        FileRelationshipGraph.getInstance().seedEdgesForTest([
            { type: 'MEMBER', fromFile: callerPath, toFile: progPath, fromLine: 0 },
            { type: 'INCLUDE', fromFile: progPath, toFile: incPath, fromLine: 1 },
        ]);
    });

    teardown(() => {
        TokenCache.getInstance().clearTokens(callerDoc.uri);
        FileRelationshipGraph.getInstance().reset();
        fs.rmSync(root, { recursive: true, force: true });
    });

    const expectedUriTail = '/LibSrc/Win/StringTheory.INC';

    test('the resolver\'s candidates name the file as spelled on disk', () => {
        const tokens = TokenCache.getInstance().getTokens(callerDoc);
        const decls = new MethodOverloadResolver().findAllMethodDeclarationsIncludingIncludes('StringTheory', 'SetValue', callerDoc, tokens);
        assert.strictEqual(decls.length, 2, 'both overloads found through the graph');
        for (const d of decls) {
            assert.ok(decodeURIComponent(d.file).endsWith(expectedUriTail), `candidate file ${d.file}`);
        }
    });

    test('Go to Definition on st.SetValue(...) lands on the file as spelled on disk', async () => {
        const result = await new DefinitionProvider().provideDefinition(callerDoc, { line: 6, character: 6 });
        const loc = (Array.isArray(result) ? result[0] : result) as Location | undefined;
        assert.ok(loc, 'a definition');
        assert.strictEqual(loc!.range.start.line, 1, 'the STRING overload');
        assert.ok(decodeURIComponent(loc!.uri).endsWith(expectedUriTail), `definition uri ${loc!.uri}`);
    });

    test('onDiskSpelling restores the case of every segment and leaves a missing path alone', () => {
        const lowered = incPath.toLowerCase();
        assert.strictEqual(onDiskSpelling(lowered).slice(-expectedUriTail.length).replace(/\\/g, '/'), expectedUriTail);
        assert.strictEqual(onDiskSpelling(lowered.replace(/\\/g, '/')).replace(/\\/g, '/').slice(-expectedUriTail.length), expectedUriTail,
            'forward-slash form too');
        const missing = path.join(root, 'nope', 'Gone.inc').toLowerCase();
        assert.strictEqual(onDiskSpelling(missing), missing);
    });
});

suite('#655 Find All References names files reached through the file graph as spelled on disk', () => {
    let fix: NoSolutionFixture | undefined;
    teardown(() => { if (fix) teardownNoSolutionFixture(fix); fix = undefined; });

    test('a sibling MEMBER file found through the graph keeps its spelling', async () => {
        const programBody = "  PROGRAM\nGLO:SessionId  STRING(20)\nMain PROCEDURE\n  CODE\n  RETURN\n";
        const memberOne = "  MEMBER('MyProg.CLW')\nWorkerOne PROCEDURE\n  CODE\n  GLO:SessionId = 'one'\n  RETURN\n";
        const memberTwo = "  MEMBER('MyProg.CLW')\nWorkerTwo PROCEDURE\n  CODE\n  GLO:SessionId = 'two'\n  RETURN\n";
        fix = buildNoSolutionFixture({
            libsrcs: [{}],
            sourceFile: { filename: 'MyProg001.CLW', content: memberOne, siblings: { 'MyProg.CLW': programBody, 'MyProg002.CLW': memberTwo } }
        });
        const doc = TextDocument.create(fix.sourceUri!, 'clarion', 1, memberOne);
        const refs = await new ReferencesProvider().provideReferences(doc, cursorPositionOf(memberOne, 'SessionId'), { includeDeclaration: true });
        const names = (refs ?? []).map(r => path.basename(decodeURIComponent(r.uri)));
        assert.ok(names.some(n => n.toLowerCase() === 'myprog002.clw'), `sibling found: ${names.join(', ')}`);
        for (const n of names) assert.ok(['MyProg.CLW', 'MyProg001.CLW', 'MyProg002.CLW'].includes(n), `spelling of ${n}`);
    });
});
