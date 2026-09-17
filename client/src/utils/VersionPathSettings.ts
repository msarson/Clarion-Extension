import * as path from 'path';
import type { ClarionCompilerVersion } from './ClarionInstallationDetector';

/** The file-resolution settings a Clarion version gives `globalSettings` and the language server. */
export interface VersionPathSettings {
    redirectionFile: string;
    redirectionPath: string;
    macros: Record<string, string>;
    libsrcPaths: string[];
}

/** The redirection file, its directory, the macros and the LIBSRC paths of one ClarionProperties.xml version. */
export function versionPathSettings(version: ClarionCompilerVersion): VersionPathSettings {
    return {
        redirectionFile: version.redirectionFile,
        // #567 — the file is stored as a bare name, so its folder part is "."; the redirection
        // directory is the version's %REDDIR%, else its bin path.
        redirectionPath: version.macros?.reddir || version.path || path.dirname(version.redirectionFile),
        macros: version.macros,
        libsrcPaths: version.libsrc.split(';').map(p => p.trim()).filter(Boolean),
    };
}
