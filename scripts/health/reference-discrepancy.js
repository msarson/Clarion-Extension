#!/usr/bin/env node
/**
 * #599 — corpus reference-discrepancy sweep (stage 1).
 *
 * Every Find-All-References bug we have shipped a fix for is the same class: the file holding the
 * reference was not in the set we searched (#523, #524, #525, #550, #559, #596). All of them arrived
 * as bug reports. This looks for the next one by measuring the POPULATION rather than a case.
 *
 * THE INSTRUMENT MUST NOT SHARE THE DEFECT. The obvious way to count references is to ask
 * ReferenceCountIndex — which is circular, because #525 was a bug IN that index (its word regex split
 * identifiers at colons, so prefixed names were never recorded). A sweep measured with it would have
 * reported those names as genuinely unreferenced. So two independent oracles are counted and DIFFED:
 *
 *   naive    this file's own permissive identifier scan, written here and not imported
 *   product  ReferenceCountIndex.scanContent — the real thing, defects included
 *
 * The signal is the DISCREPANCY, not either number. A declaration the naive scan sees 50 times and
 * the product sees 0 times is a pruning bug. Agreement is the healthy case, and a slice whose
 * agreement rate diverges from its siblings is where to look.
 *
 * Deliberately says nothing about whether a symbol is "really" used: plenty of declarations have no
 * references (exported entry points, template-called procedures). That is why this compares two
 * counts of the same thing instead of thresholding one.
 *
 * Usage:
 *   node scripts/health/reference-discrepancy.js [corpusRoot] [--top=N] [--json=out.json]
 *
 * Requires `npm run compile` first — it loads the built server out of out/.
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'out', 'server', 'src');
const { ClarionTokenizer, TokenType } = require(path.join(OUT, 'ClarionTokenizer.js'));
const { ReferenceCountIndex } = require(path.join(OUT, 'services', 'ReferenceCountIndex.js'));

const args = process.argv.slice(2);
const corpusRoot = args.find(a => !a.startsWith('--')) || require('path').dirname(require('../corpus-config').required('solution'));
const topN = Number((args.find(a => a.startsWith('--top=')) || '--top=40').split('=')[1]);
const jsonOut = (args.find(a => a.startsWith('--json=')) || '').split('=')[1];

// ── the naive oracle ────────────────────────────────────────────────────────────────────────────
// Written here on purpose. If this delegated to the product's scanner the comparison would be
// vacuous. Permissive by design: colon-joined segments are one name (a Clarion label may carry a
// PRE:FIX: chain), everything else is an ordinary identifier. Comments and string literals are
// stripped first so a name mentioned in prose does not count as a use.
const NAIVE_WORD = /[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)*/g;
const STRING_LITERAL = /'(?:[^']|'')*'/g;

function stripNonCode(line) {
    line = line.replace(STRING_LITERAL, ' ');
    const bang = line.indexOf('!');
    return bang === -1 ? line : line.substring(0, bang);
}

function naiveScan(content, into) {
    for (const raw of content.split(/\r?\n/)) {
        const line = stripNonCode(raw);
        NAIVE_WORD.lastIndex = 0;
        let m;
        while ((m = NAIVE_WORD.exec(line)) !== null) {
            const w = m[0].toLowerCase();
            into.set(w, (into.get(w) || 0) + 1);
        }
    }
}

// ── declaration population ──────────────────────────────────────────────────────────────────────
// MAP prototypes, because that is where the reported bugs have been and the tokenizer already
// classifies them. Each declaration records the properties we slice by.
function collectDeclarations(tokens, relPath) {
    // Column must be read from the FIRST token on the declaration's line, not from the token
    // carrying the MapProcedure subType. In the explicit-keyword form the subType lands on the
    // PROCEDURE/FUNCTION keyword — `reg:ITEM:CashOutExists FUNCTION(),LONG` puts the label at
    // column 0 and the keyword well to the right — so reading the keyword's start reported every
    // declaration in the corpus as indented, which is exactly backwards for that form.
    const firstOnLine = new Map();
    for (const t of tokens) {
        const prev = firstOnLine.get(t.line);
        if (prev === undefined || t.start < prev) firstOnLine.set(t.line, t.start);
    }

    const decls = [];
    for (const t of tokens) {
        if (t.subType !== TokenType.MapProcedure) continue;
        const name = (t.label !== undefined ? t.label : t.value);
        if (!name) continue;
        const segments = name.split(':').length - 1;
        decls.push({
            name,
            lower: name.toLowerCase(),
            file: relPath,
            line: t.line,
            colonSegments: segments,
            atColumnZero: (firstOnLine.get(t.line) || 0) === 0
        });
    }
    return decls;
}

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

