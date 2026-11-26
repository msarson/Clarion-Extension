import { describe, it } from 'mocha';
import * as assert from 'assert';
import { buildClarionVersionArg } from "../utils/ClarionBuildArgs";
import { registeredVersionsFromXml, registeredVersionNamesFromXml } from "../utils/SolutionFallbackPolicy";

/**
 * #863 — telling the Clarion compile which registered version to use.
 *
 * `SoftVelocity.Build.Clarion.targets` (Clarion 10 and 12) hands
 * `Version="$(clarion_version)"` to the CW compile task as well as to Redirection and
 * CWClean. Compiler-checked on Clarion 10 with several versions in one properties file:
 * an unknown name fails with `InvalidVersionException`, a known one changes the
 * redirection file the compile uses, without it the compile uses the version
 * ClarionBinPath belongs to, and a version from another install than ClarionBinPath's
 * crashes MSBuild.
 */

const ACCURA_BIN = 'C:\\Clarion\\C10A\\bin';
const DS_BIN = 'C:\\Clarion\\C10DS\\bin';

const XML = [
    '<ClarionProperties>',
    '  <Properties name="Clarion.Versions">',
    '    <Properties name="Clarion.NET 4.0.12463">',
    `      <path value="${ACCURA_BIN}" />`,
    '    </Properties>',
    '    <Properties name="Accura">',
    `      <path value="${ACCURA_BIN}" />`,
    '      <Properties name="RedirectionFile">',
    '        <Name value="Clarion100.red" />',
    '        <Properties name="Macros">',
    '          <path value="C:\\elsewhere" />',
    '        </Properties>',
    '      </Properties>',
    '    </Properties>',
    '    <Properties name="Direct Systems">',
    `      <path value="${DS_BIN}" />`,
    '      <Properties name="RedirectionFile">',
    '        <Name value="Clarion100.red" />',
    '      </Properties>',
    '    </Properties>',
    '    <Properties name="NoPath">',
    '      <Properties name="RedirectionFile" />',
    '    </Properties>',
    '  </Properties>',
    '</ClarionProperties>'
].join('\r\n');

describe('#863 — registered versions and their bins', () => {

    it("reads each Win32 version's own bin, not a nested <path>", () => {
        assert.deepStrictEqual(registeredVersionsFromXml(XML), [
            { name: 'Accura', bin: ACCURA_BIN },
            { name: 'Direct Systems', bin: DS_BIN },
            { name: 'NoPath', bin: undefined }
        ]);
    });

    it('lists the same names as before (#535)', () => {
        assert.deepStrictEqual(registeredVersionNamesFromXml(XML), ['Accura', 'Direct Systems', 'NoPath']);
    });
});

describe('#863 — clarion_version build argument', () => {
    const registered = registeredVersionsFromXml(XML);

    it('names the chosen version when its bin is ClarionBinPath', () => {
        assert.deepStrictEqual(buildClarionVersionArg('Accura', registered, ACCURA_BIN),
            { arg: '/property:clarion_version=Accura' });
    });

    it('passes a name containing spaces bare: MSBuild is started without a shell (#708)', () => {
        assert.strictEqual(buildClarionVersionArg('Direct Systems', registered, DS_BIN).arg,
            '/property:clarion_version=Direct Systems');
    });

    it('compares the bin without case or a trailing separator', () => {
        assert.ok(buildClarionVersionArg('Accura', registered, ACCURA_BIN.toLowerCase() + '\\').arg);
    });

    it('is omitted when the version belongs to another bin, which crashes MSBuild', () => {
        const r = buildClarionVersionArg('Direct Systems', registered, ACCURA_BIN);
        assert.strictEqual(r.arg, '');
        assert.match(r.skipped!, /not ClarionBinPath/);
        assert.strictEqual(buildClarionVersionArg('NoPath', registered, ACCURA_BIN).arg, '', 'a version with no bin');
    });

    it('is omitted, silently, when no version is chosen', () => {
        assert.deepStrictEqual(buildClarionVersionArg('', registered, ACCURA_BIN), { arg: '' });
        assert.deepStrictEqual(buildClarionVersionArg(undefined, registered, ACCURA_BIN), { arg: '' });
        assert.deepStrictEqual(buildClarionVersionArg('   ', registered, ACCURA_BIN), { arg: '' });
    });

    it('is omitted for a name the properties file does not register exactly', () => {
        assert.match(buildClarionVersionArg('Clarion11', registered, ACCURA_BIN).skipped!, /not registered/);
        assert.strictEqual(buildClarionVersionArg('accura', registered, ACCURA_BIN).arg, '',
            'the solution loader matches the name exactly, so a case-different name never loaded its paths');
        assert.strictEqual(buildClarionVersionArg('Accura', null, ACCURA_BIN).arg, '', 'an unreadable properties file');
    });

    it('is omitted for a name with ; or , which MSBuild would split into more properties', () => {
        const xml = XML.replace('name="Accura"', 'name="A;ClarionBinPath=C:\\x"');
        const r = buildClarionVersionArg('A;ClarionBinPath=C:\\x', registeredVersionsFromXml(xml), ACCURA_BIN);
        assert.strictEqual(r.arg, '');
        assert.match(r.skipped!, /; or ,/);
    });
});
