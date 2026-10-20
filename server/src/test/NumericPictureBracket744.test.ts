import * as assert from 'assert';
import { ClarionTokenizer, TokenType } from '../ClarionTokenizer';

/**
 * #744 — a numeric picture ran up to the next space or comma, so in `ENTRY(@n5),AT(...)` the
 * picture token was `@n5)` and the control's closing bracket was lost: everything that counts
 * brackets on the line (the control card's attribute reader, #743) saw one left open.
 * A numeric picture's own brackets (`@N(10.2)`, negative in brackets) stay part of it.
 */
function lineTokens(control: string): string[] {
    const src = `W WINDOW,AT(0,0,1,1)\n       ${control}\n END`;
    return new ClarionTokenizer(src).tokenize().filter(t => t.line === 1).map(t => t.value);
}
function picture(control: string): string | undefined {
    const src = `W WINDOW,AT(0,0,1,1)\n       ${control}\n END`;
    return new ClarionTokenizer(src).tokenize().find(t => t.line === 1 && t.type === TokenType.PictureFormat)?.value;
}

suite('Numeric picture keeps the control\'s closing bracket (#744)', () => {
    test('ENTRY(@n5) and SPIN(@n_5): the picture ends before the bracket', () => {
        assert.deepStrictEqual(lineTokens('ENTRY(@n5),USE(?A)').slice(0, 5), ['ENTRY', '(', '@n5', ')', ',']);
        assert.deepStrictEqual(lineTokens('SPIN(@n_5),RANGE(1,9)').slice(0, 5), ['SPIN', '(', '@n_5', ')', ',']);
        assert.strictEqual(picture('ENTRY(@N-9.2B),USE(?A)'), '@N-9.2B');
        assert.strictEqual(picture('ENTRY(@E12.2),USE(?A)'), '@E12.2');
    });

    test('a picture\'s own brackets stay in it: negative in brackets, with or without currency', () => {
        assert.deepStrictEqual(lineTokens('ENTRY(@N(10.2)),USE(?A)').slice(0, 5), ['ENTRY', '(', '@N(10.2)', ')', ',']);
        assert.strictEqual(picture('ENTRY(@N$(11.2)),USE(?A)'), '@N$(11.2)');
    });

    test('a picture outside brackets is unchanged', () => {
        assert.strictEqual(picture("ENTRY(@s20),USE(?A)"), '@s20');
        const decl = new ClarionTokenizer('Amount DECIMAL(9,2)\nTotal  STRING(@N$12.2)\n').tokenize();
        assert.ok(decl.some(t => t.value === '@N$12.2' || t.value === 'STRING(@N$12.2)'), decl.map(t => t.value).join(' '));
    });
});
