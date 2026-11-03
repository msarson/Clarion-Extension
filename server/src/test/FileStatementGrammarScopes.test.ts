import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * #799 — the file-handling built-ins share one TextMate scope.
 *
 * `STREAM(file)` and `FLUSH(file)` are a pair, but FLUSH sat in `ioStatements`
 * (`keyword.io.clarion`) and STREAM in `builtInFunctions` (`support.function.clarion`),
 * so the editor painted them in different colours. The same split ran through the
 * rest of the family: HOLD / RELEASE, LOGOUT / COMMIT / ROLLBACK, ADD / APPEND,
 * FREE / EMPTY, NEXT / SKIP.
 *
 * There is no TextMate engine in the repo (see UnicodeGrammar.test.ts), so this
 * simulates the one decision that matters for a bare word: the engine scans the
 * top-level `patterns` in order, takes the rule whose regex matches earliest in the
 * line, and breaks a tie by pattern order. Each word is placed in a call context
 * (`  WORD(Customers)`) so the label rule cannot claim it.
 */

interface Rule { match?: string; begin?: string; name?: string; include?: string; patterns?: Rule[]; }
interface Grammar { patterns: Rule[]; repository: Record<string, Rule>; }

function repoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'syntaxes', 'clarion.tmLanguage.json'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('could not locate the repo root from ' + __dirname);
}

// #490 — lift Oniguruma's `(?i:` to `(?:` + the `i` flag so the regex compiles on Node 20.
const js = (oniguruma: string): RegExp => {
    const lifted = oniguruma.replace(/\(\?i:/g, '(?:');
    return new RegExp(lifted, lifted === oniguruma ? 'g' : 'gi');
};

/**
 * Every file-handling built-in (Language Reference > 13 - Built-in Functions) the grammar
 * colours. NOMEMO is left out: `controlAttributes`, an earlier rule, also lists it and
 * paints it as an attribute — a separate question from this one.
 */
const FILE_WORDS = [
    'OPEN', 'CLOSE', 'CREATE', 'BUILD', 'SHARE', 'STREAM', 'FLUSH', 'EMPTY', 'PACK', 'BUFFER',
    'SET', 'RESET', 'NEXT', 'PREVIOUS', 'SKIP', 'GET', 'REGET', 'POSITION',
    'ADD', 'APPEND', 'PUT', 'DELETE', 'FREE',
    'HOLD', 'RELEASE', 'WATCH', 'LOCK', 'UNLOCK',
    'LOGOUT', 'COMMIT', 'ROLLBACK',
];

suite('File-handling built-ins share one scope (#799)', () => {

    const grammar = JSON.parse(
        fs.readFileSync(path.join(repoRoot(), 'syntaxes', 'clarion.tmLanguage.json'), 'utf8')
    ) as Grammar;

    // The top-level patterns, in order, each flattened to its regex-bearing rules.
    const ordered: { key: string; scope: string; re: RegExp }[] = [];
    const walk = (rule: Rule | undefined, key: string, scope: string | undefined): void => {
        if (!rule) return;
        if (rule.include?.startsWith('#')) {
            const name = rule.include.slice(1);
            walk(grammar.repository[name], name, undefined);
            return;
        }
        const own = rule.name ?? scope ?? '';
        const src = rule.match ?? rule.begin;
        if (src) ordered.push({ key, scope: own, re: js(src) });
        for (const child of rule.patterns ?? []) walk(child, key, own);
    };
    for (const p of grammar.patterns) walk(p, '(top)', undefined);

    /** The rule and scope that paint `word` in `  word(Customers)`. */
    const winner = (word: string): { key: string; scope: string; text: string } | null => {
        const line = `  ${word}(Customers)`;
        let best: { key: string; scope: string; text: string; at: number } | null = null;
        for (const r of ordered) {
            r.re.lastIndex = 0;
            const m = r.re.exec(line);
            if (m && (best === null || m.index < best.at)) {
                best = { key: r.key, scope: r.scope, text: m[0], at: m.index };
            }
        }
        return best && { key: best.key, scope: best.scope, text: best.text };
    };

    test('the simulation sees the real rules (sanity)', () => {
        assert.deepStrictEqual(winner('CLIP'),
            { key: 'builtInFunctions', scope: 'support.function.clarion', text: 'CLIP' });
        assert.deepStrictEqual(winner('OPEN'),
            { key: 'ioStatements', scope: 'keyword.io.clarion', text: 'OPEN' });
    });

    test('STREAM and FLUSH are painted with the same scope', () => {
        assert.strictEqual(winner('STREAM')?.scope, winner('FLUSH')?.scope);
    });

    test('every file-handling built-in is painted by ioStatements', () => {
        const wrong = FILE_WORDS
            .map(w => ({ w, got: winner(w) }))
            .filter(({ w, got }) => got?.key !== 'ioStatements' || got.text.toUpperCase() !== w)
            .map(({ w, got }) => `${w} -> ${got ? `${got.key} (${got.scope})` : 'nothing'}`);
        assert.deepStrictEqual(wrong, []);
    });

    test('no file-handling built-in is left in another alternation as well', () => {
        const homes = (word: string): string[] =>
            Object.entries(grammar.repository)
                .filter(([, rule]) => typeof rule.match === 'string' && !rule.match.includes(':\\w*'))
                .filter(([, rule]) => {
                    const re = js(`^(?:${rule.match})$`);
                    return re.test(word);
                })
                .map(([key]) => key);
        const doubled = FILE_WORDS
            .map(w => ({ w, at: homes(w) }))
            .filter(({ at }) => at.length !== 1 || at[0] !== 'ioStatements')
            .map(({ w, at }) => `${w}: ${at.join(', ')}`);
        assert.deepStrictEqual(doubled, []);
    });
});
