import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { serverSettings, applyFeatureFlags, isDiagnosticEnabled } from '../serverSettings';
import { DIAGNOSTIC_CHECKS, settingKeyFor, DIAGNOSTICS_MASTER_SETTING } from '../../../common/diagnosticChecks';

/**
 * #542 — every check has its own switch and there is a master switch. The sync pass
 * gates each validator by id; the async facades gate themselves; the three legacy
 * flags (#62 / #517 / #121) are views onto the same table so nothing that reads them
 * changes.
 */
suite('Per-check diagnostics settings and the master switch (#542)', () => {

    const UNTERMINATED_IF = ['P PROCEDURE()', '  CODE', '  IF x', '    y = 1', '  RETURN'].join('\n');
    let v = 0;
    const doc = (code: string) => TextDocument.create('file:///checks542.clw', 'clarion', ++v, code);
    const messages = (code: string) => DiagnosticProvider.validateDocument(doc(code)).map(d => String(d.message));

    let saved: { enabled: boolean; checks: Record<string, boolean | undefined> };
    setup(() => {
        saved = { enabled: serverSettings.diagnostics.enabled, checks: { ...serverSettings.diagnostics.checks } };
        serverSettings.diagnostics.enabled = true;
        for (const k of Object.keys(serverSettings.diagnostics.checks)) delete serverSettings.diagnostics.checks[k];
    });
    teardown(() => {
        serverSettings.diagnostics.enabled = saved.enabled;
        for (const k of Object.keys(serverSettings.diagnostics.checks)) delete serverSettings.diagnostics.checks[k];
        Object.assign(serverSettings.diagnostics.checks, saved.checks);
    });

    test('precondition: an unterminated IF is reported with everything on', () => {
        assert.ok(messages(UNTERMINATED_IF).some(m => m.includes('IF statement is not terminated')));
    });

    test('switching one check off silences that check only', () => {
        serverSettings.diagnostics.checks.unterminatedStructures = false;
        assert.ok(!messages(UNTERMINATED_IF).some(m => m.includes('not terminated')), 'unterminated-structure check is off');
        // A different check still runs: a CYCLE outside any loop.
        const cycle = ['P PROCEDURE()', '  CODE', '  CYCLE', '  RETURN'].join('\n');
        assert.ok(messages(cycle).some(m => /CYCLE/i.test(m)), 'other checks keep running');
    });

    test('the master switch off means no diagnostics at all from the sync pass', () => {
        serverSettings.diagnostics.enabled = false;
        assert.deepStrictEqual(messages(UNTERMINATED_IF), []);
    });

    test('isDiagnosticEnabled: unset falls back to the table default, master off wins', () => {
        assert.strictEqual(isDiagnosticEnabled('unresolvedProcedureCalls'), false, 'opt-in default');
        assert.strictEqual(isDiagnosticEnabled('missingIncludes'), true, 'opt-out default');
        serverSettings.diagnostics.checks.missingIncludes = false;
        assert.strictEqual(isDiagnosticEnabled('missingIncludes'), false);
        serverSettings.diagnostics.checks.unresolvedProcedureCalls = true;
        serverSettings.diagnostics.enabled = false;
        assert.strictEqual(isDiagnosticEnabled('unresolvedProcedureCalls'), false, 'master off wins');
    });

    test('the legacy flags are views onto the table', () => {
        serverSettings.undeclaredVariablesEnabled = false;
        assert.strictEqual(serverSettings.diagnostics.checks.undeclaredVariables, false);
        serverSettings.diagnostics.checks.indistinguishablePrototypes = false;
        assert.strictEqual(serverSettings.indistinguishablePrototypesEnabled, false);
        serverSettings.diagnostics.checks.unresolvedProcedureCalls = true;
        assert.strictEqual(serverSettings.unresolvedProcedureCallsEnabled, true);
    });

    test('applyFeatureFlags takes the table payload and reports what changed', () => {
        const changed = applyFeatureFlags({
            diagnosticsEnabled: false,
            diagnosticChecks: { caseStructures: false, missingIncludes: true } as Record<string, boolean>,
        });
        assert.strictEqual(serverSettings.diagnostics.enabled, false);
        assert.strictEqual(serverSettings.diagnostics.checks.caseStructures, false);
        assert.deepStrictEqual(changed.sort(), ['diagnostics.caseStructures', 'diagnosticsEnabled'],
            'missingIncludes:true equals its default — not a change');
        // A legacy field still applies, and lands in the same table.
        assert.deepStrictEqual(applyFeatureFlags({ undeclaredVariablesEnabled: false }), ['undeclaredVariablesEnabled']);
        assert.strictEqual(serverSettings.diagnostics.checks.undeclaredVariables, false);
    });

    test('sentinel: the table and package.json list the same settings with the same defaults', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8'));
        const props = pkg.contributes.configuration.properties as Record<string, { default: boolean }>;
        const declared = Object.keys(props).filter(k => k.startsWith('clarion.diagnostics.')).sort();
        const expected = [DIAGNOSTICS_MASTER_SETTING, ...DIAGNOSTIC_CHECKS.map(c => settingKeyFor(c.id))].sort();
        assert.deepStrictEqual(declared, expected);
        for (const c of DIAGNOSTIC_CHECKS) assert.strictEqual(props[settingKeyFor(c.id)].default, c.default, c.id);
        assert.strictEqual(props[DIAGNOSTICS_MASTER_SETTING].default, true);
    });

    test('sentinel: every check id in the table is gated somewhere in the server source', () => {
        // Cheap textual guard: a check that is in the table but never consulted is a
        // setting that does nothing.
        const src = ['providers/DiagnosticProvider.ts', 'providers/diagnostics/IndistinguishablePrototypeDiagnostics.ts']
            .map(f => fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'server', 'src', f), 'utf8')).join('\n');
        for (const c of DIAGNOSTIC_CHECKS) {
            assert.ok(src.includes(`'${c.id}'`), `check '${c.id}' is never gated`);
        }
    });
});
