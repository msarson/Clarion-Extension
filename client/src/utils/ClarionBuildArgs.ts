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
