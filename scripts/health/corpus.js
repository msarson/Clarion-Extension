/**
 * Shared plumbing for the corpus sweeps under scripts/health (#609 phase 2).
 *
 * A sweep runs one piece of the product over every file of a real solution and writes one row
 * per result. Run it before a change (`--out=before.tsv`) and after it (`--against=before.tsv`)
 * and the compare below reports exactly which results moved and how - the "0 results changed"
 * evidence a refactor needs, and the list of cases a fix changed.
 *
 * Rows are TSV: a key (what the result is about) and a value (what the product answered).
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const DEFAULT_SLN = 'F:\\DirectSystems\\AppDev\\ap1.sln';

const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : undefined; };

/** Every file under `dir` whose name matches `pattern`, sorted, so two runs visit the same order. */
function corpusFiles(dir, pattern = /\.(clw|inc)$/i, out = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) corpusFiles(p, pattern, out);
        else if (pattern.test(e.name)) out.push(p);
    }
    return out.sort();
}

/** Loads the compiled server module `rel` (e.g. 'providers/ClarionDocumentSymbolProvider'). */
function server(rel) {
    const p = path.join(REPO, 'out', 'server', 'src', rel + '.js');
    if (!fs.existsSync(p)) throw new Error(`Server build missing: ${p} - run \`npm run compile\` first.`);
    return require(p);
}

/** Silences the server's console logging for an in-process sweep; returns the real console.log. */
function quietServerLogs() {
    const log = console.log;
    console.log = console.info = console.warn = console.debug = () => {};
    return log;
}

const clean = s => String(s).replace(/[\t\r\n]/g, ' ');

function writeRows(file, rows) {
    fs.writeFileSync(file, rows.map(r => `${clean(r.key)}\t${clean(r.value)}`).join('\n') + '\n');
}

function readRows(file) {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => {
        const i = l.indexOf('\t');
        return { key: l.substring(0, i), value: l.substring(i + 1) };
    });
}

/**
 * Compares two row sets as multisets per key: a key whose values differ is `changed`, a key only
 * in one run is `added`/`removed`. `classify(before, after)` names a transition for the summary.
 */
function compareRows(before, after, classify = (b, a) => `${b ?? '(none)'} -> ${a ?? '(none)'}`) {
    // Both sides as writeRows puts them on disk, so a run read back compares equal to itself.
    const group = rows => {
        const m = new Map();
        for (const r of rows) {
            const key = clean(r.key);
            if (!m.has(key)) m.set(key, []);
            m.get(key).push(clean(r.value));
        }
        return m;
    };
    const b = group(before), a = group(after);
    const transitions = new Map();
    const note = (kind, key, bv, av) => {
        if (!transitions.has(kind)) transitions.set(kind, []);
        transitions.get(kind).push({ key, before: bv, after: av });
    };
    for (const [key, bvals] of b) {
        const avals = a.get(key);
        if (!avals) { for (const v of bvals) note(classify(v, undefined), key, v, undefined); continue; }
        const bs = [...bvals].sort(), as = [...avals].sort();
        if (bs.join('\u0000') === as.join('\u0000')) continue;
        const n = Math.max(bs.length, as.length);
        for (let i = 0; i < n; i++) if (bs[i] !== as[i]) note(classify(bs[i], as[i]), key, bs[i], as[i]);
    }
    for (const [key, avals] of a) if (!b.has(key)) for (const v of avals) note(classify(undefined, v), key, undefined, v);
    return transitions;
}

/** Prints a compare: total, then each transition with its count and up to `show` examples. */
function printComparison(transitions, show = 5, log = console.log) {
    const total = [...transitions.values()].reduce((n, l) => n + l.length, 0);
    log(`\n== compared with the previous run: ${total} result(s) changed ==`);
    for (const [kind, list] of [...transitions.entries()].sort((x, y) => y[1].length - x[1].length)) {
        log(`${String(list.length).padStart(6)}  ${kind}`);
        for (const t of list.slice(0, show)) log(`          ${t.key}   ${t.before ?? '-'}  ->  ${t.after ?? '-'}`);
    }
    return total;
}

module.exports = { REPO, DEFAULT_SLN, arg, corpusFiles, server, quietServerLogs, writeRows, readRows, compareRows, printComparison };
