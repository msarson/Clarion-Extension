import * as path from 'path';
import { serverSettings } from '../serverSettings';

const norm = (p: string) => path.normalize(p).toLowerCase();

/**
 * #568 — one string for the Clarion install that file resolution runs under: the version, the
 * redirection file and its directory, the macros (%ROOT% and friends) and the libsrc paths. Two
 * environments with the same key resolve every file name the same way, so the disk caches of
 * resolved results carry it in their identity. A leaf module: the caches import it.
 */
export function resolutionEnvironmentKey(): string {
    const macros = Object.entries(serverSettings.macros ?? {})
        .map(([k, v]) => `${k.toLowerCase()}=${norm(String(v))}`)
        .sort();
    return [
        `version:${(serverSettings.clarionVersion ?? '').toLowerCase()}`,
        `red:${(serverSettings.redirectionFile ?? '').toLowerCase()}`,
        `reddir:${(serverSettings.redirectionPaths ?? []).filter(Boolean).map(norm).join(';')}`,
        `macros:${macros.join(';')}`,
        `libsrc:${(serverSettings.libsrcPaths ?? []).filter(Boolean).map(norm).join(';')}`,
    ].join('|');
}
