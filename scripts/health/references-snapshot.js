#!/usr/bin/env node
/**
 * #654 - Find All References at member-access positions: the full result list per position, and a
 * diff of two snapshots. References is expensive (a whole-solution search, seconds to a minute per
 * position), so this takes a small, even draw per slice from agreement / chain-position JSON.
 *
 *   node scripts/health/references-snapshot.js --positions=a.json[,b.json] --out=r.json
 *        [--per-slice=8] [--slices=self-member,parent-member,dot-member,self-chain,obj-chain] [--against=prev.json]
 */
const fs = require('fs');
const { startSession } = require('./lsp-session');
const arg = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : undefined; };
const PER = Number(arg('per-slice') ?? 8);
const SLICES = (arg('slices') ?? 'self-member,parent-member,dot-member,self-chain,obj-chain').split(',');
const all = arg('positions').split(',').flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')).results);
const picked = [];
for (const s of SLICES) {
    const list = all.filter(p => p.slice === s);
    const step = Math.max(1, list.length / PER);
    for (let i = 0; i < Math.min(PER, list.length); i++) picked.push(list[Math.floor(i * step)]);
}
const loc = l => `${decodeURIComponent(l.uri).split('/').pop().toLowerCase()}:${l.range.start.line}`;
(async () => {
    const session = await startSession({ seedFile: picked[0].file, settleMs: 20000, log: () => {} });
    const out = [];
    for (const p of picked) {
        const uri = session.open(p.file);
        const t0 = Date.now();
        let refs = null, error = null;
        try {
            refs = await session.request('textDocument/references',
                { textDocument: { uri }, position: { line: p.line, character: p.character }, context: { includeDeclaration: true } }, 180000);
        } catch (e) { error = e.message; }
        out.push({ key: `${p.file}:${p.line}:${p.character}`, word: p.word, slice: p.slice, ms: Date.now() - t0, error,
            refs: (refs ?? []).map(loc).sort() });
    }
    fs.writeFileSync(arg('out'), JSON.stringify(out, null, 1));
    const total = out.reduce((a, r) => a + r.ms, 0);
    console.log(`wrote ${out.length} positions, ${(total / 1000).toFixed(0)}s total`);
    if (arg('against')) {
        const prev = new Map(JSON.parse(fs.readFileSync(arg('against'), 'utf8')).map(r => [r.key, r]));
        let changed = 0;
        for (const r of out) {
            const b = prev.get(r.key);
            if (!b || b.refs.join() === r.refs.join()) continue;
            changed++;
            const gone = b.refs.filter(x => !r.refs.includes(x)), added = r.refs.filter(x => !b.refs.includes(x));
            console.log(`\n== ${r.slice} ${r.word}  ${r.key.split(/[\\/]/).pop()}   ${b.refs.length} -> ${r.refs.length} results   (${b.ms}ms -> ${r.ms}ms)`);
            if (gone.length) console.log(`   gone:  ${gone.slice(0, 8).join(' ')}${gone.length > 8 ? ' ...' : ''}`);
            if (added.length) console.log(`   added: ${added.slice(0, 8).join(' ')}${added.length > 8 ? ' ...' : ''}`);
        }
        const prevTotal = [...prev.values()].reduce((a, r) => a + r.ms, 0);
        console.log(`\nresult lists changed: ${changed} of ${out.length}   time ${(prevTotal / 1000).toFixed(0)}s -> ${(total / 1000).toFixed(0)}s`);
    }
    await session.close();
    setTimeout(() => process.exit(0), 1500);
})().catch(e => { console.error('FAILED ' + e.message); process.exit(1); });
