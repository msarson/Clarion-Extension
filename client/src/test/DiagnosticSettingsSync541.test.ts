import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { affectsDiagnosticSettings, DIAGNOSTIC_SETTINGS_SECTION } from '../utils/DiagnosticSettingsSync';
import {
    DIAGNOSTIC_CHECKS,
    DIAGNOSTICS_MASTER_SETTING,
    buildDiagnosticSettingsPayload,
    settingKeyFor,
    severitySettingKeyFor,
} from '../../../common/diagnosticChecks';

/**
 * #541 — every `clarion.diagnostics.*` setting was read once at solution
 * initialisation and shipped in `clarion/updatePaths`; ticking a box in Settings
 * did nothing until a window reload. The client now listens for configuration
 * changes under `clarion.diagnostics` and sends the current flags to the server
 * in `clarion/updateDiagnosticSettings`.
 *
 * #542 — the payload is built from the shared check table (one setting per check
 * plus the master switch), so the sentinel below pins that table to package.json.
 */
describe('DiagnosticSettingsSync (#541, #542)', () => {

    it('reacts to a change anywhere under clarion.diagnostics and to nothing else', () => {
        assert.strictEqual(affectsDiagnosticSettings(s => s === 'clarion.diagnostics'), true);
        assert.strictEqual(affectsDiagnosticSettings(s => s === 'clarion.redirectionFile'), false);
        assert.strictEqual(DIAGNOSTIC_SETTINGS_SECTION, 'clarion.diagnostics');
    });

    it('builds the payload from the live configuration: the master switch and one flag per check', () => {
        const values: Record<string, boolean> = {
            'diagnostics.enabled': true,
            'diagnostics.undeclaredVariables.enabled': false,
            'diagnostics.unresolvedProcedureCalls.enabled': true,
        };
        const payload = buildDiagnosticSettingsPayload((key, def) => key in values ? values[key] : def);
        assert.strictEqual(payload.diagnosticsEnabled, true);
        assert.strictEqual(payload.diagnosticChecks.undeclaredVariables, false);
        assert.strictEqual(payload.diagnosticChecks.unresolvedProcedureCalls, true);
        assert.strictEqual(payload.diagnosticChecks.missingIncludes, true, 'unset → default');
        assert.strictEqual(Object.keys(payload.diagnosticChecks).length, DIAGNOSTIC_CHECKS.length);
    });

    it('falls back to each setting\'s declared default when the configuration has no value', () => {
        const payload = buildDiagnosticSettingsPayload((_key, def) => def);
        assert.strictEqual(payload.diagnosticsEnabled, true);
        for (const c of DIAGNOSTIC_CHECKS) assert.strictEqual(payload.diagnosticChecks[c.id], c.default, c.id);
        for (const c of DIAGNOSTIC_CHECKS) assert.strictEqual(payload.diagnosticSeverities[c.id], 'default', `${c.id} severity`); // #543
    });

    it('sentinel: the table matches package.json — same settings, same defaults', () => {
        // If a diagnostics setting is added to package.json and not to the table, it
        // silently goes back to reload-only; if a default drifts, the fallback lies.
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8'));
        const props = pkg.contributes.configuration.properties as Record<string, { type: string; default: boolean }>;
        const declared = Object.keys(props).filter(k => k.startsWith('clarion.diagnostics.')).sort();
        const expected = [
            DIAGNOSTICS_MASTER_SETTING,
            ...DIAGNOSTIC_CHECKS.map(c => settingKeyFor(c.id)),
            ...DIAGNOSTIC_CHECKS.map(c => severitySettingKeyFor(c.id)), // #543
        ].sort();
        assert.deepStrictEqual(declared, expected, 'the table and package.json must list the same clarion.diagnostics.* settings');
        for (const c of DIAGNOSTIC_CHECKS) {
            assert.strictEqual(props[settingKeyFor(c.id)].default, c.default, `default for ${c.id}`);
        }
    });
});
