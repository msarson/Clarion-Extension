import { readFileSync, statSync } from 'fs';
import * as path from 'path';

// __SERVER_VERSION__ / __BUILD_DATE__ are injected by esbuild's `define` at
// bundle time (see esbuild.mjs) — this is how the shipped VSIX carries an exact
// build timestamp that survives installation. In the tsc/dev path (tests,
// `npm run compile`, F5 Extension Development Host) esbuild is not involved, so
// these identifiers are undeclared at runtime and we resolve real values at
// runtime instead: the version from package.json and the build date from the
// compiled server file's mtime (its compile time). The `typeof` guards are safe
// because typeof on an undeclared identifier never throws.
declare const __SERVER_VERSION__: string;
declare const __BUILD_DATE__: string;

export interface ServerVersionInfo {
    /** Server version, from the bundle stamp or package.json at runtime. */
    version: string;
    /** ISO-8601 timestamp of when this build was produced. */
    buildDate: string;
}

function resolveVersion(): string {
    if (typeof __SERVER_VERSION__ !== 'undefined') {
        return __SERVER_VERSION__;
    }
    // Dev/tsc path: the extension root package.json sits three levels above the
    // compiled server file (out/server/src/server.js → <root>/package.json).
    try {
        const pkgPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
        return pkg.version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

function resolveBuildDate(): string {
    if (typeof __BUILD_DATE__ !== 'undefined') {
        return __BUILD_DATE__;
    }
    // Dev/tsc path: the compile time of the running server file is a faithful
    // "build date/time" for an F5 / watch session.
    try {
        return statSync(__filename).mtime.toISOString();
    } catch {
        return 'unknown';
    }
}

/**
 * Returns the server version and the date/time this build was produced.
 * Wired to the `clarion/getServerVersion` LSP request (returned as a JSON
 * string) so the client — or an external tool feature-gating against the
 * running server — can confirm exactly which build is live. Works in both the
 * bundled VSIX and an F5/dev build.
 */
export function getServerVersionInfo(): ServerVersionInfo {
    return {
        version: resolveVersion(),
        buildDate: resolveBuildDate()
    };
}
