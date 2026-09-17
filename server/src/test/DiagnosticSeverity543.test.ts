import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { DiagnosticProvider } from '../providers/DiagnosticProvider';
import { serverSettings, applyFeatureFlags, applyCheckSeverity } from '../serverSettings';
import { DIAGNOSTIC_CHECKS, severitySettingKeyFor, SEVERITY_CHOICES, buildDiagnosticSettingsPayload } from '../../../common/diagnosticChecks';

/**
 * #543 — `clarion.diagnostics.<check>.severity` chooses how loud a check is:
 * `default` keeps the check's built-in severity; error / warning / information /
 * hint override it. Applied after each validator runs, keyed by the same check id
 * the on/off gate uses, so every check is covered by construction.
 */
suite('Severity per diagnostic check (#543)', () => {

    const UNTERMINATED_IF = ['P PROCEDURE()', '  CODE', '  IF x', '    y = 1', '  RETURN'].join('\n');
    let v = 0;
    const doc = (code: string) => TextDocument.create('file:///severity543.clw', 'clarion', ++v, code);

    let savedSeverities: Record<string, string | undefined>;
    setup(() => {
        savedSeverities = { ...serverSettings.diagnostics.severities };
        for (const k of Object.keys(serverSettings.diagnostics.severities)) delete serverSettings.diagnostics.severities[k];
    });
    teardown(() => {
        for (const k of Object.keys(serverSettings.diagnostics.severities)) delete serverSettings.diagnostics.severities[k];
        Object.assign(serverSettings.diagnostics.severities, savedSeverities);
    });

    const sample = (): Diagnostic[] => [{
        severity: DiagnosticSeverity.Error,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        message: 'x',
    }];

    test('unset or default leaves the built-in severity alone', () => {
        assert.strictEqual(applyCheckSeverity('unterminatedStructures', sample())[0].severity, DiagnosticSeverity.Error);
        serverSettings.diagnostics.severities.unterminatedStructures = 'default';
        assert.strictEqual(applyCheckSeverity('unterminatedStructures', sample())[0].severity, DiagnosticSeverity.Error);
    });

    test('each choice maps to the LSP severity', () => {
        const expected: Array<[string, DiagnosticSeverity]> = [
            ['error', DiagnosticSeverity.Error], ['warning', DiagnosticSeverity.Warning],
            ['information', DiagnosticSeverity.Information], ['hint', DiagnosticSeverity.Hint],
        ];
        for (const [choice, sev] of expected) {
            serverSettings.diagnostics.severities.caseStructures = choice;
            assert.strictEqual(applyCheckSeverity('caseStructures', sample())[0].severity, sev, choice);
        }
    });

    test('the sync pass applies it: an unterminated IF demoted to a hint', () => {
        serverSettings.diagnostics.severities.unterminatedStructures = 'hint';
        const d = DiagnosticProvider.validateDocument(doc(UNTERMINATED_IF)).find(x => String(x.message).includes('IF statement is not terminated'))!;
        assert.ok(d, 'the check still reports');
        assert.strictEqual(d.severity, DiagnosticSeverity.Hint);
    });

    test('applyFeatureFlags takes severities, ignores unknown values, and default clears', () => {
        let changed = applyFeatureFlags({ diagnosticSeverities: { caseStructures: 'error', missingIncludes: 'loud', bogusCheck: 'error' } });
        assert.deepStrictEqual(changed, ['severity.caseStructures']);
        assert.strictEqual(serverSettings.diagnostics.severities.caseStructures, 'error');
        assert.strictEqual(serverSettings.diagnostics.severities.missingIncludes, undefined, 'unknown value ignored');
        changed = applyFeatureFlags({ diagnosticSeverities: { caseStructures: 'default' } });
        assert.deepStrictEqual(changed, ['severity.caseStructures']);
        assert.strictEqual(serverSettings.diagnostics.severities.caseStructures, undefined, 'default clears the override');
        assert.deepStrictEqual(applyFeatureFlags({ diagnosticSeverities: { caseStructures: 'default' } }), [], 'no change second time');
    });

    test('the client payload carries one severity per check, read from diagnostics.<id>.severity', () => {
        const payload = buildDiagnosticSettingsPayload(
            (_k, def) => def,
            (key, def) => key === 'diagnostics.byRefArguments.severity' ? 'information' : def
        );
        assert.strictEqual(payload.diagnosticSeverities.byRefArguments, 'information');
        assert.strictEqual(payload.diagnosticSeverities.caseStructures, 'default');
        assert.strictEqual(Object.keys(payload.diagnosticSeverities).length, DIAGNOSTIC_CHECKS.length);
    });

    test('sentinel: package.json declares a .severity setting per check with the enum and default "default"', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8'));
        const props = pkg.contributes.configuration.properties as Record<string, { enum?: string[]; default: string }>;
        for (const c of DIAGNOSTIC_CHECKS) {
            const p = props[severitySettingKeyFor(c.id)];
            assert.ok(p, `${severitySettingKeyFor(c.id)} missing`);
            assert.deepStrictEqual(p.enum, [...SEVERITY_CHOICES], c.id);
            assert.strictEqual(p.default, 'default', c.id);
        }
    });
});
