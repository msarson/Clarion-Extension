/**
 * #365 — ClassConstantsCodeActionProvider missing-include branch was un-memoized.
 *
 * VS Code fires a code-action request on every cursor move. When the cursor sits on a
 * line carrying a `missing-include` diagnostic, the provider called
 * getActionsForMissingInclude UNCONDITIONALLY — and that path does parseFile plus a
 * per-constant ProjectConstantsChecker loop — returning before the word-path memo was
 * ever reached (100-350ms measured on the VM, a dozen+ times per startup on one line).
 *
 * Pin: repeated requests carrying the same missing-include diagnostic parse the class
 * file exactly once (the branch now memoizes per (className, includeFile, uri, version)).
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CancellationToken } from 'vscode-languageserver';
import { ClassConstantsCodeActionProvider } from '../providers/ClassConstantsCodeActionProvider';
import { StructureDeclarationIndexer, StructureDeclarationInfo } from '../utils/StructureDeclarationIndexer';
import { ClassConstantParser } from '../utils/ClassConstantParser';
import { ProjectConstantsChecker } from '../utils/ProjectConstantsChecker';
import { setServerInitialized } from '../serverState';

const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => { /* noop */ } })
} as CancellationToken;

function makeDoc(version: number): TextDocument {
    return TextDocument.create('file:///c:/proj/missinginc365.clw', 'clarion', version, [
        "  MEMBER('prog.clw')",
        '  MAP',
        '  END',
        '  CODE',
        '  loc:widget = WidgetClass',
    ].join('\n'));
}

// A missing-include diagnostic on the line at the cursor (what MissingIncludeDiagnostics emits).
const missingIncludeContext = {
    diagnostics: [{
        code: 'missing-include',
        data: { typeName: 'WidgetClass', incFileName: 'WidgetClass.inc' },
        range: { start: { line: 4, character: 15 }, end: { line: 4, character: 26 } },
        message: "Class 'WidgetClass' is not included"
    }]
};
const cursorRange = { start: { line: 4, character: 15 }, end: { line: 4, character: 15 } };

suite('ClassConstantsCodeActionProvider #365 — missing-include branch memoizes', () => {

    let origGetOrBuild: typeof StructureDeclarationIndexer.prototype.getOrBuildIndex;
    let origFind: typeof StructureDeclarationIndexer.prototype.find;
    let origParseFile: typeof ClassConstantParser.prototype.parseFile;
    let origSatisfied: typeof ProjectConstantsChecker.prototype.isConstantSatisfied;
    let parseFileCalls: number;

    suiteSetup(() => setServerInitialized(true));

    setup(() => {
        origGetOrBuild = StructureDeclarationIndexer.prototype.getOrBuildIndex;
        origFind = StructureDeclarationIndexer.prototype.find;
        origParseFile = ClassConstantParser.prototype.parseFile;
        origSatisfied = ProjectConstantsChecker.prototype.isConstantSatisfied;
        parseFileCalls = 0;

        StructureDeclarationIndexer.prototype.getOrBuildIndex = (async function (this: unknown, p: string) {
            return { byName: new Map(), lastIndexed: 0, projectPath: p };
        }) as typeof origGetOrBuild;
        StructureDeclarationIndexer.prototype.find = ((name: string) =>
            name.toLowerCase() === 'widgetclass'
                ? [{ name: 'WidgetClass', filePath: 'c:\\proj\\WidgetClass.inc', line: 0, structureType: 'CLASS', isType: false, lineContent: 'WidgetClass CLASS' } as StructureDeclarationInfo]
                : []
        ) as typeof origFind;
        ClassConstantParser.prototype.parseFile = (async () => {
            parseFileCalls++;
            return [{ className: 'WidgetClass', constants: [{ name: 'WidgetClass:Something', type: 'Link' }] }];
        }) as unknown as typeof origParseFile;
        ProjectConstantsChecker.prototype.isConstantSatisfied = (async () => true) as typeof origSatisfied;
    });

    teardown(() => {
        StructureDeclarationIndexer.prototype.getOrBuildIndex = origGetOrBuild;
        StructureDeclarationIndexer.prototype.find = origFind;
        ClassConstantParser.prototype.parseFile = origParseFile;
        ProjectConstantsChecker.prototype.isConstantSatisfied = origSatisfied;
    });

    test('repeated requests on a missing-include diagnostic parse the class file once', async () => {
        const doc = makeDoc(7);

        const first = new ClassConstantsCodeActionProvider();
        const actions = await first.provideCodeActions(doc, cursorRange as never, missingIncludeContext as never, token);
        const afterFirst = parseFileCalls;
        assert.ok(afterFirst >= 1, 'first request does the real parse');
        assert.ok(actions.some(a => /INCLUDE/i.test(a.title)),
            `must offer an add-INCLUDE quick-fix (got: ${actions.map(a => a.title).join(' | ')})`);

        // Fresh provider per request — mirrors server.ts constructing one per call.
        for (let i = 0; i < 5; i++) {
            const p = new ClassConstantsCodeActionProvider();
            await p.provideCodeActions(doc, cursorRange as never, missingIncludeContext as never, token);
        }
        assert.strictEqual(parseFileCalls, afterFirst,
            `repeated cursor-rests on the same missing-include line must answer from the memo ` +
            `(parseFile ran ${parseFileCalls}x, expected ${afterFirst})`);
    });
});
