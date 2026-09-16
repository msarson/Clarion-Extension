import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    DIAGNOSTIC_SETTINGS_SECTION,
    DIAGNOSTIC_SETTING_KEYS,
    affectsDiagnosticSettings,
    buildDiagnosticSettingsPayload,
} from '../utils/DiagnosticSettingsSync';

/**
 * #541 — every `clarion.diagnostics.*` setting was read once at solution
 * initialisation and shipped in `clarion/updatePaths`; ticking a box in Settings
 * did nothing until a window reload. The client now listens for configuration
 * changes under `clarion.diagnostics` and sends the current flags to the server
 * in `clarion/updateDiagnosticSettings`.
 *
 * The listener itself needs the vscode API; the two decisions it makes — "is
 * this change ours?" and "what do we send?" — are the vscode-free functions
 * pinned here (the SymbolFilter / ConfigurationPolicy pattern).
 */
describe('DiagnosticSettingsSync (#541)', () => {

    it('reacts to a change anywhere under clarion.diagnostics and to nothing else', () => {
        assert.strictEqual(affectsDiagnosticSettings(s => s === 'clarion.diagnostics'), true);
        assert.strictEqual(affectsDiagnosticSettings(s => s === 'clarion.redirectionFile'), false);
        assert.strictEqual(DIAGNOSTIC_SETTINGS_SECTION, 'clarion.diagnostics');
    });

    it('builds the payload from the live configuration, one flag per setting', () => {
        const values: Record<string, boolean> = {
            'diagnostics.undeclaredVariables.enabled': false,
            'diagnostics.unresolvedProcedureCalls.enabled': true,
            'diagnostics.indistinguishablePrototypes.enabled': true,
        };
        const payload = buildDiagnosticSettingsPayload((key, def) => key in values ? values[key] : def);
        assert.deepStrictEqual(payload, {
            undeclaredVariablesEnabled: false,
            unresolvedProcedureCallsEnabled: true,
            indistinguishablePrototypesEnabled: true,
        });
    });

    it('falls back to each setting\'s declared default when the configuration has no value', () => {
        const payload = buildDiagnosticSettingsPayload((_key, def) => def);
        assert.deepStrictEqual(payload, {
            undeclaredVariablesEnabled: true,
            unresolvedProcedureCallsEnabled: false,
            indistinguishablePrototypesEnabled: true,
        });
    });

    it('sentinel: the key table matches package.json — every key exists there with the same default', () => {
        // If a diagnostics setting is added to package.json and not to the table, it
        // silently goes back to reload-only; if a default drifts, the fallback lies.
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8'));
        const props = pkg.contributes.configuration.properties as Record<string, { type: string; default: boolean }>;
        const declared = Object.keys(props).filter(k => k.startsWith('clarion.diagnostics.'));
        assert.deepStrictEqual(
            DIAGNOSTIC_SETTING_KEYS.map(k => `clarion.${k.key}`).sort(),
            declared.sort(),
            'the table and package.json must list the same clarion.diagnostics.* settings'
        );
        for (const k of DIAGNOSTIC_SETTING_KEYS) {
            assert.strictEqual(props[`clarion.${k.key}`].default, k.default, `default for ${k.key}`);
        }
    });
});
