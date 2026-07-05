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
});
