#!/usr/bin/env node
/**
 * #609 phase 1 - do hover and Go to Definition agree, on real code?
 *
 * Hover and F12 resolve a word through separate pipelines, and they drift: a fix lands in one
 * and not the other. This samples identifier positions from the code sections of a real
 * solution, asks the running server for both answers at each, and classifies the pair with the
 * same rule the fixture test uses (server/src/test/support/hoverDefinitionAgreement.ts, loaded
 * from its compiled copy):
 *
 *   agree / mismatch / f12-only / hover-only / hover-no-link / no-location
 *
 * mismatch, f12-only and hover-only are disagreements. hover-no-link (the card names no
 * location) and no-location (a keyword card, or nothing) are reported but are not defects on
 * their own.
 *
 * Positions are picked by a plain regex over the source, not by the tokenizer under test, and
 * grouped by the shape of the reference, because the two pipelines split on exactly that shape:
 *   self-member   SELF.x      (cursor on x)       parent-member  PARENT.x
 *   self-parent   the SELF / PARENT keyword itself
 *   dot-member    obj.x       (cursor on x)       dot-receiver   obj in obj.x
 *   prefixed      PRE:Name / Name:Part            plain          any other identifier
 * The draw is deterministic (evenly spaced files, evenly spaced positions), so two runs are
 * comparable - run it before and after a change and diff the reports.
 *
 * Usage (run `npm run compile` first):
 *   node scripts/health/hover-definition-agreement.js [--sln=...] [--files=40] [--per-slice=2]
 *        [--settle=20000] [--show=12] [--json=out.json] [--against=previous.json]
 *
 * --against compares with an earlier run's --json, position by position, and prints every verdict
 * that moved (and every agreeing pair whose locations moved) - how a fix shows it changed exactly
 * its own cases and nothing else.
 */

const fs = require('fs');
const path = require('path');
const { startSession, REPO } = require('./lsp-session');
const { stripNonCode } = require('./naive-scan');
const { corpusFiles, compareRows, printComparison } = require('./corpus');

const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : undefined; };
const SLN = arg('sln') ?? 'F:\\DirectSystems\\AppDev\\ap1.sln';
const FILES = Number(arg('files') ?? 40);
const PER_SLICE = Number(arg('per-slice') ?? 2);
const SHOW = Number(arg('show') ?? 12);
const JSON_OUT = arg('json');
const AGAINST = arg('against');
const CORPUS = path.dirname(SLN);

const agreement = require(path.join(REPO, 'out', 'server', 'src', 'test', 'support', 'hoverDefinitionAgreement.js'));
const SLICES = ['self-member', 'parent-member', 'self-parent', 'dot-member', 'dot-receiver', 'prefixed', 'plain'];

// Statement words: they never have a declaration, so sampling them only spends the budget.
const STATEMENT_WORDS = new Set(('IF THEN ELSE ELSIF END LOOP CODE DATA RETURN OF OROF CASE BREAK CYCLE DO TO BY '
    + 'AND OR NOT XOR TRUE FALSE NULL EXIT BEGIN WHILE UNTIL TIMES ACCEPT EXECUTE GOTO ROUTINE PROCEDURE FUNCTION '
    + 'SELF PARENT').split(' '));
const IDENT = /[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)*/g;

/** Candidate positions in the code sections of one file, by slice. */
function candidatesIn(file) {
    const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/);
    const bySlice = new Map(SLICES.map(s => [s, []]));
    let inCode = false;
    lines.forEach((raw, line) => {
        if (/^[A-Za-z_][\w:.]*\s+(PROCEDURE|FUNCTION)\b/i.test(raw)) { inCode = false; return; }
        if (/^[A-Za-z_][\w:]*\s+ROUTINE\b/i.test(raw)) { inCode = true; return; }
        if (/^\s+(CODE|DATA)\s*(!.*)?$/i.test(raw)) { inCode = /CODE/i.test(raw); return; }
        if (!inCode) return;
        const text = stripNonCode(raw);
        IDENT.lastIndex = 0;
        let m;
        while ((m = IDENT.exec(text)) !== null) {
            const word = m[0], col = m.index, upper = word.toUpperCase();
            const before = text.substring(0, col).trimEnd();
            const after = text.substring(col + word.length);
            let slice;
            if (upper === 'SELF' || upper === 'PARENT') {
                if (before.endsWith('.')) continue;
                slice = 'self-parent';
            } else if (before.endsWith('.')) {
                const recv = /([A-Za-z_][\w:]*)\s*\.$/.exec(before);
                const r = recv ? recv[1].toUpperCase() : '';
                slice = r === 'SELF' ? 'self-member' : r === 'PARENT' ? 'parent-member' : 'dot-member';
            } else if (STATEMENT_WORDS.has(upper)) {
                continue;
            } else if (/^\s*\.\s*[A-Za-z_]/.test(after)) {
                slice = 'dot-receiver';
            } else {
                slice = word.includes(':') ? 'prefixed' : 'plain';
            }
            bySlice.get(slice).push({ file, line, character: col + Math.min(1, word.length - 1), word, slice });
        }
    });
    return bySlice;
}

