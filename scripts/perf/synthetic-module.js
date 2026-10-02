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

/** The MEMBER module's text, about `targetLines` lines long (CRLF), with no files written. */
function syntheticModuleText(targetLines) {
    const perProc = procedure(0, 1).length;
    return syntheticModuleLines(Math.max(2, Math.round(targetLines / perProc))).join(CRLF) + CRLF;
}

/** Write the solution under `dir`; the module is grown to about `targetLines` lines. */
function writeSyntheticSolution(dir, targetLines) {
    fs.mkdirSync(dir, { recursive: true });
    const perProc = procedure(0, 1).length;
    const procedures = Math.max(2, Math.round(targetLines / perProc));

    const module = syntheticModuleLines(procedures);

    const program = ['  PROGRAM', '', "  INCLUDE('EQUATES.CLW'),ONCE", '', '  MAP', "    MODULE('SynthMod.clw')"];
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
    console.log(writeSyntheticSolution(out, lines));
}