// ── sweep ───────────────────────────────────────────────────────────────────────────────────────
const started = Date.now();
const files = walk(corpusRoot, []).sort();
if (files.length === 0) {
    console.error('No .clw/.inc found under ' + corpusRoot);
    process.exit(2);
}

const naive = new Map();
const product = new Map();
const declarations = [];
let unreadable = 0;

for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'latin1'); } catch { unreadable++; continue; }

    naiveScan(text, naive);

    const productCounts = ReferenceCountIndex.scanContent(text);
    for (const [name, n] of productCounts) product.set(name, (product.get(name) || 0) + n);

    try {
        const tokens = new ClarionTokenizer(text).tokenize();
        const rel = path.relative(corpusRoot, f).split(path.sep).join('/');
        for (const d of collectDeclarations(tokens, rel)) declarations.push(d);
    } catch { /* a file that will not tokenize contributes no declarations, not a crash */ }
}

// ── compare ─────────────────────────────────────────────────────────────────────────────────────
const rows = declarations.map(d => {
    const n = naive.get(d.lower) || 0;
    const p = product.get(d.lower) || 0;
    return Object.assign({}, d, { naive: n, product: p, missing: n - p });
});

// Only product < naive is a defect signal. The product scan deliberately records a colon-joined
// name AND each of its segments (#525: "field lookups ask for the bare field name with the prefix
// applied separately"), so an unprefixed declaration called `Name` legitimately counts higher than
// the naive scan every time some `GLO:Name` appears. Summing both directions into one number hides
// the signal under that documented inflation, so they are reported apart.
function sliceStats(rows, label, keyFn) {
    const buckets = new Map();
    for (const r of rows) {
        const k = keyFn(r);
        let b = buckets.get(k);
        if (!b) { b = { total: 0, productZero: 0, under: 0, lost: 0 }; buckets.set(k, b); }
        b.total++;
        if (r.product === 0) b.productZero++;
        if (r.missing > 0) { b.under++; b.lost += r.missing; }
    }
    console.log('\n' + label);
    console.log('  ' + 'slice'.padEnd(24) + 'decls'.padStart(7) + 'product=0'.padStart(12)
        + 'product<naive'.padStart(15) + 'occurrences lost'.padStart(19));
    for (const [k, b] of [...buckets.entries()].sort()) {
        const pz = (100 * b.productZero / b.total).toFixed(1) + '%';
        const un = (100 * b.under / b.total).toFixed(1) + '%';
        console.log('  ' + String(k).padEnd(24) + String(b.total).padStart(7)
            + pz.padStart(12) + un.padStart(15) + String(b.lost).padStart(19));
    }
}

console.log('corpus     ' + corpusRoot);
console.log('files      ' + files.length + (unreadable ? '  (' + unreadable + ' unreadable)' : ''));
console.log('decls      ' + rows.length + ' MAP prototypes');
console.log('names      naive ' + naive.size + ' distinct / product ' + product.size + ' distinct');
console.log('elapsed    ' + ((Date.now() - started) / 1000).toFixed(1) + 's');

sliceStats(rows, 'By colon segments in the declared name', r =>
    r.colonSegments === 0 ? '0 (unprefixed)' : r.colonSegments === 1 ? '1 (PRE:Name)' : '2+ (a:b:Name)');
sliceStats(rows, 'By declaration column', r => r.atColumnZero ? 'column 0' : 'indented');
sliceStats(rows, 'By colon segments x column', r =>
    (r.colonSegments === 0 ? 'plain' : r.colonSegments === 1 ? '1-colon' : '2+colon')
    + (r.atColumnZero ? ' @col0' : ' indented'));

const worst = rows.filter(r => r.missing > 0).sort((a, b) => b.missing - a.missing).slice(0, topN);
if (worst.length) {
    console.log('\nLargest discrepancies (naive sees them, product does not)');
    for (const r of worst) {
        console.log('  ' + String(r.missing).padStart(6) + ' lost  naive=' + String(r.naive).padStart(5)
            + ' product=' + String(r.product).padStart(5) + '  ' + r.name + '   ' + r.file + ':' + r.line);
    }
} else {
    console.log('\nNo declaration is seen by the naive scan and missed by the product scan.');
}

const overcount = rows.filter(r => r.missing < 0).length;
if (overcount) {
    console.log('\n' + overcount + ' declaration(s) counted higher by the product scan. Expected, not a');
    console.log('defect: the product records each colon segment as well as the joined name, so any');
    console.log('unprefixed name that also appears as the tail of a prefixed one is inflated.');
}

if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({ corpusRoot, files: files.length, rows }, null, 1));
    console.log('\nwrote ' + jsonOut);
}
