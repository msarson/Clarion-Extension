#!/usr/bin/env node
/**
 * #711 — summarise a V8 .cpuprofile: the functions with the most self time, and the heaviest
 * call paths (inclusive time) through the server's own code.
 *
 *   node scripts/perf/cpuprofile-summary.js <file.cpuprofile> [--top=25]
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
const top = Number((process.argv.find(a => a.startsWith('--top=')) || '--top=25').slice(6));
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));
const nodes = new Map(prof.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);

// Self time per node from the sample timeline.
const self = new Map();
for (let i = 0; i < prof.samples.length; i++) {
    const dt = prof.timeDeltas[i + 1] ?? 0;
    self.set(prof.samples[i], (self.get(prof.samples[i]) || 0) + dt);
}
const label = n => {
    const cf = n.callFrame;
    const where = cf.url ? `${path.basename(cf.url)}:${cf.lineNumber + 1}` : '';
    return `${cf.functionName || '(anonymous)'} ${where}`.trim();
};
const total = [...self.values()].reduce((a, b) => a + b, 0);

// Self time by function.
const bySelf = new Map();
for (const [id, t] of self) { const k = label(nodes.get(id)); bySelf.set(k, (bySelf.get(k) || 0) + t); }
console.log(`total sampled: ${(total / 1000).toFixed(0)} ms\n\n== self time ==`);
for (const [k, t] of [...bySelf].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${(t / 1000).toFixed(0).padStart(8)} ms  ${k}`);

// Inclusive time by function (counted once per sample even if recursive).
const incl = new Map();
for (let i = 0; i < prof.samples.length; i++) {
    const dt = prof.timeDeltas[i + 1] ?? 0;
    const seen = new Set();
    for (let id = prof.samples[i]; id !== undefined; id = parent.get(id)) {
        const k = label(nodes.get(id));
        if (seen.has(k)) continue;
        seen.add(k);
        incl.set(k, (incl.get(k) || 0) + dt);
    }
}
console.log('\n== inclusive time (server code only) ==');
for (const [k, t] of [...incl].filter(([k]) => /\.js:\d+/.test(k) && !/node:|internal/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top)) {
    console.log(`${(t / 1000).toFixed(0).padStart(8)} ms  ${k}`);
}
