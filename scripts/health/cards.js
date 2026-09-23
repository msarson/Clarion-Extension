// Snapshot the full hover text and F12 targets at the agreement-sweep positions, and diff two
// snapshots: the check that a refactor moved no hover card, not just no location.
//   node <repo>/scripts/health/cards.js --positions=<agreement json> --out=<json> [--against=<json>]
const fs = require('fs');
const { startSession } = require('./lsp-session');
const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : undefined; };
const positions = JSON.parse(fs.readFileSync(arg('positions'), 'utf8')).results;
const text = h => {
    if (!h || !h.contents) return '';
    const c = h.contents;
    return typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.value ?? x).join('\n') : c.value ?? '';
};
const locs = d => (Array.isArray(d) ? d : d ? [d] : []).map(l => `${(l.uri ?? l.targetUri).split('/').pop()}:${(l.range ?? l.targetSelectionRange).start.line}`).join(',');
(async () => {
    const session = await startSession({ seedFile: positions[0].file, settleMs: 20000, log: () => {} });
    const out = [];
    for (const p of positions) {
        const uri = session.open(p.file);
        const params = { textDocument: { uri }, position: { line: p.line, character: p.character } };
        let hover = null, def = null, impl = null;
        try { hover = await session.request('textDocument/hover', params, 60000); } catch { }
        try { def = await session.request('textDocument/definition', params, 60000); } catch { }
        try { impl = await session.request('textDocument/implementation', params, 60000); } catch { }
        out.push({ key: `${p.file}:${p.line}:${p.character}`, word: p.word, slice: p.slice, hover: text(hover), f12: locs(def), impl: locs(impl) });
    }
    fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1));
    console.log(`wrote ${out.length} positions`);
    if (arg('against')) {
        const prev = new Map(JSON.parse(fs.readFileSync(arg('against'), 'utf8')).map(r => [r.key, r]));
        let hoverMoved = 0, f12Moved = 0, implMoved = 0;
        for (const r of out) {
            const b = prev.get(r.key);
            if (!b) continue;
            // A snapshot from before Ctrl+F12 was recorded (#654) has no `impl`; compare the rest.
            const h = b.hover !== r.hover, f = b.f12 !== r.f12, m = b.impl !== undefined && b.impl !== r.impl;
            if (h) hoverMoved++;
            if (f) f12Moved++;
            if (m) implMoved++;
            if (h || f || m) {
                console.log(`\n== ${r.slice} ${r.word}  ${r.key.split('/').pop()}${f ? `   F12 ${b.f12} -> ${r.f12}` : ''}${m ? `   Ctrl+F12 ${b.impl} -> ${r.impl}` : ''}`);
                if (h) console.log(`  before: ${b.hover.replace(/\n+/g, ' | ').slice(0, 260)}\n  after:  ${r.hover.replace(/\n+/g, ' | ').slice(0, 260)}`);
            }
        }
        console.log(`\nhover cards changed: ${hoverMoved}   F12 targets changed: ${f12Moved}   Ctrl+F12 targets changed: ${implMoved}   (of ${out.length})`);
    }
    await session.close();
    setTimeout(() => process.exit(0), 1500);
})().catch(e => { console.error('FAILED ' + e.message); process.exit(1); });
