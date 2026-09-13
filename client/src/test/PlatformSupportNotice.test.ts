import { describe, it } from 'mocha';
import * as assert from 'assert';
import { unsupportedPlatformNotice } from '../platformUtils';

/**
 * #446 — the extension installs on Linux and macOS and then does almost nothing,
 * because Clarion is a Windows-only toolchain and installation discovery reads
 * `%APPDATA%\SoftVelocity\Clarion`. Off Windows there is no install to find, so
 * no `ClarionProperties.xml`, no redirection, no libsrc paths — and every feature
 * built on those returns nothing, with no explanation. The same silent-degradation
 * shape as #434, one level up.
 *
 * `os: ["win32"]` is not the fix: that is an npm field, and the VS Code manifest
 * does not honour it. The mechanism that would actually block installation is
 * platform-specific packaging (`vsce package --target`), which is designed for
 * extensions shipping native binaries and would restructure the release. This is
 * the cheap, honest alternative — say so at activation.
 *
 * `unsupportedPlatformNotice` is the pure decision point, free of the `vscode`
 * API so it can be tested directly, mirroring `shouldMarkExplicitlyClosed` and
 * `decideConfiguration`. Presentation and frequency belong to the caller.
 */
describe('unsupportedPlatformNotice (#446)', () => {

    it('says nothing on Windows', () => {
        assert.strictEqual(unsupportedPlatformNotice('win32'), null,
            'the supported platform must produce no notice at all');
    });

    it('names macOS specifically', () => {
        const notice = unsupportedPlatformNotice('darwin');
        assert.ok(notice, 'macOS cannot run Clarion and must be told so');
        assert.ok(notice!.includes('macOS'),
            `the notice should name the platform the user is actually on; got: ${notice}`);
    });

    it('names Linux specifically', () => {
        const notice = unsupportedPlatformNotice('linux');
        assert.ok(notice, 'Linux cannot run Clarion and must be told so');
        assert.ok(notice!.includes('Linux'),
            `the notice should name the platform the user is actually on; got: ${notice}`);
    });

    it('falls back to neutral wording on an unrecognised platform', () => {
        // Rather than leaking a raw Node platform id like "freebsd" into a message
        // a user reads.
        const notice = unsupportedPlatformNotice('freebsd' as NodeJS.Platform);
        assert.ok(notice, 'anything that is not Windows cannot run Clarion');
        assert.ok(notice!.includes('this platform'),
            `unrecognised hosts should read naturally, not echo the platform id; got: ${notice}`);
    });

    it('explains the cause and says what still works', () => {
        // The point is not "unsupported" — it is that the user understands why the
        // solution tree never populates, and that editing is still usable. A bare
        // "not supported" would leave them exactly as stuck as the silence did.
        const notice = unsupportedPlatformNotice('linux')!;
        assert.ok(/SoftVelocity/i.test(notice),
            `the notice must give the actual cause (installation discovery); got: ${notice}`);
        assert.ok(/highlighting|editing/i.test(notice),
            `the notice must say what does still work; got: ${notice}`);
    });
});
