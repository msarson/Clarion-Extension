import * as fs from 'fs';
import * as path from 'path';
import { Token } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from './TokenHelper';
import { resolveViaProjectRedirection } from './RedirectionResolution';
import { pathToCanonicalUri } from './UriUtils';

/**
 * The MEMBER header of a module, wherever it is written.
 *
 * A module's MEMBER('program') statement is often not in the module itself: a
 * small shim file holds it and every module starts with `INCLUDE('member.clw')`,
 * so the same shared source can belong to different PROGRAMs by swapping the
 * shim. TokenHelper.findMemberHeaderToken() only sees the tokens it is given, so
 * on its own it reports such a module as having no MEMBER at all, and every
 * feature that climbs to the PROGRAM through it (go to implementation, hover,
 * the parent-MAP diagnostics, FAR) stops at the module.
 *
 * MEMBER (or PROGRAM) must be the first statement of the compiled token stream,
 * so only the FIRST statement of each file is consulted
 * (TokenHelper.findShimIncludeToken): a module whose first statement is not an
 * INCLUDE is an instant miss with no file read, each hop reads one file,
 * MAX_SHIM_HOPS bounds the rare chained shim and a visited set stops cycles.
 *
 * This is the one implementation of that walk; resolve a MEMBER through it
 * rather than calling findMemberHeaderToken where the parent is what you need.
 */

export interface MemberHeader {
    /** The MEMBER token, with `referencedFile` set. */
    token: Token;
    /** The file the MEMBER statement is written in: the module itself, or its shim. */
    hostFile: string;
}

export interface MemberHeaderOptions {
    /**
     * Resolves a shim INCLUDE's file name seen from `fromFile`. The default is the
     * owner project's redirection first (#328: projects may each have their own
     * same-named shim), then the file's own folder.
     */
    resolveInclude?: (fileName: string, fromFile: string) => string | null;
    /** Tokens of a resolved shim. The default is TokenCache.getTokensForClosedFile (open buffer first). */
    loadTokens?: (filePath: string) => Token[] | null;
}

export const MAX_SHIM_HOPS = 3;

export function defaultResolveShimInclude(fileName: string, fromFile: string): string | null {
    const viaRedirection = resolveViaProjectRedirection(fileName, fromFile);
    if (viaRedirection) return viaRedirection;
    const relative = path.resolve(path.dirname(fromFile), fileName);
    return fs.existsSync(relative) ? relative : null;
}

function defaultLoadTokens(filePath: string): Token[] | null {
    const tokens = TokenCache.getInstance().getTokensForClosedFile(pathToCanonicalUri(filePath));
    return tokens.length > 0 ? tokens : null;
}

/**
 * The module's MEMBER header and the file it is written in, following a
 * first-statement INCLUDE shim. `fromFile` is the module's own file path.
 */
export function resolveMemberHeader(
    tokens: Token[],
    fromFile: string,
    options: MemberHeaderOptions = {}
): MemberHeader | undefined {
    const resolveInclude = options.resolveInclude ?? defaultResolveShimInclude;
    const loadTokens = options.loadTokens ?? defaultLoadTokens;
    const visited = new Set<string>();

    for (let hop = 0; hop <= MAX_SHIM_HOPS; hop++) {
        const direct = TokenHelper.findMemberHeaderToken(tokens);
        if (direct?.referencedFile) return { token: direct, hostFile: fromFile };

        const shim = TokenHelper.findShimIncludeToken(tokens);
        if (!shim?.referencedFile) return undefined;
        const shimPath = resolveInclude(shim.referencedFile, fromFile);
        if (!shimPath) return undefined;
        const key = shimPath.toLowerCase();
        if (visited.has(key)) return undefined;
        visited.add(key);

        const shimTokens = loadTokens(shimPath);
        if (!shimTokens) return undefined;
        tokens = shimTokens;
        fromFile = shimPath;
    }
    return undefined;
}

/** {@link resolveMemberHeader}, the token only. */
export function resolveMemberHeaderToken(
    tokens: Token[],
    fromFile: string,
    options?: MemberHeaderOptions
): Token | undefined {
    return resolveMemberHeader(tokens, fromFile, options)?.token;
}

/** {@link resolveMemberHeaderToken} for a document URI. */
export function resolveMemberHeaderTokenForUri(
    tokens: Token[],
    documentUri: string,
    options?: MemberHeaderOptions
): Token | undefined {
    return resolveMemberHeaderToken(tokens, uriToFsPath(documentUri), options);
}

function uriToFsPath(uri: string): string {
    return decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
}
