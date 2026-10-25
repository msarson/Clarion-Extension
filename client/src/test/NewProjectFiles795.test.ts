import * as assert from 'assert';
import { buildProgramContent, newProjectFiles } from '../solution/SolutionFiles';

/**
 * #795 — what a project added from Solution Properties writes: its .cwproj, its main program and,
 * for a DLL, the minimal export file it cannot link without (#763). An EXE's main CODE runs the
 * program; a DLL's is empty, as the generator writes it.
 */
suite('Solution Properties: a new project\'s files (#795)', () => {
    test('an EXE: the project and a program that runs', () => {
        const files = newProjectFiles({ name: 'Orders', kind: 'exe', mainFile: 'Orders.clw', guid: '{33333333-3333-3333-3333-333333333333}' });
        assert.deepStrictEqual(files.map(f => f.path), ['Orders.cwproj', 'Orders.clw']);
        assert.ok(files[0].content.includes('<OutputType>Exe</OutputType>'));
        assert.ok(files[0].content.includes('<Compile Include="Orders.clw" />'));
        assert.ok(files[0].content.includes('<ProjectGuid>{33333333-3333-3333-3333-333333333333}</ProjectGuid>'));
        assert.strictEqual(files[1].content, buildProgramContent('exe'));
        assert.match(files[1].content, /CODE\r\n  MESSAGE/);
    });

    test('a DLL: an empty main CODE, and its export file', () => {
        const files = newProjectFiles({ name: 'Common', kind: 'dll', mainFile: 'Common.clw', guid: '{44444444-4444-4444-4444-444444444444}' });
        assert.deepStrictEqual(files.map(f => f.path), ['Common.cwproj', 'Common.clw', 'Common.exp']);
        assert.ok(files[0].content.includes('<OutputType>Library</OutputType>'));
        assert.match(files[1].content, /  CODE\r\n$/, 'nothing after CODE');
        assert.strictEqual(files[2].content, "LIBRARY 'COMMON' GUI\r\nEXPORTS\r\n");
    });
});
