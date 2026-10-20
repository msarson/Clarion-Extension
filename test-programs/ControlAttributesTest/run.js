#!/usr/bin/env node
/**
 * #737 — which attributes each WINDOW and REPORT control accepts: settled by the compiler, not the help.
 *
 * For every control, in a WINDOW and in a REPORT, builds one program holding one copy of the
 * control per candidate attribute, each in its own WINDOW (or REPORT), and reads the compiler's
 * errors back by line. An attribute is:
 *   - a flag      when it builds bare (`,HIDE`),
 *   - a value     when it fails bare but builds with a sample argument (`,TIP('t')`),
 *   - rejected    when the compiler says `Unknown attribute`,
 *   - unresolved  when every form fails with some other error (look at it by hand).
 *
 *   node test-programs/ControlAttributesTest/run.js --clarion=<Clarion install root> [--controls=TEXT,LIST]
 *
 * Writes results-<version>.json and results-<version>.md next to this script.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const CLARION = arg('clarion');
if (!CLARION || !fs.existsSync(path.join(CLARION, 'bin', 'SoftVelocity.Build.Clarion.targets'))) {
    console.error('usage: node run.js --clarion=<Clarion install root>   (the folder holding bin\\SoftVelocity.Build.Clarion.targets)');
    process.exit(2);
}
const MSBUILD = 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\MSBuild.exe';

// The attribute pages of the Language Reference's "Window and Report Attributes" chapter, the
// names the control declaration pages add (DROPID, NOTICKS).
const CANDIDATES = ('ABOVE ABSOLUTE ALONE ALRT ANGLE AT AUTO AUTOSIZE AVE BELOW BEVEL BOXED CAP CENTER CENTERED CHECK ' +
    'CLIP CNT COLOR COLUMN COMPATIBILITY CREATE CURSOR DECIMAL DEFAULT DELAY DISABLE DOCK DOCKED DOCUMENT DOUBLE DOWN ' +
    'DRAGID DROP DROPID EXTEND FILL FIRST FLAT FONT FORMAT FROM FULL GRAY GRID HIDE HLP HSCROLL HVSCROLL ICON ICONIZE ' +
    'IMM INS JOIN KEY LANDSCAPE LAST LAYOUT LEFT LINEWIDTH LINK MARK MASK MAX MAXIMIZE MDI MIN MM MODAL MSG NOBAR ' +
    'NOCASE NOFRAME NOMERGE NOSHEET NOTICKS OPEN OVR PAGE PAGEAFTER PAGEBEFORE PAGENO PALETTE PAPER PASSWORD POINTS ' +
    'PREVIEW RANGE READONLY REPEAT REQ RESET RESIZE RIGHT ROUND RTF SCROLL SEPARATOR SINGLE SKIP SMOOTH SPREAD STATUS ' +
    'STD STEP STRETCH SUM SYSTEM TALLY THOUS TILED TIMER TIP TOGETHER TOOLBOX TRN UP UPR USE VALUE VCR VERTICAL ' +
    'VSCROLL WALLPAPER WITHNEXT WITHPRIOR WIZARD ZOOM').split(' ');

// Arguments to try when an attribute fails bare, most specific first. `?Zz` is a control
// declared in every window; `Gd` and `Gb` are the DETAIL and the BREAK of the report the
// program opens with, which a REPORT case swaps for its own.
const SAMPLES = {
    ALRT: ['(113)'], KEY: ['(113)'], MSG: ["('m')"], HLP: ["('h')"], TIP: ["('t')"], CURSOR: ["('x.cur')"],
    ICON: ["('x.ico')"], FONT: ["('Arial',10)"], COLOR: ['(0)'], FILL: ['(0)'], LAYOUT: ['(0)'],
    DROPID: ["('x')"], DRAGID: ["('x')"], FROM: ['(Q)', "('a|b')"], FORMAT: ["('20L(2)|M')"], RANGE: ['(1,10)'],
    STEP: ['(1)'], VALUE: ["('1')"], DELAY: ['(1)'], REPEAT: ['(1)'], LINEWIDTH: ['(1)'], ANGLE: ['(1)'],
    TIMER: ['(1)'], EXTEND: ["('x')"], RTF: ['(0)'], STD: ['(1)'], GRID: ['(0)'], MARK: ['(Num)'], VCR: ['(?Zz)'],
    USE: ['(?Uu)', '(Num)'], AT: ['(1,1,10,10)'], DOCUMENT: ["('x')"], CREATE: ["('x')"], OPEN: ["('x')"],
    LINK: ["('x','y')", "('x')"], COMPATIBILITY: ['(1)'], BEVEL: ['(1)', '(1,1)'], DROP: ['(5)'],
    TALLY: ['(Gd)'], RESET: ['(Gb)'], PAGENO: [''], WALLPAPER: ["('x.bmp')"], PALETTE: ['(256)'], STATUS: ['(10)'],
    CHECK: [''], DECIMAL: ['(1)'], LEFT: ['(1)'], RIGHT: ['(1)'], CENTER: ['(1)'], MAX: ['(1)'], MIN: ['(1)'],
    PAPER: ['(1)'], PREVIEW: ['(Q)'], JOIN: [''], ABOVE: ['(1)'], BELOW: ['(1)'], UP: [''], DOWN: [''],
};
const GENERIC = ['(1)', "('x')", '(1,1)', '(Num)', '(1,1,1)', '(Q)', '(?Zz)', "('x',1)", '(Gd)', '(Gb)'];

// Each control as it is declared on its own; `$A` is where the attribute goes.
const CONTROLS = {
    BUTTON: ["BUTTON('Go')$A"], ENTRY: ['ENTRY(@s20)$A'], LIST: ['LIST$A'], COMBO: ['COMBO(@s20)$A'],
    CHECK: ["CHECK('c')$A"], TEXT: ['TEXT$A'], STRING: ["STRING('s')$A"],
    // A STRING with a picture displays a variable, and takes what a constant one does not (SUM, PAGENO...).
    'STRING@': ['STRING(@n9)$A'], PROMPT: ["PROMPT('p')$A"],
    IMAGE: ['IMAGE$A'], BOX: ['BOX$A'], LINE: ['LINE$A'], ELLIPSE: ['ELLIPSE$A'], REGION: ['REGION$A'],
    PANEL: ['PANEL$A'], PROGRESS: ['PROGRESS$A'], SPIN: ['SPIN(@n5)$A'], SLIDER: ['SLIDER$A'],
    OPTION: ["OPTION('o')$A", "  RADIO('r')", 'END'],
    RADIO: ["RADIO('r')$A"], // placed inside an OPTION, see wrap below
    GROUP: ["GROUP('g')$A", 'END'],
    SHEET: ['SHEET$A', "  TAB('t')", '  END', 'END'],
    TAB: ["TAB('t')$A", 'END'], // inside a SHEET
    OLE: ['OLE$A', 'END'],
    MENUBAR: ['MENUBAR$A', "  MENU('m')", "    ITEM('i')", '  END', 'END'],
    MENU: ["MENU('m')$A", "  ITEM('i')", 'END'], // inside a MENUBAR
    ITEM: ["ITEM('i')$A"], // inside a MENU inside a MENUBAR
    TOOLBAR: ['TOOLBAR$A', "  BUTTON('b')", 'END'],
};
// Controls that only exist inside another one: the lines that open and close it.
const WRAP = {
    RADIO: [["OPTION('o')"], ['END']],
    TAB: [['SHEET'], ['END']],
    MENU: [['MENUBAR'], ['END']],
    ITEM: [['MENUBAR', "  MENU('m')"], ['  END', 'END']],
};

const CWPROJ = name => [
    '<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    '  <PropertyGroup>',
    '    <ProjectGuid>{5B1D7E43-2C9A-4F60-8E1B-3A7C9D2E4F10}</ProjectGuid>',
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

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ctlattr-'));
let seq = 0;

/**
 * Builds one program with a case per entry of `cases` ({ attr, text }) for `control` in `where`
 * (WINDOW or REPORT), and returns, per case, the compiler's errors on that case's lines.
 */
