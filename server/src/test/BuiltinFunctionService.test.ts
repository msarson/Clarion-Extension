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

    test('getBuiltinCount returns non-negative number', () => {
        const count = service.getBuiltinCount();
        strictEqual(count >= 0, true, 'Count should be non-negative');
    });
});
