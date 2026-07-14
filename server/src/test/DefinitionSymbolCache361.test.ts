import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { bumpCrossFileEpoch } from '../utils/crossFileEpoch';

/**
 * #360/#361 — F12 (findSymbolDefinition) on a symbol in a big PROGRAM file walked
 * findSymbol's tier cascade for ~15s cold. The result is now cached per
 * (uri, word, line) and invalidated by the cross-file epoch, so a repeat F12 on
 * the same call site is instant. This pins the cache wrapper contract by counting
 * calls to the (replaced) uncached implementation.
 */
suite('DefinitionProvider - findSymbolDefinition result cache (#361)', () => {

    function makeDoc(): TextDocument {
        return TextDocument.create('file:///c:/tmp/host.clw', 'clarion', 1, '  PROGRAM\n  CODE\n  Foo()\n');
    }

    test('repeat F12 on the same call site is served from cache; epoch bump re-runs', async () => {
        const provider = new DefinitionProvider();
        let calls = 0;
        // Replace the heavy uncached walk with a counter (instance-scoped — no
        // shared-singleton leak; a fresh provider per test).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (provider as any).findSymbolDefinitionUncached = async () => { calls++; return null; };

        const doc = makeDoc();
        const pos = { line: 2, character: 2 };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const find = (provider as any).findSymbolDefinition.bind(provider);

        bumpCrossFileEpoch(); // clean epoch for this provider's cache
        await find('Foo', doc, pos);
        await find('Foo', doc, pos);
        assert.strictEqual(calls, 1, 'second identical call must be served from the cache');

        // A different line is a different call site → its own entry.
        await find('Foo', doc, { line: 5, character: 2 });
        assert.strictEqual(calls, 2, 'a different call site computes its own result');

        // Epoch bump (the #340 watcher / #355 drift path) invalidates everything.
        bumpCrossFileEpoch();
        await find('Foo', doc, pos);
        assert.strictEqual(calls, 3, 'an epoch bump must invalidate the cache and re-run');
    });
});
