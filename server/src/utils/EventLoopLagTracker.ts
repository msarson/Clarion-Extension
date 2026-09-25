/**
 * #289 / #661 — event-loop lag bookkeeping for the startup sampler in server.ts. A 100ms
 * heartbeat drifts by however long the loop was blocked; this keeps the worst drift of the
 * current reporting window and of the sampler's whole life. The lifetime figure exists so a
 * session shorter than one window (a default perf-driver run) still reports its worst block at
 * shutdown instead of dropping the partial window.
 */
export class EventLoopLagTracker {
    private windowMax = 0;
    private lifetimeMax = 0;

    /** Record one heartbeat's lag (ms beyond the expected interval; negative drift counts as 0). */
    record(lagMs: number): void {
        if (lagMs > this.windowMax) this.windowMax = lagMs;
        if (lagMs > this.lifetimeMax) this.lifetimeMax = lagMs;
    }

    /** Close the current window: its worst lag when above `thresholdMs`, else null. The window restarts. */
    takeWindow(thresholdMs: number): number | null {
        const worst = this.windowMax;
        this.windowMax = 0;
        return worst > thresholdMs ? worst : null;
    }

    /** At shutdown: the unreported partial window and the worst lag over the sampler's life. */
    final(): { windowMaxMs: number; lifetimeMaxMs: number } {
        return { windowMaxMs: this.windowMax, lifetimeMaxMs: this.lifetimeMax };
    }
}
