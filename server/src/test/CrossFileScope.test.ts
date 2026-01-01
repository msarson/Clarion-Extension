import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { TokenCache } from '../TokenCache';

suite('Cross-File Scope Analysis', () => {
    let definitionProvider: DefinitionProvider;
    let hoverProvider: HoverProvider;
    let implementationProvider: ImplementationProvider;
    let tokenCache: TokenCache;

    // Helper to create documents
    function createDocument(code: string, uri: string): TextDocument {
        return TextDocument.create(uri, 'clarion', 1, code);
    }

    // Helper to get definition line number
    function getLocationLine(result: Location | Location[] | null | undefined): number {
        if (!result) return -1;
        if (Array.isArray(result)) {
            return result.length > 0 ? result[0].range.start.line : -1;
        }
        return result.range.start.line;
    }

    setup(() => {
        tokenCache = TokenCache.getInstance();
        
        definitionProvider = new DefinitionProvider();
        hoverProvider = new HoverProvider();
        implementationProvider = new ImplementationProvider();
    });

    suite('TEST 1: Global Variable Access (Cross-File)', () => {
        const mainCode = `PROGRAM
MAP
  MODULE('utils.clw')
    IncrementCounter PROCEDURE()
  END
END

GlobalCounter LONG

CODE
  GlobalCounter = 0
  IncrementCounter()
`;

        const utilsCode = `   MEMBER('main.clw')

IncrementCounter PROCEDURE()
Counter          LONG
CODE
  Counter = GlobalCounter  ! Should find GlobalCounter in main.clw
  RETURN
`;

        test('F12 on GlobalCounter in utils.clw should jump to main.clw', async () => {
            const mainDoc = createDocument(mainCode, 'file:///test/main.clw');
            const utilsDoc = createDocument(utilsCode, 'file:///test/utils.clw');
            
            // Cache both documents
            tokenCache.getTokens(mainDoc);
            tokenCache.getTokens(utilsDoc);
            
            // F12 on "GlobalCounter" in utils.clw line 5
            const position: Position = { line: 5, character: 12 };
            const result = await definitionProvider.provideDefinition(utilsDoc, position);
            
            const line = getLocationLine(result);
            assert.strictEqual(line, 7, 'Should jump to GlobalCounter declaration in main.clw at line 7');
        });

        test('Hover on GlobalCounter in utils.clw should show global scope', async () => {
            const utilsDoc = createDocument(utilsCode, 'file:///test/utils.clw');
            tokenCache.getTokens(utilsDoc);
            
            const position: Position = { line: 5, character: 12 };
            const result = await hoverProvider.provideHover(utilsDoc, position);
            
            assert.ok(result, 'Should provide hover');
            assert.ok(result?.contents.toString().includes('🌍'), 'Should show global scope icon');
        });
    });

    suite('TEST 2: Procedure Implementation Navigation', () => {
        const mainCode = `PROGRAM
MAP
  MODULE('utils.clw')
    IncrementCounter PROCEDURE()
  END
END

CODE
  IncrementCounter()
`;

        const utilsCode = `   MEMBER('main.clw')

IncrementCounter PROCEDURE()
CODE
  ! Implementation
  RETURN
`;

        test('F12 on IncrementCounter() call should jump to MAP declaration', async () => {
            const mainDoc = createDocument(mainCode, 'file:///test/main.clw');
            tokenCache.getTokens(mainDoc);
            
            const position: Position = { line: 8, character: 5 };
            const result = await definitionProvider.provideDefinition(mainDoc, position);
            
            const line = getLocationLine(result);
            assert.strictEqual(line, 3, 'Should jump to MAP declaration at line 3');
        });

        test('Ctrl+F12 on IncrementCounter() call should jump to implementation', async () => {
            const mainDoc = createDocument(mainCode, 'file:///test/main.clw');
            const utilsDoc = createDocument(utilsCode, 'file:///test/utils.clw');
            
            tokenCache.getTokens(mainDoc);
            tokenCache.getTokens(utilsDoc);
            
            const position: Position = { line: 8, character: 5 };
            const result = await implementationProvider.provideImplementation(mainDoc, position);
            
            const line = getLocationLine(result);
            assert.strictEqual(line, 2, 'Should jump to implementation at line 2');
        });
    });

    suite('TEST 4: Module-Local Variable Blocking (Cross-File)', () => {
        const mainCode = `PROGRAM
CODE
  ModuleData = 999  ! Should NOT access utils.clw's ModuleData
`;

        const utilsCode = `   MEMBER('main.clw')

ModuleData LONG  ! Module-local variable

IncrementCounter PROCEDURE()
CODE
  ModuleData = 99  ! Should work - same module
  RETURN
`;

        test('F12 on ModuleData in main.clw should fail (module-local)', async () => {
            const mainDoc = createDocument(mainCode, 'file:///test/main.clw');
            const utilsDoc = createDocument(utilsCode, 'file:///test/utils.clw');
            
            tokenCache.getTokens(mainDoc);
            tokenCache.getTokens(utilsDoc);
            
            const position: Position = { line: 2, character: 5 };
            const result = await definitionProvider.provideDefinition(mainDoc, position);
            
            assert.strictEqual(result, null, 'Should NOT find definition (module-local variable in different file)');
        });

        test('Hover on ModuleData in main.clw should fail', async () => {
            const mainDoc = createDocument(mainCode, 'file:///test/main.clw');
            tokenCache.getTokens(mainDoc);
            
            const position: Position = { line: 2, character: 5 };
            const result = await hoverProvider.provideHover(mainDoc, position);
            
            assert.strictEqual(result, null, 'Should NOT provide hover (module-local in different file)');
        });

        test('F12 on ModuleData within utils.clw should work (same module)', async () => {
            const utilsDoc = createDocument(utilsCode, 'file:///test/utils.clw');
            tokenCache.getTokens(utilsDoc);
            
            const position: Position = { line: 6, character: 5 };
            const result = await definitionProvider.provideDefinition(utilsDoc, position);
            
            const line = getLocationLine(result);
            assert.strictEqual(line, 2, 'Should find definition at line 2 (same module)');
        });
    });

    suite('TEST 6: Global Procedure Call (Cross-File)', () => {
        const mainCode = `PROGRAM
MAP
GlobalHelper PROCEDURE()  ! Global procedure declaration
END

CODE
  GlobalHelper()

GlobalHelper PROCEDURE()
CODE
  ! Implementation
  RETURN
`;

        const utilsCode = `   MEMBER('main.clw')

IncrementCounter PROCEDURE()
CODE
  GlobalHelper()  ! Should find global procedure
  RETURN
`;

        test('F12 on GlobalHelper() in utils.clw should jump to MAP in main.clw', async () => {
            const mainDoc = createDocument(mainCode, 'file:///test/main.clw');
            const utilsDoc = createDocument(utilsCode, 'file:///test/utils.clw');
            
            tokenCache.getTokens(mainDoc);
            tokenCache.getTokens(utilsDoc);
            
            const position: Position = { line: 4, character: 5 };
            const result = await definitionProvider.provideDefinition(utilsDoc, position);
            
            const line = getLocationLine(result);
            assert.strictEqual(line, 2, 'Should jump to GlobalHelper MAP declaration at line 2');
        });
    });

    suite('Procedure Hover Scope Information', () => {
        const programCode = `PROGRAM

GlobalProc PROCEDURE()
CODE
  RETURN
`;

        const memberCode = `   MEMBER('main.clw')

ModuleProc PROCEDURE()
CODE
  RETURN
`;

        test('Hover on global procedure should show 🌍 Global scope', async () => {
            const doc = createDocument(programCode, 'file:///test/main.clw');
            tokenCache.getTokens(doc);
            
            const position: Position = { line: 2, character: 5 };
            const result = await hoverProvider.provideHover(doc, position);
            
            assert.ok(result, 'Should provide hover');
            const content = result?.contents.toString();
            assert.ok(content.includes('🌍'), 'Should show global scope icon');
            assert.ok(content.includes('Global'), 'Should mention global scope');
        });

        test('Hover on module-local procedure should show 📦 Module scope', async () => {
            const doc = createDocument(memberCode, 'file:///test/utils.clw');
            tokenCache.getTokens(doc);
            
            const position: Position = { line: 2, character: 5 };
            const result = await hoverProvider.provideHover(doc, position);
            
            assert.ok(result, 'Should provide hover');
            const content = result?.contents.toString();
            assert.ok(content.includes('📦'), 'Should show module scope icon');
            assert.ok(content.includes('Module'), 'Should mention module scope');
        });
    });
});
