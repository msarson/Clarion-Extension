import * as assert from 'assert';
import { buildFormState, defaultFormChoices, formResult, FormInput } from '../solution/NewSolutionForm';
import { inferProjects, SourceFile } from '../solution/FolderProjectInference';
import { ReviewInput } from '../solution/NewSolutionReview';

/**
 * #792 — New Solution asks everything on its page: the Clarion installation, compiler version and
 * configuration (as the Solution page does), whether to start from the programs in the folder or a
 * new empty program, and the name. No quick pick comes before it.
 */
const C12 = { propertiesFile: 'C:/C12/ClarionProperties.xml', ideVersion: '12.0', compilers: ['Clarion 12.0.14373'] };
const C10 = { propertiesFile: 'C:/C10/ClarionProperties.xml', ideVersion: '10.0', compilers: ['Clarion 10.0.12799', 'Clarion 10.0 (legacy)'] };

const files: SourceFile[] = [
    { relPath: 'Sales.clw', text: '  PROGRAM\r\n  MAP\r\n  END\r\n  CODE\r\n  MESSAGE(1)\r\n' },
    { relPath: 'Common.clw', text: '  PROGRAM\r\n  MAP\r\n  END\r\n  CODE\r\n' },
];
const review = (compiler: string): ReviewInput => ({
    folder: 'C:/Apps/Sales', files, libraries: [], inference: inferProjects(files, []), exportFiles: {}, compiler, sourceCount: files.length,
});
const input = (over: Partial<FormInput> = {}): FormInput => ({
    folder: 'C:/Apps/Sales', installations: [C12, C10], programs: 2, tooLarge: false, ...over,
});

suite('New Solution: one form (#792)', () => {
    test('the installation is taken from what is remembered, else the only one; the rest is chosen on the page', () => {
        assert.deepStrictEqual(defaultFormChoices(input(), 'Sales', { propertiesFile: C12.propertiesFile }).propertiesFile, C12.propertiesFile);
        assert.strictEqual(defaultFormChoices(input({ installations: [C10] }), 'Sales', {}).propertiesFile, C10.propertiesFile);
        const state = buildFormState(input(), defaultFormChoices(input(), 'Sales', {}));
        assert.deepStrictEqual([state.installation.needs, state.version.needs], [true, true]);
        assert.strictEqual(state.canCreate, false);
    });

    test('a folder with programs starts from them; without any, from a new empty program', () => {
        assert.strictEqual(defaultFormChoices(input(), 'Sales', {}).start, 'programs');
        assert.strictEqual(defaultFormChoices(input({ programs: 0 }), 'Sales', {}).start, 'empty');
        const none = buildFormState(input({ programs: 0 }), defaultFormChoices(input({ programs: 0 }), 'Sales', {}));
        assert.strictEqual(none.start.offered, false, 'only one way to start');
        const tooMany = buildFormState(input({ programs: 0, tooLarge: true }), defaultFormChoices(input({ programs: 0, tooLarge: true }), 'Sales', {}));
        assert.match(tooMany.start.why ?? '', /too many/);
    });

    test('from the programs: the projects show once the installation and compiler are chosen', () => {
        const choices = { ...defaultFormChoices(input(), 'Sales', {}), propertiesFile: C12.propertiesFile };
        const waiting = buildFormState(input(), choices);
        assert.strictEqual(waiting.review, undefined);
        assert.match(waiting.waiting ?? '', /Finding|projects/);
        const ready = buildFormState(input({ review: review('Clarion 12.0.14373') }), choices);
        assert.deepStrictEqual(ready.review?.projects.map(p => p.name), ['Sales', 'Common']);
        assert.strictEqual(ready.canCreate, true);
        assert.strictEqual(ready.createLabel, 'Create 2 projects');
    });

    test('a new empty program: its main file, named after the solution until edited', () => {
        const choices = { ...defaultFormChoices(input(), 'Sales', { propertiesFile: C12.propertiesFile }), start: 'empty' as const };
        const state = buildFormState(input(), choices);
        assert.strictEqual(state.mainFile, 'Sales.clw');
        assert.strictEqual(state.createLabel, 'Create the solution');
        assert.strictEqual(buildFormState(input(), { ...choices, name: 'Orders' }).mainFile, 'Orders.clw');
        assert.strictEqual(buildFormState(input(), { ...choices, name: 'Orders', mainFile: 'Main.clw' }).mainFile, 'Main.clw');
        assert.match(buildFormState(input(), { ...choices, mainFile: 'Main.txt' }).mainFileError ?? '', /\.clw/);
        assert.strictEqual(buildFormState(input(), { ...choices, mainFile: 'Main.txt' }).canCreate, false);
    });

    test('the result carries what the solution builds with, and what to write', () => {
        const base = { ...defaultFormChoices(input(), 'Sales', { propertiesFile: C10.propertiesFile, version: 'Clarion 10.0 (legacy)' }), configuration: 'Release' };
        const empty = formResult(input(), { ...base, start: 'empty' });
        assert.deepStrictEqual(empty && { ...empty }, {
            folder: 'C:/Apps/Sales', propertiesFile: C10.propertiesFile, compiler: 'Clarion 10.0 (legacy)', configuration: 'Release', name: 'Sales', start: 'empty', mainFile: 'Sales.clw',
        });
        const programs = formResult(input({ review: review('Clarion 10.0 (legacy)') }), base);
        assert.strictEqual(programs?.start, 'programs');
        assert.deepStrictEqual(programs?.start === 'programs' ? programs.specs.map(s => s.name) : [], ['Sales', 'Common']);
        assert.strictEqual(formResult(input(), base), undefined, 'no projects yet: nothing to create');
        assert.strictEqual(formResult(input(), { ...base, propertiesFile: undefined, start: 'empty' }), undefined, 'no installation chosen');
    });
});

suite('New Solution: the folder it is made in (#792)', () => {
    const C12 = { propertiesFile: 'C:/C12/ClarionProperties.xml', ideVersion: '12.0', compilers: ['Clarion 12.0.14373'] };

    test('with no folder chosen, the page asks for one and cannot create', () => {
        const input = { folder: '', installations: [C12], programs: 0, tooLarge: false };
        const state = buildFormState(input, defaultFormChoices(input, '', {}));
        assert.strictEqual(state.folder.needs, true);
        assert.strictEqual(state.canCreate, false);
        assert.strictEqual(state.title, 'New solution');
    });

    test('a chosen folder is shown, and the solution is made in it', () => {
        const input = { folder: 'D:/Apps/Orders', installations: [C12], programs: 0, tooLarge: false };
        const choices = defaultFormChoices(input, 'Orders', {});
        const state = buildFormState(input, choices);
        assert.deepStrictEqual([state.folder.value, state.folder.needs], ['D:/Apps/Orders', false]);
        assert.strictEqual(state.title, 'New solution in D:/Apps/Orders');
        assert.strictEqual(formResult(input, choices)?.folder, 'D:/Apps/Orders');
    });
});
