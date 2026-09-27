#!/usr/bin/env node
/**
 * #701 — which keywords may be labels, and where: settled by the compiler, not the help.
 *
 * Builds one tiny program per (keyword, place) with MSBuild and the Clarion targets, and writes a
 * table of what compiled to results-<version>.md next to this script.
 *
 *   node test-programs/ReservedWordsTest/run.js --clarion=<Clarion install root> [--words=IF,CODE] [--jobs=1]
 *
 * The keywords are the two tables of the Language Reference's Reserved Words page. `Foo` is the
 * control: it must build in every place, and the "must fail" cases must not, or the harness
 * itself is broken and the table means nothing.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const CLARION = arg('clarion');
if (!CLARION || !fs.existsSync(path.join(CLARION, 'bin', 'SoftVelocity.Build.Clarion.targets'))) {
    console.error('usage: node run.js --clarion=<Clarion install root>   (the folder holding bin\\SoftVelocity.Build.Clarion.targets)');
    process.exit(2);
}
const MSBUILD = 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\MSBuild.exe';
// One build at a time by default: parallel builds collide in the linker and report symbols
// (AddCommand in ClaRUN.dll, ActivateActCtx in KERNEL32.dll) as duplicates, failing cases at random.
const JOBS = Number(arg('jobs') ?? 1);

// The Reserved Words page, table 1 ("may not be used as labels for any purpose") and table 2
// ("may be used as labels of data structures or executable statements ... not ... any PROCEDURE").
const TABLE1 = ('ACCEPT AND ASSERT BEGIN BREAK BY CASE CATCH CHOOSE CODE COMPILE CONST CYCLE DATA DO ELSE ELSIF END ' +
    'EXECUTE EXIT FINALLY FUNCTION GOTO IF INCLUDE LOOP MEMBER NEW NOT NULL OF OMIT OR OROF PRAGMA PROCEDURE ' +
    'PROGRAM RETURN ROUTINE SECTION THEN THROW TIMES TO TRY UNTIL WHILE XOR').split(' ');
const TABLE2 = ('APPLICATION CLASS DETAIL FILE FOOTER FORM GROUP HEADER ITEM ITEMIZE JOIN MAP MENU MENUBAR MODULE ' +
    'OLE OPTION QUEUE PARENT RECORD REPORT SELF SHEET TAB TOOLBAR VIEW WINDOW').split(' ');
const CONTROL = 'Foo';

// Each place a label can go. K is the keyword; every program is otherwise minimal and valid.
const PLACES = {
    globalData: K => ['  PROGRAM', '  MAP', '  END', `${K}   LONG`, '  CODE'],
    localData: K => ['  PROGRAM', '  MAP', 'P PROCEDURE', '  END', '  CODE', '  P()', 'P PROCEDURE', `${K}   LONG`, '  CODE'],
    groupField: K => ['  PROGRAM', '  MAP', '  END', 'G   GROUP', `${K}   LONG`, '    END', '  CODE'],
    classProperty: K => ['  PROGRAM', '  MAP', '  END', 'C   CLASS', `${K}   LONG`, '    END', '  CODE'],
    classMethod: K => ['  PROGRAM', '  MAP', '  END', 'C   CLASS', `${K}   PROCEDURE`, '    END', '  CODE', '  C.' + K + '()', `C.${K} PROCEDURE`, '  CODE'],
    globalProcedure: K => ['  PROGRAM', '  MAP', `${K} PROCEDURE`, '  END', '  CODE', `${K} PROCEDURE`, '  CODE'],
    routine: K => ['  PROGRAM', '  MAP', '  END', '  CODE', `  DO ${K}`, `${K} ROUTINE`, '  EXIT'],
    parameter: K => ['  PROGRAM', '  MAP', `P PROCEDURE(LONG ${K})`, '  END', '  CODE', '  P(1)', `P PROCEDURE(LONG ${K})`, '  CODE'],
    // A reserved word before a comma fails where the same word alone or last builds.
    parameterFirst: K => ['  PROGRAM', '  MAP', `P PROCEDURE(LONG ${K}, LONG Y)`, '  END', '  CODE', '  P(1, 2)', `P PROCEDURE(LONG ${K}, LONG Y)`, '  CODE'],
    parameterLast: K => ['  PROGRAM', '  MAP', `P PROCEDURE(LONG Y, LONG ${K})`, '  END', '  CODE', '  P(1, 2)', `P PROCEDURE(LONG Y, LONG ${K})`, '  CODE'],
    statementLabel: K => ['  PROGRAM', '  MAP', '  END', 'X   LONG', '  CODE', `${K}  X = 1`],
    methodParameter: K => ['  PROGRAM', '  MAP', '  END', 'C   CLASS', `M   PROCEDURE(LONG ${K})`, '    END', '  CODE', '  C.M(1)', `C.M PROCEDURE(LONG ${K})`, '  CODE'],
    methodLocal: K => ['  PROGRAM', '  MAP', '  END', 'C   CLASS', 'M   PROCEDURE', '    END', '  CODE', '  C.M()', 'C.M PROCEDURE', `${K}   LONG`, '  CODE'],
};

// Harness checks: these must fail, whatever the table says.
const MUST_FAIL = [
    ['a statement in column 1', ['  PROGRAM', '  MAP', '  END', 'X   LONG', '  CODE', 'X = 1']],
    ['a label indented', ['  PROGRAM', '  MAP', '  END', '  X   LONG', '  CODE']],
];

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'reserved-words-'));
const CWPROJ = name => [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <ProjectGuid>{7D0E4C2A-1B3F-4E5D-9A60-7C8B9D0E1F21}</ProjectGuid>',
    "    <Configuration Condition=\" '$(Configuration)' == '' \">Debug</Configuration>",
    "    <Platform Condition=\" '$(Platform)' == '' \">Win32</Platform>",
    '    <OutputType>Exe</OutputType>',
    `    <AssemblyName>${name}</AssemblyName>`,
    `    <OutputName>${name}</OutputName>`,
    '  </PropertyGroup>',
    '  <ItemGroup>',
    '    <Compile Include="case.clw"/>',
    '  </ItemGroup>',
    '  <Import Project="$(ClarionBinPath)\\SoftVelocity.Build.Clarion.targets"/>',
    '</Project>',
    '',
].join('\r\n');

let seq = 0;
function build(lines) {
    const dir = path.join(work, String(++seq));
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'case.clw'), lines.join('\r\n') + '\r\n'); // CRLF: the compiler needs it
    fs.writeFileSync(path.join(dir, 'case.cwproj'), CWPROJ(`c${seq}`));
    return new Promise(resolve => {
        const p = spawn(MSBUILD, ['case.cwproj', '/t:build', '/p:Configuration=Debug', '/p:Platform=Win32',
            `/p:ClarionBinPath=${path.join(CLARION, 'bin')}`, '/p:clarion_Sections=Debug', '/nologo', '/v:minimal'], { cwd: dir });
        let out = '';
        p.stdout.on('data', d => out += d);
        p.stderr.on('data', d => out += d);
        p.on('close', code => {
            const error = /error\s*:\s*(.*?)(?:\s+\[[^\]]*\])?\s*$/m.exec(out)?.[1]?.trim();
            // A link error means the compiler accepted the source: the label is legal, and the
            // clash is with a runtime symbol of the same name (the label became a public symbol).
            const link = code !== 0 && /Duplicate symbol|Unresolved External/i.test(out) && !/\.clw\(\d+,\d+\)\s*:\s*error/i.test(out);
            resolve({ ok: code === 0, link, error: code === 0 ? undefined : (error ?? `exit ${code}`) });
        });
    });
}

async function pool(tasks) {
    const results = new Array(tasks.length);
    let next = 0;
    await Promise.all(Array.from({ length: JOBS }, async () => {
        while (next < tasks.length) { const i = next++; results[i] = await tasks[i](); }
    }));
    return results;
}

(async () => {
    const words = arg('words')?.split(',') ?? [CONTROL, ...TABLE1, ...TABLE2];
    const places = Object.keys(PLACES);
    console.log(`${words.length} words x ${places.length} places, ${JOBS} at a time, in ${work}`);

    const checks = await pool(MUST_FAIL.map(([, lines]) => () => build(lines)));
    MUST_FAIL.forEach(([name], i) => console.log(`harness: ${name} -> ${checks[i].ok ? 'BUILT (harness broken!)' : 'fails, as it must'}`));
    if (checks.some(c => c.ok)) process.exit(1);

    const cases = words.flatMap(w => places.map(p => ({ w, p })));
    const started = Date.now();
    const results = await pool(cases.map(c => () => build(PLACES[c.p](c.w))));
    const at = (w, p) => results[cases.findIndex(c => c.w === w && c.p === p)];
    console.log(`built ${cases.length} cases in ${Math.round((Date.now() - started) / 1000)}s`);

    const control = places.filter(p => !at(CONTROL, p).ok);
    if (control.length) { console.error(`control ${CONTROL} failed in: ${control.join(', ')} — fix the harness first`); process.exit(1); }

    const version = /Clarion(\d+)/i.exec(CLARION)?.[1] ?? path.basename(CLARION);
    const table = w => TABLE1.includes(w) ? '1' : TABLE2.includes(w) ? '2' : 'control';
    const cell = r => r.ok ? '✓' : r.link ? 'L' : '✗';
    const rows = words.map(w => `| ${w} | ${table(w)} | ${places.map(p => cell(at(w, p))).join(' | ')} |`);
    const failures = cases.map((c, i) => ({ ...c, r: results[i] })).filter(x => !x.r.ok);
    const md = [
        `# Keywords as labels — compiler results (${path.basename(CLARION)})`,
        '',
        `Generated by \`run.js\` on ${new Date().toISOString().slice(0, 10)}. ✓ builds; ✗ the compiler rejects it; L compiles but does not link (the label clashes with a runtime symbol). "Help table" is the Language Reference's Reserved Words table the word appears in (1: never a label; 2: not a PROCEDURE's label).`,
        '',
        `| Word | Help table | ${places.join(' | ')} |`,
        `|---|---|${places.map(() => '---').join('|')}|`,
        ...rows,
        '',
        '## Every failure',
        '',
        ...failures.map(x => `- ${x.w} / ${x.p}: ${x.r.link ? 'link' : 'compile'} — \`${x.r.error}\``),
        '',
    ].join('\n');
    const outFile = path.join(__dirname, `results-${version}.md`);
    fs.writeFileSync(outFile, md);
    console.log(`wrote ${outFile}`);
    fs.rmSync(work, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
