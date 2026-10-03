/**
 * #599 — the NAIVE oracle, shared by both sweep stages.
 *
 * Deliberately hand-written here rather than imported from the server. The whole method depends on
 * this counter being independent of the machinery under test: #525 was a bug IN
 * ReferenceCountIndex, whose word regex split identifiers at colons, so a sweep that counted with it
 * would have reported every prefixed name as genuinely unreferenced and found nothing.
 *
 * Permissive on purpose. Colon-joined segments are one name, because a Clarion label may carry a
 * PRE:FIX: chain; everything else is an ordinary identifier. Comments and string literals are
 * stripped so a name mentioned in prose is not counted as a use. It is scope-blind and over-counts —
 * that is fine and intended, because the signal is the DISCREPANCY against what the product reports,
 * not the absolute number.
 */

const NAIVE_WORD = /[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)*/g;
const STRING_LITERAL = /'(?:[^']|'')*'/g;

// A literal is blanked to spaces of its own length, not to one space: the agreement sweep samples
// cursor columns from the stripped line, and a shorter line put every later column on another
// word (#647).
function stripNonCode(line) {
    line = line.replace(STRING_LITERAL, s => ' '.repeat(s.length));
    const bang = line.indexOf('!');
    return bang === -1 ? line : line.substring(0, bang);
}

/** Accumulate lowercased identifier occurrences from `content` into `into` (a Map). */
function naiveScan(content, into) {
    for (const raw of content.split(/\r?\n/)) {
        const line = stripNonCode(raw);
        NAIVE_WORD.lastIndex = 0;
        let m;
        while ((m = NAIVE_WORD.exec(line)) !== null) {
            const w = m[0].toLowerCase();
            into.set(w, (into.get(w) || 0) + 1);
        }
    }
}

module.exports = { naiveScan, stripNonCode, NAIVE_WORD };
