#!/usr/bin/env node
/**
 * #711 — a synthetic, generated-style Clarion solution for latency benchmarks: a PROGRAM with a
 * large global MAP and FILE declarations, and one MEMBER module of many procedures, each with a
 * local data section (QUEUE, GROUP, locals), a WINDOW, an ACCEPT loop with CASE EVENT()/FIELD(),
 * calls to its neighbours and ROUTINEs. Entirely made up — no third-party source.
 *
 *   const { writeSyntheticSolution } = require('./synthetic-module');
 *   const sol = writeSyntheticSolution(dir, 60000);  // ~60k-line module
 *   // sol = { sln, program, module, lines, procedures }
 */
const fs = require('fs');
const path = require('path');

const CRLF = '\r\n';

function procedure(i, total) {
    const p = `Proc${i}`;
    const next = `Proc${(i + 1) % total}`;
    const lines = [
        `${p}                PROCEDURE`,
        '',
        `Loc:Total           DECIMAL(12,2)`,
        `Loc:Count           LONG`,
        `Loc:Name            STRING(40)`,
        `Loc:Date            LONG`,
        `Loc:Flag            BYTE`,
        `Loc:Message         CSTRING(256)`,
        `${p}:Queue          QUEUE,PRE(PQ${i})`,
        `Id                    LONG`,
        `Name                  STRING(40)`,
        `Amount                DECIMAL(12,2)`,
        `Due                   LONG`,
        `Status                STRING(10)`,
        `Mark                  BYTE`,
        `                    END`,
        `${p}:Group          GROUP,PRE(PG${i})`,
        `First                 STRING(20)`,
        `Last                  STRING(20)`,
        `Phone                 STRING(20)`,
        `                    END`,
        `ThisWindow          CLASS(WindowManager)`,
        `Init                  PROCEDURE(),BYTE,DERIVED`,
        `Kill                  PROCEDURE(),BYTE,DERIVED`,
        `                    END`,
        `Window              WINDOW('Window ${i}'),AT(,,420,260),CENTER,GRAY,SYSTEM,MAX`,
        `                       PROMPT('&Name:'),AT(8,10),USE(?Prompt:Name)`,
        `                       ENTRY(@s40),AT(60,10,200,12),USE(Loc:Name)`,
        `                       PROMPT('&Date:'),AT(8,28),USE(?Prompt:Date)`,
        `                       ENTRY(@d17),AT(60,28,80,12),USE(Loc:Date)`,
        `                       CHECK('&Flag'),AT(60,46),USE(Loc:Flag)`,
        `                       LIST,AT(8,64,404,150),USE(?List),VSCROLL,FROM(${p}:Queue), |`,
        `                          FORMAT('40R(2)|M~Id~C(0)@n_9@160L(2)|M~Name~@s40@60R(2)|M~Amount~C(0)@n-14.2@' & |`,
        `                          '60R(2)|M~Due~C(0)@d17@40L(2)|M~Status~@s10@')`,
        `                       BUTTON('&OK'),AT(300,226,50,16),USE(?OK),DEFAULT`,
        `                       BUTTON('&Cancel'),AT(356,226,50,16),USE(?Cancel)`,
        `                     END`,
        '',
        '  CODE',
        '  OPEN(Window)',
        '  DO LoadQueue',
        '  ACCEPT',
        '    CASE EVENT()',
        '    OF EVENT:OpenWindow',
        '      SELECT(?Prompt:Name)',
        '    OF EVENT:CloseWindow',
        '      BREAK',
        '    END',
        '    CASE FIELD()',
        '    OF ?OK',
        '      CASE EVENT()',
        '      OF EVENT:Accepted',
        '        DO SaveQueue',
        `        Loc:Total = Loc:Total + PQ${i}:Amount`,
        `        F${i % 40}:Amount = Loc:Total`,
        '        Glo:Today = TODAY()',
        '        ThisWindow.Kill()',
        `        IF Loc:Count > 10 AND Loc:Flag = 1`,
        `          Loc:Message = 'Too many rows in ' & Loc:Name`,
        `          MESSAGE(Loc:Message)`,
        '        ELSE',
        `          ${next}()`,
        '        END',
        '        POST(EVENT:CloseWindow)',
        '      END',
        '    OF ?Cancel',
        '      POST(EVENT:CloseWindow)',
        '    OF ?List',
        '      CASE EVENT()',
        '      OF EVENT:NewSelection',
        `        GET(${p}:Queue, CHOICE(?List))`,
        `        Loc:Name = PQ${i}:Name`,
        `        PG${i}:First = PQ${i}:Name`,
        '      END',
        '    END',
        '  END',
        '  CLOSE(Window)',
        '  RETURN',
        '',
        'LoadQueue           ROUTINE',
        `  FREE(${p}:Queue)`,
        '  LOOP Loc:Count = 1 TO 20',
        `    PQ${i}:Id = Loc:Count`,
        `    PQ${i}:Name = 'Row ' & Loc:Count`,
        `    PQ${i}:Amount = Loc:Count * 1.5`,
        `    PQ${i}:Due = TODAY() + Loc:Count`,
        `    PQ${i}:Status = 'Open'`,
        `    ADD(${p}:Queue)`,
        '  END',
        '',
        'SaveQueue           ROUTINE',
        `  LOOP Loc:Count = 1 TO RECORDS(${p}:Queue)`,
        `    GET(${p}:Queue, Loc:Count)`,
        `    IF PQ${i}:Mark`,
        `      Loc:Total += PQ${i}:Amount`,
        '    END',
        '  END',
        '',
    ];
    return lines;
}

