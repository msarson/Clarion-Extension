/**
 * #682 — the Actions toolbar icons, drawn as 16px inline SVG in the theme's foreground colour. The
 * emoji glyphs they replace looked different in every font (the Debug "bug" was a centipede in
 * Segoe UI). The combined buttons are the run or debug icon with a small hammer badge.
 */
const HAMMER = '<path d="M8.56 2.44 13.56 7.44 11.44 9.56 6.44 4.56Z" fill="currentColor"/>'
    + '<path d="M9 7 2.5 13.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const PLAY = '<path d="M4 2.5 13 8 4 13.5Z" fill="currentColor"/>';
const BUG = '<ellipse cx="8" cy="9.5" rx="3.3" ry="4.3" fill="currentColor"/>'
    + '<circle cx="8" cy="3.8" r="1.9" fill="currentColor"/>'
    + '<path d="M4.7 7.5 1.8 6M4.7 10H1.5M4.9 12.5 2 14.2M11.3 7.5 14.2 6M11.3 10h3.2M11.1 12.5 14 14.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';

const svg = (body: string) => `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
/** The run or debug icon, shifted right, with the hammer small at the top left. */
const withHammer = (body: string) => svg(`<g transform="translate(3 3) scale(0.8)">${body}</g><g transform="scale(0.55)">${HAMMER}</g>`);

export const toolbarIcons = {
    build: svg(HAMMER),
    run: svg(PLAY),
    buildAndRun: withHammer(PLAY),
    debug: svg(BUG),
    buildAndDebug: withHammer(BUG),
};
