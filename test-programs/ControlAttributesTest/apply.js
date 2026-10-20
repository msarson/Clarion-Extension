#!/usr/bin/env node
/**
 * #737 — writes the compiler's answers from results-*.json into server/src/data/clarion-controls.json.
 *
 *   node test-programs/ControlAttributesTest/apply.js [--check]
 *
 * An attribute goes on a control's list only when every Clarion version that was run accepts it
 * there, so the card never offers what an older compiler rejects. It is a flag (`HIDE`) when it
 * builds bare in every version, and takes a value (`TIP()`) otherwise; the few that build bare
 * but mean nothing without their value (`AT`, `USE`, ...) are listed as taking one.
 *
 * Each control gets its WINDOW list as `attributes`. A control that a REPORT accepts gets its
 * REPORT list on its reportControls entry, which is added when the two lists differ. A STRING
 * with a picture takes more than a constant one in a REPORT (SUM, PAGENO, ...): that list is
 * `pictureAttributes`.
 *
 * --check exits 1, without writing, when the data file does not match the results.
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', '..', 'server', 'src', 'data', 'clarion-controls.json');
// They build bare, but only their value does anything: a toggle would add a useless word.
const VALUE_ONLY = new Set(['AT', 'USE', 'FONT', 'DROPID', 'DRAGID']);

const results = fs.readdirSync(__dirname).filter(f => /^results-\d+\.json$/.test(f)).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')));
if (results.length === 0) { console.error('no results-*.json next to this script: run run.js first'); process.exit(2); }

/** The list for `control` in `where`, agreed by every version; null when one rejects the control there. */
function agreed(control, where) {
    const runs = results.map(r => r.controls[control]?.[where]);
    if (runs.some(r => !r || !r.valid)) return null;
    const names = Object.keys(runs[0].attributes);
    const list = [];
    for (const name of names) {
        const all = runs.map(r => r.attributes[name]);
        if (all.some(a => !a || a.kind === 'rejected' || a.kind === 'unresolved')) continue;
        const flag = all.every(a => a.bare) && !VALUE_ONLY.has(name);
        list.push(flag ? name : `${name}()`);
    }
    return list;
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const controls = Object.keys(results[0].controls).filter(c => c !== 'STRING@');
for (const control of controls) {
    const windowList = agreed(control, 'WINDOW');
    const reportList = agreed(control, 'REPORT');
    let def = data.windowControls.find(c => c.name === control);
    if (!def) {
        def = { name: control, description: `Declares a ${control.toLowerCase()} control`, syntax: control, commonAttributes: ['AT', 'USE'] };
        data.windowControls.push(def);
    }
    if (windowList) def.attributes = windowList;

    let reportDef = data.reportControls.find(c => c.name === control);
    const pictureList = control === 'STRING' ? agreed('STRING@', 'REPORT') : null;
    if (reportList && (reportDef || !windowList || !same(reportList, windowList) || pictureList)) {
        if (!reportDef) {
            reportDef = { name: control, description: def.description, syntax: def.syntax, commonAttributes: def.commonAttributes };
            data.reportControls.push(reportDef);
        }
        reportDef.attributes = reportList;
        if (pictureList && !same(pictureList, reportList)) reportDef.pictureAttributes = pictureList;
    }
    // Clashing pairs are kept as they are; they are only reported when both attributes apply.
    for (const d of [def, reportDef]) {
        if (d?.exclusive) d.exclusive = d.exclusive.filter(group => group.every(a => (d.attributes ?? []).some(x => x.replace('()', '') === a)));
        if (d?.exclusive && d.exclusive.length === 0) delete d.exclusive;
    }
}

// The file's own layout: a key per line, arrays of names on one line, a `params` entry per
// line, CRLF. New keys go after the existing ones.
const inline = v => JSON.stringify(v).replace(/","/g, '", "').replace(/\],\[/g, '], [');
function formatValue(key, value) {
    if (key !== 'params') return inline(value);
    const entry = p => '        { ' + Object.entries(p).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(', ') + ' }';
    return '[\r\n' + value.map(entry).join(',\r\n') + '\r\n      ]';
}
function formatControl(c) {
    return '    {\r\n' + Object.keys(c).map(k => `      "${k}": ${formatValue(k, c[k])}`).join(',\r\n') + '\r\n    }';
}
const out = '{\r\n' + Object.entries(data).map(([k, list]) =>
    `  "${k}": [\r\n` + list.map(formatControl).join(',\r\n') + '\r\n  ]').join(',\r\n') + '\r\n}\r\n';

const current = fs.readFileSync(DATA, 'utf8');
if (process.argv.includes('--check')) {
    if (current !== out) { console.error('clarion-controls.json does not match the results: run apply.js'); process.exit(1); }
    console.log('clarion-controls.json matches the results');
} else {
    fs.writeFileSync(DATA, out);
    console.log(`wrote ${DATA} from ${results.map(r => `Clarion ${r.version}`).join(' + ')}`);
}
