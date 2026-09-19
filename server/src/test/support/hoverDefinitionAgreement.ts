/**
 * #609 phase 1 - does hover point where F12 goes?
 *
 * Hover and Go to Definition resolve the same word through separate pipelines (hover's
 * StructureFieldResolver/router, DefinitionProvider's own branches). This classifies one
 * position's pair of answers so drift between them shows up as data. Shared by the fixture
 * test (HoverDefinitionAgreement.test.ts) and the real-solution sweep
 * (scripts/health/hover-definition-agreement.js, which loads the compiled copy), so both
 * judge a pair by the same rule.
 */

export interface SourceLocation {
    /** Normalised file key: decoded, forward slashes, lower case, no scheme. */
    file: string;
    /** 0-based line. */
    line: number;
}

/**
 * - `agree`       F12's target is one of the locations the hover links to
 * - `mismatch`    both answer, but F12 goes somewhere the hover does not link
 * - `f12-only`    F12 resolves, hover shows nothing
 * - `hover-only`  hover links a location, F12 resolves nothing
 * - `hover-no-link` both answer, but the hover names no location to compare
 * - `no-location` neither gives a location (a keyword card, or nothing at all)
 */
export type AgreementVerdict = 'agree' | 'mismatch' | 'f12-only' | 'hover-only' | 'hover-no-link' | 'no-location';

/** Verdicts that mean the two features disagree about the same word. */
export const DISAGREEMENTS: readonly AgreementVerdict[] = ['mismatch', 'f12-only', 'hover-only'];

export function normaliseFile(uriOrPath: string): string {
    let s = uriOrPath.replace(/^file:\/*/i, '');
    try { s = decodeURIComponent(s); } catch { /* keep as is */ }
    return s.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function hoverMarkdown(hover: any): string {
    if (!hover || !hover.contents) return '';
    const c = hover.contents;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(x => (typeof x === 'string' ? x : x.value ?? '')).join('\n');
    return c.value ?? '';
}

/** Every location a hover links to, in order: `[name:line](file:///...#L<1-based>)`. */
export function hoverLocations(hover: any): SourceLocation[] {
    const out: SourceLocation[] = [];
    const re = /\]\((file:[^)#\s]+)#L(\d+)\)/g;
    const md = hoverMarkdown(hover);
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) out.push({ file: normaliseFile(m[1]), line: Number(m[2]) - 1 });
    return out;
}

/** Every location a definition result names (Location, Location[] or LocationLink[]). */
export function definitionLocations(def: any): SourceLocation[] {
    const arr = Array.isArray(def) ? def : (def ? [def] : []);
    return arr
        .map(l => ({ uri: l.uri ?? l.targetUri, range: l.range ?? l.targetSelectionRange ?? l.targetRange }))
        .filter(l => l.uri && l.range)
        .map(l => ({ file: normaliseFile(l.uri), line: l.range.start.line }));
}

export function classifyAgreement(hover: any, definition: any): AgreementVerdict {
    const defs = definitionLocations(definition);
    const links = hoverLocations(hover);
    const hoverShown = hoverMarkdown(hover).trim().length > 0;

    if (defs.length === 0) return links.length > 0 ? 'hover-only' : 'no-location';
    if (!hoverShown) return 'f12-only';
    if (links.length === 0) return 'hover-no-link';
    const same = (a: SourceLocation, b: SourceLocation) => a.file === b.file && a.line === b.line;
    return defs.some(d => links.some(l => same(d, l))) ? 'agree' : 'mismatch';
}
