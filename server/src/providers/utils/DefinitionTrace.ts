import LoggerManager from '../../logger';

const perfLogger = LoggerManager.getLogger('DefinitionProvider.Perf', 'perf');

/**
 * #360 — per-call instrumentation for F12 / Go To Definition.
 *
 * A single onDefinition took 53.9s with a 38.4s CONTINUOUS synchronous
 * event-loop freeze on the real solution. Phase duration alone can't tell a
 * 38s await-latency (queued behind other work) from a 38s unyielded block —
 * they need different fixes. So the key measurement here is
 * `max_sync_slice_ms`: the longest stretch the event loop went WITHOUT a tick.
 *
 * Mechanism: a self-rescheduling `setImmediate` heartbeat. It can only fire
 * when the loop is free, so the gap between two successive fires equals the
 * duration of any synchronous block that ran between them. A phase that awaits
 * lots of small async work keeps the heartbeat ticking (small max slice); a
 * phase that blocks continuously starves it (large max slice ≈ phase ms).
 *
 * Fields mirror the requested schema: symbol, route, elapsed_ms,
 * candidate_count, files_examined, cache_hits, cache_misses, fallback_entered,
 * cancelled — plus max_sync_slice_ms and a per-phase ms breakdown so the next
 * F12 log names the culprit tier precisely.
 */
export class DefinitionTrace {
    symbol = '';
    route = 'unresolved';
    cancelled = false;
    candidateCount = 0;
    filesExamined = 0;
    cacheHits = 0;
    cacheMisses = 0;
    fallbackEntered = false;

    private readonly startMs: number;
    private phaseMs = new Map<string, number>();
    private maxSyncSliceMs = 0;
    private lastTickMs: number;
    private stopped = false;

    constructor(nowMs: number) {
        this.startMs = nowMs;
        this.lastTickMs = nowMs;
        this.beat();
    }

    private beat(): void {
        if (this.stopped) return;
        const now = Date.now();
        const gap = now - this.lastTickMs;
        if (gap > this.maxSyncSliceMs) this.maxSyncSliceMs = gap;
        this.lastTickMs = now;
        setImmediate(() => this.beat());
    }

    /** Time an async phase; ms accumulate per name across repeated calls. */
    async time<T>(phase: string, fn: () => Promise<T>): Promise<T> {
        const t0 = Date.now();
        try {
            return await fn();
        } finally {
            this.phaseMs.set(phase, (this.phaseMs.get(phase) ?? 0) + (Date.now() - t0));
        }
    }

    /** Time a synchronous phase. */
    timeSync<T>(phase: string, fn: () => T): T {
        const t0 = Date.now();
        try {
            return fn();
        } finally {
            this.phaseMs.set(phase, (this.phaseMs.get(phase) ?? 0) + (Date.now() - t0));
        }
    }

    /** Snapshot the current field set (also the emitted shape). Stops the heartbeat. */
    snapshot(): Record<string, string | number> {
        this.stopped = true;
        const elapsed = Date.now() - this.startMs;
        const attributed = [...this.phaseMs.values()].reduce((a, b) => a + b, 0);
        const phases = [...this.phaseMs.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([n, ms]) => `${n}=${ms}`)
            .join(', ');
        return {
            symbol: this.symbol,
            route: this.route,
            elapsed_ms: elapsed,
            max_sync_slice_ms: this.maxSyncSliceMs,
            attributed_ms: attributed,
            unattributed_ms: elapsed - attributed,
            candidate_count: this.candidateCount,
            files_examined: this.filesExamined,
            cache_hits: this.cacheHits,
            cache_misses: this.cacheMisses,
            fallback_entered: String(this.fallbackEntered),
            cancelled: String(this.cancelled),
            phases: phases || '(none)'
        };
    }

    /**
     * Emit one perf line when the call was slow or cancelled. Always stops the
     * heartbeat. Call from a `finally` so every return path is covered.
     */
    emitIfSlow(thresholdMs = 1000): void {
        const fields = this.snapshot();
        if ((fields.elapsed_ms as number) < thresholdMs && !this.cancelled) return;
        perfLogger.perf('Definition trace', fields);
    }
}
