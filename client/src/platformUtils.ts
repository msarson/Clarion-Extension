// platformUtils.ts

export class PlatformUtils {
    static isWindows(): boolean {
        return process.platform === 'win32';
    }

    static isMac(): boolean {
        return process.platform === 'darwin';
    }

    static isLinux(): boolean {
        return process.platform === 'linux';
    }

    static getPlatformName(): string {
        switch (process.platform) {
            case 'win32': return 'Windows';
            case 'darwin': return 'macOS';
            case 'linux': return 'Linux';
            default: return 'Unknown';
        }
    }
}

/**
 * #446 — the notice shown on a host that cannot run Clarion, or `null` on Windows.
 *
 * Clarion is a Windows-only toolchain and the coupling is deeper than the
 * compiler: installation discovery reads `%APPDATA%\SoftVelocity\Clarion`, so
 * off Windows there is no install to find, hence no `ClarionProperties.xml`, no
 * redirection and no libsrc paths — and every feature built on those returns
 * nothing. Without this the user sees a solution tree that never populates and
 * hover that never answers, with nothing saying why.
 *
 * Kept free of the `vscode` API (this module imports nothing) so the decision is
 * unit-testable, mirroring `SolutionFallbackPolicy` and `ConfigurationPolicy`.
 * The caller owns how it is presented and how often.
 *
 * @param platform Defaults to the running host; injectable for tests.
 */
export function unsupportedPlatformNotice(
    platform: NodeJS.Platform = process.platform
): string | null {
    if (platform === 'win32') {
        return null;
    }

    const name = platform === 'darwin' ? 'macOS'
        : platform === 'linux' ? 'Linux'
        : 'this platform';

    return `Clarion Extensions requires Windows — Clarion is a Windows-only toolchain, and the ` +
        `extension locates your compiler through %APPDATA%\\SoftVelocity\\Clarion, which ${name} ` +
        `does not have. Syntax highlighting and editing work; loading a solution, hover, ` +
        `Go to Definition, Find All References and builds will not.`;
}
