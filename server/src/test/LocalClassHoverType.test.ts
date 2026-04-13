import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { ClarionDocumentSymbolProvider, ClarionDocumentSymbol } from '../providers/ClarionDocumentSymbolProvider';
import { SymbolKind } from 'vscode-languageserver-types';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';
import { setServerInitialized } from '../serverState';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Minimal code extracted from TestKanban001.clw to isolate the hover type issue
const KANBAN_CODE = `
   MEMBER('TestKanban.clw')

Main PROCEDURE

HelloWorld           CLASS
SayHello               PROCEDURE
                     END
ThisWindow           CLASS(WindowManager)
Init                   PROCEDURE(),BYTE,PROC,DERIVED
Kill                   PROCEDURE(),BYTE,PROC,DERIVED
                     END
Kanban               Class(KanbanWrapperClass)
Init                   PROCEDURE (LONG pCtrl),VIRTUAL
                     End
Resizer              CLASS(WindowResizeClass)
Init                   PROCEDURE(BYTE AppStrategy=AppStrategy:Resize)
                     END

  CODE
  GlobalResponse = ThisWindow.Run()

ThisWindow.Init PROCEDURE
ReturnValue          BYTE,AUTO
  CODE
  RETURN ReturnValue

ThisWindow.Kill PROCEDURE
ReturnValue          BYTE,AUTO
  CODE
  RETURN ReturnValue
`;

suite('Local CLASS declaration hover type', () => {
    setup(() => {
        setServerInitialized(true);
    });

    function findSymbolByName(symbols: ClarionDocumentSymbol[], name: string): ClarionDocumentSymbol | undefined {
        for (const sym of symbols) {
            if (sym.name === name || (sym as any)._clarionVarName === name) return sym;
            if (sym.children) {
                const found = findSymbolByName(sym.children, name);
                if (found) return found;
            }
        }
        return undefined;
    }

    function allSymbols(symbols: ClarionDocumentSymbol[]): ClarionDocumentSymbol[] {
        const result: ClarionDocumentSymbol[] = [];
        for (const sym of symbols) {
            result.push(sym);
            if (sym.children) result.push(...allSymbols(sym.children));
        }
        return result;
    }

    test('CLASS(WindowManager) _clarionType is not UNKNOWN', () => {
        const tokenizer = new ClarionTokenizer(KANBAN_CODE);
        const tokens = tokenizer.tokenize();

        const provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://TestKanban001.clw');

        const flat = allSymbols(symbols);
        const thisWindow = flat.find(s =>
            s.name === 'ThisWindow' ||
            (s as any)._clarionVarName === 'ThisWindow' ||
            /^CLASS\s*\(ThisWindow\)/i.test(s.name)
        );

        assert.ok(thisWindow, `Should find ThisWindow symbol (got names: ${flat.map(s => s.name).join(', ')})`);
        console.log(`\nThisWindow symbol: kind=${thisWindow.kind}, name="${thisWindow.name}", _clarionType="${(thisWindow as any)._clarionType}", _clarionVarName="${(thisWindow as any)._clarionVarName}"`);

        const clarionType = (thisWindow as any)._clarionType;
        const varName = (thisWindow as any)._clarionVarName;
        assert.strictEqual(varName, 'ThisWindow', `_clarionVarName should be 'ThisWindow'`);
        assert.strictEqual(clarionType, 'CLASS(WindowManager)', `_clarionType should be 'CLASS(WindowManager)' (got: '${clarionType}')`);
    });

    test('SymbolFinderService.findLocalVariable returns correct type for CLASS(WindowManager)', () => {
        const tokenizer = new ClarionTokenizer(KANBAN_CODE);
        const tokens = tokenizer.tokenize();

        const uri = 'test://TestKanban001.clw';
        const doc = TextDocument.create(uri, 'clarion', 1, KANBAN_CODE);

        const cache = TokenCache.getInstance();
        // Prime the cache by calling getTokens on the document
        cache.getTokens(doc);

        const scopeAnalyzer = new ScopeAnalyzer(cache, null);
        const finder = new SymbolFinderService(cache, scopeAnalyzer);

        // Find the scope token for 'Main PROCEDURE' (the outer procedure)
        const mainScope = tokens.find(t => t.label === 'Main' || t.value === 'Main');
        assert.ok(mainScope, 'Should find Main procedure token');

        const result = finder.findLocalVariable('ThisWindow', tokens, mainScope!, doc);

        console.log('\n=== SymbolFinderService result for ThisWindow ===');
        console.log(JSON.stringify(result, null, 2));

        assert.ok(result, 'findLocalVariable should find ThisWindow');
        assert.ok(result!.type, `result.type should be set (got: ${result!.type})`);
        assert.notStrictEqual(result!.type, 'UNKNOWN', `result.type should not be 'UNKNOWN' (got: '${result!.type}')`);
        assert.ok(
            result!.type.toUpperCase().includes('CLASS') || result!.type.includes('WindowManager'),
            `result.type should reference CLASS or WindowManager (got: '${result!.type}')`
        );
    });

    test('HelloWorld CLASS (no base class) has a valid type', () => {
        const tokenizer = new ClarionTokenizer(KANBAN_CODE);
        const tokens = tokenizer.tokenize();

        const provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://TestKanban001.clw');

        const flat = allSymbols(symbols);
        const helloWorld = flat.find(s =>
            s.name === 'HelloWorld' ||
            (s as any)._clarionVarName === 'HelloWorld' ||
            /^CLASS\s*\(HelloWorld\)/i.test(s.name)
        );

        assert.ok(helloWorld, `Should find HelloWorld symbol (got names: ${flat.map(s => s.name).join(', ')})`);
        console.log(`\nHelloWorld symbol: kind=${helloWorld.kind}, name="${helloWorld.name}", detail="${helloWorld.detail}"`);
        // HelloWorld CLASS has no base class so the name should be "CLASS (HelloWorld)"
        assert.ok(
            /CLASS/i.test(helloWorld.name),
            `HelloWorld symbol name should reference CLASS (got: '${helloWorld.name}')`
        );
    });
});
