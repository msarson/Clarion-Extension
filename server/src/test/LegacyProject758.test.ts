import * as assert from 'assert';
import { parseLegacyProject } from '../../../common/LegacyProject';

/**
 * #758 — the legacy (TopSpeed) project language of .prj/.pr files, as the help's Legacy Project
 * System Reference describes it: what a project compiles, includes and defines.
 */
suite('Legacy project files (#758)', () => {
    const files = (map: Record<string, string>) => (name: string) => map[name.toLowerCase()];

    test('a generated project: #compile lists the sources, with their per-file defines', () => {
        const p = parseLegacyProject([
            '#noedit',
            '#system win32',
            '#model clarion dll',
            '#pragma debug(vid=>full)',
            '#compile QWKTU_RD.CLW -- GENERATED',
            '#compile QWKTUTOR.clw /define(GENERATED=>on) -- GENERATED',
            '#pragma link(C%L%TPS%S%.LIB) -- GENERATED',
            '#link QWKTUTOR.EXE',
        ].join('\r\n'));
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['QWKTU_RD.CLW', 'QWKTUTOR.clw']);
        assert.deepStrictEqual(p.compiles[1].defines, { generated: 'on' });
        assert.deepStrictEqual(p.compiles[0].defines, {});
        assert.strictEqual(p.system, 'win32');
        assert.strictEqual(p.model, 'clarion');
        assert.deepStrictEqual(p.linkTargets, ['QWKTUTOR.EXE']);
        assert.deepStrictEqual(p.links, ['CTPS.LIB'], 'unset macros expand to nothing');
    });

    test('a DLL project with an #include of a shared .pi that sets the macros', () => {
        const read = files({
            'common.pi': "#set pfx = 'ABC'\r\n#declare_compiler exp = '#run tsimplib %%src'\r\n",
        });
        const p = parseLegacyProject([
            '-- Generator',
            '#noedit',
            '#system win32',
            '#model clarion dll',
            '',
            '#include common.pi',
            '',
            '#pragma define(maincode=>off)',
            '#pragma define(_PROJ_=>1)',
            '',
            '#compile "Main.clw"',
            '#compile "ModuleA.clw"',
            '#compile "Shared.clw" /define(_STD_DLL_INIT_=>on)',
            '#compile "Main.exp"',
            '',
            '#pragma link("%pfx%Files.lib")',
            '#pragma link("%pfx%035.lib")',
            '#link "%pfx%016.DLL"',
        ].join('\r\n'), { read });
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['Main.clw', 'ModuleA.clw', 'Shared.clw', 'Main.exp']);
        assert.deepStrictEqual(p.compiles[2].defines, { _std_dll_init_: 'on' });
        assert.deepStrictEqual(p.includes, [{ file: 'common.pi', found: true }]);
        assert.deepStrictEqual(p.defines, { maincode: 'off', _proj_: '1' });
        assert.deepStrictEqual(p.links, ['ABCFiles.lib', 'ABC035.lib']);
        assert.deepStrictEqual(p.linkTargets, ['ABC016.DLL']);
    });

    test('an #include that cannot be read is recorded, and the rest still parses', () => {
        const p = parseLegacyProject('#include missing.pi\n#compile a.clw\n', { read: () => undefined });
        assert.deepStrictEqual(p.includes, [{ file: 'missing.pi', found: false }]);
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['a.clw']);
    });

    test('several commands on one line, and one #compile naming several sources', () => {
        const p = parseLegacyProject('#set a=on #set b=off #compile x.clw, y.clw /define(q=>1), z.clw #to zz.obj\n');
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['x.clw', 'y.clw', 'z.clw']);
        assert.deepStrictEqual(p.compiles[1].defines, { q: '1' });
        assert.deepStrictEqual(p.compiles[2].defines, {});
    });

    test('#if decides on macros (a bare word is a literal string): only the taken branch compiles', () => {
        const p = parseLegacyProject([
            '#set release = on',
            '#if "%release"="on" #then',
            '  #compile rel.clw',
            '#elsif %release = off #then',
            '  #compile dbg.clw',
            '#else',
            '  #compile other.clw',
            '#endif',
            '#if #not %release #then #compile notrel.clw #endif',
            '#if release #then #compile literal.clw #endif',
            '#if %missing = "" #and %release #then #compile both.clw #endif',
            '#if (%missing = x) #or %release= #then #compile either.clw #endif',
            '#if #not %system=dos #then #compile notdos.clw #endif',
        ].join('\n'));
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['rel.clw', 'both.clw', 'either.clw', 'notdos.clw']);
        assert.strictEqual(p.uncertain, false);
    });

    test('a condition it cannot decide follows every branch and says so', () => {
        const p = parseLegacyProject([
            '#if a.lib #older a.exp #then #compile one.clw #else #compile two.clw #endif',
            '#if #exists vendor.pr #then #compile three.clw #endif',
        ].join('\n'));
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['one.clw', 'two.clw', 'three.clw']);
        assert.strictEqual(p.uncertain, true);
    });

    test('#exists is decided when the caller can tell', () => {
        const p = parseLegacyProject('#if #exists vendor.pr #then #compile v.clw #else #compile none.clw #endif',
            { exists: name => name.toLowerCase() === 'other.pr' });
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['none.clw']);
        assert.strictEqual(p.uncertain, false);
    });

    test('nested #if inside a branch not taken stays skipped', () => {
        const p = parseLegacyProject([
            '#set demo = off',
            '#if %demo #then',
            '  #if #exists x.pr #then #compile a.clw #endif',
            '  #compile b.clw',
            '#endif',
            '#compile c.clw',
        ].join('\n'));
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['c.clw']);
        assert.strictEqual(p.uncertain, false);
    });

    test('comments end at the line; -- inside a string is not a comment', () => {
        const p = parseLegacyProject("#compile a.clw -- #compile b.clw\n#set s = 'x -- y' #compile '%s.clw'\n");
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['a.clw', 'x -- y.clw']);
    });

    test('#call runs another project: its sources are not this one\'s', () => {
        const read = files({ 'sub.pr': '#compile sub.clw' });
        const p = parseLegacyProject('#call sub.pr\n#compile main.clw', { read });
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['main.clw']);
        assert.deepStrictEqual(p.calls, ['sub.pr']);
    });

    test('a macro holding commands runs where it is used; %% delays expansion', () => {
        const p = parseLegacyProject([
            "#set doit = '#compile %%name.clw'",
            '#set name = first',
            '%doit',
            '#set name = second',
            '%doit',
        ].join('\n'));
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['first.clw', 'second.clw']);
    });

    test('a multi-line quoted macro value', () => {
        const p = parseLegacyProject([
            "#set models = '",
            '  #compile one.clw',
            '  #compile two.clw',
            "'",
            '%models',
        ].join('\n'));
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['one.clw', 'two.clw']);
    });

    test('#file redirect names the redirection file', () => {
        const p = parseLegacyProject('#file redirect ts.red\n#compile a.clw');
        assert.strictEqual(p.redirect, 'ts.red');
    });

    test('an #include cycle stops', () => {
        const read = files({ 'a.pi': '#include b.pi\n#compile a.clw', 'b.pi': '#include a.pi\n#compile b.clw' });
        const p = parseLegacyProject('#include a.pi', { read });
        assert.deepStrictEqual(p.compiles.map(c => c.file).sort(), ['a.clw', 'b.clw']);
    });

    test('macro names ignore case and a trailing % is optional', () => {
        const p = parseLegacyProject("#set Pfx = Cla\n#compile %PFX%one.clw, %pfx.two.clw");
        assert.deepStrictEqual(p.compiles.map(c => c.file), ['Claone.clw', 'Cla.two.clw']);
    });
});
