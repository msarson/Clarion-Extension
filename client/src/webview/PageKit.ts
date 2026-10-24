/**
 * #792 — what the property pages share: the HTML shell (a nonce'd script, nothing loaded from
 * outside, VS Code's theme colours), the styles for their headers, sections, rows, tables and
 * buttons, a small element builder for their scripts, and the smallest edit that turns one
 * document text into another. No vscode here, so all of it can be tested.
 */

export function nonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A value for a page's script, safe inside its <script> element. */
export function scriptJson(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** The styles every page uses; a page adds its own after them. */
export const PAGE_CSS = `
  body { margin: 0; padding: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; padding: 18px 24px 14px; border-bottom: 1px solid var(--vscode-panel-border); }
  header .title { flex: 1 1 240px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  h1 { margin: 0; font-size: 1.5em; font-weight: 600; }
  .muted { color: var(--vscode-descriptionForeground); }
  .bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  label.inline { display: flex; align-items: center; gap: 8px; }
  select, input[type=text] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; padding: 4px 8px; font: inherit; }
  select:focus, input:focus, button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; padding: 6px 14px; font: inherit; cursor: pointer; }
  button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; padding: 5px 10px; font: inherit; cursor: pointer; }
  button.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button.link { background: none; border: none; padding: 0; color: var(--vscode-textLink-foreground); font: inherit; cursor: pointer; }
  button.link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
  button:disabled { opacity: 0.5; cursor: default; }
  main { flex: 999 1 520px; min-width: 0; padding: 18px 24px 40px; display: flex; flex-direction: column; gap: 20px; }
  section { border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
  section.attention { border-color: var(--vscode-editorWarning-foreground); }
  h2 { margin: 0; padding: 9px 16px; font-size: 0.85em; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 9px 16px; border-top: 1px solid var(--vscode-panel-border); }
  h2 + .row { border-top: none; }
  .label { flex: 1 1 220px; max-width: 280px; display: flex; flex-direction: column; gap: 2px; }
  code { font-family: var(--vscode-editor-font-family); font-size: 0.85em; color: var(--vscode-descriptionForeground); background: none; padding: 0; }
  .control { flex: 999 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .control input[type=text] { max-width: 520px; }
  .note { font-size: 0.9em; color: var(--vscode-editorWarning-foreground); }
  .needs { color: var(--vscode-editorWarning-foreground); font-weight: 600; }
  .empty { padding: 12px 16px; color: var(--vscode-descriptionForeground); }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 600; font-size: 0.9em; color: var(--vscode-descriptionForeground); padding: 8px 16px; }
  td { padding: 8px 16px; border-top: 1px solid var(--vscode-panel-border); vertical-align: middle; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 0.9em; border: 1px solid var(--vscode-panel-border); }
  .pill.good { border-color: var(--vscode-testing-iconPassed, var(--vscode-panel-border)); color: var(--vscode-testing-iconPassed, inherit); }
  .pill.warn { border-color: var(--vscode-editorWarning-foreground); color: var(--vscode-editorWarning-foreground); }
  .pill.bad { border-color: var(--vscode-errorForeground); color: var(--vscode-errorForeground); }
  .pill.info { border-color: var(--vscode-focusBorder); }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
`;

/**
 * The element builder a page's script starts with: `el(tag, attrs, ...children)`, where an `on…`
 * attribute is an event listener and a false or missing attribute is left out.
 */
export const EL_SCRIPT = `
  const el = (tag, attrs, ...children) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children) if (c !== null && c !== undefined && c !== false) e.append(c);
    return e;
  };
`;

export interface PageParts {
    /** The webview's `cspSource`: where the page may load its images and styles from. */
    cspSource: string;
    title: string;
    /** The page's own markup, inside <body>. */
    body: string;
    /** The page's script; it runs after EL_SCRIPT, so `el` is defined. */
    script: string;
    /** Styles after PAGE_CSS. */
    css?: string;
}

export function pageHtml(parts: PageParts): string {
    const n = nonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${parts.cspSource}; script-src 'nonce-${n}'; style-src ${parts.cspSource} 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(parts.title)}</title>
<style>${PAGE_CSS}${parts.css ?? ''}</style>
</head>
<body>
${parts.body}
<script nonce="${n}">
(function () {
  const vscode = acquireVsCodeApi();
${EL_SCRIPT}
${parts.script}
})();
</script>
</body>
</html>`;
}

/** The single replacement that turns `current` into `next`: offsets into `current`; undefined when equal. */
export function minimalEdit(current: string, next: string): { start: number; end: number; text: string } | undefined {
    if (next === current) return undefined;
    let start = 0;
    while (start < current.length && start < next.length && current[start] === next[start]) start++;
    let endCurrent = current.length, endNext = next.length;
    while (endCurrent > start && endNext > start && current[endCurrent - 1] === next[endNext - 1]) { endCurrent--; endNext--; }
    return { start, end: endCurrent, text: next.slice(start, endNext) };
}
