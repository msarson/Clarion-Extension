import * as assert from 'assert';
import { pathToCanonicalUri } from '../utils/UriUtils';

/**
 * Tests for the URI canonicalisation helper introduced for task `5b42b29b`.
 * VS Code's canonical URI form on Windows is `file:///<drive>%3A/...` with a
 * lowercase drive letter; the helper exists so server-side construction sites
 * agree with that form and don't duplicate `TokenCache` entries.
 */
suite('UriUtils — pathToCanonicalUri', () => {

    test('Windows path with uppercase drive letter — encodes colon, lowercases drive', () => {
        assert.strictEqual(
            pathToCanonicalUri('C:\\Users\\msars\\Foo.clw'),
            'file:///c%3A/Users/msars/Foo.clw'
        );
    });

    test('Windows path with lowercase drive letter — encodes colon, drive stays lower', () => {
        assert.strictEqual(
            pathToCanonicalUri('f:\\Playground\\SimpleNewSln\\OtherModule.clw'),
            'file:///f%3A/Playground/SimpleNewSln/OtherModule.clw'
        );
    });

    test('Windows path with forward slashes already — encodes colon, normalises drive', () => {
        assert.strictEqual(
            pathToCanonicalUri('D:/projects/repo/file.clw'),
            'file:///d%3A/projects/repo/file.clw'
        );
    });

    test('POSIX absolute path — prepends file:/// only, no drive encoding', () => {
        assert.strictEqual(
            pathToCanonicalUri('/home/user/code/file.clw'),
            'file:////home/user/code/file.clw'
        );
    });

    test('bare filename (no path, no drive) — file:/// prefix only, no encoding', () => {
        // Defensive: bare filenames should NOT reach this helper after the
        // d2fadc09 fix, but if they do the helper is idempotent and minimal.
        assert.strictEqual(
            pathToCanonicalUri('Foo.clw'),
            'file:///Foo.clw'
        );
    });

    test('idempotent on Windows', () => {
        const once = pathToCanonicalUri('C:\\foo\\bar.clw');
        // Strip the file:/// prefix and feed it back through. The helper
        // doesn't recognise URI inputs explicitly — but applied to its own
        // OUTPUT-as-path-string it should preserve the canonical form.
        const stripped = once.replace(/^file:\/\/\//, '').replace(/%3A/, ':');
        const twice = pathToCanonicalUri(stripped);
        assert.strictEqual(twice, once,
            `helper not idempotent: first=${once}, second=${twice}`);
    });

    test('matches VS Code canonical form for the f:\\Playground\\SimpleNewSln\\SimpleNewSln.clw repro path', () => {
        // The exact path that surfaced d2fadc09 / 5b42b29b in Mark's repro.
        // VS Code's TextDocument layer keys this file as
        // `file:///f%3A/Playground/SimpleNewSln/SimpleNewSln.clw`.
        const repro = 'f:\\Playground\\SimpleNewSln\\SimpleNewSln.clw';
        assert.strictEqual(
            pathToCanonicalUri(repro),
            'file:///f%3A/Playground/SimpleNewSln/SimpleNewSln.clw'
        );
    });
});
