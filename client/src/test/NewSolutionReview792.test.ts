import * as assert from 'assert';
import { inferProjects, SourceFile } from '../solution/FolderProjectInference';
import {
    buildReviewState, chosenSpecs, defaultChoices, ReviewChoices, ReviewInput, reviewResult, solutionNameError,
} from '../solution/NewSolutionReview';

/**
 * #792 — New Solution's review page: the whole proposal on one page, confirmed once. What the
 * page shows and what it returns are worked out here, without vscode: the defaults are today's
 * quick-pick defaults (every program, EXE or DLL as inferred, the first project offered for a
 * module to place, every possible leftover kept), and the result is what the quick picks returned
 * after New Solution worked out references and exports from the final compile lists.
 */
const f = (relPath: string, text: string): SourceFile => ({ relPath, text });
const member = (prog: string) => `  MEMBER('${prog}')\r\n`;
const LIB = 'C:\\Clarion\\libsrc\\win\\';

const FILES: SourceFile[] = [
    f('Sales.clw', [
        '  PROGRAM',
        '  MAP',
        "    MODULE('Common.DLL')",
        'CommonProc  PROCEDURE',
        '    END',
        "    MODULE('Reports.DLL')",
        'PrintIt  PROCEDURE',
        '    END',
        "    MODULE('Sales001.clw')",
        'Browse  PROCEDURE',
        '    END',
        "    INCLUDE('CWUTIL.INC')",
        '  END',
        '  CODE',
        '  Browse()',
        "  OpenUrlLink('x')",
    ].join('\r\n')),
    f('Sales001.clw', member('Sales')),
    f('Sales009.clw', member('Sales')),
    f('Common.clw', [
        '  PROGRAM',
        '  MAP',
        "    MODULE('Common001.clw')",
        'CommonProc  PROCEDURE,EXPORT',
        '    END',
        '  END',
        '  CODE',
    ].join('\r\n')),
    f('Common001.clw', member('Common')),
    f('Reports.clw', [
        '  PROGRAM',
        '  MAP',
        "    MODULE('Common.DLL')",
        'CommonProc  PROCEDURE',
        '    END',
        "    MODULE('Reports001.clw')",
        'PrintIt  PROCEDURE',
        '    END',
        '  END',
        '  CODE',
    ].join('\r\n')),
    f('Reports001.clw', member('Reports')),
    f('Tools.clw', '  PROGRAM\r\n  MAP\r\nToolProc  PROCEDURE,EXPORT\r\n  END\r\n  CODE\r\n'),
    f('Shared.clw', '  MEMBER()\r\n'),
];
const LIBRARIES: SourceFile[] = [
    f(LIB + 'CWUTIL.INC', "  MODULE('cwutil.clw')\r\nOpenUrlLink(STRING url),ULONG,PROC\r\n  END"),
    f(LIB + 'CWUtil.CLW', '  MEMBER()'),
];

function input(files = FILES, libraries = LIBRARIES): ReviewInput {
    return {
        folder: 'C:\\Apps\\Sales',
        files,
        libraries,
        inference: inferProjects(files, libraries),
        exportFiles: { 'Reports.exp': 'C:\\Apps\\Sales\\genfiles\\exp\\Reports.exp' },
        compiler: 'Clarion 11.1',
        sourceCount: files.length,
    };
}

/** Guids in order, so a result can be compared whole. */
const guids = () => { let n = 0; return () => `{G${++n}}`; };
const change = (choices: ReviewChoices, patch: Partial<ReviewChoices>): ReviewChoices => ({ ...choices, ...patch });

