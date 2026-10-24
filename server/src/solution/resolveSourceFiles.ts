import { RedirectionFileParserServer } from './redirectionFileParserServer';

/**
 * #763 — the request behind `clarion/resolveSourceFiles`: where the folder's redirection file
 * (or, without one, the installation's) finds each of `names`, for an installation that is not
 * the loaded solution's. New Solution asks for the library sources a folder's directives name
 * (CWUTIL.INC, the cwutil.clw it declares) before any solution exists. The parser gets the
 * installation's settings for this call only; the loaded solution's are untouched.
 */
export interface ResolveSourceFilesParams {
    folder: string;
    /** As the client's versionPathSettings gives them, plus the build configuration. */
    settings: { redirectionFile: string; redirectionPath: string; macros: Record<string, string>; libsrcPaths: string[]; configuration: string };
    names: string[];
}

/** Each name that resolves, to its path; names nothing finds are left out. */
export function resolveSourceFiles(params: ResolveSourceFilesParams): Record<string, string> {
    const { redirectionPath, ...rest } = params.settings;
    const parser = new RedirectionFileParserServer({ ...rest, primaryRedirectionPath: redirectionPath });
    parser.parseRedFile(params.folder);
    const found: Record<string, string> = {};
    for (const name of params.names) {
        const resolved = parser.findFile(name);
        if (resolved) found[name] = resolved.path;
    }
    return found;
}
