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
    // #740: where HEADER is the WINDOW, APPLICATION or REPORT header line itself.
    const runs = results.map(r => where === 'HEADER' ? r.headers?.[control] : r.controls[control]?.[where]);
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

// #740: each structure's header list goes on its containerStructures entry.
for (const structure of Object.keys(results[0].headers ?? {})) {
    const list = agreed(structure, 'HEADER');
    const def = data.containerStructures.find(c => c.name === structure);
    if (!list || !def) continue;
    def.attributes = list;
    if (def.exclusive) def.exclusive = def.exclusive.filter(group => group.every(a => list.some(x => x.replace('()', '') === a)));
    if (def.exclusive && def.exclusive.length === 0) delete def.exclusive;
}

// #746: the FILE declarations go into fileStructures. The probe tries every data attribute on
// every declaration, and the compiler takes a few the help never describes there (AUTO on a KEY,
// DUP and PRIMARY on an INDEX); a declaration offers only what its help page lists and the
// compiler accepts. A version without a FILE phase (Clarion 11.1 so far) does not vote.
const FILE_DOCUMENTED = {
    FILE: 'DRIVER NAME PRE CREATE RECLAIM OWNER ENCRYPT BINDABLE THREAD EXTERNAL DLL OEM',
    KEY: 'DUP NOCASE OPT PRIMARY NAME',
    INDEX: 'NOCASE OPT NAME',
    MEMO: 'BINARY NAME',
    BLOB: 'BINARY NAME',
};
const FILE_TEXT = {
    FILE: { description: 'Declares a data file: its driver, its keys and memos, and its RECORD', syntax: 'label FILE,DRIVER(type) [,attributes...]' },
    KEY: { description: 'Declares a key the file driver keeps up to date on its component fields', syntax: 'label KEY([-]component[,...]) [,attributes...]' },
    INDEX: { description: 'Declares an index on its component fields, built at run time with BUILD', syntax: 'label INDEX([-]component[,...]) [,attributes...]' },
    MEMO: { description: 'Declares a variable-length text field of up to 64K, stored outside the record', syntax: 'label MEMO(size) [,attributes...]' },
    BLOB: { description: 'Declares a variable-length field that may be larger than 64K', syntax: 'label BLOB [,attributes...]' },
};
// Rules the compiler enforces, each settled by a pair of FILE_RULES cases: the first must fail and
// the second build in every version, or the rule is not written.
const FILE_REQUIRES = [
    { attribute: 'ENCRYPT', needs: 'OWNER', fails: 'ENCRYPT without OWNER', builds: 'ENCRYPT with OWNER' },
    { attribute: 'DLL', needs: 'EXTERNAL', fails: 'DLL without EXTERNAL', builds: 'DLL with EXTERNAL' },
];
const FILE_REQUIRED = [{ attribute: 'DRIVER', fails: 'FILE without DRIVER', builds: 'FILE with DRIVER (control)' }];

const fileRuns = results.filter(r => r.files && Object.keys(r.files).length);
const rule = name => fileRuns.map(r => (r.fileRules ?? []).find(x => x.name === name));
const holds = (fails, builds) => fileRuns.length > 0 && rule(fails).every(x => x && !x.builds) && rule(builds).every(x => x && x.builds);
if (fileRuns.length) {
    data.fileStructures = data.fileStructures ?? [];
    for (const name of Object.keys(FILE_DOCUMENTED)) {
        const runs = fileRuns.map(r => r.files[name]);
        if (runs.some(r => !r || !r.valid)) continue;
        const documented = FILE_DOCUMENTED[name].split(' ');
        const requires = Object.fromEntries(FILE_REQUIRES.filter(q => holds(q.fails, q.builds)).map(q => [q.attribute, q.needs]));
        const list = [];
        for (const attr of Object.keys(runs[0].attributes)) {
            if (!documented.includes(attr)) continue;
            const all = runs.map(r => r.attributes[attr]);
            // an attribute that needs a partner fails alone, so the probe cannot settle it: its rule does
            if (requires[attr] && name === 'FILE') { list.push(attr); continue; }
            if (all.some(a => !a || a.kind === 'rejected' || a.kind === 'unresolved')) continue;
            list.push(all.every(a => a.bare) && !VALUE_ONLY.has(attr) ? attr : `${attr}()`);
        }
        let def = data.fileStructures.find(c => c.name === name);
        if (!def) {
            def = { name, ...FILE_TEXT[name], commonAttributes: [] };
            data.fileStructures.push(def);
        }
        def.attributes = list;
        const own = Object.fromEntries(Object.entries(requires).filter(([a, b]) => list.includes(a) && list.some(x => x.replace('()', '') === b)));
        if (Object.keys(own).length) def.requires = own; else delete def.requires;
        const required = FILE_REQUIRED.filter(q => name === 'FILE' && holds(q.fails, q.builds)).map(q => q.attribute);
        if (required.length) def.required = required; else delete def.required;
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
