import * as path from "path";

/**
 * MSBuild argument construction for a Clarion build.
 *
 * Deliberately free of any `vscode` import so it can be unit-tested: `buildTasks.ts`
 * pulls in the extension host API, which cannot load outside VS Code (several client
 * suites are excluded from the runner for exactly that reason).
 */

/**
 * The `/property:ConfigDir=` argument for a given ClarionProperties.xml path, or an
 * empty string when none is selected (#471).
 *
 * `ConfigDir` is not an MSBuild concept — it appears nowhere in
 * Microsoft.Common.targets and `msbuild /help` has no such switch. It is an ordinary
 * property that `SoftVelocity.Build.Clarion.targets` hands to its own tasks
 * (`Redirection` ×3, `CWClean`) and never defines itself, so it can only come from the
 * caller. It names the FOLDER holding ClarionProperties.xml, which is where the
 * compile target's version, its redirection file name and its macros are read from.
 *
 * The argument is omitted entirely rather than passed empty when no file is selected:
 * an empty ConfigDir is not the same as an absent one, since the Clarion tasks fall
 * back to their default location only when the property is undefined.
 */
export function buildConfigDirArg(clarionPropertiesFile: string | undefined | null): string {
    if (!clarionPropertiesFile) return "";
    return `/property:ConfigDir="${path.dirname(clarionPropertiesFile)}"`;
}

/**
 * #531 — `Debug|Win32` → `Debug (Win32)`, `Release` → `Release`, empty → a placeholder,
 * for the build header and the build result messages.
 */
export function describeConfiguration(configuration: string | undefined | null): string {
    const value = (configuration ?? '').trim();
    if (!value) return '(no configuration)';
    const [name, ...platform] = value.split('|');
    const plat = platform.join('|').trim();
    return plat ? `${name.trim()} (${plat})` : name.trim();
}

/**
 * #531 — the lines written to the Clarion Build output before MSBuild starts: what is
 * being built, in which configuration, and the exact MSBuild command line. The task
 * terminal is hidden by default and the command line used to go only to the
 * extension's own log, so a Release build by mistake was invisible.
 */
export function formatBuildHeader(p: {
    buildTarget: 'Solution' | 'Project';
    targetName: string;
    configuration: string;
    msBuildPath: string;
    buildArgs: string[];
}): string[] {
    const what = p.buildTarget === 'Solution' ? 'solution' : 'project';
    return [
        `Building ${what} ${p.targetName} — ${describeConfiguration(p.configuration)}`,
        `MSBuild: ${p.msBuildPath} ${p.buildArgs.join(' ')}`.trimEnd(),
        '',
    ];
}
