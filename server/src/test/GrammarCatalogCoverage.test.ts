import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';

/**
 * #521 — every name in `server/src/data/clarion-builtins.json` must be highlighted by
 * some `match` rule in `syntaxes/clarion.tmLanguage.json`.
 *
 * The two files are maintained by hand and drift: #519 added HTTPWEBREQUEST and three
 * other functions to the catalog without touching the grammar, and CALLBACK, NULL, SQL
 * and SQLCALLBACK had been catalog-only for longer. A name the catalog knows gets
 * hover, completion and signature help but is painted as a plain identifier, which
 * reads as "the extension does not know this function".
 *
 * Like UnicodeGrammar.test.ts this asserts the grammar's own regexes (there is no
 * TextMate engine in the repo), so it pins WHAT the alternations contain, not rule
 * precedence. A name counts as covered only when a rule matches it whole — the
 * operator rule matches a "(" in almost anything, so a bare substring test is useless.
 */

interface Rule { match?: string; name?: string; patterns?: Rule[]; }

function repoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'syntaxes', 'clarion.tmLanguage.json'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('could not locate the repo root from ' + __dirname);
}

suite('Grammar covers the built-in catalog (#521)', () => {

    const grammar = JSON.parse(
        fs.readFileSync(path.join(repoRoot(), 'syntaxes', 'clarion.tmLanguage.json'), 'utf8')
    ) as { repository: Record<string, Rule> };

    // #490 — lift Oniguruma's `(?i:` to `(?:` + the `i` flag so the regex compiles on Node 20.
    const js = (oniguruma: string): RegExp => {
        const lifted = oniguruma.replace(/\(\?i:/g, '(?:');
        return new RegExp(lifted, lifted === oniguruma ? '' : 'i');
    };

    const rules: { key: string; re: RegExp }[] = [];
    const walk = (rule: Rule | undefined, key: string): void => {
        if (!rule) return;
        if (rule.match) rules.push({ key, re: js(rule.match) });
        for (const child of rule.patterns ?? []) walk(child, key);
    };
    for (const [key, rule] of Object.entries(grammar.repository)) walk(rule, key);

    const coveredBy = (name: string): string[] =>
        rules.filter(r => { const m = r.re.exec(name); return !!m && m[0].toUpperCase() === name.toUpperCase(); })
             .map(r => r.key);

    test('the walker sees the builtInFunctions rule (sanity)', () => {
        assert.ok(rules.some(r => r.key === 'builtInFunctions'));
        assert.deepStrictEqual(coveredBy('CLIP'), ['builtInFunctions']);
    });

    test('every catalog name is whole-matched by at least one grammar rule', () => {
        const names = BuiltinFunctionService.getInstance().getAllBuiltinNames();
        assert.ok(names.length > 250, `expected the full catalog, got ${names.length} names`);
        const uncovered = names.filter(n => coveredBy(n).length === 0);
        assert.deepStrictEqual(uncovered, [],
            `catalog names no grammar rule highlights — add them to builtInFunctions in clarion.tmLanguage.json`);
    });
});
