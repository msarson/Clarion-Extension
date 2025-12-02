import { describe, it, before} from 'mocha';
import * as assert from 'assert';
import { ClarionDocumentSymbolProvider } from '../providers/ClarionDocumentSymbolProvider';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { setServerInitialized } from '../serverState';

describe('ClarionDocumentSymbolProvider - Method Implementations', () => {
    let provider: ClarionDocumentSymbolProvider;

    before(() => {
        setServerInitialized(true);
    });

    it('Should organize method implementations under class hierarchy', () => {
        const source = `
  MEMBER

StringTheory._GetNextBufferSize PROCEDURE(long pLen)
LocalVar  LONG
  CODE
    LocalVar = pLen * 2
    RETURN LocalVar

StringTheory._EqualsUnicode PROCEDURE(string str)
str2  STRING(100)
  CODE
    str2 = CLIP(str)
    RETURN str2

StringTheory._Equals PROCEDURE(long ln)
result  BYTE
  CODE
    result = 1
    RETURN result
`;

        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');

        // Should have ONE top-level class implementation container
        const classContainers = symbols.filter(s => s.name.includes('StringTheory') && s.name.includes('Implementation'));
        assert.strictEqual(classContainers.length, 1, 'Should have exactly one StringTheory (Implementation) container');

        const classContainer = classContainers[0];

        // Should have a Methods container
        const methodsContainer = classContainer.children?.find(c => c.name === 'Methods');
        assert.ok(methodsContainer, 'Should have a Methods container');

        // Should have 3 methods
        assert.strictEqual(methodsContainer.children?.length, 3, 'Should have 3 method implementations');

        // Check first method
        const method1 = methodsContainer.children![0];
        assert.ok(method1.name.includes('_GetNextBufferSize'), 'First method should be _GetNextBufferSize');
        assert.strictEqual(method1.children?.length, 1, '_GetNextBufferSize should have 1 local variable');
        assert.ok(method1.children![0].name.includes('LocalVar'), 'Should have LocalVar variable');

        // Check second method
        const method2 = methodsContainer.children![1];
        assert.ok(method2.name.includes('_EqualsUnicode'), 'Second method should be _EqualsUnicode');
        assert.strictEqual(method2.children?.length, 1, '_EqualsUnicode should have 1 local variable');
        assert.ok(method2.children![0].name.includes('str2'), 'Should have str2 variable');

        // Check third method
        const method3 = methodsContainer.children![2];
        assert.ok(method3.name.includes('_Equals'), 'Third method should be _Equals');
        assert.strictEqual(method3.children?.length, 1, '_Equals should have 1 local variable');
        assert.ok(method3.children![0].name.includes('result'), 'Should have result variable');
    });

    it('Should NOT show items from CODE section in structure', () => {
        const source = `
  MEMBER

StringTheory._Test PROCEDURE()
LocalVar  LONG
  CODE
    LocalVar = CLIP('test')
    len = LEN(LocalVar)
    RETURN LocalVar
`;

        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');

        console.log('\n=== ALL SYMBOLS ===');
        for (const symbol of symbols) {
            console.log(`Symbol: ${symbol.name}, kind: ${symbol.kind}, children: ${symbol.children?.length || 0}`);
            if (symbol.children) {
                for (const child of symbol.children) {
                    console.log(`  Child: ${child.name}, kind: ${child.kind}, children: ${child.children?.length || 0}`);
                    if (child.children) {
                        for (const grandchild of child.children) {
                            console.log(`    Grandchild: ${grandchild.name}`);
                        }
                    }
                }
            }
        }

        // Find the method
        const classContainer = symbols.find(s => s.name.includes('StringTheory'));
        assert.ok(classContainer, 'Should have StringTheory container');

        const methodsContainer = classContainer.children?.find(c => c.name === 'Methods');
        assert.ok(methodsContainer, 'Should have Methods container');

        const method = methodsContainer.children![0];
        
        // Should only have 1 child (LocalVar), not CLIP, len, etc.
        assert.strictEqual(method.children?.length, 1, 'Method should only have LocalVar, not code execution items');
        assert.ok(method.children![0].name.includes('LocalVar'), 'Should only have LocalVar');
    });

    it('Should handle multiple global procedures correctly', () => {
        const source = `
  PROGRAM

GlobalVar  LONG

  CODE
    RETURN

MyProc1 PROCEDURE
LocalVar1  LONG
  CODE
    LocalVar1 = 1
    RETURN

MyProc2 PROCEDURE
LocalVar2  LONG
  CODE
    LocalVar2 = 2
    RETURN
`;

        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        provider = new ClarionDocumentSymbolProvider();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://test.clw');

        // Should have 2 procedures at top level (plus PROGRAM container)
        const procedures = symbols.filter(s => s.name.includes('MyProc'));
        assert.strictEqual(procedures.length, 2, 'Should have 2 procedures');

        // First procedure should have its own local variable
        const proc1 = procedures.find(p => p.name.includes('MyProc1'));
        assert.ok(proc1, 'Should have MyProc1');
        assert.strictEqual(proc1.children?.length, 1, 'MyProc1 should have 1 local variable');
        assert.ok(proc1.children![0].name.includes('LocalVar1'), 'MyProc1 should have LocalVar1');

        // Second procedure should have its own local variable (not inherit from first)
        const proc2 = procedures.find(p => p.name.includes('MyProc2'));
        assert.ok(proc2, 'Should have MyProc2');
        assert.strictEqual(proc2.children?.length, 1, 'MyProc2 should have 1 local variable');
        assert.ok(proc2.children![0].name.includes('LocalVar2'), 'MyProc2 should have LocalVar2');

        // Verify LocalVar1 is NOT in MyProc2
        const hasLocalVar1InProc2 = proc2.children?.some(c => c.name.includes('LocalVar1'));
        assert.strictEqual(hasLocalVar1InProc2, false, 'MyProc2 should NOT have LocalVar1');
    });
});
