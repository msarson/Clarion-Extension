/**
 * Tests for ChainedPropertyResolver
 * Verifies chained dot-notation access like SELF.Order.MainKey
 * where intermediate segments are CLASS, QUEUE, or GROUP type references.
 */

import * as assert from 'assert';
import { ClassMemberResolver } from '../utils/ClassMemberResolver';
import { ChainedPropertyResolver } from '../utils/ChainedPropertyResolver';

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

// --- extractChain helper tests -------------------------------------------------

/**
 * Mirrors the `isPureChain` gate applied by the hover and definition callers to
 * extractChain's result. A chain that fails this test is routed to the
 * single-segment fallback instead of the chained resolver.
 */
const isPureChain = (s: string): boolean =>
    /^[A-Za-z_][A-Za-z0-9_:]*(?:\.[A-Za-z_][A-Za-z0-9_:]*)*$/i.test(s.trim());

suite('ChainedPropertyResolver.extractChain', () => {

    test('SELF anchor — keeps only the rightmost SELF chain', () => {
        assert.strictEqual(ChainedPropertyResolver.extractChain('SELF.Order.X &= SELF.Primary'), 'SELF.Primary');
    });

    test('PARENT anchor — keeps only the rightmost PARENT chain', () => {
        assert.strictEqual(ChainedPropertyResolver.extractChain('x = PARENT.Owner'), 'PARENT.Owner');
    });

    test('bare chain with no statement context is returned unchanged', () => {
        assert.strictEqual(ChainedPropertyResolver.extractChain('Obj.Prop'), 'Obj.Prop');
    });

    test('assignment context is stripped from a non-SELF chain root', () => {
        // Regression: the whole prefix used to be returned, so the caller's
        // pure-chain gate rejected it and multi-segment access never resolved.
        assert.strictEqual(ChainedPropertyResolver.extractChain('rc = Obj.Prop'), 'Obj.Prop');
    });

    test('an extracted non-SELF chain satisfies the caller-side pure-chain gate', () => {
        const extracted = ChainedPropertyResolver.extractChain('rc = Obj.Prop');
        assert.ok(isPureChain(extracted), `expected a pure chain, got "${extracted}"`);
    });

    test('open-paren call context is stripped from a non-SELF chain root', () => {
        assert.strictEqual(ChainedPropertyResolver.extractChain('Foo(Obj.Prop'), 'Obj.Prop');
    });

    test('keyword context is stripped from a non-SELF chain root', () => {
        assert.strictEqual(ChainedPropertyResolver.extractChain('IF Obj.Prop'), 'Obj.Prop');
    });

    test('a colon-prefixed chain root survives extraction', () => {
        assert.strictEqual(ChainedPropertyResolver.extractChain('rc = PRE:Field.Prop'), 'PRE:Field.Prop');
    });

    test('deeper non-SELF chains keep every segment', () => {
        assert.strictEqual(ChainedPropertyResolver.extractChain('rc = Obj.Inner.Deeper'), 'Obj.Inner.Deeper');
    });

    test('a prefix not ending in an identifier is returned unchanged', () => {
        // Nothing sensible to extract — must not mangle it into a bogus chain.
        assert.strictEqual(ChainedPropertyResolver.extractChain('CLIP(a.b)'), 'CLIP(a.b)');
    });

    test('a single identifier with no dot is returned as-is', () => {
        assert.strictEqual(ChainedPropertyResolver.extractChain('rc = Obj'), 'Obj');
    });

    test('SELF anchor still wins over the trailing-chain fallback', () => {
        // The fallback must not shadow SELF handling when both could match.
        assert.strictEqual(ChainedPropertyResolver.extractChain('rc = SELF.Owner'), 'SELF.Owner');
    });
});
