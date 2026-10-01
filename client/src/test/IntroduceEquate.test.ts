import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { formatEquateDeclaration, isValidEquateName } from '../refactor/introduceEquate';

/**
 * #281 — pure helpers for the Introduce EQUATE refactor. Scope detection lives server-side; these
 * cover the declaration formatting and name validation the client command relies on.
 */
suite('#281 introduceEquate helpers', () => {
    test('formats a numeric EQUATE with the label at column 0 and value verbatim', () => {
        assert.strictEqual(formatEquateDeclaration('MaxItems', '100'), 'MaxItems EQUATE(100)');
    });

    test('keeps a string literal\'s quotes', () => {
        assert.strictEqual(formatEquateDeclaration('Title', "'Main'"), "Title EQUATE('Main')");
    });

    test('trims the name', () => {
        assert.strictEqual(formatEquateDeclaration('  Foo  ', '1'), 'Foo EQUATE(1)');
    });

    test('accepts valid Clarion labels (incl. `:` namespace)', () => {
        assert.ok(isValidEquateName('MaxItems'));
        assert.ok(isValidEquateName('_hidden'));
        assert.ok(isValidEquateName('EQ:Max'));
    });

    test('rejects invalid labels', () => {
        assert.ok(!isValidEquateName(''));
        assert.ok(!isValidEquateName('9lives'));   // cannot start with a digit
        assert.ok(!isValidEquateName('has space'));
        assert.ok(!isValidEquateName('has-dash'));
    });
});

suite('#710 Introduce EQUATE replaces the whole concatenated string', () => {
    test('a multi-line chain value goes into the EQUATE verbatim', () => {
        const chain = "'some string' & |\n      'Some more string'";
        assert.strictEqual(formatEquateDeclaration('Greeting', chain), `Greeting EQUATE(${chain})`);
    });

    test('the command replaces through the chain\'s end line, not just the first line', () => {
        let dir = __dirname;
        while (!fs.existsSync(path.join(dir, 'client', 'src', 'commands', 'RefactorCommands.ts'))) dir = path.dirname(dir);
        const src = fs.readFileSync(path.join(dir, 'client', 'src', 'commands', 'RefactorCommands.ts'), 'utf8');
        assert.match(src, /new Range\(literal\.line, literal\.startChar, literal\.endLine \?\? literal\.line, literal\.endChar\)/);
    });
});
