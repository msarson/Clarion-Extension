import * as assert from 'assert';
import { HoverFormatter } from '../providers/hover/HoverFormatter';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { TokenCache } from '../TokenCache';

/**
 * `locationLink` renders a hover footer location as a clickable markdown link
 * (`[name:line](file:///...#Lline)`) instead of plain text. Pins the link shape across the
 * input forms callers actually pass it: a plain OS path, a path containing a space, an
 * already-formed `file://` URI, and a non-file scheme (which must fall back to plain text
 * unchanged, since `test://` fixture URIs and similar aren't openable).
 *
 * #691 — every link is written in the canonical form (#251: lower-case drive, encoded colon,
 * `file:///d%3A/...`), whatever form the location arrived in. #389 left a plain path's drive
 * unescaped (`file:///d:/`) to match the other half of a footer, which then came from
 * hand-built `file:///D:/` locations; since #251 those are canonical, so the unescaped form had
 * become the odd one out and one footer linked the same drive two ways.
 */
suite('HoverFormatter.locationLink', () => {
    const formatter = new HoverFormatter(new ScopeAnalyzer(TokenCache.getInstance(), undefined as never));

    test('plain Windows path with a drive letter renders as a canonical link', () => {
        const link = formatter.locationLink('d:\\proj\\demo.clw', 2);
        assert.strictEqual(link, '[demo.clw:3](file:///d%3A/proj/demo.clw#L3)');
    });

    test('path containing a space is percent-encoded in the URI but not in the label', () => {
        const link = formatter.locationLink('d:\\src dir\\demo.clw', 0);
        assert.strictEqual(link, '[demo.clw:1](file:///d%3A/src%20dir/demo.clw#L1)');
    });

    test('bug-pin (#691): an already-formed file:// URI in another spelling is made canonical', () => {
        assert.strictEqual(formatter.locationLink('file:///D:/proj/Foo.clw', 4), '[Foo.clw:5](file:///d%3A/proj/Foo.clw#L5)');
        assert.strictEqual(formatter.locationLink('file:///d:/src%20dir/Foo.clw', 4), '[Foo.clw:5](file:///d%3A/src%20dir/Foo.clw#L5)');
    });

    test('a canonical URI is unchanged', () => {
        assert.strictEqual(formatter.locationLink('file:///d%3A/src%20dir/Foo.clw', 4), '[Foo.clw:5](file:///d%3A/src%20dir/Foo.clw#L5)');
    });

    test('a non-file scheme (e.g. test:// fixtures) falls back to plain text, unchanged', () => {
        const link = formatter.locationLink('test://fixture/demo.clw', 6);
        assert.strictEqual(link, 'demo.clw:7');
    });

    test('bug-pin (#691): the two halves of a footer match whatever form each arrived in', () => {
        const declLink = formatter.locationLink('d:\\proj\\demo.inc', 1);
        const implLink = formatter.locationLink('file:///d%3A/proj/demo.clw', 39);
        assert.strictEqual(
            `${declLink} → ${implLink}`,
            '[demo.inc:2](file:///d%3A/proj/demo.inc#L2) → [demo.clw:40](file:///d%3A/proj/demo.clw#L40)'
        );
    });
});
