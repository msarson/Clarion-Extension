import { describe, it } from 'mocha';
import * as assert from 'assert';
import { rememberedSolutionState } from '../utils/SolutionFallbackPolicy';

/**
 * #498 — a folder whose remembered solution has no stored Clarion version used to
 * end in "Initialization failed" with an empty Solution View: the tree keyed off
 * `globalSolutionFile` alone, so it rendered the loaded-solution branch (nothing),
 * while the initializer aborted on the missing version.
 *
 * `rememberedSolutionState` is the pure decision point both now consult: only
 * 'ready' means "drive the loaded-solution UI"; 'needs-version' means "show the
 * found-solutions list, mark the remembered entry, and offer Set Version".
 */
describe('rememberedSolutionState (#498)', () => {

    it('no solution file at all -> none', () => {
        assert.strictEqual(rememberedSolutionState('', '', ''), 'none');
        assert.strictEqual(rememberedSolutionState('', 'C:\\Clarion\\ClarionProperties.xml', 'Clarion 11.1'), 'none');
    });

    it('solution, properties file and version present -> ready', () => {
        assert.strictEqual(
            rememberedSolutionState('C:\\proj\\app.sln', 'C:\\Clarion\\ClarionProperties.xml', 'Clarion 11.1'),
            'ready');
    });

    it('solution remembered but no version -> needs-version', () => {
        assert.strictEqual(
            rememberedSolutionState('C:\\proj\\app.sln', 'C:\\Clarion\\ClarionProperties.xml', ''),
            'needs-version');
    });

    it('solution remembered but no properties file -> needs-version', () => {
        assert.strictEqual(
            rememberedSolutionState('C:\\proj\\app.sln', '', 'Clarion 11.1'),
            'needs-version');
    });

    it('solution remembered with neither -> needs-version (the #498 repro)', () => {
        assert.strictEqual(rememberedSolutionState('C:\\proj\\ViewJoinTest.sln', '', ''), 'needs-version');
    });
});
