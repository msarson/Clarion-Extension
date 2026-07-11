/**
 * #317 — trailing-edge burst coalescer.
 *
 * `trigger()` schedules `fn` to run once after `delayMs` of quiet; every
 * trigger inside the quiet period restarts the clock, so an N-notification
 * burst (clarion/projectConstantsChanged arrives once PER PROJECT — 40x on a
 * real solution) costs one run. A trigger that lands while `fn` is executing
 * is remembered and schedules exactly one follow-up run — the in-flight run
 * may have read state that trigger invalidated — and runs never overlap.
 *
 * `fn` owns its error handling; a rejection is swallowed here so the
 * coalescer can never wedge.
 *
 * NOTE: an identical copy lives in client/src/utils/TrailingCoalescer.ts
 * (separate compilation units) — keep the two in sync.
 */
export class TrailingCoalescer {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;
    private pendingWhileRunning = false;

    constructor(
        private readonly delayMs: number,
        private readonly fn: () => void | Promise<void>
    ) { }

    public trigger(): void {
        if (this.running) {
            this.pendingWhileRunning = true;
            return;
        }
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.run();
        }, this.delayMs);
    }

    private async run(): Promise<void> {
        this.running = true;
        try {
            await this.fn();
        } catch {
            // fn logs at source — never wedge the coalescer
        } finally {
            this.running = false;
            if (this.pendingWhileRunning) {
                this.pendingWhileRunning = false;
                this.trigger();
            }
        }
    }
}