function buildBatch(control, where, cases) {
    const lines = ['  PROGRAM', '  MAP', '  END', 'Notes STRING(200)', 'Num LONG', 'Q QUEUE', 'F STRING(20)', '  END',
        'Gr REPORT,AT(0,0,8000,10000)', 'Gb BREAK(Num)', 'Gd DETAIL,AT(,,8000,1000)', '  END', '  END', '  END'];
    const ranges = [];
    cases.forEach((c, i) => {
        const start = lines.length + 1;
        const indent = '    ';
        const body = [];
        const [open, close] = WRAP[control] ?? [[], []];
        open.forEach(l => body.push(indent + l));
        const inner = open.length ? '  ' : '';
        CONTROLS[control].forEach(l => body.push(indent + inner + l.replace('$A', c.text)));
        close.forEach(l => body.push(indent + l));
        if (where === 'WINDOW') {
            // ?Zz is there for VCR(?Zz) to name; it follows the case, so a MENUBAR stays first
            lines.push(`W${i} WINDOW('w'),AT(,,200,100)`, ...body, "    BUTTON('z'),USE(?Zz)", '  END');
        } else {
            lines.push(`R${i} REPORT,AT(0,0,8000,10000)`, `Rb${i} BREAK(Num)`, `Rd${i} DETAIL,AT(,,8000,1000)`,
                ...body.map(l => l.replace('(Gd)', `(Rd${i})`).replace('(Gb)', `(Rb${i})`)), "    STRING('z'),USE(?Zz)", '  END', '  END', '  END');
        }
        ranges.push({ from: start, to: lines.length });
    });
    lines.push('  CODE');
    const text = lines.join('\r\n') + '\r\n'; // CRLF: the compiler needs it
    const dir = path.join(work, String(++seq));
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'case.clw'), text);
    fs.writeFileSync(path.join(dir, 'case.cwproj'), CWPROJ(`c${seq}`));
    const r = spawnSync(MSBUILD, ['case.cwproj', '/t:build', '/p:Configuration=Debug', '/p:Platform=Win32',
        `/p:ClarionBinPath=${path.join(CLARION, 'bin')}`, '/p:clarion_Sections=Debug', '/nologo', '/v:minimal'], { cwd: dir, encoding: 'utf8' });
    const out = (r.stdout ?? '') + (r.stderr ?? '');
    const errors = [];
    for (const m of out.matchAll(/case\.clw\((\d+)(?:,\d+)?\)\s*:\s*error\s*:\s*(.*?)(?:\s+\[[^\]]*\])?\s*$/gm)) {
        errors.push({ line: Number(m[1]), message: m[2].trim() });
    }
    if (r.status !== 0 && errors.length === 0 && !/Duplicate symbol|Unresolved External/i.test(out)) {
        throw new Error(`build failed with no source error (${control} in ${where}):\n${out.slice(-2000)}`);
    }
    return ranges.map(range => [...new Set(errors.filter(e => e.line >= range.from && e.line <= range.to).map(e => e.message))]);
}

