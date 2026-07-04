export type ClarionOperationType = 'build' | 'generation';

export type ClarionOperationState = 'running' | 'success' | 'failure';

function operationLabel(operation: ClarionOperationType): string {
    return operation === 'build' ? 'Build' : 'Generation';
}

/**
 * Builds concise status text for build/generation lifecycle states.
 */
export function buildOperationStatusText(
    operation: ClarionOperationType,
    state: ClarionOperationState,
    detail?: string
): string {
    const label = operationLabel(operation);

    if (state === 'running') {
        return detail
            ? `$(sync~spin) Clarion ${label}: ${detail}`
            : `$(sync~spin) Clarion ${label}: Running...`;
    }

    if (state === 'success') {
        return detail
            ? `$(check) Clarion ${label}: ${detail}`
            : `$(check) Clarion ${label}: Succeeded`;
    }

    return detail
        ? `$(error) Clarion ${label}: ${detail}`
        : `$(error) Clarion ${label}: Failed`;
}
