#!/usr/bin/env node
/**
 * #609 phase 2 - what every `SELF.member` of a real solution resolves to, before and after.
 *
 * Runs ClassMemberResolver.findClassMemberInfo in-process at every `SELF.x` in the code of
 * every .clw of the solution's folder and records the declaration it lands on. In-process there
 * is no solution index, so a member inherited from a class in another file reads `null` here:
 * this sweep measures the in-document class scan (the part #607/#608 fixed), not the full
 * product answer - the agreement sweep does that. Established on #607: 7,537 results changed,
 * every one of the 7,518 dropped hits confirmed wrong.
 *
 * Usage (run `npm run compile` first; about 5 minutes on ap1):
 *   node scripts/health/self-members.js --out=before.tsv
 *   node scripts/health/self-members.js --out=after.tsv --against=before.tsv
 * Options: --sln=...  --show=5
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { DEFAULT_SLN, REPO, arg, corpusFiles, server, quietServerLogs, writeRows, readRows, compareRows, printComparison } = require('./corpus');

const SLN = arg('sln') ?? DEFAULT_SLN;
const OUT = arg('out') ?? path.join(os.tmpdir(), 'clarion-self-members.tsv');
const AGAINST = arg('against');
const CORPUS = path.dirname(SLN);

const log = quietServerLogs();
server('serverState').setServerInitialized(true);
const { TextDocument } = require(path.join(REPO, 'node_modules', 'vscode-languageserver-textdocument'));
const { TokenCache } = server('TokenCache');
const { ClassMemberResolver } = server('utils/ClassMemberResolver');

const SELF_MEMBER = /\bSELF\.([A-Za-z_][\w:]*)/gi;
const t0 = Date.now();
const files = corpusFiles(CORPUS, /\.clw$/i);
const rows = [];
let hits = 0, misses = 0, errors = 0;
for (const file of files) {
    const text = fs.readFileSync(file, 'latin1');
    if (!/\bSELF\./i.test(text)) continue;
    const rel = path.relative(CORPUS, file).replace(/\\/g, '/');
    const doc = TextDocument.create('file:///' + file.replace(/\\/g, '/'), 'clarion', 1, text);
    const cache = TokenCache.getInstance();
    const tokens = cache.getTokens(doc);
    const resolver = new ClassMemberResolver();
    text.split(/\r?\n/).forEach((line, i) => {
        if (/^\s*!/.test(line)) return;
        for (const m of line.matchAll(SELF_MEMBER)) {
            let value;
            try {
                const r = resolver.findClassMemberInfo(m[1], doc, i, tokens, undefined);
                if (r) { hits++; value = `${path.basename(decodeURIComponent(r.file))}:${r.line + 1}`; } else { misses++; value = 'null'; }
            } catch (e) { errors++; value = 'ERROR ' + e.message; }
            rows.push({ key: `${rel}:${i + 1}:${m.index + 1}\t${m[1]}`, value });
        }
    });
    if (cache.clearAllTokens) cache.clearAllTokens();
}
writeRows(OUT, rows);

log('== #609 SELF.member sweep ==');
log(`corpus:  ${CORPUS}`);
log(`files ${files.length}  sites ${rows.length}  resolved ${hits}  null ${misses}  errors ${errors}`);
log(`wrote ${OUT}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
const kind = v => v === undefined ? '(none)' : v === 'null' ? 'null' : v.startsWith('ERROR') ? 'error' : 'hit';
if (AGAINST) printComparison(compareRows(readRows(AGAINST), rows, (b, a) => `${kind(b)} -> ${kind(a)}`), Number(arg('show') ?? 5), log);