function fileDecl(i) {
    return [
        `File${i}               FILE,DRIVER('TOPSPEED'),PRE(F${i}),CREATE,BINDABLE,THREAD`,
        `KeyId                  KEY(F${i}:Id),NOCASE,OPT,PRIMARY`,
        `KeyName                KEY(F${i}:Name),DUP,NOCASE`,
        `Record                 RECORD,PRE()`,
        `Id                       LONG`,
        `Name                     STRING(40)`,
        `Amount                   DECIMAL(12,2)`,
        `Created                  LONG`,
        `                       END`,
        `                     END`,
        '',
    ];
}

/** The MEMBER module's lines: `procedures` generated-style procedures (about 90 lines each). */
function syntheticModuleLines(procedures) {
    const module = ["  MEMBER('Synth')", '', '  MAP', '  END', ''];
    for (let i = 0; i < procedures; i++) module.push(...procedure(i, procedures));
    return module;
}

/**
 * #715 — the other generated shape: one procedure that is nearly the whole module (a report
 * or export designer: a few hundred lines of data and window, then thousands of field blocks
 * spread over ROUTINEs), followed by a few ordinary procedures. Per-procedure work is
 * whole-module work here. Made up; no third-party source.
 */
const SMALL_AFTER_GIANT = 12;
function fieldBlock(r, b) {
    const n = `R${r}F${b}`;
    const lines = [
        `  Rpt:Name = '${n}'`,
        `  Rpt:Kind = ${b % 3 === 0 ? 'KIND:Number' : 'KIND:Text'}`,
        `  Rpt:Value &= NEW(CSTRING(128))`,
        `  IF Rpt:Kind = KIND:Number`,
        `    Rpt:Value = FORMAT(Loc:Amount + ${b}, @n12.2)`,
        `  ELSE`,
        `    Rpt:Value = CLIP(Loc:Name) & '${n}'`,
        `  END`,
        `  DO SendField`,
        `  DISPOSE(Rpt:Value)`,
    ];
    if (b % 7 === 3) lines.push(`  Rpt:Caption = 'Field ' & |`, `                '${n}' & |`, `                ' caption'`);
    if (b % 11 === 5) lines.push(`  CASE Rpt:Kind`, `  OF KIND:Number`, `    Loc:Count += 1`, `  OF KIND:Text`, `    Loc:Count += 2`, `  END`);
    if (b % 13 === 8) lines.push(`  LOOP Loc:Index = 1 TO 3`, `    Loc:Total += Loc:Index`, `  END`);
    if (b % 29 === 17) lines.push(`  OMIT('***')`, `  Rpt:Name = 'retired ${n}'`, `  ***`);
    return lines;
}
function giantProcedure(targetLines) {
    const head = [
        'Designer             PROCEDURE',
        '',
        'Rpt:Name             STRING(255)',
        'Rpt:Value            &CSTRING',
        'Rpt:Caption          STRING(255)',
        'Rpt:Kind             LONG',
        'Loc:Amount           DECIMAL(12,2)',
        'Loc:Name             STRING(40)',
        'Loc:Count            LONG',
        'Loc:Index            LONG',
        'Loc:Total            LONG',
        'Fields:Queue         QUEUE,PRE(FQ)',
        'Name                   STRING(60)',
        'Kind                   LONG',
        '                     END',
        'ThisWindow           CLASS(WindowManager)',
        'Init                   PROCEDURE(),BYTE,DERIVED',
        'Kill                   PROCEDURE(),BYTE,DERIVED',
        '                     END',
        "Window               WINDOW('Designer'),AT(,,400,240),CENTER,GRAY,SYSTEM",
        '                       LIST,AT(8,8,384,200),USE(?Fields),FROM(Fields:Queue)',
        "                       BUTTON('&Close'),AT(340,214,50,16),USE(?Close)",
        '                     END',
        '',
        '  CODE',
        '  OPEN(Window)',
        '  ACCEPT',
        '    CASE EVENT()',
        '    OF EVENT:OpenWindow',
        '      DO Fields0',
        '    OF EVENT:CloseWindow',
        '      BREAK',
        '    END',
        '    CASE FIELD()',
        '    OF ?Close',
        '      POST(EVENT:CloseWindow)',
        '    END',
        '  END',
        '  CLOSE(Window)',
        '  RETURN',
        '',
        'SendField            ROUTINE',
        '  FQ:Name = Rpt:Name',
        '  FQ:Kind = Rpt:Kind',
        '  ADD(Fields:Queue)',
        '',
    ];
    const routines = 50;
    const perRoutine = Math.max(20, Math.floor((targetLines - head.length) / routines));
    const lines = [...head];
    for (let r = 0; r < routines; r++) {
        lines.push(`Fields${r}             ROUTINE`);
        const end = lines.length + perRoutine - 3;
        for (let b = 0; lines.length < end; b++) lines.push(...fieldBlock(r, b));
        if (r + 1 < routines) lines.push(`  DO Fields${r + 1}`);
        lines.push('');
    }
    return lines;
}
function giantModuleLines(targetLines) {
    const perProc = procedure(0, 1).length;
    const module = ["  MEMBER('Synth')", '', "  INCLUDE('EQUATES.CLW'),ONCE", 'KIND:Number          EQUATE(1)', 'KIND:Text            EQUATE(2)', '', '  MAP', '  END', ''];
    module.push(...giantProcedure(targetLines - SMALL_AFTER_GIANT * perProc));
    for (let i = 0; i < SMALL_AFTER_GIANT; i++) module.push(...procedure(i, SMALL_AFTER_GIANT));
    return module;
}