suite('New Solution review page (#792)', () => {
    test('the defaults are today\'s: every program, EXE or DLL as inferred, the first project for a module to place, every leftover kept', () => {
        const choices = defaultChoices(input().inference, 'Sales');
        assert.deepStrictEqual(choices, {
            included: { 'Sales.clw': true, 'Common.clw': true, 'Reports.clw': true, 'Tools.clw': true },
            kinds: { 'Sales.clw': 'exe', 'Common.clw': 'dll', 'Reports.clw': 'dll', 'Tools.clw': 'dll' },
            placement: { 'Shared.clw': 'Sales' },
            kept: { 'Sales009.clw': true },
            name: 'Sales',
            configuration: 'Debug',
        });
    });

    test('the default choices give what the quick picks gave when every default was taken', () => {
        // confirmProjects: programs in order, the DLL ticks, a placed module appended, the
        // leftovers kept (a library source the first inference listed stays); references and exports not\r
        // worked out yet.
        const inf = input().inference;
        assert.deepStrictEqual(chosenSpecs(inf, defaultChoices(inf, 'Sales'), guids()), [
            { name: 'Sales', guid: '{G1}', compile: ['Sales.clw', 'Sales001.clw', 'Sales009.clw', 'CWUtil.CLW', 'Shared.clw'], kind: 'exe', programFile: 'Sales.clw' },
            { name: 'Common', guid: '{G2}', compile: ['Common.clw', 'Common001.clw'], kind: 'dll', programFile: 'Common.clw' },
            { name: 'Reports', guid: '{G3}', compile: ['Reports.clw', 'Reports001.clw'], kind: 'dll', programFile: 'Reports.clw' },
            { name: 'Tools', guid: '{G4}', compile: ['Tools.clw'], kind: 'dll', programFile: 'Tools.clw' },
        ]);
    });

    test('the result is the specs New Solution writes: settled compile lists, references by guid, exports marked', () => {
        const inp = input();
        const result = reviewResult(inp, defaultChoices(inp.inference, 'Sales'), guids());
        assert.deepStrictEqual(result, {
            name: 'Sales',
            configuration: 'Debug',
            specs: [
                {
                    name: 'Sales', guid: '{G1}', kind: 'exe', programFile: 'Sales.clw', exportsMarked: false,
                    compile: ['Sales.clw', 'Sales001.clw', 'Sales009.clw', 'CWUtil.CLW', 'Shared.clw'],
                    references: [{ name: 'Common', guid: '{G2}' }, { name: 'Reports', guid: '{G3}' }],
                },
                { name: 'Common', guid: '{G2}', kind: 'dll', programFile: 'Common.clw', exportsMarked: true, compile: ['Common.clw', 'Common001.clw'], references: [] },
                { name: 'Reports', guid: '{G3}', kind: 'dll', programFile: 'Reports.clw', exportsMarked: false, compile: ['Reports.clw', 'Reports001.clw'], references: [{ name: 'Common', guid: '{G2}' }] },
                { name: 'Tools', guid: '{G4}', kind: 'dll', programFile: 'Tools.clw', exportsMarked: true, compile: ['Tools.clw'], references: [] },
            ],
        });
    });

    test('excluding a program drops it, the references to it, its leftovers and its place as a module\'s project', () => {
        const inp = input();
        const base = defaultChoices(inp.inference, 'Sales');
        const result = reviewResult(inp, change(base, { included: { ...base.included, 'Common.clw': false, 'Sales.clw': false } }), guids())!;
        assert.deepStrictEqual(result.specs.map(s => [s.name, s.references!.map(r => r.name)]), [['Reports', []], ['Tools', []]]);
        // Shared.clw was going to Sales: the first project still offered takes it.
        assert.deepStrictEqual(result.specs[0].compile, ['Reports.clw', 'Reports001.clw', 'Shared.clw']);

        const state = buildReviewState(inp, change(base, { included: { ...base.included, 'Common.clw': false, 'Sales.clw': false } }));
        assert.deepStrictEqual(state.leftovers, []);
        assert.deepStrictEqual(state.toPlace[0].options.map(o => o.label), ['Reports', 'Tools', 'Leave it out']);
        assert.strictEqual(state.toPlace[0].value, 'Reports');
        assert.deepStrictEqual(state.projects.map(p => [p.name, p.included, p.references]), [
            ['Sales', false, []], ['Common', false, []], ['Reports', true, []], ['Tools', true, []],
        ]);
        assert.strictEqual(state.createLabel, 'Create 2 projects');
    });

    test('toggling EXE or DLL changes the project kind and what happens to its export file', () => {
        const inp = input();
        const base = defaultChoices(inp.inference, 'Sales');
        const exp = (choices: ReviewChoices) => buildReviewState(inp, choices).projects.map(p => [p.name, p.kind, p.exportFile.tone, p.exportFile.text]);
        const detail = (choices: ReviewChoices) => buildReviewState(inp, choices).projects.map(p => p.exportFile.detail);
        assert.deepStrictEqual(exp(base), [
            ['Sales', 'exe', 'muted', 'Not needed for an EXE'],
            ['Common', 'dll', 'warn', 'Will be written: exports marked EXPORT'],
            ['Reports', 'dll', 'good', 'Found in genfiles\\exp'],
            ['Tools', 'dll', 'warn', 'Will be written: exports marked EXPORT'],
        ]);
        const toggled = change(base, { kinds: { ...base.kinds, 'Sales.clw': 'dll', 'Tools.clw': 'exe' } });
        assert.deepStrictEqual(exp(toggled).filter(r => r[0] === 'Sales' || r[0] === 'Tools'), [
            ['Sales', 'dll', 'bad', 'Missing'],
            ['Tools', 'exe', 'muted', 'Not needed for an EXE'],
        ]);
        // The warning New Solution shows afterwards, said before the user confirms.
        assert.deepStrictEqual(detail(toggled), ['Generate the application in the Clarion IDE to write Sales.exp, or mark the exported procedures with EXPORT.', 'The DLL exports only the procedures marked EXPORT.', undefined, undefined]);
        assert.deepStrictEqual(detail(base), [undefined, 'The DLL exports only the procedures marked EXPORT.', undefined, 'The DLL exports only the procedures marked EXPORT.']);
        const specs = reviewResult(inp, toggled, guids())!.specs;
        assert.deepStrictEqual(specs.map(s => [s.name, s.kind]), [['Sales', 'dll'], ['Common', 'dll'], ['Reports', 'dll'], ['Tools', 'exe']]);
        // References come from MODULE('X.DLL'), not from the kind: Sales still imports from both.
        assert.deepStrictEqual(specs[0].references!.map(r => r.name), ['Common', 'Reports']);
    });

    test('an export file outside the folder shows where it was found', () => {
        const inp = { ...input(), exportFiles: { 'Reports.exp': 'D:\\Shared\\exp\\Reports.exp' } };
        const reports = buildReviewState(inp, defaultChoices(inp.inference, 'Sales')).projects[2];
        assert.strictEqual(reports.exportFile.text, 'Found in D:\\Shared\\exp');
        const atRoot = { ...input(), exportFiles: { 'Reports.exp': 'C:\\Apps\\Sales\\Reports.exp' } };
        assert.strictEqual(buildReviewState(atRoot, defaultChoices(atRoot.inference, 'Sales')).projects[2].exportFile.text, 'Found in the folder');
    });

    test('placing a module puts it in the chosen project, and its exports and references follow', () => {
        const files = [...FILES.filter(x => x.relPath !== 'Shared.clw'), f('Shared.clw', '  MEMBER()\r\n  MAP\r\nSharedProc  PROCEDURE,EXPORT\r\n  END\r\n')];
        const inp = input(files);
        const base = defaultChoices(inp.inference, 'Sales');
        const result = reviewResult(inp, change(base, { placement: { 'Shared.clw': 'Reports' } }), guids())!;
        assert.deepStrictEqual(result.specs.map(s => [s.name, s.compile.includes('Shared.clw'), s.exportsMarked]), [
            ['Sales', false, false], ['Common', false, true], ['Reports', true, true], ['Tools', false, true],
        ]);
        const state = buildReviewState(inp, change(base, { placement: { 'Shared.clw': 'Reports' } }));
        assert.strictEqual(state.toPlace[0].value, 'Reports');
        assert.strictEqual(state.projects[2].exportFile.text, 'Found in genfiles\\exp');
    });

    test('"Leave it out" compiles the module nowhere', () => {
        const inp = input();
        const base = defaultChoices(inp.inference, 'Sales');
        const result = reviewResult(inp, change(base, { placement: { 'Shared.clw': '' } }), guids())!;
        assert.ok(result.specs.every(s => !s.compile.includes('Shared.clw')));
        assert.strictEqual(buildReviewState(inp, change(base, { placement: { 'Shared.clw': '' } })).toPlace[0].value, '');
    });

    test('unticking a possible leftover leaves it out of its project', () => {
        const inp = input();
        const base = defaultChoices(inp.inference, 'Sales');
        const unticked = change(base, { kept: { 'Sales009.clw': false } });
        assert.deepStrictEqual(reviewResult(inp, unticked, guids())!.specs[0].compile, ['Sales.clw', 'Sales001.clw', 'CWUtil.CLW', 'Shared.clw']);
        assert.deepStrictEqual(buildReviewState(inp, unticked).leftovers, [{ file: 'Sales009.clw', project: 'Sales', kept: false }]);
        assert.deepStrictEqual(buildReviewState(inp, base).leftovers, [{ file: 'Sales009.clw', project: 'Sales', kept: true }]);
    });

    test('a module naming a program two folders hold is offered only those programs', () => {
        const files = [
            f('a\\Lib.clw', '  PROGRAM\r\n  CODE\r\n'), f('b\\Lib.clw', '  PROGRAM\r\n  CODE\r\n'),
            f('c\\Lib001.clw', member('Lib')), f('Tools.clw', '  PROGRAM\r\n  CODE\r\n  x# = 1'),
        ];
        const inp = input(files, []);
        const base = defaultChoices(inp.inference, 'Lib');
        assert.deepStrictEqual(base.placement, { 'c\\Lib001.clw': 'Lib' });
        const state = buildReviewState(inp, base);
        assert.deepStrictEqual(state.toPlace.map(t => [t.file, t.why, t.options.map(o => o.value)]), [
            ['c\\Lib001.clw', 'MEMBER names a program more than one folder holds', ['Lib', 'b_Lib', '']],
        ]);
        const result = reviewResult(inp, change(base, { placement: { 'c\\Lib001.clw': 'b_Lib' } }), guids())!;
        assert.deepStrictEqual(result.specs.map(s => [s.name, s.compile]), [
            ['Lib', ['a\\Lib.clw']], ['b_Lib', ['b\\Lib.clw', 'c\\Lib001.clw']], ['Tools', ['Tools.clw']],
        ]);
        // Neither Lib included: the module has nowhere to go.
        const none = change(base, { included: { 'a\\Lib.clw': false, 'b\\Lib.clw': false, 'Tools.clw': true } });
        assert.deepStrictEqual(buildReviewState(inp, none).toPlace[0].options.map(o => o.label), ['Leave it out']);
        assert.deepStrictEqual(reviewResult(inp, none, guids())!.specs.map(s => s.compile), [['Tools.clw']]);
    });

    test('the page shows the folder, a summary, why each program is EXE or DLL, its sources and references', () => {
        const inp = input();
        const state = buildReviewState(inp, defaultChoices(inp.inference, 'Sales'));
        assert.strictEqual(state.title, 'New solution from C:\\Apps\\Sales');
        assert.strictEqual(state.summary, '4 programs in 9 source files, 2 library sources through redirection · Clarion 11.1 · Debug');
        assert.deepStrictEqual(state.projects.map(p => [p.programFile, p.why, p.sources]), [
            ['Sales.clw', 'Main CODE runs the program', '4 files + CWUtil.CLW'],
            ['Common.clw', 'Main CODE is empty', '2 files'],
            ['Reports.clw', 'Main CODE is empty', '2 files'],
            ['Tools.clw', 'Main CODE is empty', '1 file'],
        ]);
        assert.deepStrictEqual(state.projects.map(p => p.references), [['Common', 'Reports'], [], ['Common'], []]);
        assert.deepStrictEqual(state.toPlace.map(t => [t.file, t.why, t.value]), [['Shared.clw', 'MEMBER() names no program', 'Sales']]);
        assert.deepStrictEqual(state.configurations, ['Debug', 'Release']);
        assert.strictEqual(state.createLabel, 'Create 4 projects');
        assert.strictEqual(state.canCreate, true);
    });

    test('class implementations a CLASS\'s LINK builds are counted in the note, not listed', () => {
        const files = [...FILES, f('Thing.inc', "Thing CLASS,TYPE,MODULE('Thing.clw'),LINK('Thing.clw')\r\n  END"), f('Thing.clw', '  MEMBER()')];
        const inp = input(files);
        const state = buildReviewState(inp, defaultChoices(inp.inference, 'Sales'));
        assert.strictEqual(state.note, '1 class implementation is built by its CLASS\'s LINK and is not listed. Library sources are listed only where a project calls them.');
        assert.ok(!state.toPlace.some(t => t.file === 'Thing.clw'));
        const plain = input(FILES, []);
        assert.strictEqual(buildReviewState(plain, defaultChoices(plain.inference, 'Sales')).note, '');
    });

    test('nothing to create without a project or a valid solution name', () => {
        const inp = input();
        const base = defaultChoices(inp.inference, 'Sales');
        const none = change(base, { included: { 'Sales.clw': false, 'Common.clw': false, 'Reports.clw': false, 'Tools.clw': false } });
        assert.strictEqual(buildReviewState(inp, none).canCreate, false);
        assert.strictEqual(reviewResult(inp, none, guids()), undefined);
        for (const name of ['', '   ', 'a/b', 'a:b']) {
            assert.strictEqual(buildReviewState(inp, change(base, { name })).canCreate, false, name);
            assert.strictEqual(reviewResult(inp, change(base, { name }), guids()), undefined, name);
        }
        assert.strictEqual(solutionNameError(''), 'Solution name cannot be empty');
        assert.strictEqual(solutionNameError('a|b'), 'Solution name contains invalid characters');
        assert.strictEqual(solutionNameError(' Sales '), undefined);
        assert.strictEqual(reviewResult(inp, change(base, { name: ' Sales2 ', configuration: 'Release' }), guids())!.name, 'Sales2');
        assert.strictEqual(reviewResult(inp, change(base, { configuration: 'Release' }), guids())!.configuration, 'Release');
        assert.strictEqual(buildReviewState(inp, change(base, { included: { ...base.included, 'Tools.clw': false } })).createLabel, 'Create 3 projects');
    });

    test('choices about files the inference no longer has are ignored, and new ones take their defaults', () => {
        // The configuration changes the library sources, so the inference is redone under it.
        const inp = input();
        const stale = change(defaultChoices(inp.inference, 'Sales'), {
            included: { 'Gone.clw': false, 'Tools.clw': false }, kinds: { 'Gone.clw': 'exe' }, placement: {}, kept: {},
        });
        const state = buildReviewState(inp, stale);
        assert.deepStrictEqual(state.projects.map(p => [p.name, p.included, p.kind]), [
            ['Sales', true, 'exe'], ['Common', true, 'dll'], ['Reports', true, 'dll'], ['Tools', false, 'dll'],
        ]);
        assert.strictEqual(state.toPlace[0].value, 'Sales');
        assert.strictEqual(state.leftovers[0].kept, true);
    });
});
