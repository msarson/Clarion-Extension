#!/usr/bin/env node
/**
 * #654 - the discarded-return-value warning on the real solution, before and after a change.
 *
 * Picks the .clw files that call a method, as a statement, through a CLASS label the same file
 * declares (`ThisWindow.Reset()`) - the receiver shape #654 changed - plus an even draw of the
 * rest, asks the running server for each file's pull diagnostics and records every "is
 * discarded" warning. `--against` prints the warnings that appeared and disappeared.
 *
 *   node scripts/health/discarded-returns.js --out=a.json [--files=150] [--against=prev.json]
 */
const fs = require('fs');
const path = require('path');
const { startSession } = require('./lsp-session');
const { DEFAULT_SLN, arg, corpusFiles } = require('./corpus');

const SLN = arg('sln') ?? DEFAULT_SLN;
const MAX = Number(arg('files') ?? 150);
const CORPUS = path.dirname(SLN);

const all = corpusFiles(CORPUS).filter(f => /\.clw$/i.test(f)).sort();
const shaped = [], rest = [];
for (const f of all) {
    const text = fs.readFileSync(f, 'utf8');
    const labels = [...text.matchAll(/^([A-Za-z_][\w:]*)\s+CLASS\b/gim)].map(m => m[1].toLowerCase());
    const hit = labels.some(l => new RegExp(`^\\s+${l.replace(/:/g, '\\:')}\\.[\\w:]+\\s*\\(`, 'im').test(text));
    (hit ? shaped : rest).push(f);
}
const draw = (list, n) => { const step = Math.max(1, list.length / n); return Array.from({ length: Math.min(n, list.length) }, (_, i) => list[Math.floor(i * step)]); };
const picked = [...draw(shaped, Math.ceil(MAX * 2 / 3)), ...draw(rest, Math.floor(MAX / 3))];


// The warning comes from the asynchronous pass: a pull right after didOpen answers from the
// synchronous one. Wait for the file's `complete` status (#460), then pull. `text` opens a
// buffer that is not on disk.
async function pull(session, file, text) {
    const uri = session.toUri(file);
    const done = (async () => {
        for (;;) {
            const st = await session.waitNotification('clarion/diagnosticsStatus', 180000);
            if (st && st.uri === uri && st.state === 'complete') return;
        }
    })().catch(() => {});
    if (text === undefined) session.open(file);
    else session.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'clarion', version: 1, text } });
    await done;
    try { return { items: (await session.request('textDocument/diagnostic', { textDocument: { uri } }, 180000))?.items ?? [], error: null }; }
    catch (e) { return { items: [], error: e.message }; }
}

// A sweep that cannot see a warning reports 0 changed on both sides: prove it can, first.
const SENTINEL = ['  MEMBER()', '  MAP', '  END', 'Caller PROCEDURE()', 'Loc   CLASS', 'Val     PROCEDURE(),LONG', '      END', '  CODE', '  Loc.Val()'].join('\r\n');
const BROWSE_HEAD = ['  MEMBER()', "  INCLUDE('ABBROWSE.INC'),ONCE", '  MAP', '  END', 'Caller PROCEDURE()', 'BRW1   CLASS(BrowseClass)', 'Mine     PROCEDURE(),LONG', '       END', '  CODE'];
const PLANTED = {
    'inherited-library': [...BROWSE_HEAD, '  BRW1.Next()'],   // BrowseClass.Next: BYTE, no PROC
    'own-method': [...BROWSE_HEAD, '  BRW1.Mine()'],
};

(async () => {
    console.log(`${shaped.length} of ${all.length} .clw files call through a local CLASS label; checking ${picked.length}`);
    const session = await startSession({ sln: SLN, seedFile: picked[0], settleMs: 20000, textDocumentCapabilities: { diagnostic: {} } });
    const probe = await pull(session, path.join(CORPUS, 'zz_discarded_returns_sentinel.clw'), SENTINEL);
    if (!probe.items.some(d => /is discarded/.test(d.message))) throw new Error(`sentinel raised no warning - the sweep cannot see one (${probe.error ?? probe.items.map(d => d.message).join(' | ')})`);
    console.log('sentinel: warns');
    const out = [];
    // Planted buffers (not on disk) for the shapes a generated corpus may not hold a live instance
    // of, recorded like any file: a library method inherited through a local CLASS label, and
    // one the local class declares itself (#654).
    for (const [name, lines] of Object.entries(PLANTED)) {
        const { items, error } = await pull(session, path.join(CORPUS, `zz_planted_${name}.clw`), lines.join('\r\n'));
        out.push({ file: `planted:${name}`, error, warns: items.filter(d => /is discarded/.test(d.message)).map(d => `${d.range.start.line}: ${d.message.match(/'([^']+)'/)?.[1]}`) });
    }
    for (const f of picked) {
        const { items, error } = await pull(session, f);
        const rel = path.relative(CORPUS, f).replace(/\\/g, '/');
        const warns = items.filter(d => /is discarded/.test(d.message)).map(d => `${d.range.start.line}: ${d.message.match(/'([^']+)'/)?.[1] ?? d.message}`);
        out.push({ file: rel, error, warns });
    }
    fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1));
    console.log(`wrote ${out.length} files, ${out.reduce((a, r) => a + r.warns.length, 0)} warnings, ${out.filter(r => r.error).length} errors`);
    if (arg('against')) {
        const prev = new Map(JSON.parse(fs.readFileSync(arg('against'), 'utf8')).map(r => [r.file, r]));
        let changed = 0;
        for (const r of out) {
            const b = prev.get(r.file);
            if (!b) continue;
            const gone = b.warns.filter(w => !r.warns.includes(w)), added = r.warns.filter(w => !b.warns.includes(w));
            if (!gone.length && !added.length) continue;
            changed++;
            console.log(`\n== ${r.file}`);
            for (const w of gone) console.log(`   gone:  ${w}`);
            for (const w of added) console.log(`   added: ${w}`);
        }
        console.log(`\nfiles whose warnings changed: ${changed} of ${out.length}`);
    }
    await session.close();
    setTimeout(() => process.exit(0), 1500);
})().catch(e => { console.error('FAILED ' + e.message); process.exit(1); });