const isUnknown = (messages, attr) => messages.some(m => m.toUpperCase() === `UNKNOWN ATTRIBUTE: ${attr.toUpperCase()}`);

function probe(control, where) {
    // The control alone must build here, and an attribute that does not exist must fail, or
    // the batch tells us nothing.
    const [alone, bogus] = buildBatch(control, where, [{ attr: '', text: '' }, { attr: 'NOSUCHATTR', text: ',NOSUCHATTR' }]);
    if (alone.length) return { valid: false, reason: alone.join(' | ') };
    if (!isUnknown(bogus, 'NOSUCHATTR')) throw new Error(`${control} in ${where}: the bogus attribute was not rejected: ${bogus.join(' | ')}`);

    // Round 0 tries every attribute bare; later rounds try the sample arguments in turn, until
    // one builds. The compiler checks the argument count before it checks whether the control
    // takes the attribute at all, so `Wrong number of parameters` says nothing either way:
    // only `Unknown attribute`, in any round, rejects it.
    const state = Object.fromEntries(CANDIDATES.map(attr => [attr, {
        tries: [''].concat(SAMPLES[attr] ?? [], GENERIC.filter(g => !(SAMPLES[attr] ?? []).includes(g))),
        bare: false, sample: null, rejected: false, errors: [],
    }]));
    for (let round = 0; ; round++) {
        const batch = CANDIDATES.filter(a => {
            const s = state[a];
            if (s.rejected || s.sample !== null || round >= s.tries.length) return false;
            return round === 0 || s.tries[round] !== '';
        });
        if (!batch.length) break;
        // The last case must fail: proof that the compiler reached the end of the file.
        const cases = batch.map(a => ({ attr: a, text: `,${a}${state[a].tries[round]}` })).concat([{ attr: 'NOSUCHATTR', text: ',NOSUCHATTR' }]);
        const errors = buildBatch(control, where, cases);
        if (!isUnknown(errors[errors.length - 1], 'NOSUCHATTR')) throw new Error(`${control} in ${where}: the compiler stopped before the end of round ${round}`);
        batch.forEach((a, i) => {
            const s = state[a];
            const messages = errors[i];
            if (isUnknown(messages, a)) s.rejected = true;
            else if (!messages.length) { if (round === 0) s.bare = true; else s.sample = s.tries[round]; }
            else s.errors.push(`${a}${s.tries[round]}: ${messages.join(' | ')}`);
        });
    }
    const result = {};
    for (const a of CANDIDATES) {
        const s = state[a];
        result[a] = s.rejected ? { kind: 'rejected' }
            : s.bare || s.sample !== null ? { kind: s.bare ? 'flag' : 'value', bare: s.bare, sample: s.sample }
            : { kind: 'unresolved', errors: s.errors };
    }
    return { valid: true, attributes: result, clashes: probeClashes(control, where, result) };
}

