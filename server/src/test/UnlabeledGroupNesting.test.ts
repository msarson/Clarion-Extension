import * as assert from 'assert';
import { ClarionDocumentSymbolProvider } from '../providers/ClarionDocumentSymbolProvider';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { SymbolKind } from 'vscode-languageserver';
import { setServerInitialized } from '../serverState';

suite('Unlabeled GROUP Nesting', () => {
    let provider: ClarionDocumentSymbolProvider;

    setup(() => {
        setServerInitialized(true);
        provider = new ClarionDocumentSymbolProvider();
    });

    test('should correctly nest fields under unlabeled GROUP structure', () => {
        const source = `  PROGRAM

StringTheory.Base64Decode Procedure(*string pText, *long pLen) !, bool
bits        long
            group,over(bits),pre()
triplet1      string(1)
triplet2      string(1)
triplet3      string(1)
            end
x           long, auto
a           long
b           long
z           long(1)
y           long
sz          long, auto
  CODE
`;

        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://unlabeled-group.clw');

        // Find the Base64Decode method
        const classImpl = symbols.find(s => s.name.includes('StringTheory'));
        assert.ok(classImpl, 'Should find StringTheory class implementation');

        const methodsContainer = classImpl!.children!.find(c => c.name === 'Methods');
        assert.ok(methodsContainer, 'Should find Methods container');

        const method = methodsContainer!.children!.find(c => c.name.includes('Base64Decode'));
        assert.ok(method, 'Should find Base64Decode method');

        // Find the unlabeled GROUP
        const group = method!.children!.find(c => c.name.includes('GROUP,OVER(bits)'));
        assert.ok(group, 'Should find unlabeled GROUP,OVER(bits)');
        assert.strictEqual(group!.kind, SymbolKind.Struct, 'GROUP should be a Struct');

        // Verify the GROUP has exactly 3 children (triplet1, triplet2, triplet3)
        assert.strictEqual(group!.children!.length, 3, 'GROUP should have 3 children');

        const triplet1 = group!.children!.find(c => c.name === 'triplet1');
        const triplet2 = group!.children!.find(c => c.name === 'triplet2');
        const triplet3 = group!.children!.find(c => c.name === 'triplet3');

        assert.ok(triplet1, 'triplet1 should be a child of GROUP');
        assert.ok(triplet2, 'triplet2 should be a child of GROUP');
        assert.ok(triplet3, 'triplet3 should be a child of GROUP');

        // Verify types
        assert.strictEqual(triplet1!.detail, 'in GROUP,OVER(bits)', 'triplet1 should show it is in GROUP');
        assert.strictEqual(triplet2!.detail, 'in GROUP,OVER(bits)', 'triplet2 should show it is in GROUP');
        assert.strictEqual(triplet3!.detail, 'in GROUP,OVER(bits)', 'triplet3 should show it is in GROUP');

        // Verify that variables AFTER the END are NOT children of the GROUP
        const methodChildren = method!.children!;
        const xVariable = methodChildren.find(c => c.name === 'x');
        const aVariable = methodChildren.find(c => c.name === 'a');

        assert.ok(xVariable, 'x variable should exist as method child');
        assert.ok(aVariable, 'a variable should exist as method child');

        // Make sure x and a are NOT children of the group
        const groupChildNames = group!.children!.map(c => c.name);
        assert.ok(!groupChildNames.includes('x'), 'x should NOT be a child of GROUP');
        assert.ok(!groupChildNames.includes('a'), 'a should NOT be a child of GROUP');
    });

    test('should handle multiple unlabeled GROUPs in the same method', () => {
        const source = `  PROGRAM

Test Procedure()
            group,pre(g1_)
field1        long
field2        long
            end
            group,pre(g2_)
field3        long
field4        long
            end
  CODE
`;

        const tokenizer = new ClarionTokenizer(source);
        const tokens = tokenizer.tokenize();
        const symbols = provider.provideDocumentSymbols(tokens, 'test://multiple-groups.clw');

        // Find the Test procedure
        const testProc = symbols.find(s => s.name.includes('Test'));
        assert.ok(testProc, 'Should find Test procedure');

        // Find both groups
        const group1 = testProc!.children!.find(c => c.name.includes('PRE(g1_)'));
        const group2 = testProc!.children!.find(c => c.name.includes('PRE(g2_)'));

        assert.ok(group1, 'Should find first GROUP');
        assert.ok(group2, 'Should find second GROUP');

        // Verify each group has 2 children
        assert.strictEqual(group1!.children!.length, 2, 'First GROUP should have 2 children');
        assert.strictEqual(group2!.children!.length, 2, 'Second GROUP should have 2 children');

        // Verify field names
        const group1ChildNames = group1!.children!.map(c => c.name);
        const group2ChildNames = group2!.children!.map(c => c.name);

        assert.ok(group1ChildNames.includes('field1'), 'field1 should be in first GROUP');
        assert.ok(group1ChildNames.includes('field2'), 'field2 should be in first GROUP');
        assert.ok(group2ChildNames.includes('field3'), 'field3 should be in second GROUP');
        assert.ok(group2ChildNames.includes('field4'), 'field4 should be in second GROUP');

        // Verify no cross-contamination
        assert.ok(!group1ChildNames.includes('field3'), 'field3 should NOT be in first GROUP');
        assert.ok(!group2ChildNames.includes('field1'), 'field1 should NOT be in second GROUP');
    });
});
