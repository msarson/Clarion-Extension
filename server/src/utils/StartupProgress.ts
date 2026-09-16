import LoggerManager from '../logger';

const logger = LoggerManager.getLogger('StartupProgress');
logger.setLevel('error');

/**
 * #544 — startup phases (declaration-index build, file-relationship-graph build, the
 * re-validation pass once the index is ready) reported through the protocol's
 * window/workDoneProgress, so a client shows them without any custom code — VS Code
 * puts them in the status bar. The extension's own notifications (clarion/graphStatus
 * and friends) are unchanged; this is in addition, for every client.
 *
 * Progress is decoration. Nothing here may throw into the startup chain: an
 * unsupported client, a failed `window/workDoneProgress/create`, or a call after
 * `done` all degrade to silence.
 */

/** The subset of vscode-languageserver's WorkDoneProgressServerReporter that is used. */
export interface ProgressReporterLike {
    begin(title: string, percentage?: number, message?: string, cancellable?: boolean): void;
    report(message: string, percentage?: number): void;
    done(): void;
}

export interface ProgressPhase {
    /** Update the message and, optionally, the percentage (clamped to 0–100). */
    report(message: string, percentage?: number): void;
    /** `n of total: what` with the matching percentage. */
    step(n: number, total: number, what?: string): void;
    /** Finish the phase. Safe to call more than once. */
    done(): void;
}

/** vscode-languageserver's reporter, whose `report` overloads put the percentage FIRST. */
export interface LibraryReporterLike {
    begin(title: string, percentage?: number, message?: string, cancellable?: boolean): void;
    report(percentage: number): void;
    report(message: string): void;
    report(percentage: number, message: string): void;
    done(): void;
}

/** Adapt the library's argument order to ProgressReporterLike (message, percentage). */
export function adaptLibraryReporter(r: LibraryReporterLike): ProgressReporterLike {
    return {
        begin: (title, percentage, message, cancellable) => r.begin(title, percentage, message, cancellable),
        report: (message, percentage) => percentage === undefined ? r.report(message) : r.report(percentage, message),
        done: () => r.done(),
    };
}

const NO_OP: ProgressPhase = { report() { /* unsupported */ }, step() { /* unsupported */ }, done() { /* unsupported */ } };

export class StartupProgress {
    private static supported = false;
    private static factory: () => Promise<ProgressReporterLike> = async () => { throw new Error('StartupProgress not configured'); };

    /**
     * Called once from onInitialize with the client's `window.workDoneProgress`
     * capability and a factory (`connection.window.createWorkDoneProgress`).
     */
    static configure(supported: boolean, factory: () => Promise<ProgressReporterLike>): void {
        StartupProgress.supported = supported;
        StartupProgress.factory = factory;
    }

    /** Start a phase. Resolves to a no-op phase when progress cannot be shown. */
    static async begin(title: string, message?: string): Promise<ProgressPhase> {
        if (!StartupProgress.supported) return NO_OP;
        let reporter: ProgressReporterLike;
        try {
            reporter = await StartupProgress.factory();
        } catch (err) {
            logger.info(`progress unavailable for "${title}": ${err instanceof Error ? err.message : String(err)}`);
            return NO_OP;
        }
        let finished = false;
        const safe = (fn: () => void) => { try { fn(); } catch (err) { logger.info(`progress call failed: ${err instanceof Error ? err.message : String(err)}`); } };
        safe(() => reporter.begin(title, 0, message));
        const phase: ProgressPhase = {
            report(msg, percentage) {
                if (finished) return;
                const pct = percentage === undefined ? undefined : Math.max(0, Math.min(100, Math.round(percentage)));
                safe(() => reporter.report(msg, pct));
            },
            step(n, total, what) {
                const label = what ? `${n} of ${total}: ${what}` : `${n} of ${total}`;
                phase.report(label, total > 0 ? (n / total) * 100 : undefined);
            },
            done() {
                if (finished) return;
                finished = true;
                safe(() => reporter.done());
            },
        };
        return phase;
    }
}
