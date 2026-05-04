import { strictEqual, ok } from 'assert';
import { KeywordService } from '../utils/KeywordService';
import { DirectiveService } from '../utils/DirectiveService';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';

/**
 * Tests for KeywordService and the issue #77 hover-data refactor.
 *
 * These confirm that keywords and compiler directives previously living
 * inside clarion-builtins.json have been migrated cleanly:
 *  - the relevant entries are now answered by KeywordService /
 *    DirectiveService (not BuiltinFunctionService)
 *  - the migrated entries still carry usable hover content (name, syntax,
 *    description, category)
 */
suite('KeywordService (issue #77)', () => {
    const keywords = KeywordService.getInstance();
    const directives = DirectiveService.getInstance();
    const builtins = BuiltinFunctionService.getInstance();

    test('singleton', () => {
        strictEqual(KeywordService.getInstance(), KeywordService.getInstance());
    });

    test('isKeyword returns false for unknown', () => {
        strictEqual(keywords.isKeyword('NOTAKEYWORD_XYZ'), false);
    });

    suite('migrated keywords are answered by KeywordService', () => {
        const sample = ['IF', 'CASE', 'LOOP', 'PROCEDURE', 'FUNCTION', 'SELF', 'PARENT', 'NEW', 'RETURN', 'CYCLE', 'BREAK'];
        for (const k of sample) {
            test(`KeywordService recognises ${k}`, () => {
                ok(keywords.isKeyword(k), `${k} should be a known keyword`);
                const entry = keywords.getKeyword(k)!;
                ok(entry, `expected entry for ${k}`);
                strictEqual(entry.name, k);
                ok(entry.description.length > 0, `description should not be empty`);
                ok(entry.syntax.length > 0, `syntax should not be empty`);
                ok(entry.category.length > 0, `category should not be empty`);
            });
        }
    });

    suite('migrated directives are answered by DirectiveService', () => {
        const sample = ['INCLUDE', 'OMIT', 'COMPILE', 'PRAGMA', 'EQUATE', 'MEMBER'];
        for (const d of sample) {
            test(`DirectiveService recognises ${d}`, () => {
                ok(directives.isDirective(d), `${d} should be a known directive`);
                const entry = directives.getDirective(d)!;
                ok(entry, `expected entry for ${d}`);
                strictEqual(entry.name, d);
                ok(entry.description.length > 0);
            });
        }
    });

    suite('pre-existing directives still answered (regression-pinned)', () => {
        for (const d of ['ITEMIZE', 'SECTION']) {
            test(`DirectiveService still recognises ${d}`, () => {
                ok(directives.isDirective(d));
            });
        }
    });

    suite('migrated entries no longer in BuiltinFunctionService', () => {
        const movedNames = [
            // keywords
            'IF', 'CASE', 'LOOP', 'PROCEDURE', 'FUNCTION', 'SELF', 'PARENT',
            'NEW', 'RETURN', 'CYCLE', 'BREAK', 'PROGRAM', 'CODE',
            // directives
            'INCLUDE', 'OMIT', 'COMPILE', 'PRAGMA', 'EQUATE', 'MEMBER'
        ];
        for (const name of movedNames) {
            test(`${name} no longer answered by BuiltinFunctionService`, () => {
                strictEqual(builtins.isBuiltin(name), false, `${name} must not appear in builtins.json after migration`);
            });
        }
    });

    suite('actual built-in functions still answered by BuiltinFunctionService', () => {
        // Pick a handful that should clearly remain — math + IO functions.
        for (const fn of ['ABS', 'CLIP', 'MESSAGE', 'OPEN', 'CLOSE']) {
            test(`BuiltinFunctionService still recognises ${fn}`, () => {
                ok(builtins.isBuiltin(fn), `${fn} must still be a built-in function`);
            });
        }
    });

    test('no overlap: a moved name should be answered by exactly one service', () => {
        const moved = ['IF', 'CASE', 'INCLUDE', 'OMIT'];
        for (const name of moved) {
            const inKeywords = keywords.isKeyword(name);
            const inDirectives = directives.isDirective(name);
            const inBuiltins = builtins.isBuiltin(name);
            const count = [inKeywords, inDirectives, inBuiltins].filter(Boolean).length;
            strictEqual(count, 1, `${name}: expected exactly one service to claim it (kw=${inKeywords}, dir=${inDirectives}, fn=${inBuiltins})`);
        }
    });
});
