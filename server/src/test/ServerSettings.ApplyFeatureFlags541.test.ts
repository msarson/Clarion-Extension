import * as assert from 'assert';
import { serverSettings, applyFeatureFlags } from '../serverSettings';

/**
 * #541 — the flag-application block that lived inline in the `clarion/updatePaths`
 * handler is now shared with the live `clarion/updateDiagnosticSettings` path. It
 * keeps the #62 rule (only an explicit boolean from the client wins; a missing
 * field preserves the current value) and reports which flags actually changed, so
 * the live path can skip a re-validation that would change nothing.
 */
suite('serverSettings.applyFeatureFlags (#541)', () => {

    const snapshot = () => ({
        undeclaredVariablesEnabled: serverSettings.undeclaredVariablesEnabled,
        unresolvedProcedureCallsEnabled: serverSettings.unresolvedProcedureCallsEnabled,
        indistinguishablePrototypesEnabled: serverSettings.indistinguishablePrototypesEnabled,
        inlayHintsParameterNames: serverSettings.inlayHintsParameterNames,
        inlayHintsImplicitTypes: serverSettings.inlayHintsImplicitTypes,
    });
    let saved: ReturnType<typeof snapshot>;

    setup(() => {
        saved = snapshot();
        serverSettings.undeclaredVariablesEnabled = true;
        serverSettings.unresolvedProcedureCallsEnabled = false;
        serverSettings.indistinguishablePrototypesEnabled = true;
    });
    teardown(() => { Object.assign(serverSettings, saved); });

    test('an explicit boolean sets the flag and is reported as changed', () => {
        const changed = applyFeatureFlags({ unresolvedProcedureCallsEnabled: true, undeclaredVariablesEnabled: false });
        assert.strictEqual(serverSettings.unresolvedProcedureCallsEnabled, true);
        assert.strictEqual(serverSettings.undeclaredVariablesEnabled, false);
        assert.deepStrictEqual(changed.sort(), ['undeclaredVariablesEnabled', 'unresolvedProcedureCallsEnabled']);
    });

    test('a missing field preserves the current value (legacy client, #62 rule)', () => {
        const changed = applyFeatureFlags({ indistinguishablePrototypesEnabled: false });
        assert.strictEqual(serverSettings.undeclaredVariablesEnabled, true, 'untouched');
        assert.strictEqual(serverSettings.unresolvedProcedureCallsEnabled, false, 'untouched');
        assert.strictEqual(serverSettings.indistinguishablePrototypesEnabled, false);
        assert.deepStrictEqual(changed, ['indistinguishablePrototypesEnabled']);
    });

    test('setting a flag to the value it already has reports nothing changed', () => {
        const changed = applyFeatureFlags({ undeclaredVariablesEnabled: true, unresolvedProcedureCallsEnabled: false });
        assert.deepStrictEqual(changed, []);
    });

    test('only true is true: any other explicit value is treated as false', () => {
        // Mirrors the `=== true` the inline block always applied.
        const changed = applyFeatureFlags({ undeclaredVariablesEnabled: 'yes' as unknown as boolean });
        assert.strictEqual(serverSettings.undeclaredVariablesEnabled, false);
        assert.deepStrictEqual(changed, ['undeclaredVariablesEnabled']);
    });
});
