/**
 * #687 (experimental) — the unresolved file references report page. The server's
 * clarion/unresolvedReferences answer, rendered: project sources that could not be found, then
 * missing references (the solution's own sources first), then the conditional and library-like
 * ones folded away. A row posts { command: 'open', file, line }. vscode-free for tests.
 */
export interface UnresolvedReportData {
    built: boolean;
    filesScanned: number;
    ms: number;
    projectSources: string[];
    references: Array<{
        kind: 'INCLUDE' | 'MODULE' | 'MEMBER';
        target: string;
        /** 0-based. */
        line: number;
        conditional: boolean;
        classModule: boolean;
        file: string;
        category: 'missing' | 'library' | 'conditional';
        inProject: boolean;
    }>;
}

type Entry = UnresolvedReportData['references'][number];

function esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function table(entries: Entry[]): string {
    if (entries.length === 0) return '<p class="none">None.</p>';
    const rows = entries.map(e => {
        const display = e.file.replace(/\//g, '\\');
        const name = display.slice(display.lastIndexOf('\\') + 1);
        const kind = e.kind === 'MODULE' && e.classModule ? 'CLASS MODULE' : e.kind;
        return `<tr data-file="${esc(e.file)}" data-line="${e.line}"><td title="${esc(display)}">${esc(name)}</td>`
            + `<td>${e.line + 1}</td><td>${kind}</td><td>${esc(e.target)}</td></tr>`;
    }).join('');
    return `<table><thead><tr><th>File</th><th>Line</th><th>Statement</th><th>Refers to</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function renderUnresolvedReport(data: UnresolvedReportData, nonce: string, cspSource: string): string {
    const missing = data.references.filter(e => e.category === 'missing');
    const conditional = data.references.filter(e => e.category === 'conditional');
    const library = data.references.filter(e => e.category === 'library');

    const body = !data.built
        ? '<p>The file graph has not been built yet. Open a solution and wait for the Graph row in the Clarion Tools pane to show its file count.</p>'
        : `<p class="summary">${plural(data.filesScanned, 'file')} scanned in ${(Math.round(data.ms / 100) / 10).toFixed(1)} s: `
            + `${missing.length} missing, ${conditional.length} conditional, ${plural(library.length, 'library name')}.</p>`
            + (data.projectSources.length > 0
                ? `<h2>Project source files not found (${data.projectSources.length})</h2><ul>${data.projectSources.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`
                : '')
            + `<h2>Missing: in the solution&#39;s source files (${missing.filter(e => e.inProject).length})</h2>${table(missing.filter(e => e.inProject))}`
            + `<h2>Missing: in included and library files (${missing.filter(e => !e.inProject).length})</h2>${table(missing.filter(e => !e.inProject))}`
            + `<details><summary>Inside OMIT or COMPILE blocks (${conditional.length})</summary>`
            + `<p class="note">Compiled only under some condition, if at all, so a miss here may be expected.</p>${table(conditional)}</details>`
            + `<details><summary>MODULE names with no file extension (${library.length})</summary>`
            + `<p class="note">Such a name can be a .clw file, the label of an external library, or a description; no file of that name was found.</p>${table(library)}</details>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 16px 16px; }
  h1 { font-size: 1.3em; }
  h2 { font-size: 1.05em; margin-top: 1.4em; }
  .summary, .note, .none { color: var(--vscode-descriptionForeground); }
  details { margin-top: 1.2em; }
  summary { cursor: pointer; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th, td { text-align: left; padding: 2px 8px; border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2)); }
  th { color: var(--vscode-descriptionForeground); font-weight: normal; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--vscode-list-hoverBackground); }
</style>
</head>
<body>
<h1>Unresolved file references <small>(experimental)</small></h1>
${body}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', ev => {
    const row = ev.target && ev.target.closest ? ev.target.closest('tr[data-file]') : null;
    if (row) vscode.postMessage({ command: 'open', file: row.dataset.file, line: Number(row.dataset.line) });
  });
</script>
</body>
</html>`;
}
