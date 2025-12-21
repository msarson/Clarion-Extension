import { describe, it } from 'mocha';
import * as assert from 'assert';
import { SymbolElementRegistry } from '../helpers/SymbolElementRegistry';
import { DocumentSymbol, SymbolKind, Range, Position } from 'vscode-languageserver-protocol';

describe('SymbolElementRegistry', () => {
    
    function createSymbol(name: string, kind: SymbolKind, line: number, char: number = 0): DocumentSymbol {
        const pos = Position.create(line, char);
        return DocumentSymbol.create(
            name,
            undefined,
            kind,
            Range.create(pos, pos),
            Range.create(pos, pos)
        );
    }

    describe('getElementKey', () => {
        it('should generate unique keys for different symbols', () => {
            const registry = new SymbolElementRegistry();
            
            const symbol1 = createSymbol('MyProc', SymbolKind.Function, 5, 0);
            const symbol2 = createSymbol('MyProc', SymbolKind.Function, 10, 0);
            const symbol3 = createSymbol('MyClass', SymbolKind.Class, 5, 0);
            
            const key1 = registry.getElementKey(symbol1);
            const key2 = registry.getElementKey(symbol2);
            const key3 = registry.getElementKey(symbol3);
            
            assert.notStrictEqual(key1, key2, 'Same name at different lines should have different keys');
            assert.notStrictEqual(key1, key3, 'Different names at same line should have different keys');
        });

        it('should generate same key for same symbol', () => {
            const registry = new SymbolElementRegistry();
            const symbol = createSymbol('Test', SymbolKind.Function, 5, 10);
            
            const key1 = registry.getElementKey(symbol);
            const key2 = registry.getElementKey(symbol);
            
            assert.strictEqual(key1, key2, 'Same symbol should generate same key');
        });

        it('should include kind in key generation', () => {
            const registry = new SymbolElementRegistry();
            const pos = Position.create(5, 0);
            const range = Range.create(pos, pos);
            
            const funcSymbol = DocumentSymbol.create('Test', undefined, SymbolKind.Function, range, range);
            const classSymbol = DocumentSymbol.create('Test', undefined, SymbolKind.Class, range, range);
            
            const funcKey = registry.getElementKey(funcSymbol);
            const classKey = registry.getElementKey(classSymbol);
            
            assert.notStrictEqual(funcKey, classKey, 'Different kinds should generate different keys');
        });
    });

    describe('trackSymbol', () => {
        it('should track a symbol without parent', () => {
            const registry = new SymbolElementRegistry();
            const symbol = createSymbol('MyProc', SymbolKind.Function, 5);
            
            registry.trackSymbol(symbol);
            
            const key = registry.getElementKey(symbol);
            const tracked = registry.getTrackedSymbol(key);
            
            assert.strictEqual(tracked, symbol, 'Should retrieve tracked symbol');
        });

        it('should track a symbol with null parent', () => {
            const registry = new SymbolElementRegistry();
            const symbol = createSymbol('MyProc', SymbolKind.Function, 5);
            
            registry.trackSymbol(symbol, null);
            
            const key = registry.getElementKey(symbol);
            const parent = registry.getParent(key);
            
            assert.strictEqual(parent, null, 'Parent should be null');
        });

        it('should track a symbol with parent relationship', () => {
            const registry = new SymbolElementRegistry();
            const parentSymbol = createSymbol('MyClass', SymbolKind.Class, 1);
            const childSymbol = createSymbol('MyMethod', SymbolKind.Method, 5);
            
            registry.trackSymbol(parentSymbol, null);
            registry.trackSymbol(childSymbol, parentSymbol);
            
            const childKey = registry.getElementKey(childSymbol);
            const retrievedParent = registry.getParent(childKey);
            
            assert.strictEqual(retrievedParent, parentSymbol, 'Should retrieve correct parent');
        });

        it('should not track parent if not provided', () => {
            const registry = new SymbolElementRegistry();
            const symbol = createSymbol('MyProc', SymbolKind.Function, 5);
            
            registry.trackSymbol(symbol); // no parent argument
            
            const key = registry.getElementKey(symbol);
            const parent = registry.getParent(key);
            
            assert.strictEqual(parent, undefined, 'Parent should be undefined when not tracked');
        });
    });

    describe('trackHierarchy', () => {
        it('should track flat list with null parent', () => {
            const registry = new SymbolElementRegistry();
            const symbols = [
                createSymbol('Proc1', SymbolKind.Function, 1),
                createSymbol('Proc2', SymbolKind.Function, 10),
                createSymbol('Proc3', SymbolKind.Function, 20)
            ];
            
            registry.trackHierarchy(symbols, null);
            
            symbols.forEach(symbol => {
                const key = registry.getElementKey(symbol);
                assert.strictEqual(registry.getTrackedSymbol(key), symbol, 'Symbol should be tracked');
                assert.strictEqual(registry.getParent(key), null, 'Parent should be null');
            });
        });

        it('should recursively track children', () => {
            const registry = new SymbolElementRegistry();
            
            const grandchild = createSymbol('Field', SymbolKind.Field, 15);
            const child = createSymbol('Method', SymbolKind.Method, 10);
            child.children = [grandchild];
            
            const parent = createSymbol('Class', SymbolKind.Class, 5);
            parent.children = [child];
            
            registry.trackHierarchy([parent], null);
            
            // Check parent
            const parentKey = registry.getElementKey(parent);
            assert.strictEqual(registry.getParent(parentKey), null);
            
            // Check child
            const childKey = registry.getElementKey(child);
            assert.strictEqual(registry.getParent(childKey), parent);
            
            // Check grandchild
            const grandchildKey = registry.getElementKey(grandchild);
            assert.strictEqual(registry.getParent(grandchildKey), child);
        });
    });

    describe('visibility tracking', () => {
        it('should track visibility state', () => {
            const registry = new SymbolElementRegistry();
            const symbol = createSymbol('MyProc', SymbolKind.Function, 5);
            const key = registry.getElementKey(symbol);
            
            assert.strictEqual(registry.isVisible(key), undefined, 'Initially undefined');
            
            registry.setVisible(key, true);
            assert.strictEqual(registry.isVisible(key), true, 'Should be visible');
            
            registry.setVisible(key, false);
            assert.strictEqual(registry.isVisible(key), false, 'Should be hidden');
        });
    });

    describe('clear', () => {
        it('should clear all tracked data', () => {
            const registry = new SymbolElementRegistry();
            const symbol = createSymbol('MyProc', SymbolKind.Function, 5);
            
            registry.trackSymbol(symbol, null);
            const key = registry.getElementKey(symbol);
            registry.setVisible(key, true);
            
            assert.ok(registry.getTrackedSymbol(key), 'Symbol should be tracked');
            assert.ok(registry.getParent(key) !== undefined, 'Parent should be tracked');
            assert.ok(registry.isVisible(key) !== undefined, 'Visibility should be tracked');
            
            registry.clear();
            
            assert.strictEqual(registry.getTrackedSymbol(key), undefined, 'Symbol should be cleared');
            assert.strictEqual(registry.getParent(key), undefined, 'Parent should be cleared');
            assert.strictEqual(registry.isVisible(key), undefined, 'Visibility should be cleared');
        });
    });

    describe('getAllKeys', () => {
        it('should return empty array initially', () => {
            const registry = new SymbolElementRegistry();
            assert.strictEqual(registry.getAllKeys().length, 0);
        });

        it('should return all tracked symbol keys', () => {
            const registry = new SymbolElementRegistry();
            const symbols = [
                createSymbol('A', SymbolKind.Function, 1),
                createSymbol('B', SymbolKind.Function, 2),
                createSymbol('C', SymbolKind.Function, 3)
            ];
            
            symbols.forEach(s => registry.trackSymbol(s));
            
            const keys = registry.getAllKeys();
            assert.strictEqual(keys.length, 3, 'Should have 3 keys');
            
            symbols.forEach(symbol => {
                const key = registry.getElementKey(symbol);
                assert.ok(keys.includes(key), `Should include key for ${symbol.name}`);
            });
        });
    });

    describe('container node navigation rules', () => {
        it('should handle Methods container correctly', () => {
            const registry = new SymbolElementRegistry();
            
            // Methods container (organizational node)
            const methodsContainer = createSymbol('Methods', SymbolKind.Namespace, 5);
            
            // Actual method implementations
            const method1 = createSymbol('Init', SymbolKind.Method, 10);
            const method2 = createSymbol('Kill', SymbolKind.Method, 20);
            
            methodsContainer.children = [method1, method2];
            
            registry.trackHierarchy([methodsContainer], null);
            
            // Verify container is tracked
            const containerKey = registry.getElementKey(methodsContainer);
            assert.ok(registry.getTrackedSymbol(containerKey), 'Container should be tracked');
            
            // Verify methods have container as parent
            const method1Key = registry.getElementKey(method1);
            assert.strictEqual(registry.getParent(method1Key), methodsContainer);
        });
    });
});
