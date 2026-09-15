import { strictEqual, deepStrictEqual } from 'assert';
import { BuiltinFunctionService } from '../utils/BuiltinFunctionService';

/**
 * Tests for BuiltinFunctionService
 * Verifies that the service loads and queries built-in function definitions correctly
 */
suite('BuiltinFunctionService', () => {
    const service = BuiltinFunctionService.getInstance();

    test('getInstance returns same instance (singleton)', () => {
        const instance1 = BuiltinFunctionService.getInstance();
        const instance2 = BuiltinFunctionService.getInstance();
        strictEqual(instance1, instance2, 'Should return same instance');
    });

    test('loads without errors', () => {
        // If we got here, the service loaded successfully
        strictEqual(typeof service.getBuiltinCount(), 'number', 'Should return function count');
    });

    test('isBuiltin returns false for unknown function', () => {
        strictEqual(service.isBuiltin('NOTAREALFUNCTION'), false, 'Unknown function should return false');
    });

    test('getSignatures returns empty array for unknown function', () => {
        const signatures = service.getSignatures('NOTAREALFUNCTION');
        strictEqual(signatures.length, 0, 'Unknown function should return empty array');
    });

    test('getAllBuiltinNames returns array', () => {
        const names = service.getAllBuiltinNames();
        strictEqual(Array.isArray(names), true, 'Should return an array');
    });

    test('getSignatures does not throw for builtins whose signature has no params (e.g. RUN, SEND, CHOICE)', () => {
        // ~60 builtins store their (empty) params under a `parameters` key rather than `params`,
        // so `sig.params` is undefined. getSignatures must not crash mapping over it — this
        // previously threw "Cannot read properties of undefined (reading 'map')" and took down
        // signature help / inlay hints on any file calling one of them.
        for (const name of ['RUN', 'SEND', 'CHOICE', 'EMPTY', 'HALT', 'COMMIT']) {
            const sigs = service.getSignatures(name);
            strictEqual(Array.isArray(sigs), true, `${name} should return an array without throwing`);
        }
    });

    test('getBuiltinCount returns non-negative number', () => {
        const count = service.getBuiltinCount();
        strictEqual(count >= 0, true, 'Count should be non-negative');
    });

    // #519 — built-in functions the help documents (Language Reference ch.13) that
    // were absent from clarion-builtins.json until #519. Guards against a data
    // change silently dropping them (they would then read as unknown to completion,
    // hover, and the #517 unresolved-call check).
    test('#519 — the added built-in functions are recognised', () => {
        // PRAGMA is intentionally NOT here — issue #77 keeps it out of builtins.json
        // (it is a directive, handled elsewhere), and a test guards that.
        for (const name of [
            'COMPRESS', 'DEBUGHOOK', 'DECOMPRESS', 'HTTPWEBREQUEST', 'HTTPWEBREQUESTTOFILE',
            'IMAGEROTATEFLIP', 'IMAGETOPNG', 'PRINTERDIALOGA', 'SETLAYOUT',
            'QUOTE', 'UNQUOTE', 'WHERE',
        ]) {
            strictEqual(service.isBuiltin(name), true, `${name} should be a recognised built-in`);
            strictEqual(service.isBuiltin(name.toLowerCase()), true, `${name} should match case-insensitively`);
        }
    });
    // #521 — the help documents REGISTER and UNREGISTER with the note "Can also be
    // prototyped as REGISTEREVENT" / "UNREGISTEREVENT". The grammar highlighted both
    // alias names but the catalog only knew the short forms, so a call written with the
    // long name got no hover or signature help.
    test('#521 — the REGISTEREVENT and UNREGISTEREVENT alias names are recognised', () => {
        for (const [alias, base] of [['REGISTEREVENT', 'REGISTER'], ['UNREGISTEREVENT', 'UNREGISTER']]) {
            strictEqual(service.isBuiltin(alias), true, `${alias} should be a recognised built-in`);
            strictEqual(service.isBuiltin(alias.toLowerCase()), true, `${alias} should match case-insensitively`);
            deepStrictEqual(service.getSignatures(alias).map(s => (s.parameters ?? []).length),
                service.getSignatures(base).map(s => (s.parameters ?? []).length),
                `${alias} should carry the same parameter list as ${base}`);
        }
    });
});
