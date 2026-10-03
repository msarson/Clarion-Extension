#!/usr/bin/env node
/**
 * #599 stage 2 — naive occurrence count vs a REAL textDocument/references result.
 *
 * Stage 1 (reference-discrepancy.js) diffs the naive scan against ReferenceCountIndex and so tests
 * the INDEX. It cannot see the bug class we actually keep shipping, which is search-set
 * construction: #596 cause 4 returned 13 references out of ~145 with a perfectly healthy index,
 * because the files holding the other 132 were never in the set FAR searched. Only asking the real
 * provider exposes that.
 *
 * FAR is heavy per symbol, so this samples rather than exhausts: a stratified draw across the slices
 * that have historically hidden bugs (colon segments, declaration column, declaring file kind).
 *
 * What counts as a finding: naive >> resolved. The naive scan is scope-blind and over-counts by
 * design — a local name reused in twenty procedures legitimately resolves to few references — so a
 * single large ratio is not a defect on its own. The signal is a SLICE whose ratio diverges from its
 * siblings, which is what a systematically-too-narrow search set looks like.
 *
 * Startup mirrors scripts/perf/lsp-driver.js exactly (initialize → didOpen → clarion/updatePaths →
 * solutionReady) because that ordering is load-bearing: updatePaths must arrive with a file already
 * open. Run `npm run compile` first.
 *
 * Usage:
 *   node scripts/health/reference-far-sample.js [--sln=...] [--per-slice=N] [--settle=ms] [--json=out.json]
 */

const { fork } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { naiveScan } = require('./naive-scan');

const REPO = path.resolve(__dirname, '..', '..');
const SERVER = path.join(REPO, 'out', 'server', 'src', 'server.js');
const corpus = require('../corpus-config');
const CLARION_ROOT = corpus.required('clarionRoot');
const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : undefined; };
const SLN = arg('sln') ?? corpus.required('solution');
const APPDEV = path.dirname(SLN);
const PER_SLICE = Number(arg('per-slice') ?? 60);
const JSON_OUT = arg('json');
const CORPUS = path.dirname(SLN);

if (!fs.existsSync(SERVER)) { console.error(`Server build missing: ${SERVER} — run \`npm run compile\` first.`); process.exit(1); }

const { ClarionTokenizer, TokenType } = require(path.join(REPO, 'out', 'server', 'src', 'ClarionTokenizer.js'));

// ── JSON-RPC over IPC, same transport the real client uses ──────────────────────────────────────
let seq = 0;
const pending = new Map();
const notificationWaiters = [];
const child = fork(SERVER, ['--node-ipc'], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [] });
const errLog = fs.createWriteStream(path.join(os.tmpdir(), 'clarion-far-sample-stderr.log'));
child.stderr.on('data', d => errLog.write(d));
child.stdout.on('data', d => errLog.write(d));

child.on('message', msg => {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
        const p = pending.get(msg.id);
        if (p) { pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); }
    } else if (msg.method && msg.id !== undefined) {
        child.send({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'workspace/configuration' ? (msg.params.items || []).map(() => null) : null });
    } else if (msg.method) {
        for (let i = notificationWaiters.length - 1; i >= 0; i--) {
            const w = notificationWaiters[i];
            if (w.method === msg.method) { notificationWaiters.splice(i, 1); w.resolve(msg.params); }
        }
    }
});

function request(method, params, timeoutMs = 120000) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, timeoutMs);
        pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
        child.send({ jsonrpc: '2.0', id, method, params });
    });
}
const notify = (method, params) => child.send({ jsonrpc: '2.0', method, params });
const waitNotification = (method, timeoutMs = 600000) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
    notificationWaiters.push({ method, resolve: v => { clearTimeout(t); resolve(v); } });
});
const toUri = p => 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '').replace(':', '%3A');

// ── corpus scan: naive counts + declarations with positions ─────────────────────────────────────
function walk(dir, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(clw|inc)$/i.test(e.name)) out.push(p);
    }
    return out;
}

/**
 * A declaration's position for the FAR request. For the explicit-keyword form the MapProcedure
 * subType sits on PROCEDURE/FUNCTION, not on the name — asking for references there resolves the
 * keyword, not the symbol — so the label token that starts the line is used when there is one.
 */
