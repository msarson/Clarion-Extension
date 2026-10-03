import { AsyncLocalStorage } from 'async_hooks';
import { performance } from 'perf_hooks';

/**
 * #715 item 1 — interactive requests run ahead of background validation.
 *
 * The server is one event loop. Background validation yields every ~25 ms (cooperativeScan), and a
 * hover with many async steps then got one step per yield: a cold MAP-include walk that takes
 * 212 ms alone took 2.1 s during a re-check, and a cold global lookup right after opening a module
 * 162 ms alone, 3.3 s alongside the opening check.
 *
 * Background work runs inside `runAsBackground` (validateTextDocument does), which marks every
 * continuation of it through AsyncLocalStorage. At a yield point inside that context,
 * `yieldForInteractive` waits while a hover, completion or F12 is in flight (`beginInteractive`),
 * but never longer than BACKGROUND_STARVATION_CAP_MS since background work last had the loop, so a
 * steady stream of requests cannot starve validation. Outside the context it returns at once:
 * the shared yield helpers are also used by interactive features, which must never wait for
 * another request, or for themselves.
 */
export const BACKGROUND_STARVATION_CAP_MS = 250;

const background = new AsyncLocalStorage<boolean>();
let inFlight = 0;
let idleWaiters: Array<() => void> = [];
let lastBackgroundSlice = 0;

export function runAsBackground<T>(work: () => Promise<T>): Promise<T> {
    return background.run(true, work);
}

export function isBackground(): boolean {
    return background.getStore() === true;
}

/** Marks an interactive request in flight; call the returned function when it has answered. */
export function beginInteractive(): () => void {
    inFlight++;
    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        inFlight--;
        if (inFlight === 0) {
            const waiters = idleWaiters;
            idleWaiters = [];
            for (const wake of waiters) wake();
        }
    };
}

/**
 * At a background yield point: wait while a request is in flight, at most until the starvation
 * cap since background work last had the loop. A no-op outside runAsBackground.
 */
export async function yieldForInteractive(): Promise<void> {
    if (!isBackground()) return;
    // Wait in short steps while a request is in flight AND busy. A request in flight on an idle
    // loop is waiting for something - often work background validation started, such as a shared
    // index - so holding background back would only make it wait longer: measured on a real
    // module, a quarter of steady-state hovers lost ~130 ms that way before this check.
    while (inFlight > 0) {
        const remaining = lastBackgroundSlice + BACKGROUND_STARVATION_CAP_MS - Date.now();
        if (remaining <= 0) break;
        const before = performance.eventLoopUtilization();
        await new Promise<void>(resolve => {
            let settled = false;
            const wake = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
            const timer = setTimeout(wake, Math.min(BUSY_CHECK_MS, remaining));
            idleWaiters.push(wake);
        });
        if (inFlight > 0 && performance.eventLoopUtilization(before).utilization < BUSY_UTILIZATION) break;
    }
    lastBackgroundSlice = Date.now();
}

/** How often background re-checks whether the request in flight is still using the loop. */
const BUSY_CHECK_MS = 10;
/** Below this share of the last step spent running code, the loop counts as idle. */
const BUSY_UTILIZATION = 0.5;

/** Test seam: forget any in-flight count and slice time left by an earlier test. */
export function resetInteractivePriorityForTests(): void {
    inFlight = 0;
    idleWaiters = [];
    lastBackgroundSlice = 0;
}
