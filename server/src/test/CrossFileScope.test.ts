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

    setup(() => {
        tokenCache = TokenCache.getInstance();
        
        definitionProvider = new DefinitionProvider();
        hoverProvider = new HoverProvider();
        implementationProvider = new ImplementationProvider();
    });

    // ═══════════════════════════════════════════════════════════════════════
    // NOTE: In-Memory Cross-File Tests REMOVED
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Previously, this file contained 8 in-memory cross-file scope tests that
    // created virtual documents with URIs like 'file:///test/main.clw'.
    //
    // ❌ WHY REMOVED: CrossFileResolver requires real filesystem access
    //    - Uses fs.existsSync() to check if MEMBER files exist
    //    - Uses fs.readFileSync() to read parent files
    //    - Cannot work with in-memory TextDocuments
    //
    // ✅ REPLACEMENT: SolutionBased.CrossFileScope.test.ts
    //    - Uses real files in test-programs/RealWorldTestSuite/CrossFileScope/
    //    - Tests actual cross-file scope functionality
    //    - Validates MEMBER/PROGRAM relationships
    //    - Tests global vs module-local variable access
    //    - Tests F12 and Ctrl+F12 navigation
    //
    // If virtual document testing is needed in the future, CrossFileResolver
    // would need refactoring to accept a DocumentProvider abstraction.
    //
    // ═══════════════════════════════════════════════════════════════════════

    suite('TEST 7: MAP INCLUDE - Module-Local Procedure Declarations', () => {
        // Use real files from test-programs/RealWorldTestSuite/CrossFileScope
        // __dirname is out/server/src/test, need to go up to project root
        const projectRoot = path.join(__dirname, '../../../../');
        const testSuitePath = path.join(projectRoot, 'test-programs/RealWorldTestSuite/CrossFileScope');
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
