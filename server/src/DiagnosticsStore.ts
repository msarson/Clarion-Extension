import { Diagnostic } from 'vscode-languageserver/node';

/**
 * #545 — the last computed diagnostics per document, so a `textDocument/diagnostic`
 * pull can be answered without re-validating: a full report with a resultId, or
 * `unchanged` when the client already holds that resultId.
 *
 * A resultId is `<document version>:<sequence>`; the sequence advances on every
 * record for the document, because one version produces several sets in turn (the
 * sync pass, then the sync+async pass, then a re-validation once the index is ready)
 * and each must read as a change to a client that pulled the previous one.
 */

export type DiagnosticsState = 'partial' | 'deferred' | 'complete';

export interface StoredDiagnostics {
    version: number;
    state: DiagnosticsState;
    diagnostics: Diagnostic[];
    resultId: string;
}

export type DiagnosticsReport =
    | { kind: 'unchanged'; resultId: string }
    | { kind: 'full'; resultId?: string; items: Diagnostic[] };

export class DiagnosticsStore {
    private readonly byUri = new Map<string, StoredDiagnostics>();
    // One counter for the whole store: a resultId is then unique across documents too,
    // so a client cannot present one document's id for another and be told "unchanged".
    private sequence = 0;

    /** Remember the set just computed for `uri` at `version`; returns its resultId. */
    record(uri: string, version: number, state: DiagnosticsState, diagnostics: Diagnostic[]): string {
        const resultId = `${version}:${++this.sequence}`;
        this.byUri.set(uri, { version, state, diagnostics: [...diagnostics], resultId });
        return resultId;
    }

    get(uri: string): StoredDiagnostics | undefined {
        return this.byUri.get(uri);
    }

    /** The pull answer: unchanged when the client's previousResultId is the current one. */
    report(uri: string, previousResultId?: string): DiagnosticsReport {
        const stored = this.byUri.get(uri);
        if (!stored) return { kind: 'full', items: [] };
        if (previousResultId !== undefined && previousResultId === stored.resultId) {
            return { kind: 'unchanged', resultId: stored.resultId };
        }
        return { kind: 'full', resultId: stored.resultId, items: [...stored.diagnostics] };
    }

    clear(uri: string): void {
        this.byUri.delete(uri);
    }
}