// Attributes that look like alternatives; each pair of them that the control accepts is built
// together, and a pair the compiler rejects is a clash.
const CLASH_GROUPS = [
    ['HSCROLL', 'VSCROLL', 'HVSCROLL'], ['LEFT', 'RIGHT', 'CENTER', 'DECIMAL'], ['ABOVE', 'BELOW', 'LEFT', 'RIGHT'],
    ['UP', 'DOWN'], ['INS', 'OVR'], ['FIRST', 'LAST'], ['CAP', 'UPR'], ['READONLY', 'REQ'], ['HIDE', 'DISABLE'],
    ['SUM', 'CNT', 'AVE', 'MIN', 'MAX'], ['FLAT', 'TRN'], ['NOSHEET', 'WIZARD'], ['CHECK', 'SEPARATOR'],
];

function probeClashes(control, where, accepted) {
    const form = a => accepted[a].bare ? a : `${a}${accepted[a].sample}`;
    const ok = a => accepted[a] && (accepted[a].kind === 'flag' || accepted[a].kind === 'value');
    const pairs = [];
    const seen = new Set();
    for (const group of CLASH_GROUPS) {
        for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
            const [a, b] = [group[i], group[j]];
            if (!ok(a) || !ok(b) || seen.has(`${a} ${b}`)) continue;
            seen.add(`${a} ${b}`);
            pairs.push([a, b]);
        }
    }
    if (!pairs.length) return [];
    const cases = pairs.map(([a, b]) => ({ attr: `${a}+${b}`, text: `,${form(a)},${form(b)}` })).concat([{ attr: 'NOSUCHATTR', text: ',NOSUCHATTR' }]);
    const errors = buildBatch(control, where, cases);
    if (!isUnknown(errors[errors.length - 1], 'NOSUCHATTR')) throw new Error(`${control} in ${where}: the compiler stopped before the end of the clash batch`);
    return pairs.map((pair, i) => ({ pair, error: errors[i].join(' | ') })).filter(c => c.error);
}

const only = arg('controls')?.toUpperCase().split(',');
const version = /Clarion(\d+)/i.exec(fs.readdirSync(path.join(CLARION, 'bin')).find(f => /^Clarion\d+\.exe$/i.test(f)) ?? '')?.[1]
    ?? path.basename(CLARION).replace(/\D+/g, '').slice(0, 2);
// The install folder's own name only: a full path can name the machine's owner or a client.
const results = { clarion: path.basename(CLARION), version, controls: {} };
for (const control of Object.keys(CONTROLS)) {
    if (only && !only.includes(control)) continue;
    results.controls[control] = {};
    for (const where of ['WINDOW', 'REPORT']) {
        const t = Date.now();
        results.controls[control][where] = probe(control, where);
        const r = results.controls[control][where];
        const summary = r.valid
            ? Object.entries(r.attributes).filter(([, v]) => v.kind !== 'rejected').map(([a, v]) => v.kind === 'flag' ? a : v.kind === 'value' ? `${a}()` : `${a}?`).join(' ')
                + (r.clashes.length ? `; clashes: ${r.clashes.map(c => c.pair.join('+')).join(' ')}` : '')
            : `not valid: ${r.reason}`;
        console.log(`${control} in ${where} (${Date.now() - t} ms): ${summary}`);
    }
}

const outBase = path.join(__dirname, `results-${version}`);
fs.writeFileSync(outBase + '.json', JSON.stringify(results, null, 1) + '\n');
const md = [`# Control attributes — Clarion ${version}`, '', `Generated by \`run.js\` against \`${path.basename(CLARION)}\`. Flags build bare; \`X()\` builds only with a value; \`X?\` failed every form with an error other than \`Unknown attribute\`. A clash is a pair the compiler rejects together.`, ''];
for (const [control, byWhere] of Object.entries(results.controls)) {
    for (const [where, r] of Object.entries(byWhere)) {
        if (!r.valid) { md.push(`- **${control}** in a ${where}: not valid (${r.reason})`); continue; }
        const list = Object.entries(r.attributes).filter(([, v]) => v.kind !== 'rejected')
            .map(([a, v]) => v.kind === 'flag' ? a : v.kind === 'value' ? `${a}()` : `${a}?`);
        md.push(`- **${control}** in a ${where}: ${list.join(' ')}`);
        for (const c of r.clashes) md.push(`  - clash ${c.pair.join(' + ')}: ${c.error}`);
        for (const [a, v] of Object.entries(r.attributes).filter(([, v]) => v.kind === 'unresolved')) md.push(`  - ${a}?: ${(v.errors ?? []).join(' | ')}`);
    }
}
fs.writeFileSync(outBase + '.md', md.join('\n') + '\n');
fs.rmSync(work, { recursive: true, force: true });
console.log(`wrote ${outBase}.json and .md`);
