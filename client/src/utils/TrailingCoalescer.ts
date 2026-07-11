/**
 * #317 — trailing-edge burst coalescer.
 *
 * `trigger()` schedules `fn` to run once after `delayMs` of quiet; every
 * trigger inside the quiet period restarts the clock. A .cwproj regeneration
 * touches every project file in the solution (40x on a real solution) and
 * each watcher event ran a FULL environment reinitialize + tree refresh +
 * server notification + toast — the coalescer collapses the burst to one.
 * A trigger landing while `fn` executes schedules exactly one follow-up run;
 * runs never overlap.
 *
 * NOTE: an identical copy lives in server/src/utils/TrailingCoalescer.ts
 * (separate compilation units; contract tests live in the server suite) —
 * keep the two in sync.
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
