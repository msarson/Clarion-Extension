#!/usr/bin/env node
/**
 * #652 - chain-member positions from the corpus: the member after `a.b.` in code (`SELF.Q.Field`,
 * `BRW1.Popup.AddItem()`), drawn evenly across files. The agreement sweep's sampler almost never lands
 * on one, so it is blind to how chains resolve; this writes the same JSON shape, for cards.js:
 *
 *   node scripts/health/chain-positions.js <out.json> [count=300]
 *   node scripts/health/cards.js --positions=<out.json> --out=a.json [--against=prev.json]
 */
const fs = require('fs');
const path = require('path');
const { corpusFiles } = require('./corpus');
const { stripNonCode } = require('./naive-scan');
const SLN = require('../corpus-config').required('solution');
const out = process.argv[2];
const LIMIT = Number(process.argv[3] ?? 300);
const CHAIN = /\b([A-Za-z_][\w:]*(?:\.[A-Za-z_][\w:]*)+)\.([A-Za-z_][\w:]*)/g;
const files = corpusFiles(path.dirname(SLN), /\.clw$/i);
const all = [];
for (const file of files) {
    const lines = fs.readFileSync(file, 'latin1').split(/\r?\n/);
    let inCode = false;
    lines.forEach((raw, line) => {
        if (/^[A-Za-z_][\w:.]*\s+(PROCEDURE|FUNCTION)\b/i.test(raw)) { inCode = false; return; }
        if (/^[A-Za-z_][\w:]*\s+ROUTINE\b/i.test(raw)) { inCode = true; return; }
        if (/^\s+(CODE|DATA)\s*(!.*)?$/i.test(raw)) { inCode = /CODE/i.test(raw); return; }
        if (!inCode) return;
        const text = stripNonCode(raw);
        for (const m of text.matchAll(CHAIN)) {
            const col = m.index + m[1].length + 1;
            const root = m[1].split('.')[0].toUpperCase();
            all.push({ file, line, character: col + 1, word: m[2], slice: root === 'SELF' || root === 'PARENT' ? 'self-chain' : 'obj-chain' });
        }
    });
}
const step = Math.max(1, all.length / LIMIT);
const results = Array.from({ length: Math.min(LIMIT, all.length) }, (_, i) => all[Math.floor(i * step)]);
fs.writeFileSync(out, JSON.stringify({ results }, null, 1));
const by = {}; results.forEach(r => by[r.slice] = (by[r.slice] || 0) + 1);
console.log(`chain positions in corpus: ${all.length}; sampled ${results.length}`, by);
