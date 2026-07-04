export type InitializationStatusPhase =
    | 'activating'
    | 'starting-language-server'
    | 'loading-solution'
    | 'indexing-solution';

/**
 * Builds concise status-bar text for Clarion initialization phases.
 */
export function buildInitializationStatusText(
    phase: InitializationStatusPhase,
    detail?: string
): string {
    switch (phase) {
        case 'activating':
            return '$(sync~spin) Clarion: Initializing extension...';
        case 'starting-language-server':
            return '$(sync~spin) Clarion: Starting language server...';
        case 'loading-solution':
            return detail
                ? `$(sync~spin) Clarion: Loading solution ${detail}...`
                : '$(sync~spin) Clarion: Loading solution...';
        case 'indexing-solution':
            return detail
                ? `$(sync~spin) Clarion: Indexing ${detail}...`
                : '$(sync~spin) Clarion: Indexing solution...';
        default:
            return '$(sync~spin) Clarion: Initializing...';
    }
}
