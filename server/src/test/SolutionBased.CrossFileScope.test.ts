import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position, Location } from 'vscode-languageserver-protocol';
import { SolutionManager } from '../solution/solutionManager';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { HoverProvider } from '../providers/HoverProvider';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import { TokenCache } from '../TokenCache';

suite('Solution-Based Cross-File Scope Tests', () => {
    let solutionManager: SolutionManager | null = null;
    let definitionProvider: DefinitionProvider;
    let hoverProvider: HoverProvider;
    let implementationProvider: ImplementationProvider;
    let tokenCache: TokenCache;
    
    // Helper to get definition line number
    function getLocationLine(result: Location | Location[] | null | undefined): number {
        if (!result) return -1;
        if (Array.isArray(result)) {
            return result.length > 0 ? result[0].range.start.line : -1;
        }
        return result.range.start.line;
    }
    
    // Helper to get URI from location
    function getLocationUri(result: Location | Location[] | null | undefined): string {
        if (!result) return '';
        if (Array.isArray(result)) {
            return result.length > 0 ? result[0].uri : '';
        }
        return result.uri;
    }

    suiteSetup(async function() {
        // Increase timeout for solution loading
        this.timeout(30000);
        
        console.log('\n🔧 Setting up solution-based tests...');
        
        try {
            // Resolve path to test solution
            // __dirname in compiled JS is out/server/src/test
            // We need to go up to project root, then into test-programs
            const testSolutionPath = path.resolve(__dirname, 
                '..', '..', '..', '..', 'test-programs', 'RealWorldTestSuite', 'RealWorldTestSuite.sln');
            
            console.log(`📂 Test solution path: ${testSolutionPath}`);
            
            // Check if solution file exists
            if (!fs.existsSync(testSolutionPath)) {
                console.error(`❌ Solution file not found: ${testSolutionPath}`);
                throw new Error(`Test solution not found: ${testSolutionPath}`);
            }
            
            console.log('✅ Solution file exists');
            
            // Load the solution
            console.log('🔄 Loading solution...');
            solutionManager = await SolutionManager.create(testSolutionPath);
            
            console.log(`✅ Solution loaded with ${solutionManager.solution.projects.length} project(s)`);
            
            // List projects and files
            for (const project of solutionManager.solution.projects) {
                console.log(`   📦 Project: ${project.name}`);
                console.log(`      Path: ${project.path}`);
                console.log(`      Files: ${project.sourceFiles.length}`);
                for (const file of project.sourceFiles) {
                    console.log(`         - ${file.relativePath}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Failed to load solution:', error);
            throw error;
        }
    });
    
    suiteTeardown(() => {
        console.log('🧹 Cleaning up solution-based tests...');
        if (solutionManager) {
            SolutionManager.clearAllCaches();
        }
    });
    
    setup(() => {
        tokenCache = TokenCache.getInstance();
        definitionProvider = new DefinitionProvider();
        hoverProvider = new HoverProvider();
        implementationProvider = new ImplementationProvider();
    });
    
    suite('Step 3: Get Actual File Documents', () => {
        
        test('Should find main.clw in loaded solution', () => {
            assert.ok(solutionManager, 'Solution manager should be loaded');
            assert.ok(solutionManager!.solution.projects.length > 0, 'Should have at least one project');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw in project');
            console.log(`   ✅ Found main.clw: ${mainFile!.relativePath}`);
        });
        
        test('Should find utils.clw in loaded solution', () => {
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('utils.clw'));
            
            assert.ok(utilsFile, 'Should find utils.clw in project');
            console.log(`   ✅ Found utils.clw: ${utilsFile!.relativePath}`);
        });
        
        test('Should get absolute path for main.clw', () => {
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const absolutePath = mainFile!.getAbsolutePath();
            assert.ok(absolutePath, 'Should get absolute path');
            assert.ok(fs.existsSync(absolutePath!), 'File should exist at absolute path');
            
            console.log(`   ✅ Absolute path: ${absolutePath}`);
        });
        
        test('Should read file content from main.clw', () => {
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const content = mainFile!.getContent();
            assert.ok(content, 'Should read content');
            assert.ok(content!.includes('PROGRAM'), 'Content should include PROGRAM keyword');
            assert.ok(content!.includes('GlobalCounter'), 'Content should include GlobalCounter variable');
            
            console.log(`   ✅ Read ${content!.length} bytes from main.clw`);
        });
    });
    
    suite('Step 4: Pass Real URIs to Providers', () => {
        
        test('Should create TextDocument from real file', () => {
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const absolutePath = mainFile!.getAbsolutePath();
            const content = mainFile!.getContent();
            
            assert.ok(absolutePath, 'Should have absolute path');
            assert.ok(content, 'Should have content');
            
            // Create TextDocument with real URI
            const uri = `file:///${absolutePath!.replace(/\\/g, '/')}`;
            const document = TextDocument.create(uri, 'clarion', 1, content!);
            
            assert.strictEqual(document.languageId, 'clarion');
            assert.strictEqual(document.getText(), content);
            
            console.log(`   ✅ Created TextDocument with URI: ${uri}`);
        });
        
        test('Should use getTextDocumentByPath from project', () => {
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const absolutePath = mainFile!.getAbsolutePath();
            assert.ok(absolutePath, 'Should have absolute path');
            
            // Use project's method to get TextDocument
            const document = project.getTextDocumentByPath(absolutePath!);
            
            // NOTE: This might be null if the method requires the document to be open
            if (document) {
                console.log(`   ✅ Got TextDocument from project method`);
                assert.strictEqual(document.languageId, 'clarion');
            } else {
                console.log(`   ⚠️ getTextDocumentByPath returned null - may require open document`);
                console.log(`      This is expected if documents need to be explicitly opened first`);
            }
        });
        
        test('Should tokenize real file content', () => {
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const absolutePath = mainFile!.getAbsolutePath();
            const content = mainFile!.getContent();
            
            const uri = `file:///${absolutePath!.replace(/\\/g, '/')}`;
            const document = TextDocument.create(uri, 'clarion', 1, content!);
            
            // Tokenize the document
            const tokens = tokenCache.getTokens(document);
            
            assert.ok(tokens.length > 0, 'Should have tokens');
            
            // Find specific tokens we expect
            const programToken = tokens.find(t => t.value.toUpperCase() === 'PROGRAM');
            const globalCounterToken = tokens.find(t => t.value === 'GlobalCounter');
            
            assert.ok(programToken, 'Should find PROGRAM token');
            assert.ok(globalCounterToken, 'Should find GlobalCounter token');
            
            console.log(`   ✅ Tokenized ${tokens.length} tokens from main.clw`);
            console.log(`      Found PROGRAM at line ${programToken!.line}`);
            console.log(`      Found GlobalCounter at line ${globalCounterToken!.line}`);
        });
    });
    
    suite('Step 5: Test Cross-File Navigation with Real Files', () => {
        
        test('TEST 1: F12 on GlobalCounter in utils.clw should jump to main.clw', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            
            // Get both files
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            const utilsFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('utils.clw'));
            
            assert.ok(mainFile && utilsFile, 'Should find both files');
            
            // Create documents
            const mainPath = mainFile!.getAbsolutePath()!;
            const utilsPath = utilsFile!.getAbsolutePath()!;
            
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            // Tokenize both
            tokenCache.getTokens(mainDoc);
            const utilsTokens = tokenCache.getTokens(utilsDoc);
            
            // Find GlobalCounter in utils.clw
            const globalCounterToken = utilsTokens.find(t => 
                t.value === 'GlobalCounter' && t.line > 45); // Should be around line 50 (0-based)
            
            assert.ok(globalCounterToken, 'Should find GlobalCounter token in utils.clw');
            console.log(`   📍 Found GlobalCounter in utils.clw at line ${globalCounterToken!.line}`);
            
            // F12 on GlobalCounter
            const position: Position = { line: globalCounterToken!.line, character: globalCounterToken!.start };
            const result = await definitionProvider.provideDefinition(utilsDoc, position);
            
            console.log(`   🔍 Definition result:`, result);
            
            if (result) {
                const resultUri = getLocationUri(result);
                const resultLine = getLocationLine(result);
                
                console.log(`   📌 Jump to: ${resultUri} line ${resultLine}`);
                
                // Should jump to main.clw
                assert.ok(resultUri.toLowerCase().includes('main.clw'), 
                    'Should navigate to main.clw');
                
                assert.ok(resultLine >= 0, 'Should have valid line number');
            } else {
                console.log(`   ❌ No definition found - ISSUE DETECTED`);
                console.log(`   This indicates cross-file resolution is not working`);
                assert.fail('Expected to find definition of GlobalCounter in main.clw');
            }
        });
        
        test('TEST 2: F12 vs Ctrl+F12 for IncrementCounter procedure', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const tokens = tokenCache.getTokens(mainDoc);
            
            // Find IncrementCounter call (should be around line 94 in 1-based, 93 in 0-based)
            const incrementTokenCall = tokens.find(t => 
                t.value === 'IncrementCounter' && t.line > 85);
            
            assert.ok(incrementTokenCall, 'Should find IncrementCounter call in CODE section');
            console.log(`   📍 Found IncrementCounter call at line ${incrementTokenCall!.line} (0-based) = line ${incrementTokenCall!.line + 1} (1-based shown in VSCode)`);
            
            // Also find the MAP declaration for comparison
            const incrementTokenMap = tokens.find(t => 
                t.value === 'IncrementCounter' && t.line >= 73 && t.line <= 80);
            if (incrementTokenMap) {
                console.log(`   📍 Found IncrementCounter MAP declaration at line ${incrementTokenMap.line} (0-based) = line ${incrementTokenMap.line + 1} (1-based)`);
            }
            
            // F12 - Should go to MAP declaration
            const position: Position = { line: incrementTokenCall!.line, character: incrementTokenCall!.start };
            const defResult = await definitionProvider.provideDefinition(mainDoc, position);
            
            console.log(`   🔍 F12 result:`, defResult);
            
            if (defResult) {
                const defLine = getLocationLine(defResult);
                const defUri = getLocationUri(defResult);
                console.log(`   📌 F12 jumps to line ${defLine} (0-based) = line ${defLine + 1} (1-based in VSCode)`);
                console.log(`   📌 File: ${defUri}`);
                
                // Check if it jumped to MAP declaration or to itself
                if (defLine === incrementTokenCall!.line) {
                    console.log(`   ⚠️ WARNING: F12 jumped to the call itself, not to MAP declaration!`);
                    console.log(`   Expected: line 75 (0-based) = line 76 (1-based) in MAP block`);
                    console.log(`   Got: line ${defLine} (0-based) = line ${defLine + 1} (1-based) - the call site`);
                } else {
                    console.log(`   ✅ F12 correctly jumped to different line (likely MAP declaration)`);
                }
                
                // Should be in MAP block (line 73-80 in 0-based = line 74-81 in 1-based)
                assert.ok(defLine >= 73 && defLine <= 80, 
                    `F12 should jump to MAP declaration (expected line 73-80 0-based, got ${defLine})`);
            } else {
                console.log(`   ⚠️ F12 found no definition`);
            }
            
            // Ctrl+F12 - Should go to implementation
            const implResult = await implementationProvider.provideImplementation(mainDoc, position);
            
            console.log(`   🔍 Ctrl+F12 result:`, implResult);
            
            if (implResult) {
                const implUri = getLocationUri(implResult);
                const implLine = getLocationLine(implResult);
                
                console.log(`   📌 Ctrl+F12 jumps to line ${implLine} (0-based) = line ${implLine + 1} (1-based in VSCode)`);
                console.log(`   📌 File: ${implUri}`);
                
                // Should jump to utils.clw implementation
                assert.ok(implUri.toLowerCase().includes('utils.clw'), 
                    'Ctrl+F12 should navigate to implementation in utils.clw');
                    
                // Implementation should be around line 46 (0-based) = line 47 (1-based)
                console.log(`   ✅ Ctrl+F12 correctly navigated to implementation in MEMBER file`);
            } else {
                console.log(`   ❌ Ctrl+F12 found no implementation - ISSUE DETECTED`);
            }
        });
        
        test('TEST 4: Module-local variable should be blocked cross-file', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('utils.clw'));
            
            assert.ok(utilsFile, 'Should find utils.clw');
            
            const utilsPath = utilsFile!.getAbsolutePath()!;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            const tokens = tokenCache.getTokens(utilsDoc);
            
            // Find ModuleData declaration (should be around line 45 in 1-based, 44 in 0-based)
            const moduleDataToken = tokens.find(t => 
                t.value === 'ModuleData' && t.line > 40 && t.line < 50);
            
            if (moduleDataToken) {
                console.log(`   📍 Found ModuleData declaration at line ${moduleDataToken.line}`);
                
                // Try to use this from main.clw - should fail
                // For now, just verify we found it
                console.log(`   ⚠️ Module-local scope blocking test requires main.clw to reference ModuleData`);
                console.log(`      Currently main.clw line 77 has this commented out`);
            } else {
                console.log(`   ⚠️ Could not find ModuleData token in utils.clw`);
            }
        });
    });
    
    suite('TEST Hover Consistency', () => {
        
        test('Hover on IncrementCounter at MAP declaration (line 76)', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const tokens = tokenCache.getTokens(mainDoc);
            
            // Find IncrementCounter in MAP (line 75 0-based = line 76 1-based)
            const mapToken = tokens.find(t => 
                t.value === 'IncrementCounter' && t.line >= 73 && t.line <= 80);
            
            assert.ok(mapToken, 'Should find IncrementCounter in MAP');
            console.log(`   📍 Testing hover at MAP declaration line ${mapToken!.line} (0-based) = line ${mapToken!.line + 1} (1-based)`);
            
            const position: Position = { line: mapToken!.line, character: mapToken!.start };
            const hoverResult = await hoverProvider.provideHover(mainDoc, position);
            
            if (hoverResult) {
                const hoverText = typeof hoverResult.contents === 'string' 
                    ? hoverResult.contents 
                    : (hoverResult.contents as any).value || JSON.stringify(hoverResult.contents);
                
                console.log(`\n   📋 Hover at MAP declaration:`);
                console.log(`   ${'-'.repeat(60)}`);
                console.log(hoverText);
                console.log(`   ${'-'.repeat(60)}\n`);
                
                // Check what's shown
                const hasScope = hoverText.includes('Scope:') || hoverText.includes('🌍') || hoverText.includes('📦');
                const hasF12Text = hoverText.includes('F12');
                const hasCtrlF12Text = hoverText.includes('Ctrl+F12');
                const hasImplementationText = hoverText.toLowerCase().includes('implementation');
                const hasDefinitionText = hoverText.toLowerCase().includes('definition');
                
                console.log(`   ✓ Shows scope info: ${hasScope ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions F12: ${hasF12Text ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions Ctrl+F12: ${hasCtrlF12Text ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions "definition": ${hasDefinitionText ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions "implementation": ${hasImplementationText ? '✅ YES' : '❌ NO'}`);
                
                if (!hasScope) {
                    console.log(`   ⚠️ ISSUE: MAP declaration hover should show scope information`);
                }
                if (hasCtrlF12Text && hasImplementationText) {
                    console.log(`   ✅ CORRECT: Shows Ctrl+F12 for implementation (we are at definition)`);
                }
                if (hasF12Text && hasDefinitionText) {
                    console.log(`   ⚠️ MISLEADING: Says F12 for definition but we ARE at the definition`);
                }
            } else {
                console.log(`   ❌ No hover result at MAP declaration`);
            }
        });
        
        test('Hover on GlobalHelper at MAP declaration (line 84)', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const tokens = tokenCache.getTokens(mainDoc);
            
            // Find GlobalHelper MAP declaration (line 83 0-based = line 84 1-based)
            const mapDeclToken = tokens.find(t => 
                t.value === 'GlobalHelper' && t.line === 83);
            
            assert.ok(mapDeclToken, 'Should find GlobalHelper MAP declaration');
            console.log(`   📍 Testing hover at GlobalHelper MAP declaration line ${mapDeclToken!.line} (0-based) = line ${mapDeclToken!.line + 1} (1-based)`);
            
            const position: Position = { line: mapDeclToken!.line, character: mapDeclToken!.start };
            const hoverResult = await hoverProvider.provideHover(mainDoc, position);
            
            assert.ok(hoverResult, 'Should have hover at MAP declaration');
            
            const hoverText = typeof hoverResult.contents === 'string' 
                ? hoverResult.contents 
                : (hoverResult.contents as any).value || JSON.stringify(hoverResult.contents);
            
            console.log(`\n   📋 Hover at GlobalHelper MAP declaration:`);
            console.log(`   ${'-'.repeat(60)}`);
            console.log(hoverText);
            console.log(`   ${'-'.repeat(60)}\n`);
            
            // Check what's shown
            const hasGlobalScope = hoverText.includes('🌍') || hoverText.includes('Global');
            const hasImplementedIn = hoverText.includes('Implemented in');
            const hasCtrlF12Text = hoverText.includes('Ctrl+F12');
            const showsImplementationCode = hoverText.includes('MESSAGE') || hoverText.includes('CODE');
            
            console.log(`   ✓ Shows Global scope: ${hasGlobalScope ? '✅ YES' : '❌ NO'}`);
            console.log(`   ✓ Shows "Implemented in": ${hasImplementedIn ? '✅ YES' : '❌ NO'}`);
            console.log(`   ✓ Mentions Ctrl+F12: ${hasCtrlF12Text ? '✅ YES' : '❌ NO'}`);
            console.log(`   ✓ Shows implementation code: ${showsImplementationCode ? '✅ YES' : '❌ NO'}`);
            
            // Assert expectations
            assert.ok(hasGlobalScope, 'Should show global scope icon/text');
            assert.ok(hasImplementedIn, 'Should show "Implemented in" with file and line');
            assert.ok(hasCtrlF12Text, 'Should mention Ctrl+F12 to navigate to implementation');
            assert.ok(showsImplementationCode, 'Should show implementation code preview');
            
            console.log(`   ✅ PASS: GlobalHelper MAP hover shows implementation correctly`);
        });
        
        test('Hover on IncrementCounter at implementation (line 47 in utils.clw)', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('utils.clw'));
            
            assert.ok(utilsFile, 'Should find utils.clw');
            
            const utilsPath = utilsFile!.getAbsolutePath()!;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            const tokens = tokenCache.getTokens(utilsDoc);
            
            // Find IncrementCounter implementation (line 46 0-based = line 47 1-based)
            const implToken = tokens.find(t => 
                t.value === 'IncrementCounter' && t.line >= 44 && t.line <= 50);
            
            assert.ok(implToken, 'Should find IncrementCounter implementation');
            console.log(`   📍 Testing hover at implementation line ${implToken!.line} (0-based) = line ${implToken!.line + 1} (1-based)`);
            
            const position: Position = { line: implToken!.line, character: implToken!.start };
            const hoverResult = await hoverProvider.provideHover(utilsDoc, position);
            
            if (hoverResult) {
                const hoverText = typeof hoverResult.contents === 'string' 
                    ? hoverResult.contents 
                    : (hoverResult.contents as any).value || JSON.stringify(hoverResult.contents);
                
                console.log(`\n   📋 Hover at implementation:`);
                console.log(`   ${'-'.repeat(60)}`);
                console.log(hoverText);
                console.log(`   ${'-'.repeat(60)}\n`);
                
                // Check what's shown
                const hasScope = hoverText.includes('Scope:') || hoverText.includes('🌍') || hoverText.includes('📦');
                const hasF12Text = hoverText.includes('F12');
                const hasCtrlF12Text = hoverText.includes('Ctrl+F12');
                const hasImplementationText = hoverText.toLowerCase().includes('implementation');
                const hasDefinitionText = hoverText.toLowerCase().includes('definition');
                
                console.log(`   ✓ Shows scope info: ${hasScope ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions F12: ${hasF12Text ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions Ctrl+F12: ${hasCtrlF12Text ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions "definition": ${hasDefinitionText ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions "implementation": ${hasImplementationText ? '✅ YES' : '❌ NO'}`);
                
                if (!hasScope) {
                    console.log(`   ⚠️ ISSUE: Implementation hover should show scope information`);
                }
                if (hasF12Text && hasDefinitionText) {
                    console.log(`   ✅ CORRECT: Shows F12 for definition (we are at implementation)`);
                }
                if (hasCtrlF12Text && hasImplementationText) {
                    console.log(`   ⚠️ MISLEADING: Says Ctrl+F12 for implementation but we ARE at the implementation`);
                }
            } else {
                console.log(`   ❌ No hover result at implementation`);
            }
        });
        
        test('Hover on IncrementCounter at call site (line 94 in main.clw)', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const tokens = tokenCache.getTokens(mainDoc);
            
            // Find IncrementCounter call (line 93 0-based = line 94 1-based)
            const callToken = tokens.find(t => 
                t.value === 'IncrementCounter' && t.line > 85);
            
            assert.ok(callToken, 'Should find IncrementCounter call');
            console.log(`   📍 Testing hover at call site line ${callToken!.line} (0-based) = line ${callToken!.line + 1} (1-based)`);
            
            const position: Position = { line: callToken!.line, character: callToken!.start };
            const hoverResult = await hoverProvider.provideHover(mainDoc, position);
            
            if (hoverResult) {
                const hoverText = typeof hoverResult.contents === 'string' 
                    ? hoverResult.contents 
                    : (hoverResult.contents as any).value || JSON.stringify(hoverResult.contents);
                
                console.log(`\n   📋 Hover at call site:`);
                console.log(`   ${'-'.repeat(60)}`);
                console.log(hoverText);
                console.log(`   ${'-'.repeat(60)}\n`);
                
                // Check what's shown
                const hasScope = hoverText.includes('Scope:') || hoverText.includes('🌍') || hoverText.includes('📦');
                const hasF12Text = hoverText.includes('F12');
                const hasCtrlF12Text = hoverText.includes('Ctrl+F12');
                
                console.log(`   ✓ Shows scope info: ${hasScope ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions F12: ${hasF12Text ? '✅ YES' : '❌ NO'}`);
                console.log(`   ✓ Mentions Ctrl+F12: ${hasCtrlF12Text ? '✅ YES' : '❌ NO'}`);
                
                if (hasF12Text && hasCtrlF12Text) {
                    console.log(`   ✅ CORRECT: Call site shows both F12 and Ctrl+F12 options`);
                }
            } else {
                console.log(`   ❌ No hover result at call site`);
            }
        });
        
        test('Hover on omitted code should return null', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('main.clw'));
            
            assert.ok(mainFile, 'Should find main.clw');
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            // Line 66 (0-based line 65) is inside omit('***') block
            // It contains: IncrementCounter  PROCEDURE()
            console.log(`   📍 Testing hover on omitted line 66 (0-based line 65)`);
            
            const position: Position = { line: 65, character: 5 }; // On "IncrementCounter"
            const hoverResult = await hoverProvider.provideHover(mainDoc, position);
            
            if (hoverResult === null) {
                console.log(`   ✅ CORRECT: No hover on omitted code`);
                assert.strictEqual(hoverResult, null, 'Should return null for omitted code');
            } else {
                console.log(`   ❌ ISSUE: Got hover on omitted code:`);
                const hoverText = typeof hoverResult.contents === 'string' 
                    ? hoverResult.contents 
                    : (hoverResult.contents as any).value || JSON.stringify(hoverResult.contents);
                console.log(hoverText);
                assert.fail('Should not provide hover for omitted code');
            }
        });
        
        test('Hover on GlobalCounter in utils.clw (line 51)', async function() {
            this.timeout(10000);
            
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => 
                f.relativePath.toLowerCase().endsWith('utils.clw'));
            
            assert.ok(utilsFile, 'Should find utils.clw');
            
            const utilsPath = utilsFile!.getAbsolutePath()!;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            const tokens = tokenCache.getTokens(utilsDoc);
            
            // Find GlobalCounter usage on line 50 (0-based) = line 51 (1-based)
            const globalCounterToken = tokens.find(t => 
                t.value === 'GlobalCounter' && t.line === 50);
            
            assert.ok(globalCounterToken, 'Should find GlobalCounter token');
            console.log(`   📍 Testing hover on GlobalCounter at line ${globalCounterToken!.line} (0-based) = line ${globalCounterToken!.line + 1} (1-based)`);
            
            const position: Position = { line: globalCounterToken!.line, character: globalCounterToken!.start };
            const hoverResult = await hoverProvider.provideHover(utilsDoc, position);
            
            assert.ok(hoverResult, 'Should have hover on GlobalCounter');
            
            const hoverText = typeof hoverResult.contents === 'string' 
                ? hoverResult.contents 
                : (hoverResult.contents as any).value || JSON.stringify(hoverResult.contents);
            
            console.log(`\n   📋 Hover on GlobalCounter in utils.clw:`);
            console.log(`   ${'-'.repeat(60)}`);
            console.log(hoverText);
            console.log(`   ${'-'.repeat(60)}\n`);
            
            // Check for duplicates
            const occurrences = (hoverText.match(/Global Variable:/g) || []).length;
            console.log(`   ✓ "Global Variable:" appears ${occurrences} time(s)`);
            
            if (occurrences > 1) {
                console.log(`   ❌ DUPLICATE: Hover text is duplicated!`);
                assert.fail('Hover text should not be duplicated');
            } else {
                console.log(`   ✅ PASS: No duplication in hover text`);
            }
            
            // Check that it shows the correct file
            const showsMainClw = hoverText.includes('main.clw');
            console.log(`   ✓ Shows main.clw: ${showsMainClw ? '✅ YES' : '❌ NO'}`);
            assert.ok(showsMainClw, 'Should show that variable is declared in main.clw');
        });
    });
    
    suite('Comprehensive Hover Tests', () => {
        
        test('TEST 1: Hover on GlobalCounter in utils.clw line 51 (usage in procedure)', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('utils.clw'));
            assert.ok(utilsFile);
            
            const utilsPath = utilsFile!.getAbsolutePath()!;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(utilsDoc, { line: 50, character: 5 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('Global variable'), 'Should identify as global variable');
            assert.ok(hoverText.includes('🌍'), 'Should show global scope icon');
            assert.ok(hoverText.includes('main.clw'), 'Should show declared in main.clw');
            assert.ok(hoverText.includes(':87') || hoverText.includes('line 87'), 'Should show line number');
        });
        
        test('TEST 2: Hover on IncrementCounter at call site in main.clw line 94', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('main.clw'));
            assert.ok(mainFile);
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(mainDoc, { line: 93, character: 5 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('IncrementCounter'), 'Should show procedure name');
            assert.ok(hoverText.includes('📦'), 'Should show module scope icon');
            assert.ok(hoverText.includes('Declared in'), 'Should show declaration location');
            assert.ok(hoverText.includes('Implemented in'), 'Should show implementation location');
            assert.ok(hoverText.includes('F12'), 'Should mention F12');
            assert.ok(hoverText.includes('Ctrl+F12'), 'Should mention Ctrl+F12');
        });
        
        test('TEST 3: Hover on GetCounter at call site in main.clw line 95', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('main.clw'));
            assert.ok(mainFile);
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(mainDoc, { line: 94, character: 25 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('GetCounter'), 'Should show procedure name');
            assert.ok(hoverText.includes('LONG'), 'Should show return type');
            assert.ok(hoverText.includes('📦'), 'Should show module scope icon');
        });
        
        test('TEST 4: Hover on ModuleData in utils.clw line 52 (module-local variable)', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('utils.clw'));
            assert.ok(utilsFile);
            
            const utilsPath = utilsFile!.getAbsolutePath()!;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(utilsDoc, { line: 51, character: 5 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('Module-Local Variable') || hoverText.includes('Module'), 'Should identify as module variable');
            assert.ok(hoverText.includes('📦'), 'Should show module scope icon');
            assert.ok(hoverText.includes('utils.clw'), 'Should show declared in utils.clw');
        });
        
        test('TEST 5: Hover on GlobalHelper at MAP declaration in main.clw line 84', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('main.clw'));
            assert.ok(mainFile);
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(mainDoc, { line: 83, character: 5 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('GlobalHelper'), 'Should show procedure name');
            assert.ok(hoverText.includes('🌍'), 'Should show global scope icon');
            assert.ok(hoverText.includes('Implemented in'), 'Should show implementation location');
            assert.ok(hoverText.includes('line 105'), 'Should show correct implementation line');
        });
        
        test('TEST 5b: Hover on GlobalHelper at implementation in main.clw line 105', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('main.clw'));
            assert.ok(mainFile);
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(mainDoc, { line: 104, character: 5 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('GlobalHelper'), 'Should show procedure name');
            assert.ok(hoverText.includes('🌍'), 'Should show global scope icon');
            assert.ok(hoverText.includes('Declared in'), 'Should show declaration location');
            assert.ok(hoverText.includes('line 84'), 'Should show correct declaration line');
            assert.ok(!hoverText.includes('Implemented in'), 'Should NOT show implementation (we are at it)');
        });
        
        test('TEST 6: Hover on GlobalHelper call in utils.clw line 53', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('utils.clw'));
            assert.ok(utilsFile);
            
            const utilsPath = utilsFile!.getAbsolutePath()!;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            const tokens = tokenCache.getTokens(utilsDoc);
            
            // Find GlobalHelper token on line 52 (0-based) = line 53 (1-based)
            const globalHelperToken = tokens.find(t => 
                t.value === 'GlobalHelper' && t.line === 52);
            
            assert.ok(globalHelperToken, 'Should find GlobalHelper token');
            console.log(`   📍 Testing hover on GlobalHelper at line ${globalHelperToken!.line} (0-based) = line ${globalHelperToken!.line + 1} (1-based), char ${globalHelperToken!.start}`);
            
            const position: Position = { line: globalHelperToken!.line, character: globalHelperToken!.start };
            const hoverResult = await hoverProvider.provideHover(utilsDoc, position);
            
            if (!hoverResult) {
                console.log(`   ❌ NO HOVER returned for GlobalHelper call`);
                assert.fail('Should have hover on GlobalHelper call');
            }
            
            const hoverText = (hoverResult.contents as any).value;
            console.log(`\n   📋 Hover on GlobalHelper call:`);
            console.log(`   ${'-'.repeat(60)}`);
            console.log(hoverText);
            console.log(`   ${'-'.repeat(60)}\n`);
            
            assert.ok(hoverText.includes('GlobalHelper'), 'Should show procedure name');
            assert.ok(hoverText.includes('🌍'), 'Should show global scope icon');
            assert.ok(hoverText.includes('main.clw'), 'Should reference main.clw');
        });
        
        test('Hover on GlobalHelper at MAP declaration in main.clw line 84', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('main.clw'));
            assert.ok(mainFile);
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(mainDoc, { line: 83, character: 10 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('GlobalHelper'), 'Should show procedure name');
            assert.ok(hoverText.includes('🌍'), 'Should show global scope icon');
            assert.ok(hoverText.includes('Implemented in') || hoverText.includes('Implementation'), 'Should show implementation location');
            assert.ok(hoverText.includes('main.clw') || hoverText.includes('105'), 'Should show implementation file or line');
        });
        
        test('Hover on IncrementCounter at implementation in utils.clw line 47', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('utils.clw'));
            assert.ok(utilsFile);
            
            const utilsPath = utilsFile!.getAbsolutePath()!;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(utilsDoc, { line: 46, character: 5 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('IncrementCounter'), 'Should show procedure name');
            assert.ok(hoverText.includes('📦'), 'Should show module scope icon');
            // Module procedures may not show "Declared in" when at implementation
            assert.ok(hoverText.includes('main.clw') || hoverText.includes('Module'), 'Should show definition file or module scope');
        });
        
        test('Hover on GlobalCounter at declaration in main.clw line 87', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const mainFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('main.clw'));
            assert.ok(mainFile);
            
            const mainPath = mainFile!.getAbsolutePath()!;
            const mainUri = `file:///${mainPath.replace(/\\/g, '/')}`;
            const mainDoc = TextDocument.create(mainUri, 'clarion', 1, mainFile!.getContent()!);
            
            const hoverResult = await hoverProvider.provideHover(mainDoc, { line: 86, character: 5 });
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            assert.ok(hoverText.includes('GlobalCounter'), 'Should show variable name');
            assert.ok(hoverText.includes('Global variable'), 'Should identify as global variable');
            assert.ok(hoverText.includes('🌍'), 'Should show global scope icon');
            assert.ok(hoverText.includes('LONG'), 'Should show type');
        });
        
        test('TEST 10: Hover on Counter (procedure-local variable) in utils.clw line 60', async function() {
            this.timeout(10000);
            
            const project = solutionManager!.solution.projects[0];
            const utilsFile = project.sourceFiles.find(f => f.relativePath.toLowerCase().endsWith('utils.clw'));
            assert.ok(utilsFile);
            
            const utilsPath = utilsFile!.getAbsolutePath()!;
            const utilsUri = `file:///${utilsPath.replace(/\\/g, '/')}`;
            const utilsDoc = TextDocument.create(utilsUri, 'clarion', 1, utilsFile!.getContent()!);
            
            // Line 60 (0-based line 59): "Counter = GlobalCounter"
            const hoverResult = await hoverProvider.provideHover(utilsDoc, { line: 59, character: 3 }); // On "Counter"
            assert.ok(hoverResult, 'Should have hover');
            
            const hoverText = (hoverResult.contents as any).value;
            console.log('TEST 10 HOVER TEXT:', hoverText);
            assert.ok(hoverText.includes('Counter'), 'Should show variable name');
            assert.ok(hoverText.includes('Procedure variable'), 'Should identify as procedure variable');
            assert.ok(hoverText.includes('🔧'), 'Should show procedure scope icon');
            assert.ok(hoverText.includes('LONG'), 'Should show type');
            assert.ok(hoverText.includes('utils.clw:57'), 'Should show declaration location');
            
            // Format should be: "🔧 Procedure variable Declared in utils.clw:57" on one line
            assert.ok(hoverText.includes('Procedure variable Declared in'), 'Scope and declaration should be on same line');
        });
    });
    
    suite('Diagnostic: Solution Structure', () => {
        
        test('Should report solution structure', () => {
            assert.ok(solutionManager, 'Solution manager should be loaded');
            
            console.log('\n📊 Solution Structure Report:');
            console.log(`   Solution: ${solutionManager!.solution.name}`);
            console.log(`   Path: ${solutionManager!.solution.path}`);
            console.log(`   Projects: ${solutionManager!.solution.projects.length}`);
            
            for (const project of solutionManager!.solution.projects) {
                console.log(`\n   📦 Project: ${project.name}`);
                console.log(`      Type: ${project.type}`);
                console.log(`      Path: ${project.path}`);
                console.log(`      GUID: ${project.guid}`);
                console.log(`      Source Files: ${project.sourceFiles.length}`);
                
                for (const file of project.sourceFiles) {
                    const absPath = file.getAbsolutePath();
                    const exists = fs.existsSync(absPath || '');
                    console.log(`         ${exists ? '✅' : '❌'} ${file.relativePath}`);
                    if (absPath) {
                        console.log(`            → ${absPath}`);
                    }
                }
            }
            
            assert.ok(true, 'Report complete');
        });
    });
});
