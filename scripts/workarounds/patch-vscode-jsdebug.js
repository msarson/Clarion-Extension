// Workaround for a VS Code bug that stops F5 (Extension Development Host) debugging. See #665.
//
// Symptom: pressing F5 opens the development host, the debug session ends, and the host shows
// "Extension host did not start in 10 seconds, it might be stopped on the first line and needs a
// debugger to continue." The launching window's exthost.log fills with
// `RequestError: connect ECONNREFUSED ::1:<port>`.
//
// Cause (VS Code 1.139, built-in js-debug 1.117.0; microsoft/vscode-js-debug#2416): js-debug finds
// the host's inspector at http://localhost:<port>. On Node 24.20, where localhost resolves to ::1
// first, the [::1] probe is refused (the inspector listens on 127.0.0.1 only) and aborts the
// discovery, so the debugger never attaches. Setting NODE_OPTIONS=--dns-result-order=ipv4first
// does not help.
//
// Fixed upstream in js-debug 1.140 (PR #2417, merged 2026-09-21), which ships with VS Code 1.140.
// That fix upgrades the HTTP library and leaves the localhost string in place, so this script goes
// by the bundled js-debug version: 1.140 or later is reported as fixed and left alone.
//
// The patch points that one attach at http://127.0.0.1:<port> in the js-debug bundled with each
// installed VS Code version. It is a local change to your VS Code install, not to this repository,
// and an update installs a fresh unpatched copy: rerun this after an update that is still below
// js-debug 1.140.
//
//   node scripts/workarounds/patch-vscode-jsdebug.js           patch (close VS Code first)
//   node scripts/workarounds/patch-vscode-jsdebug.js --revert  restore the originals
//   node scripts/workarounds/patch-vscode-jsdebug.js --root=<VS Code install folder>
//
// Default install folder: %LOCALAPPDATA%\Programs\Microsoft VS Code (the Windows user install).
// A backup of each patched file is kept beside it as extension.js.orig.
'use strict';
const fs = require('fs');
const path = require('path');

const FIXED_IN = [1, 140]; // first js-debug with the upstream fix
const FROM = 'launchProgram(t){let n=await $l(`http://localhost:${t.params.port}`';
const TO = 'launchProgram(t){let n=await $l(`http://127.0.0.1:${t.params.port}`';

const args = process.argv.slice(2);
const revert = args.includes('--revert');
const rootArg = args.find(a => a.startsWith('--root='));
const root = rootArg
    ? rootArg.slice('--root='.length)
    : path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code');

const jsDebugFile = dir => path.join(dir, 'resources', 'app', 'extensions', 'ms-vscode.js-debug', 'src', 'extension.js');

function readJsDebugVersion(dir) {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'resources', 'app', 'extensions', 'ms-vscode.js-debug', 'package.json'), 'utf8')).version;
    } catch {
        return null;
    }
}

function isFixed(version) {
    const [major, minor] = version.split('.').map(Number);
    return major > FIXED_IN[0] || (major === FIXED_IN[0] && minor >= FIXED_IN[1]);
}

if (!fs.existsSync(root)) {
    console.log(`No VS Code install at ${root}. Pass --root=<install folder>.`);
    process.exit(1);
}
// Each VS Code version lives in its own commit-named folder; an older one may linger after an update.
const versions = fs.readdirSync(root).filter(d => fs.existsSync(jsDebugFile(path.join(root, d))));
if (versions.length === 0) {
    console.log(`No bundled js-debug found under ${root}.`);
    process.exit(1);
}

for (const version of versions) {
    const file = jsDebugFile(path.join(root, version));
    const backup = file + '.orig';
    if (revert) {
        if (!fs.existsSync(backup)) {
            console.log(`${version}: no backup, nothing to revert`);
            continue;
        }
        fs.copyFileSync(backup, file);
        fs.unlinkSync(backup);
        console.log(`${version}: reverted`);
        continue;
    }
    const jsDebugVersion = readJsDebugVersion(path.join(root, version));
    if (jsDebugVersion && isFixed(jsDebugVersion)) {
        console.log(`${version}: js-debug ${jsDebugVersion} includes the upstream fix; not patched`);
        continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    const hits = src.split(FROM).length - 1;
    if (hits === 0) {
        console.log(src.includes(TO)
            ? `${version}: already patched`
            : `${version}: pattern not found - this js-debug differs (fixed, or changed); left alone`);
        continue;
    }
    if (hits !== 1) {
        console.log(`${version}: ${hits} matches, expected 1; left alone`);
        continue;
    }
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    fs.writeFileSync(file, src.replace(FROM, TO), 'utf8');
    console.log(`${version}: patched (backup: ${path.basename(backup)})`);
}