function evenly(list, n) {
    if (list.length <= n) return list.slice();
    const step = list.length / n;
    return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
}

(async () => {
    const t0 = Date.now();
    const all = corpusFiles(CORPUS, /\.clw$/i);
    const files = evenly(all, FILES);
    const picked = [];
    for (const f of files) {
        let bySlice;
        try { bySlice = candidatesIn(f); } catch { continue; }
        for (const s of SLICES) picked.push(...evenly(bySlice.get(s), PER_SLICE));
    }
    console.log('== #609 hover / F12 agreement ==');
    console.log(`solution: ${SLN}`);
    console.log(`sample:   ${picked.length} positions from ${files.length} of ${all.length} files, up to ${PER_SLICE} per slice per file`);

    const session = await startSession({ sln: SLN, seedFile: picked[0].file, settleMs: Number(arg('settle') ?? 20000), log: s => console.log(s) });

    const results = [];
    for (const p of picked) {
        const uri = session.open(p.file);
        const position = { line: p.line, character: p.character };
        let hover = null, def = null, error = null;
        const q0 = Date.now();
        try { hover = await session.request('textDocument/hover', { textDocument: { uri }, position }, 60000); } catch (e) { error = 'hover ' + e.message; }
        try { def = await session.request('textDocument/definition', { textDocument: { uri }, position }, 60000); } catch (e) { error = (error ? error + '; ' : '') + 'definition ' + e.message; }
        const verdict = error ? 'error' : agreement.classifyAgreement(hover, def);
        results.push({ ...p, verdict, ms: Date.now() - q0, error,
            hover: agreement.hoverLocations(hover), def: agreement.definitionLocations(def) });
    }

    const verdicts = ['agree', 'mismatch', 'f12-only', 'hover-only', 'hover-no-link', 'no-location', 'error'];
    console.log('\n' + 'slice'.padEnd(15) + verdicts.map(v => v.padStart(14)).join(''));
    for (const s of SLICES) {
        const rows = results.filter(r => r.slice === s);
        console.log(s.padEnd(15) + verdicts.map(v => String(rows.filter(r => r.verdict === v).length).padStart(14)).join(''));
    }
    const total = v => results.filter(r => r.verdict === v).length;
    console.log('total'.padEnd(15) + verdicts.map(v => String(total(v)).padStart(14)).join(''));

    const loc = l => l.map(x => `${x.file.split('/').pop()}:${x.line + 1}`).join(', ') || '-';
    const rel = f => path.relative(CORPUS, f).replace(/\\/g, '/');
    const bad = results.filter(r => agreement.DISAGREEMENTS.includes(r.verdict) || r.verdict === 'error');
    if (bad.length) {
        console.log(`\n== disagreements (${bad.length}; first ${SHOW} per slice) ==`);
        for (const s of SLICES) {
            const rows = bad.filter(r => r.slice === s).slice(0, SHOW);
            if (!rows.length) continue;
            console.log(`-- ${s}`);
            for (const r of rows) {
                console.log(`  ${r.verdict.padEnd(11)} ${rel(r.file)}:${r.line + 1}  ${r.word}   hover -> ${loc(r.hover)}   F12 -> ${loc(r.def)}${r.error ? '   ' + r.error : ''}`);
            }
        }
    } else {
        console.log('\nNo disagreements in this sample.');
    }

    if (JSON_OUT) { fs.writeFileSync(JSON_OUT, JSON.stringify({ sln: SLN, results }, null, 1)); console.log('\nwrote ' + JSON_OUT); }
    if (AGAINST) {
        const asRows = list => list.map(r => ({
            key: `${rel(r.file)}:${r.line + 1}:${r.character}\t${r.word}`,
            value: `${r.verdict}\thover ${loc(r.hover)}\tF12 ${loc(r.def)}`,
        }));
        const verdictOf = v => v === undefined ? '(not sampled)' : v.split('\t')[0];
        const previous = JSON.parse(fs.readFileSync(AGAINST, 'utf8')).results;
        printComparison(compareRows(asRows(previous), asRows(results), (b, a) =>
            verdictOf(b) === verdictOf(a) ? `${verdictOf(a)} (locations moved)` : `${verdictOf(b)} -> ${verdictOf(a)}`), 3);
    }
    console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await session.close();
    setTimeout(() => process.exit(0), 1500);
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
