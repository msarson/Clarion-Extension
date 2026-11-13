import { describe, it } from 'mocha';
import * as assert from 'assert';
import { buildClarionVersionArg } from "../utils/ClarionBuildArgs";

/**
 * #863 — telling the Clarion compile which registered version to use.
 *
 * `SoftVelocity.Build.Clarion.targets` (Clarion 10 and 12) hands
 * `Version="$(clarion_version)"` to the CW compile task as well as to Redirection and
 * CWClean. Compiler-checked: an unknown name fails with `InvalidVersionException`, a
 * known one changes the redirection file the compile uses, and without it the compile
 * picks the version ClarionBinPath belongs to, which cannot tell apart two registered
 * versions sharing one bin.
 */
describe('#863 — clarion_version build argument', () => {
    const registered = ['Accura', 'Direct Systems', 'Clarion 10.0.12799'];

    it('names the chosen version', () => {
        assert.strictEqual(buildClarionVersionArg('Clarion 10.0.12799', registered), '/property:clarion_version=Clarion 10.0.12799');
    });

    it('passes a name containing spaces bare: MSBuild is started without a shell (#708)', () => {
        assert.strictEqual(buildClarionVersionArg('Direct Systems', registered), '/property:clarion_version=Direct Systems');
    });

    it('is omitted when no version is chosen, so the targets keep their own default', () => {
        assert.strictEqual(buildClarionVersionArg('', registered), '');
        assert.strictEqual(buildClarionVersionArg(undefined, registered), '');
        assert.strictEqual(buildClarionVersionArg('   ', registered), '');
    });

    it('is omitted for a name the properties file does not register: the compile would fail it', () => {
        assert.strictEqual(buildClarionVersionArg('Clarion11', registered), '');
        assert.strictEqual(buildClarionVersionArg('accura', registered), '', 'the IDE matches the name exactly');
        assert.strictEqual(buildClarionVersionArg('Accura', null), '', 'an unreadable properties file');
    });
});