function declarationsIn(text, tokens, file) {
    const firstOnLine = new Map();
    for (const t of tokens) {
        const prev = firstOnLine.get(t.line);
        if (prev === undefined || t.start < prev.start) firstOnLine.set(t.line, t);
    }
    const out = [];
    for (const t of tokens) {
        if (t.subType !== TokenType.MapProcedure) continue;
        const name = t.label !== undefined ? t.label : t.value;
        if (!name) continue;
        const lead = firstOnLine.get(t.line);
        const anchor = (lead && lead !== t && lead.value.toLowerCase() === name.toLowerCase()) ? lead : t;
        out.push({
            name, lower: name.toLowerCase(), file, line: t.line,
            character: anchor.start + Math.min(1, Math.max(0, anchor.value.length - 1)),
            colonSegments: name.split(':').length - 1,
            atColumnZero: (lead ? lead.start : t.start) === 0
        });
    }
    return out;
}

function sliceOf(d) {
    const seg = d.colonSegments === 0 ? 'plain' : d.colonSegments === 1 ? '1-colon' : '2+colon';
    return seg + (d.atColumnZero ? ' @col0' : ' indented');
}

// Deterministic stratified draw — same sample every run, so two runs are comparable.
function sample(rows, perSlice) {
    const bySlice = new Map();
    for (const r of rows) {
        const k = sliceOf(r);
        if (!bySlice.has(k)) bySlice.set(k, []);
        bySlice.get(k).push(r);
    }
    const picked = [];
    for (const [k, list] of [...bySlice.entries()].sort()) {
        list.sort((a, b) => (a.file + ':' + a.line).localeCompare(b.file + ':' + b.line));
        const step = Math.max(1, Math.floor(list.length / perSlice));
        for (let i = 0; i < list.length && picked.filter(p => sliceOf(p) === k).length < perSlice; i += step) picked.push(list[i]);
    }
    return picked;
}

