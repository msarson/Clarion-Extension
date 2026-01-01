import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver-protocol';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import * as path from 'path';
import * as fs from 'fs';

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

    suite('TEST 7: MAP INCLUDE - Module-Local Procedure Declarations', () => {
        // Use real files from test-programs/scope-test-suite
        // __dirname is out/server/src/test, need to go up to project root
        const projectRoot = path.join(__dirname, '../../../../');
        const testSuitePath = path.join(projectRoot, 'test-programs/scope-test-suite');
        const utilsPath = path.join(testSuitePath, 'utils.clw');
        const startprocIncPath = path.join(testSuitePath, 'StartProc.inc');

        test('Real files exist in test suite', () => {
            assert.ok(fs.existsSync(utilsPath), `utils.clw should exist at ${utilsPath}`);
            assert.ok(fs.existsSync(startprocIncPath), `StartProc.inc should exist at ${startprocIncPath}`);
        });

        test('MAP should be detected in utils.clw', () => {
            const content = fs.readFileSync(utilsPath, 'utf-8');
            const doc = TextDocument.create(`file:///${utilsPath.replace(/\\/g, '/')}`, 'clarion', 1, content);
            const tokens = tokenCache.getTokens(doc);
            
            // Find MAP tokens
            const mapTokens = tokens.filter(t => t.value.toUpperCase() === 'MAP');
            assert.ok(mapTokens.length > 0, 'Should have at least one MAP token');
            
            // Check if any MAP token is a Structure
            const mapStructures = tokens.filter(t => 
                t.type === 16 && // TokenType.Structure
                t.value.toUpperCase() === 'MAP'
            );
            
            assert.strictEqual(mapStructures.length, 1, 'Should have exactly one MAP structure in utils.clw');
        });

        test('Hover on StartProc() in utils.clw should work with MAP INCLUDE', async () => {
            // Load real files
            const utilsContent = fs.readFileSync(utilsPath, 'utf-8');
            const utilsDoc = TextDocument.create(`file:///${utilsPath.replace(/\\/g, '/')}`, 'clarion', 1, utilsContent);
            
            // Pre-cache the document
            tokenCache.getTokens(utilsDoc);
            
            // Find line with "StartProc(" call
            const lines = utilsContent.split('\n');
            let startProcLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('StartProc(')) {
                    startProcLine = i;
                    break;
                }
            }
            
            assert.ok(startProcLine >= 0, 'Should find StartProc() call in utils.clw');
            
            const position: Position = { line: startProcLine, character: lines[startProcLine].indexOf('StartProc') + 2 };
            const result = await hoverProvider.provideHover(utilsDoc, position);
            
            // Note: This test will show us if MAP INCLUDE resolution works with real files
            if (result) {
                console.log('✅ Hover worked! Content:', result.contents.toString().substring(0, 100));
            } else {
                console.log('❌ Hover returned null - MAP INCLUDE not resolving');
            }
            
            assert.ok(result, 'Should provide hover for StartProc from MAP INCLUDE');
        });

        test('Ctrl+F12 on StartProc declaration in startproc.inc should find implementation', async () => {
            // Load the INCLUDE file
            const startprocContent = fs.readFileSync(startprocIncPath, 'utf-8');
            const startprocDoc = TextDocument.create(`file:///${startprocIncPath.replace(/\\/g, '/')}`, 'clarion', 1, startprocContent);
            
            // Pre-cache the document
            tokenCache.getTokens(startprocDoc);
            
            // Find line with "StartProc PROCEDURE" declaration
            const lines = startprocContent.split('\n');
            let declLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('StartProc') && lines[i].includes('PROCEDURE')) {
                    declLine = i;
                    break;
                }
            }
            
            assert.ok(declLine >= 0, 'Should find StartProc PROCEDURE declaration in startproc.inc');
            
            const position: Position = { line: declLine, character: lines[declLine].indexOf('StartProc') + 2 };
            const result = await implementationProvider.provideImplementation(startprocDoc, position);
            
            if (result) {
                const locations = Array.isArray(result) ? result : [result];
                console.log('✅ Implementation found at:', locations[0].uri);
                assert.ok(locations[0].uri.toUpperCase().includes('STARTPROC.CLW'), 'Should find implementation in StartProc.clw');
            } else {
                console.log('❌ Implementation not found - MODULE resolution from INCLUDE not working');
            }
            
            assert.ok(result, 'Should find implementation via MODULE reference in INCLUDE file');
        });

        test('Hover on StartProc inside START() call should work', async () => {
            // Load real files
            const utilsContent = fs.readFileSync(utilsPath, 'utf-8');
            const utilsDoc = TextDocument.create(`file:///${utilsPath.replace(/\\/g, '/')}`, 'clarion', 1, utilsContent);
            
            // Pre-cache the document
            tokenCache.getTokens(utilsDoc);
            
            // Find line with "START(StartProc," 
            const lines = utilsContent.split('\n');
            let startLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('START') && lines[i].includes('StartProc')) {
                    startLine = i;
                    break;
                }
            }
            
            assert.ok(startLine >= 0, 'Should find START(StartProc,...) call in utils.clw');
            
            // Position cursor on "StartProc" inside START()
            const position: Position = { line: startLine, character: lines[startLine].indexOf('StartProc') + 2 };
            const result = await hoverProvider.provideHover(utilsDoc, position);
            
            // Note: This tests if hover recognizes procedure names inside START() calls
            if (result) {
                console.log('✅ Hover worked for START(StartProc)! Content:', result.contents.toString().substring(0, 100));
            } else {
                console.log('❌ Hover returned null - START() procedure name not recognized');
            }
            
            assert.ok(result, 'Should provide hover for StartProc inside START() call');
        });

        test('F12 on StartProc inside START() call should go to definition', async () => {
            // Load real files
            const utilsContent = fs.readFileSync(utilsPath, 'utf-8');
            const utilsDoc = TextDocument.create(`file:///${utilsPath.replace(/\\/g, '/')}`, 'clarion', 1, utilsContent);
            
            // Pre-cache the document
            tokenCache.getTokens(utilsDoc);
            
            // Find line with "START(StartProc," 
            const lines = utilsContent.split('\n');
            let startLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('START') && lines[i].includes('StartProc')) {
                    startLine = i;
                    break;
                }
            }
            
            assert.ok(startLine >= 0, 'Should find START(StartProc,...) call in utils.clw');
            
            // Position cursor on "StartProc" inside START()
            const position: Position = { line: startLine, character: lines[startLine].indexOf('StartProc') + 2 };
            const result = await definitionProvider.provideDefinition(utilsDoc, position);
            
            if (result) {
                const locations = Array.isArray(result) ? result : [result];
                console.log('✅ F12 worked for START(StartProc)! Found definition at:', locations[0].uri);
                assert.ok(locations[0].uri.toUpperCase().includes('STARTPROC.INC'), 'Should find MAP declaration in startproc.inc');
            } else {
                console.log('❌ F12 returned null - START() procedure name not recognized for go-to-definition');
            }
            
            assert.ok(result, 'Should provide definition for StartProc inside START() call');
        });

        test('Ctrl+F12 on StartProc inside START() call should go to implementation', async () => {
            // Load real files
            const utilsContent = fs.readFileSync(utilsPath, 'utf-8');
            const utilsDoc = TextDocument.create(`file:///${utilsPath.replace(/\\/g, '/')}`, 'clarion', 1, utilsContent);
            
            // Pre-cache the document
            tokenCache.getTokens(utilsDoc);
            
            // Find line with "START(StartProc," 
            const lines = utilsContent.split('\n');
            let startLine = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('START') && lines[i].includes('StartProc')) {
                    startLine = i;
                    break;
                }
            }
            
            assert.ok(startLine >= 0, 'Should find START(StartProc,...) call in utils.clw');
            
            // Position cursor on "StartProc" inside START()
            const position: Position = { line: startLine, character: lines[startLine].indexOf('StartProc') + 2 };
            const result = await implementationProvider.provideImplementation(utilsDoc, position);
            
            if (result) {
                const locations = Array.isArray(result) ? result : [result];
                console.log('✅ Ctrl+F12 worked for START(StartProc)! Found implementation at:', locations[0].uri);
                assert.ok(locations[0].uri.toUpperCase().includes('STARTPROC.CLW'), 'Should find implementation in StartProc.clw');
            } else {
                console.log('❌ Ctrl+F12 returned null - START() procedure name not recognized for go-to-implementation');
            }
            
            assert.ok(result, 'Should provide implementation for StartProc inside START() call');
        });
    });
});