/**
 * The MEMBER module's text, about `targetLines` lines long (CRLF), with no files written.
 * `shape: 'giant'` gives one procedure that is nearly the whole module (#715).
 */
function syntheticModuleText(targetLines, { shape = 'procedures' } = {}) {
    if (shape === 'giant') return giantModuleLines(targetLines).join(CRLF) + CRLF;
    const perProc = procedure(0, 1).length;
    return syntheticModuleLines(Math.max(2, Math.round(targetLines / perProc))).join(CRLF) + CRLF;
}

/** Write the solution under `dir`; the module is grown to about `targetLines` lines. */
function writeSyntheticSolution(dir, targetLines, { shape = 'procedures' } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const perProc = procedure(0, 1).length;
    const procedures = shape === 'giant' ? SMALL_AFTER_GIANT : Math.max(2, Math.round(targetLines / perProc));

    const module = shape === 'giant' ? giantModuleLines(targetLines) : syntheticModuleLines(procedures);

    const program = ['  PROGRAM', '', "  INCLUDE('EQUATES.CLW'),ONCE", '', '  MAP', "    MODULE('SynthMod.clw')"];
    if (shape === 'giant') program.push('Designer            PROCEDURE');
    for (let i = 0; i < procedures; i++) program.push(`Proc${i}              PROCEDURE`);
    program.push('    END', '  END', '');
    for (let i = 0; i < 40; i++) program.push(...fileDecl(i));
    program.push('Glo:User            STRING(40)', 'Glo:Today           LONG', '', '  CODE', '  Proc0()', '');

    const write = (name, lines) => fs.writeFileSync(path.join(dir, name), lines.join(CRLF) + CRLF);
    write('SynthMod.clw', module);
    write('Synth.clw', program);
    write('Synth.cwproj', [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
        '  <PropertyGroup>',
        '    <ProjectGuid>{5A5A5A5A-0000-4000-8000-000000000711}</ProjectGuid>',
        "    <Configuration Condition=\" '$(Configuration)' == '' \">Debug</Configuration>",
        '    <OutputType>Exe</OutputType>',
        '    <AssemblyName>Synth</AssemblyName>',
        '    <OutputName>Synth</OutputName>',
        '  </PropertyGroup>',
        '  <ItemGroup>',
        '    <Compile Include="Synth.clw" />',
        '    <Compile Include="SynthMod.clw" />',
        '  </ItemGroup>',
        '  <Import Project="$(ClarionBinPath)\\SoftVelocity.Build.Clarion.targets" />',
        '</Project>',
    ]);
    write('Synth.sln', [
        'Microsoft Visual Studio Solution File, Format Version 12.00',
        '# Clarion 2.1.0.2447',
        'Project("{12B76EC0-1D7B-4FA7-A7D0-C524288B48A1}") = "Synth", "Synth.cwproj", "{5A5A5A5A-0000-4000-8000-000000000711}"',
        'EndProject',
        'Global',
        '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution',
        '\t\tDebug|Win32 = Debug|Win32',
        '\tEndGlobalSection',
        'EndGlobal',
    ]);
    return {
        sln: path.join(dir, 'Synth.sln'),
        program: path.join(dir, 'Synth.clw'),
        module: path.join(dir, 'SynthMod.clw'),
        lines: module.length,
        procedures,
    };
}

module.exports = { writeSyntheticSolution, syntheticModuleText };

if (require.main === module) {
    const out = process.argv[2] || path.join(require('os').tmpdir(), 'clarion-synth');
    const lines = Number(process.argv[3] || 60000);
    console.log(writeSyntheticSolution(out, lines, { shape: process.argv[4] || 'procedures' }));
}
