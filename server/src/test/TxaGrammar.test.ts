import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The Clarion TXA grammar (`syntaxes/clarion-txa.tmLanguage.json`): an application or procedure exported as text.
 *
 * There is no TextMate engine in the repo (see UnicodeGrammar.test.ts), so this checks what can be checked without
 * one: the language and grammar are registered for .txa, every regex compiles, the line rules give the scopes a TXA
 * line should get, and the code sections hand their lines to source.clarion. (Rules are tried as the engine tries
 * them: the earliest match in the line wins, a tie going to the rule listed first.)
 */

interface Rule {
    match?: string; begin?: string; end?: string; name?: string; include?: string;
    patterns?: Rule[]; captures?: Record<string, Rule>;
}
interface Grammar { scopeName: string; fileTypes: string[]; patterns: Rule[]; repository: Record<string, Rule>; }

function repoRoot(): string {
    let dir = __dirname;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'syntaxes', 'clarion-txa.tmLanguage.json'))) return dir;
        dir = path.dirname(dir);
    }
    throw new Error('could not locate the repo root from ' + __dirname);
}

// #490: lift Oniguruma's `(?i:` to `(?:` + the `i` flag so the regex compiles on Node 20.
const js = (oniguruma: string): RegExp => {
    const lifted = oniguruma.replace(/\(\?i:/g, '(?:');
    return new RegExp(lifted, lifted === oniguruma ? '' : 'i');
};

suite('Clarion TXA grammar', () => {

    const root = repoRoot();
    const grammar = JSON.parse(fs.readFileSync(path.join(root, 'syntaxes', 'clarion-txa.tmLanguage.json'), 'utf8')) as Grammar;
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    /** Every rule of the grammar, nested ones included. */
    const all: Rule[] = [];
    const collect = (r: Rule | undefined): void => {
        if (!r) return;
        all.push(r);
        for (const c of r.patterns ?? []) collect(c);
    };
    for (const p of grammar.patterns) collect(p);
    for (const r of Object.values(grammar.repository)) collect(r);

    /** The rules of a repository entry, flattened to those with a match, in order. */
    const matches = (key: string): Rule[] => {
        const out: Rule[] = [];
        const walk = (r: Rule | undefined): void => {
            if (!r) return;
            if (r.include?.startsWith('#')) { walk(grammar.repository[r.include.slice(1)]); return; }
            if (r.match) out.push(r);
            for (const c of r.patterns ?? []) walk(c);
        };
        walk(grammar.repository[key]);
        return out;
    };

    /** The scope of each captured group the winning rule of `key` gives `line`, as "text=scope". */
    const scopes = (key: string, line: string): string[] => {
        let best: { rule: Rule; m: RegExpExecArray } | null = null;
        for (const rule of matches(key)) {
            const m = js(rule.match!).exec(line);
            if (m && (best === null || m.index < best.m.index)) best = { rule, m };
        }
        if (!best) return [];
        const found: string[] = [];
        if (best.rule.name) found.push(`${best.m[0].trim()}=${best.rule.name}`);
        for (const [group, capture] of Object.entries(best.rule.captures ?? {})) {
            const text = best.m[Number(group)];
            if (capture.name && text && text.trim()) found.push(`${text.trim()}=${capture.name}`);
        }
        return found;
    };

    test('the language and grammar are registered for .txa', () => {
        const lang = pkg.contributes.languages.find((l: { id: string }) => l.id === 'clarion-txa');
        assert.ok(lang, 'no clarion-txa language');
        assert.deepStrictEqual(lang.extensions, ['.txa']);
        const g = pkg.contributes.grammars.find((x: { language: string }) => x.language === 'clarion-txa');
        assert.strictEqual(g.scopeName, grammar.scopeName);
        assert.strictEqual(path.normalize(g.path), path.normalize('./syntaxes/clarion-txa.tmLanguage.json'));
        assert.deepStrictEqual(grammar.fileTypes, ['txa']);
        // highlighting only: .txa is no Clarion language document, so the language server is not started for it
        assert.ok(!pkg.activationEvents.some((e: string) => /txa/i.test(e)), 'an activation event names .txa');
        const clarion = pkg.contributes.languages.find((l: { id: string }) => l.id === 'clarion');
        assert.ok(!clarion.extensions.includes('.txa'));
    });

    test('every regex compiles', () => {
        const bad: string[] = [];
        for (const r of all)
            for (const src of [r.match, r.begin, r.end])
                if (src) try { js(src); } catch (e) { bad.push(`${src}: ${(e as Error).message}`); }
        assert.deepStrictEqual(bad, []);
    });

    test('section headers, and [END] apart', () => {
        assert.deepStrictEqual(scopes('sectionHeader', '[PROCEDURE]'), ['[PROCEDURE]=entity.name.section.txa', '[=punctuation.definition.section.begin.txa', ']=punctuation.definition.section.end.txa']);
        assert.strictEqual(scopes('sectionHeader', '[END]')[0], '[END]=keyword.control.section.end.txa');
        assert.deepStrictEqual(scopes('sectionHeader', '  x = a[1]'), []);   // an array index in code is no header
    });

    test('a prompt line: its symbol, modifiers and DEPEND in any order, type and TIMES', () => {
        const rule = grammar.repository.promptSection.patterns![0];
        const re = js(rule.match!);
        /** "text=scope" for each captured group, the modifier group split by its own patterns. */
        const parts = (line: string): string[] => {
            const m = re.exec(line);
            assert.ok(m, line);
            const found: string[] = [];
            for (const [group, capture] of Object.entries(rule.captures as Record<string, Rule>)) {
                const text = m![Number(group)];
                if (!text?.trim()) continue;
                if (capture.name) { found.push(`${text.trim()}=${capture.name}`); continue; }
                for (const word of text.trim().split(/\s+/)) {
                    const sub = capture.patterns!.find(p => new RegExp(`^(?:${js(p.match!).source})$`).test(word));
                    found.push(`${word}=${sub?.name ?? '(none)'}`);
                }
            }
            return found;
        };
        // the order AppGen writes: DEPEND %Parent, then MULTI
        assert.deepStrictEqual(parts('%ClassLines DEPEND %ClassItem MULTI DEFAULT TIMES 2'), [
            '%ClassLines=variable.other.prompt.txa', 'DEPEND=keyword.other.depend.txa', '%ClassItem=variable.other.prompt.txa',
            'MULTI=storage.modifier.prompt.txa', 'DEFAULT=storage.type.prompt.txa', 'TIMES=keyword.other.times.txa', '2=constant.numeric.txa',
        ]);
        assert.deepStrictEqual(parts('%Things MULTI UNIQUE LONG  ()'), [
            '%Things=variable.other.prompt.txa', 'MULTI=storage.modifier.prompt.txa', 'UNIQUE=storage.modifier.prompt.txa',
            'LONG=storage.type.prompt.txa',
        ]);
        assert.deepStrictEqual(parts('%UpdateProcedure PROCEDURE  (UpdateContact)'),
            ['%UpdateProcedure=variable.other.prompt.txa', 'PROCEDURE=storage.type.prompt.txa']);
    });

    test('embed lines: EMBED %Point, WHEN, PRIORITY n, PROPERTY:BEGIN', () => {
        assert.deepStrictEqual(scopes('lineKeywords', 'EMBED %ControlEventHandling'),
            ['EMBED=keyword.other.embed.txa', '%ControlEventHandling=variable.other.embed.txa']);
        assert.deepStrictEqual(scopes('lineKeywords', "WHEN '?OK'"), ['WHEN=keyword.other.when.txa']);
        assert.deepStrictEqual(scopes('lineKeywords', 'PRIORITY 4000'), ['PRIORITY=keyword.other.property.txa', '4000=constant.numeric.txa']);
        assert.deepStrictEqual(scopes('lineKeywords', 'PROPERTY:BEGIN'), ['PROPERTY:BEGIN=keyword.other.property.txa']);
        assert.deepStrictEqual(scopes('lineKeywords', 'NAME ABC BrowseBox'), ['NAME=keyword.other.header.txa']);
    });

    test('string escapes: a doubled quote, << and <13,10>', () => {
        const escape = js(grammar.repository.strings.patterns![0].patterns![0].match!);
        for (const e of ["''", '<<', '<13,10>', '<0FFh>', '{3}', '{{']) assert.ok(new RegExp(`^(?:${escape.source})$`).test(e), e);
        assert.ok(!new RegExp(`^(?:${escape.source})$`).test('<x>'));
    });

    test('code sections hand their lines to source.clarion and stop at the next header', () => {
        const sections = grammar.repository.codeSections.patterns!;
        for (const name of ['SOURCE', 'DATA', 'SCREENCONTROLS', 'REPORTCONTROLS', 'LONGDESC', 'QUICKCODE', 'WINDOW', 'REPORT']) {
            const s = sections.find(x => js(x.begin!).test(`[${name}]`));
            assert.ok(s, `[${name}] opens no code section`);
            const includes = s!.patterns!.map(p => p.include);
            assert.ok(includes.includes('source.clarion'), `[${name}] does not include source.clarion`);
            // a stray quote ends with its line: the section's own string rule comes before Clarion's, which runs on
            assert.ok(includes.indexOf('#codeStrings') >= 0 && includes.indexOf('#codeStrings') < includes.indexOf('source.clarion'), `[${name}] strings`);
            assert.ok(js(s!.end!).test('[EMBED]') && !js(s!.end!).test("  MESSAGE('[x]')"), `[${name}] ends wrongly`);
        }
        // the embed's properties come before its code, and end at PROPERTY:END
        const props = grammar.repository.embedProperties;
        assert.ok(js(props.begin!).test('PROPERTY:BEGIN') && js(props.end!).test('PROPERTY:END'));
        const strings = grammar.repository.codeStrings;
        assert.ok(js(strings.end!).test('') && js(strings.begin!).test("It's") && js(strings.begin!).test("u'x'"));
        // control attributes AppGen keeps in a window
        assert.ok(js(grammar.repository.templateAttributes.match!).test('#ORIG(?OK)'));
    });
});
