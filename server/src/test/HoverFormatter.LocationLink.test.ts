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
 */
suite('HoverFormatter.locationLink', () => {
    const formatter = new HoverFormatter(new ScopeAnalyzer(TokenCache.getInstance(), undefined as never));

    test('plain Windows path with a drive letter renders as a clickable link, drive letter unescaped', () => {
        const link = formatter.locationLink('d:\\proj\\demo.clw', 2);
        assert.strictEqual(link, '[demo.clw:3](file:///d:/proj/demo.clw#L3)');
    });

    test('path containing a space is percent-encoded in the URI but not in the label', () => {
        const link = formatter.locationLink('d:\\src dir\\demo.clw', 0);
        assert.strictEqual(link, '[demo.clw:1](file:///d:/src%20dir/demo.clw#L1)');
    });

    test('an already-formed file:// URI is passed through untouched', () => {
        const link = formatter.locationLink('file:///D:/proj/Foo.clw', 4);
        assert.strictEqual(link, '[Foo.clw:5](file:///D:/proj/Foo.clw#L5)');
    });

    test('a non-file scheme (e.g. test:// fixtures) falls back to plain text, unchanged', () => {
        const link = formatter.locationLink('test://fixture/demo.clw', 6);
        assert.strictEqual(link, 'demo.clw:7');
    });

    test('two locations in a decl -> impl footer link independently', () => {
        const declLink = formatter.locationLink('d:\\proj\\demo.inc', 1);
        const implLink = formatter.locationLink('d:\\proj\\demo.clw', 39);
        const footer = `${declLink} → ${implLink}`;
        assert.strictEqual(
            footer,
            '[demo.inc:2](file:///d:/proj/demo.inc#L2) → [demo.clw:40](file:///d:/proj/demo.clw#L40)'
        );
    });
});
