#!/usr/bin/env node
/**
 * #609 phase 2 - every document symbol of a real solution, before and after a change.
 *
 * Runs the tokenizer and ClarionDocumentSymbolProvider in-process over every .clw/.inc of the
 * solution's folder and records each outline entry (file, line, depth, kind, name). The outline
 * feeds the Structure view, breadcrumbs and workspace/symbol, so a change there shows up here
 * first. Established on #604 (410 runaway names over 1,000 characters removed, nothing else
 * touched) and #605 (8,328 key lines went from two entries to one).
 *
 * Usage (run `npm run compile` first):
 *   node scripts/health/document-symbols.js --out=before.tsv
 *   ... make the change, compile ...
 *   node scripts/health/document-symbols.js --out=after.tsv --against=before.tsv
 * Options: --sln=...  --show=5 (examples per transition)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { DEFAULT_SLN, arg, corpusFiles, server, quietServerLogs, writeRows, readRows, compareRows, printComparison } = require('./corpus');

const SLN = arg('sln') ?? DEFAULT_SLN;
const OUT = arg('out') ?? path.join(os.tmpdir(), 'clarion-document-symbols.tsv');
const AGAINST = arg('against');
const CORPUS = path.dirname(SLN);

const log = quietServerLogs();
const { ClarionTokenizer } = server('ClarionTokenizer');
const { ClarionDocumentSymbolProvider } = server('providers/ClarionDocumentSymbolProvider');
server('serverState').setServerInitialized(true);

const t0 = Date.now();
const files = corpusFiles(CORPUS);
const rows = [];
let symbols = 0, nameChars = 0, giants = 0, errors = 0;
for (const file of files) {
    const rel = path.relative(CORPUS, file).replace(/\\/g, '/');
    let tree;
    try {
        const tokens = new ClarionTokenizer(fs.readFileSync(file, 'latin1')).tokenize();
        tree = new ClarionDocumentSymbolProvider().provideDocumentSymbols(tokens, 'file:///' + file.replace(/\\/g, '/'));
    } catch (e) {
        errors++;
        rows.push({ key: `${rel}\tERROR`, value: e.message });
        continue;
    }
    (function walk(list, depth) {
        for (const s of list) {
            symbols++;
            nameChars += s.name.length;
            if (s.name.length > 1000) giants++;
            const name = s.name.length > 200 ? `${s.name.slice(0, 200)}…(${s.name.length})` : s.name;
            rows.push({ key: `${rel}:${s.range.start.line + 1}\t${'.'.repeat(depth)}`, value: `${s.kind}\t${name}` });
            walk(s.children || [], depth + 1);
        }
    })(tree, 0);
}
writeRows(OUT, rows);

log('== #609 document-symbol sweep ==');
log(`corpus:  ${CORPUS}`);
log(`files ${files.length}  symbols ${symbols}  names over 1,000 chars ${giants}  name chars ${nameChars}  errors ${errors}`);
log(`wrote ${OUT}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (AGAINST) printComparison(compareRows(readRows(AGAINST), rows, (b, a) => b === undefined ? 'added' : a === undefined ? 'removed' : 'renamed/re-kinded'), Number(arg('show') ?? 5), log);
