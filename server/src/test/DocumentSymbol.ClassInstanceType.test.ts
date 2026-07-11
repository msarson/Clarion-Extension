import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ClarionDocumentSymbolProvider } from '../providers/ClarionDocumentSymbolProvider';
import { setServerInitialized } from '../serverState';

/**
 * #302 — hover showed "udpt — STRING" for `udpt UltimateDebugProcedureTracker`
 * (a class-instance local). The symbol provider's type collector skips ALL
 * Variable/Label tokens (assuming they are the variable's own name), so a
 * user-declared type — which tokenizes as a plain identifier — collected
 * nothing, and the "no type found → default STRING" fallback invented STRING.
 * SymbolFinder prefers the symbol's _clarionType over its own extractTypeInfo,
 * so hover displayed the invention.
 */
suite('ClarionDocumentSymbolProvider — class-instance local types (#302)', () => {

    suiteSetup(() => setServerInitialized(true));

    function symbolsFor(code: string) {
        const uri = `file:///test-302-${Math.random().toString(36).slice(2)}.clw`;
        const doc = TextDocument.create(uri, 'clarion', 1, code);
        const tokens = TokenCache.getInstance().getTokens(doc);
        const provider = new ClarionDocumentSymbolProvider();
        return provider.provideDocumentSymbols(tokens, uri, doc);
    }

    function flatten(symbols: any[]): any[] {
        const out: any[] = [];
        const walk = (list: any[]) => {
            for (const s of list) {
                out.push(s);
                if (s.children?.length) walk(s.children);
            }
        };
        walk(symbols);
        return out;
    }

    test('a class-instance local carries its class name as the type, not STRING', () => {
        const code = [
            '  PROGRAM',
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
            '',
            'MyProc  PROCEDURE',
            'udpt            UltimateDebugProcedureTracker',   // class instance
            'counter         LONG',                             // built-in regression anchor
            'name            STRING(20)',                       // sized built-in regression anchor
            '  CODE',
            '  RETURN',
        ].join('\n');

        const all = flatten(symbolsFor(code));

        const udpt = all.find(s => s._clarionVarName?.toLowerCase() === 'udpt');
        assert.ok(udpt, 'expected a symbol for udpt; got: ' + JSON.stringify(all.map(s => s.name)));
        assert.strictEqual(udpt._clarionType, 'UltimateDebugProcedureTracker',
            `class-instance local must carry its class name as the type; got: "${udpt._clarionType}"`);

        const counter = all.find(s => s._clarionVarName?.toLowerCase() === 'counter');
        assert.ok(counter, 'expected a symbol for counter');
        assert.strictEqual(counter._clarionType.toUpperCase(), 'LONG',
            `built-in type regression: got "${counter._clarionType}"`);

        const name = all.find(s => s._clarionVarName?.toLowerCase() === 'name');
        assert.ok(name, 'expected a symbol for name');
        assert.strictEqual(name._clarionType.toUpperCase(), 'STRING(20)',
            `sized built-in regression: got "${name._clarionType}"`);
    });

    test('a class instance with attributes stops the type at the comma', () => {
        const code = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'thisStartup     ctStartup,External,DLL(dll_mode)',  // Mark's #300 shape
            '  CODE',
            '  RETURN',
        ].join('\n');

        const all = flatten(symbolsFor(code));
        const inst = all.find(s => s._clarionVarName?.toLowerCase() === 'thisstartup');
        assert.ok(inst, 'expected a symbol for thisStartup; got: ' + JSON.stringify(all.map(s => s.name)));
        assert.strictEqual(inst._clarionType, 'ctStartup',
            `attributed class instance must carry the class name only; got: "${inst._clarionType}"`);
    });
});
