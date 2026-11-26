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
 * (the `CW` compile, `Redirection` ×3, `CWClean`; #863) and never defines itself, so it can only come from the
 * caller. It names the FOLDER holding ClarionProperties.xml, which is where the
 * compile target's version, its redirection file name and its macros are read from.
 *
 * The argument is omitted entirely rather than passed empty when no file is selected:
 * an empty ConfigDir is not the same as an absent one, since the Clarion tasks fall
 * back to their default location only when the property is undefined.
 */
export function buildConfigDirArg(clarionPropertiesFile: string | undefined | null): string {
    if (!clarionPropertiesFile) return "";
    // #708 — bare: MSBuild is started without a shell, and the launcher quotes an argument
    // containing a space itself. A quote of our own reaches MSBuild literally.
    return `/property:ConfigDir=${path.dirname(clarionPropertiesFile)}`;
}

/**
 * #863 — the `/property:clarion_version=` argument naming the chosen version, or an empty
 * string when none is chosen.
 *
 * The targets hand `Version="$(clarion_version)"` to the `CW` compile, `Redirection` and
 * `CWClean`, so it selects which of ConfigDir's registered versions supplies the compiler,
 * the redirection file and the macros. Without it the compile picks a version matching
 * ClarionBinPath, which cannot tell apart two registered versions sharing one bin.
 *
 * Passed only when it is safe; otherwise omitted, which still builds with the version
 * ClarionBinPath belongs to, and `skipped` says why:
 * - the properties file must register that exact name (the solution loader matches it
 *   exactly too): the CW task fails a name it cannot find;
 * - that version's own bin must be ClarionBinPath: a version from another install than
 *   ClarionBinPath's crashes MSBuild, and the two can disagree while a solution is
 *   still loading;
 * - no `;` or `,`, which MSBuild would split into further properties.
 */
export function buildClarionVersionArg(
    clarionVersion: string | undefined | null,
    registeredVersions: ReadonlyArray<{ name: string; bin: string | undefined }> | null,
    clarionBinPath: string
): { arg: string; skipped?: string } {
    const version = (clarionVersion ?? '').trim();
    if (!version) return { arg: "" };
    if (/[;,]/.test(version)) return { arg: "", skipped: `"${version}" contains ; or , which MSBuild would split` };
    const entry = registeredVersions?.find(v => v.name === version);
    if (!entry) return { arg: "", skipped: `"${version}" is not registered in the properties file` };
    if (!entry.bin || !sameFolder(entry.bin, clarionBinPath)) {
        return { arg: "", skipped: `"${version}" belongs to ${entry.bin ?? 'no bin'}, not ClarionBinPath ${clarionBinPath}` };
    }
    // #708 — bare, like ConfigDir: the launcher quotes an argument containing a space.
    return { arg: `/property:clarion_version=${version}` };
}

/** Windows folder paths compared without case or a trailing separator. */
function sameFolder(a: string, b: string): boolean {
    const norm = (p: string) => path.win32.normalize(p.trim()).replace(/[\\/]+$/, '').toLowerCase();
    return norm(a) === norm(b);
}

/** #708 — an argument as it would be typed at a prompt: quoted when it contains whitespace. */
export function displayArg(arg: string): string {
    return /\s/.test(arg) ? `"${arg}"` : arg;
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
        `MSBuild: ${displayArg(p.msBuildPath)} ${p.buildArgs.map(displayArg).join(' ')}`.trimEnd(),
        '',
    ];
}
