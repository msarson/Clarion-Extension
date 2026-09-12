import * as path from "path";

/**
 * Describing WHICH ClarionProperties.xml is active (#479).
 *
 * Until ConfigDir support the compile-target name was a sufficient identifier, because
 * every installation lived under `%APPDATA%\SoftVelocity\Clarion`. It no longer is:
 * `clarion.exe` and `ClarionCL.exe` both take `/ConfigDir=`, MSBuild honours a
 * `ConfigDir` property (#471), and two installations can present the same compile-target
 * name from different properties files. Since #471 made the build follow the selected
 * file, a user who cannot see which file is selected cannot tell what they are building
 * against.
 *
 * vscode-free so it can be unit-tested.
 */

/**
 * The config directory to surface alongside the version, or `null` when it is the
 * ordinary AppData location and therefore not worth the noise.
 *
 * Returns null — rather than the path — for the default layout deliberately: the row
 * exists to flag the unusual case, and showing `%APPDATA%\SoftVelocity\Clarion\x.y` to
 * everyone would bury the signal it is meant to carry.
 */
export function describeNonDefaultConfigDir(
    clarionPropertiesFile: string | undefined | null,
    appDataPath: string | undefined | null
): string | null {
    if (!clarionPropertiesFile) return null;

    const configDir = path.dirname(clarionPropertiesFile);
    if (!appDataPath) return configDir; // cannot tell — better to show than to hide

    const defaultRoot = path.join(appDataPath, "SoftVelocity", "Clarion");
    return isInside(defaultRoot, configDir) ? null : configDir;
}

/**
 * True when `candidate` is `root` or sits beneath it.
 *
 * Compared case-insensitively on normalised paths, and anchored with a trailing
 * separator so a sibling directory whose name merely starts with the root's — say
 * `...\ClarionExtras` next to `...\Clarion` — is not mistaken for a child.
 */
function isInside(root: string, candidate: string): boolean {
    const normalise = (p: string) => path.normalize(p).replace(/[\\/]+$/, "").toLowerCase();
    const r = normalise(root);
    const c = normalise(candidate);
    return c === r || c.startsWith(r + path.sep.toLowerCase()) || c.startsWith(r + "/");
}
