import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('IncludeIndexDiskCache');

// #295: persist the #344 include-chain and #345 sibling-label indexes so a warm
// start reuses the derived declaration maps instead of re-tokenizing / re-reading
// the entire INCLUDE/MEMBER universe on the prewarm lane (~22.7s measured on
// IBSWorking). Same mtime-validated disk-cache discipline as SDI (#290), FRG and
// ReferenceCountIndex: a per-key JSON file under the OS temp dir, reused only when
// a caller-supplied identity signature still matches AND every file that
// contributed content still carries its recorded mtime. Any drift → cold rebuild.
//
// Correctness bar (matches the sibling mtime caches): reuse is gated on file
// mtimes, so an external content change with an UNCHANGED mtime is not detected
// here — the #340 watcher eviction (evictIncludeChainIndexes) remains the primary
// in-session invalidation, and the identity signature (host-content hash for #344,
// member-list fingerprint for #345) catches input-set changes. Bump the version on
// any envelope/consumer-shape change so a stale format is discarded, never misread.
const DISK_CACHE_VERSION = 1;

export interface IncludeIndexEnvelope<P> {
    version: number;
    /** Identity of the index's inputs: #344 host-content hash / #345 member-list fingerprint. */
    signature: string;
    /** Every file whose CONTENT fed the payload → its mtimeMs at build time. */
    contributing: Record<string, number>;
    payload: P;
}

function cacheFile(bucket: string, key: string): string {
    const hash = crypto.createHash('md5').update(key.toLowerCase()).digest('hex');
    return path.join(os.tmpdir(), `clarion-extension-${bucket}`, `${bucket}-${hash}.json`);
}

/** Load + parse; returns null on missing/corrupt/version-mismatch (→ caller rebuilds cold). */
export function loadIncludeIndex<P>(bucket: string, key: string): IncludeIndexEnvelope<P> | null {
    try {
        const raw = fs.readFileSync(cacheFile(bucket, key), 'utf-8');
        const env = JSON.parse(raw) as IncludeIndexEnvelope<P>;
        if (!env || env.version !== DISK_CACHE_VERSION ||
            typeof env.signature !== 'string' || !env.contributing || env.payload === undefined) {
            return null;
        }
        return env;
    } catch {
        return null; // missing/corrupt → cold build
    }
}

/** Persist; best-effort (a failed write just means the next start rebuilds cold). */
export function saveIncludeIndex<P>(
    bucket: string,
    key: string,
    env: Omit<IncludeIndexEnvelope<P>, 'version'>
): void {
    try {
        const file = cacheFile(bucket, key);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ version: DISK_CACHE_VERSION, ...env }));
    } catch (err) {
        logger.info(`[#295] include-index disk save failed for ${path.basename(key)}: ${err}`);
    }
}

/**
 * Reuse gate: the live signature must match the cached one AND every contributing
 * file must still carry its recorded mtime. A missing file (deleted/moved) or any
 * mtime drift returns false → the caller rebuilds cold. Stats are batched and yield
 * between batches (SDI discipline) so a large chain's validation never blocks the
 * event loop.
 */
export async function includeIndexFresh<P>(
    env: IncludeIndexEnvelope<P>,
    liveSignature: string
): Promise<boolean> {
    if (env.signature !== liveSignature) return false;
    const paths = Object.keys(env.contributing);
    // An entry with NO contributing files can't be content-validated — the
    // signature alone (host hash / member fingerprint) does not cover include
    // content, so reusing it would be unsound. Force a rebuild. (This also keeps
    // synthetic/in-memory builds, whose files never stat, from being reused.)
    if (paths.length === 0) return false;
    const BATCH = 64;
    for (let i = 0; i < paths.length; i += BATCH) {
        const slice = paths.slice(i, i + BATCH);
        const stats = await Promise.all(slice.map(async p => {
            try { return { p, mtimeMs: (await fs.promises.stat(p)).mtimeMs }; }
            catch { return { p, mtimeMs: NaN }; }
        }));
        for (const { p, mtimeMs } of stats) {
            if (Number.isNaN(mtimeMs) || mtimeMs !== env.contributing[p]) return false;
        }
        if (i + BATCH < paths.length) await new Promise<void>(r => setImmediate(r));
    }
    return true;
}