(async () => {
    const t0 = Date.now();
    console.log('== #599 stage 2 — naive vs textDocument/references ==');
    console.log('solution: ' + SLN);

    const files = walk(CORPUS, []).sort();
    const naive = new Map();          // corpus-wide, kept for reporting
    const naiveByFile = new Map();    // file -> Map(name -> count), for family scoping
    const memberParent = new Map();   // member file -> its PROGRAM's file name, lowercased
    const allDecls = [];
    for (const f of files) {
        let text;
        try { text = fs.readFileSync(f, 'latin1'); } catch { continue; }
        naiveScan(text, naive);
        const perFile = new Map();
        naiveScan(text, perFile);
        naiveByFile.set(f, perFile);
        const member = /^[^\S\r\n]*MEMBER[^\S\r\n]*\([^\S\r\n]*'([^']*)'/im.exec(text);
        if (member) memberParent.set(f, path.basename(member[1]).toLowerCase().replace(/\.clw$/i, '') + '.clw');
        try {
            const tokens = new ClarionTokenizer(text).tokenize();
            for (const d of declarationsIn(text, tokens, f)) allDecls.push(d);
        } catch { /* a file that will not tokenize contributes no declarations */ }
    }

    // PROGRAM file -> the files that are its MEMBER modules. A MAP procedure is per-PROGRAM: the
    // same library import is declared independently in every program that links it, and each
    // program's calls resolve against its OWN declaration.
    const familyOf = new Map();       // program basename -> Set(files)
    for (const [file, parent] of memberParent) {
        if (!familyOf.has(parent)) familyOf.set(parent, new Set());
        familyOf.get(parent).add(file);
    }
    /** The files whose calls could legitimately resolve against a declaration in `file`. */
    function programFamily(file) {
        const base = path.basename(file).toLowerCase();
        const parent = memberParent.get(file);
        const programBase = parent ?? base;                       // a member's family is its parent's
        const set = new Set(familyOf.get(programBase) ?? []);
        for (const f of files) if (path.basename(f).toLowerCase() === programBase) set.add(f);
        set.add(file);
        return set;
    }

    // How many times each name is DECLARED anywhere in the corpus — the correction that turns a
    // raw occurrence count into a use count. See the note at the call site below.
    const declCount = new Map();
    for (const d of allDecls) declCount.set(d.lower, (declCount.get(d.lower) || 0) + 1);

    /**
     * Occurrences of `name` inside one program's family, minus that family's own declarations.
     *
     * The third correction (#599). A corpus-wide count compares 79 programs' call sites against ONE
     * program's references: vwCommonOp is declared in 79 programs and called from none of jm1's
     * members, so the corpus sees 132 "uses" while FAR correctly answers 1. Scoping to the family
     * asks the question FAR is actually answering.
     */
    function familyUses(nameLower, file) {
        let total = 0;
        for (const f of programFamily(file)) total += (naiveByFile.get(f)?.get(nameLower) || 0);
        const declsHere = allDecls.filter(d => d.lower === nameLower && programFamily(file).has(d.file)).length;
        return Math.max(0, total - declsHere);
    }

    console.log(`corpus:   ${files.length} files, ${allDecls.length} declarations, ${naive.size} distinct names  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

    const picked = sample(allDecls, PER_SLICE);
    console.log(`sample:   ${picked.length} declarations, up to ${PER_SLICE} per slice`);

    await request('initialize', {
        processId: process.pid,
        rootUri: toUri(APPDEV),
        workspaceFolders: [{ uri: toUri(APPDEV), name: path.basename(APPDEV) }],
        capabilities: { textDocument: {}, workspace: { configuration: true }, window: { workDoneProgress: true } },
        initializationOptions: { settings: { log: { performance: { enabled: false } } } },
    });
    notify('initialized', {});

    // updatePaths must arrive with a file ALREADY OPEN — the deferred-exit contract the perf
    // driver documents. Opening the first sampled file satisfies it.
    const seed = picked[0].file;
    notify('textDocument/didOpen', { textDocument: { uri: toUri(seed), languageId: 'clarion', version: 1, text: fs.readFileSync(seed, 'utf8') } });
    notify('clarion/updatePaths', {
        redirectionPaths: [path.join(CLARION_ROOT, 'bin')],
        projectPaths: [path.dirname(SLN)],
        solutionFilePath: SLN,
        configuration: 'Debug',
        clarionVersion: corpus.required('clarionVersion'),
        redirectionFile: 'Clarion100.red',
        macros: { root: CLARION_ROOT, reddir: path.join(CLARION_ROOT, 'bin') },
        libsrcPaths: [path.join(CLARION_ROOT, 'libsrc', 'win'), path.join(CLARION_ROOT, 'Accessory', 'libsrc', 'win')],
        defaultLookupExtensions: ['.clw', '.inc', '.equ', '.int'],
    });
    await waitNotification('clarion/solutionReady');
    console.log(`[${Date.now() - t0}ms] solutionReady`);

    // SETTLE. solutionReady is NOT the point at which FAR can answer: the file relationship graph
    // builds in the background afterwards, and the module-scope search set is derived from it. A
    // sweep that samples immediately reads a half-built graph and reports misses that are really
    // races — which is exactly what happened with #602, where an unsettled probe showed 1 reference
    // against 8 and the settled one showed 7. Every number this tool has produced before this change
    // was taken in that window.
    //
    // Waits for the real signal, clarion/graphStatus status:'built', with a timeout so a build that
    // never reports cannot hang the run. The floor afterwards matches the ">= 15s settle" rule in
    // CLAUDE.md, which came from the same confound in the perf lane.
    const settleMs = Number(arg('settle') ?? 20000);
    const graphT0 = Date.now();
    let built = false;
    try {
        while (Date.now() - graphT0 < settleMs) {
            const s = await waitNotification('clarion/graphStatus', settleMs - (Date.now() - graphT0));
            if (s && s.status === 'built') { built = true; break; }
        }
    } catch { /* no further graphStatus arrived inside the window */ }
    const remaining = settleMs - (Date.now() - graphT0);
    if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
    console.log(`[${Date.now() - t0}ms] settled (graph ${built ? 'reported built' : 'did not report built'}, ${settleMs}ms floor) — sampling…\n`);

    const opened = new Set([toUri(seed)]);
    const results = [];
    for (let i = 0; i < picked.length; i++) {
        const d = picked[i];
        const uri = toUri(d.file);
        if (!opened.has(uri)) {
            notify('textDocument/didOpen', { textDocument: { uri, languageId: 'clarion', version: 1, text: fs.readFileSync(d.file, 'utf8') } });
            opened.add(uri);
        }
        let refs = null, ms = 0, err = null;
        const rt = Date.now();
        try {
            refs = await request('textDocument/references', {
                textDocument: { uri }, position: { line: d.line, character: d.character },
                context: { includeDeclaration: true },
            }, 60000);
        } catch (e) { err = e.message; }
        ms = Date.now() - rt;
        // Naive occurrences MINUS the declarations of that name. A third-party prototype the app
        // generator emits into every program — vuAnimateCloseBlend is declared in 39 of app1's
        // generated .clw files and called in none — otherwise reads as 39 occurrences against 1
        // resolved reference and looks like a catastrophic miss. It is not: FAR deliberately scopes
        // a module-level MAP procedure to its own module, and there is nothing else to find.
        // Subtracting the declaration sites is what makes the remainder mean "uses".
        const declSites = declCount.get(d.lower) || 0;
        const naiveAll = naive.get(d.lower) || 0;
        results.push({
            ...d,
            naive: naiveAll,
            declSites,
            naiveUses: familyUses(d.lower, d.file),
            corpusUses: Math.max(0, naiveAll - declSites),
            resolved: refs ? refs.length : -1, ms, err,
        });
        if ((i + 1) % 25 === 0) process.stdout.write(`  ${i + 1}/${picked.length}\n`);
    }

    // ── report ──────────────────────────────────────────────────────────────────────────────────
    const buckets = new Map();
    for (const r of results) {
        const k = sliceOf(r);
        let b = buckets.get(k);
        if (!b) { b = { n: 0, zero: 0, naiveSum: 0, resolvedSum: 0, msSum: 0, errs: 0 }; buckets.set(k, b); }
        b.n++; b.msSum += r.ms;
        if (r.err || r.resolved < 0) { b.errs++; continue; }
        if (r.resolved === 0) b.zero++;
        b.naiveSum += r.naiveUses; b.resolvedSum += r.resolved;
    }
    console.log('\nBy slice — naive occurrences vs resolved references');
    console.log('  ' + 'slice'.padEnd(18) + 'n'.padStart(5) + 'resolved=0'.padStart(12)
        + 'naive uses'.padStart(12) + 'resolved'.padStart(10) + 'ratio'.padStart(8) + 'ms/req'.padStart(9) + 'err'.padStart(5));
    for (const [k, b] of [...buckets.entries()].sort()) {
        const ratio = b.resolvedSum ? (b.naiveSum / b.resolvedSum).toFixed(1) : '-';
        console.log('  ' + k.padEnd(18) + String(b.n).padStart(5)
            + (b.n ? (100 * b.zero / b.n).toFixed(0) + '%' : '-').padStart(12)
            + String(b.naiveSum).padStart(12) + String(b.resolvedSum).padStart(10)
            + String(ratio).padStart(8) + (b.msSum / b.n).toFixed(0).padStart(9) + String(b.errs).padStart(5));
    }

    const zeros = results.filter(r => !r.err && r.resolved <= 1 && r.naiveUses > 2)
        .sort((a, b) => b.naive - a.naive).slice(0, 25);
    if (zeros.length) {
        console.log('\nResolved to <=1 reference while the naive scan sees several USES');
        for (const r of zeros) {
            console.log('  family=' + String(r.naiveUses).padStart(4) + ' corpus=' + String(r.corpusUses).padStart(5) + ' resolved=' + String(r.resolved).padStart(3) + '  ' + r.name
                + '   ' + path.relative(CORPUS, r.file).replace(/\\/g, '/') + ':' + r.line);
        }
    } else {
        console.log('\nNo sampled declaration resolved to <=1 reference while showing more than two uses.');
    }

    if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify({ SLN, results }, null, 1)); console.log('\nwrote ' + JSON_OUT); }
    console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    child.kill();
    process.exit(0);
})().catch(e => { console.error('FAILED: ' + e.message); child.kill(); process.exit(1); });
