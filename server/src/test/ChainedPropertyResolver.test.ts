/**
 * Tests for ChainedPropertyResolver
 * Verifies chained dot-notation access like SELF.Order.MainKey
 * where intermediate segments are CLASS, QUEUE, or GROUP type references.
 */

import * as assert from 'assert';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';

// ─── extractClassName helper tests ───────────────────────────────────────────

suite('ClassMemberResolver.extractClassName', () => {

    test('strips & reference prefix', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('&SortOrder'), 'SortOrder');
    });

    test('strips & and trailing attributes', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('&SortOrder,PROTECTED'), 'SortOrder');
    });

    test('strips attributes without &', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('SortOrder,DIM(10)'), 'SortOrder');
    });

    test('strips DIM() without comma', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('MyQueue(BaseQueue)'), 'MyQueue');
    });

    test('returns null for PROCEDURE', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('PROCEDURE'), null);
    });

    test('returns null for PROCEDURE with params', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('PROCEDURE(STRING,LONG)'), null);
    });

    test('returns null for STRING primitive', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('STRING(20)'), null);
    });

    test('returns null for LONG', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('LONG'), null);
    });

    test('returns null for SHORT', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('SHORT'), null);
    });

    test('returns null for BYTE', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('BYTE'), null);
    });

    test('returns null for QUEUE keyword alone (not a named queue type)', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('QUEUE'), null);
    });

    test('returns null for GROUP keyword alone', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('GROUP'), null);
    });

    test('returns null for empty string', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName(''), null);
    });

    test('returns null for Unknown', () => {
        // "Unknown" is the sentinel value used when type cannot be determined
        // It's not a real class name but also not a primitive - it should pass through
        // as the chain resolver will fail to find it in the index anyway
        assert.notStrictEqual(ClassMemberResolver.extractClassName('Unknown'), null);
    });

    test('preserves case of class name', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('&BufferedPairsClass,PRIVATE'), 'BufferedPairsClass');
    });

    test('handles whitespace around &', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('  &SortOrder  '), 'SortOrder');
    });

    test('LIKE(TypeName) — returns the referenced type name', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('LIKE(WindowPositionGroup)'), 'WindowPositionGroup');
    });

    test('LIKE(TypeName) with trailing attributes', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('LIKE(WindowPositionGroup),PRIVATE'), 'WindowPositionGroup');
    });

    test('LIKE(PREFIX:TypeName) — supports colon-qualified names', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('LIKE(PYA:RECORD)'), 'PYA:RECORD');
    });

    test('LIKE alone (no parens) — returns null', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('LIKE'), null);
    });

    test('GROUP(TypeName) — returns the referenced type name', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('GROUP(ConnectionSettingsType)'), 'ConnectionSettingsType');
    });

    test('GROUP(TypeName) with trailing " END" (verbatim scanned declaration text) — real repro shape', () => {
        // scanClassBodyForMember captures the whole line after the label, e.g.
        // "Settings GROUP(ConnectionSettingsType) END" -> typeStr is
        // "GROUP(ConnectionSettingsType) END", not just the paren part.
        assert.strictEqual(ClassMemberResolver.extractClassName('GROUP(ConnectionSettingsType) END'), 'ConnectionSettingsType');
    });

    test('QUEUE(TypeName) — returns the referenced type name', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('QUEUE(BaseQueueType)'), 'BaseQueueType');
    });

    test('RECORD(TypeName) — returns the referenced type name', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('RECORD(SomeRecordType)'), 'SomeRecordType');
    });

    test('GROUP(TypeName) with trailing attributes after the paren', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('GROUP(FooType),DIM(2)'), 'FooType');
    });

    test('GROUP keyword alone still returns null (unaffected by GROUP(TypeName) handling)', () => {
        assert.strictEqual(ClassMemberResolver.extractClassName('GROUP'), null);
    });
});
