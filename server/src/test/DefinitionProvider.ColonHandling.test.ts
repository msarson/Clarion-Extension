/**
 * Phase 1 Tests: Colon Handling in DefinitionProvider
 * 
 * Tests that F12 (goto definition) correctly handles labels with colons,
 * matching the behavior that was fixed in HoverProvider on 2026-01-06.
 * 
 * Critical bug: DefinitionProvider immediately strips prefix from "BRW1::View:Browse",
 * making it search for just "Browse" instead of trying the full word first.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { TokenCache } from '../TokenCache';

suite('DefinitionProvider - Phase 1: Colon Handling Fix', () => {
    let provider: DefinitionProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new DefinitionProvider();
        tokenCache = TokenCache.getInstance();
    });

    teardown(() => {
        // Clear cached test documents
        tokenCache.clearTokens('test://colon1.clw');
        tokenCache.clearTokens('test://colon2.clw');
        tokenCache.clearTokens('test://colon3.clw');
        tokenCache.clearTokens('test://colon4.clw');
        tokenCache.clearTokens('test://colon5.clw');
        tokenCache.clearTokens('test://colon6.clw');
    });

    function getLocationLine(result: Location | Location[] | null | undefined): number {
        if (!result) return -1;
        if (Array.isArray(result)) {
            return result.length > 0 ? result[0].range.start.line : -1;
        }
        return result.range.start.line;
    }

    suite('🔴 Critical Bug: Labels with Multiple Colons', () => {
        
        test('Should find label "BRW1::View:Browse" - complex colon label', async () => {
            const code = `
PROGRAM
BRW1::View:Browse    VIEW(AABranchName)
                       PROJECT(BRA:CustId)
                       PROJECT(BRA:Name)
                     END
  CODE
  BRW1::View:Browse{PROP:SQL} = 'SELECT * FROM Branches'
  END`.trim();
            
            const doc = TextDocument.create('test://colon1.clw', 'clarion', 1, code);
            const position = Position.create(6, 5); // On 'BRW1::View:Browse' in usage
            
            const result = await provider.provideDefinition(doc, position);
            
            assert.ok(result, 'Should find definition for BRW1::View:Browse');
            const line = getLocationLine(result);
            assert.strictEqual(line, 1, 'Should jump to line 1 where BRW1::View:Browse is declared');
        });

        test('Should find label with double colon prefix', async () => {
            const code = `
MyProc PROCEDURE()
CLASS::Member:Field    STRING(50)
  CODE
  CLASS::Member:Field = 'Test'
  END`.trim();
            
            const doc = TextDocument.create('test://colon2.clw', 'clarion', 1, code);
            const position = Position.create(3, 5); // On usage
            
            const result = await provider.provideDefinition(doc, position);
            
            assert.ok(result, 'Should find definition');
            assert.strictEqual(getLocationLine(result), 1, 'Should find the declaration');
        });

        test('Should distinguish between similar labels with different colons', async () => {
            const code = `
MyProc PROCEDURE()
View:Browse        STRING(20)
BRW1::View:Browse  STRING(30)
  CODE
  View:Browse = 'Simple'
  BRW1::View:Browse = 'Complex'
  END`.trim();
            
            const doc = TextDocument.create('test://colon3.clw', 'clarion', 1, code);
            
            // Test simple label
            const simplePos = Position.create(4, 5); // On 'View:Browse' usage
            const simpleResult = await provider.provideDefinition(doc, simplePos);
            assert.strictEqual(getLocationLine(simpleResult), 1, 'Should find simple View:Browse on line 1');
            
            // Test complex label
            const complexPos = Position.create(5, 5); // On 'BRW1::View:Browse' usage
            const complexResult = await provider.provideDefinition(doc, complexPos);
            assert.strictEqual(getLocationLine(complexResult), 2, 'Should find complex BRW1::View:Browse on line 2');
        });
    });

    suite('🟡 Standard Colon Prefix Handling', () => {
        
        test('Should find prefixed variable LOC:Counter', async () => {
            const code = `
MyProc PROCEDURE()
LOC:Counter    LONG
  CODE
  LOC:Counter = 123
  END`.trim();
            
            const doc = TextDocument.create('test://colon4.clw', 'clarion', 1, code);
            const position = Position.create(3, 5); // On 'LOC:Counter' usage
            
            const result = await provider.provideDefinition(doc, position);
            
            assert.ok(result, 'Should find definition for LOC:Counter');
            assert.strictEqual(getLocationLine(result), 1, 'Should find declaration');
        });

        test('Should find field in GROUP with PRE() prefix', async () => {
            const code = `
MyGroup    GROUP,PRE(GRP)
Name         STRING(40)
Age          LONG
           END
  CODE
  GRP:Name = 'John'
  GRP:Age = 25
  END`.trim();
            
            const doc = TextDocument.create('test://colon5.clw', 'clarion', 1, code);
            
            // Test Name field
            const namePos = Position.create(5, 5); // On 'GRP:Name'
            const nameResult = await provider.provideDefinition(doc, namePos);
            assert.ok(nameResult, 'Should find GRP:Name field');
            assert.strictEqual(getLocationLine(nameResult), 1, 'Should jump to Name field declaration');
            
            // Test Age field  
            const agePos = Position.create(6, 5); // On 'GRP:Age'
            const ageResult = await provider.provideDefinition(doc, agePos);
            assert.ok(ageResult, 'Should find GRP:Age field');
            assert.strictEqual(getLocationLine(ageResult), 2, 'Should jump to Age field declaration');
        });

        test('Should handle QUEUE field with prefix', async () => {
            const code = `
MyQueue    QUEUE,PRE(Q)
ID           LONG
Name         STRING(50)
           END
  CODE
  Q:ID = 1
  Q:Name = 'Test'
  END`.trim();
            
            const doc = TextDocument.create('test://colon6.clw', 'clarion', 1, code);
            const position = Position.create(5, 3); // On 'Q:ID'
            
            const result = await provider.provideDefinition(doc, position);
            
            assert.ok(result, 'Should find Q:ID field');
            assert.strictEqual(getLocationLine(result), 1, 'Should jump to ID field');
        });
    });

    suite('🔵 Edge Cases: Search Order Validation', () => {
        
        test('Should try full word BEFORE stripping prefix', async () => {
            // This test validates the fix: search order should be:
            // 1. Try "MyPrefix:FullName" (full word)
            // 2. If not found, try "FullName" (stripped)
            const code = `
MyProc PROCEDURE()
MyPrefix:FullName    STRING(30)    ! Full label with colon
FullName             STRING(20)    ! Simple label without prefix
  CODE
  MyPrefix:FullName = 'Prefixed'   ! Should find line 1, not line 2
  FullName = 'Simple'               ! Should find line 2
  END`.trim();
            
            const doc = TextDocument.create('test://search-order1.clw', 'clarion', 1, code);
            
            // Test prefixed usage
            const prefixedPos = Position.create(4, 5); // On 'MyPrefix:FullName'
            const prefixedResult = await provider.provideDefinition(doc, prefixedPos);
            assert.ok(prefixedResult, 'Should find definition for MyPrefix:FullName');
            assert.strictEqual(getLocationLine(prefixedResult), 1, 
                'Should find MyPrefix:FullName on line 1, NOT FullName on line 2');
            
            // Test simple usage
            const simplePos = Position.create(5, 3); // On 'FullName' alone
            const simpleResult = await provider.provideDefinition(doc, simplePos);
            assert.ok(simpleResult, 'Should find definition for FullName');
            assert.strictEqual(getLocationLine(simpleResult), 2, 
                'Should find FullName on line 2');
        });

        test('Should fallback to stripped search if full word not found', async () => {
            // If "GRP:Name" as full word doesn't exist, should try "Name"
            const code = `
MyGroup    GROUP,PRE(GRP)
Name         STRING(40)
           END
  CODE
  GRP:Name = 'Test'   ! GRP:Name doesn't exist as full label, but Name does
  END`.trim();
            
            const doc = TextDocument.create('test://fallback1.clw', 'clarion', 1, code);
            const position = Position.create(4, 3); // On 'GRP:Name'
            
            const result = await provider.provideDefinition(doc, position);
            
            assert.ok(result, 'Should find Name field via fallback');
            assert.strictEqual(getLocationLine(result), 1, 'Should find Name field');
        });
    });

    suite.skip('🟢 Regression Prevention: Parameters with Colons', () => {
        
        test('Should handle parameter that looks like prefixed variable', async () => {
            const code = `
MyProc PROCEDURE(STRING pData:Name)
  CODE
  pData:Name = 'Test'
  END`.trim();
            
            const doc = TextDocument.create('test://param-colon1.clw', 'clarion', 1, code);
            const position = Position.create(2, 5); // On 'pData:Name' usage
            
            const result = await provider.provideDefinition(doc, position);
            
            // Should find parameter in PROCEDURE signature
            assert.ok(result, 'Should find parameter definition');
            assert.strictEqual(getLocationLine(result), 0, 'Should jump to procedure line');
        });
    });
});
