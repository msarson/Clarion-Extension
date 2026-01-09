import { describe, it, before } from 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Cross-File Scope Integration Tests
 * 
 * Tests that validate cross-file navigation and hover behavior respects Clarion scope rules:
 * - Global variables (in PROGRAM files) are accessible everywhere
 * - Module-local variables (in MEMBER files) are only accessible within that file
 * - Procedures follow similar rules based on file type
 */
describe('Cross-File Scope - Integration Tests', () => {
    let mainDocUri: vscode.Uri;
    let utilsDocUri: vscode.Uri;
    
    before(async function() {
        this.timeout(30000); // Allow time for extension activation
        
        const testSuiteRoot = path.join(__dirname, '..', '..', '..', '..', 'test-programs', 'scope-test-suite');
        mainDocUri = vscode.Uri.file(path.join(testSuiteRoot, 'main.clw'));
        utilsDocUri = vscode.Uri.file(path.join(testSuiteRoot, 'utils.clw'));
        
        // Open both documents to ensure they're loaded
        await vscode.workspace.openTextDocument(mainDocUri);
        await vscode.workspace.openTextDocument(utilsDocUri);
        
        // Wait for extension activation
        await new Promise(resolve => setTimeout(resolve, 2000));
    });
    
    describe('TEST 1: Global variable cross-file access', () => {
        it('should navigate from utils.clw to GlobalCounter in main.clw', async () => {
            const doc = await vscode.workspace.openTextDocument(utilsDocUri);
            
            // Line 43 (0-indexed line 42): Counter = GlobalCounter
            // Position on "GlobalCounter" 
            const position = new vscode.Position(42, 15);
            
            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                utilsDocUri,
                position
            );
            
            assert.ok(definitions && definitions.length > 0, 'Should find definition for GlobalCounter');
            assert.strictEqual(definitions[0].uri.fsPath, mainDocUri.fsPath, 'Should navigate to main.clw');
            assert.strictEqual(definitions[0].range.start.line, 66, 'Should navigate to line 67 (0-indexed 66)');
        });
        
        it('should show hover info for GlobalCounter in utils.clw', async () => {
            const doc = await vscode.workspace.openTextDocument(utilsDocUri);
            const position = new vscode.Position(42, 15);
            
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                utilsDocUri,
                position
            );
            
            assert.ok(hovers && hovers.length > 0, 'Should show hover for GlobalCounter');
            const hoverText = hovers[0].contents.map(c => (c as vscode.MarkdownString).value).join('\n');
            assert.ok(hoverText.includes('GlobalCounter'), 'Hover should mention GlobalCounter');
            assert.ok(hoverText.includes('Global') || hoverText.includes('🌍'), 'Hover should indicate global scope');
        });
    });
    
    describe('TEST 2: MAP procedure cross-file navigation', () => {
        it('should navigate from call to MAP declaration', async () => {
            const doc = await vscode.workspace.openTextDocument(mainDocUri);
            
            // Line 75 (0-indexed line 74): IncrementCounter()
            const position = new vscode.Position(74, 5);
            
            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                mainDocUri,
                position
            );
            
            assert.ok(definitions && definitions.length > 0, 'Should find MAP declaration');
            assert.strictEqual(definitions[0].range.start.line, 59, 'Should navigate to MAP declaration at line 60 (0-indexed 59)');
        });
        
        it('should navigate from MAP declaration to implementation', async () => {
            const doc = await vscode.workspace.openTextDocument(mainDocUri);
            
            // Line 60 (0-indexed line 59): IncrementCounter() in MAP
            const position = new vscode.Position(59, 5);
            
            const implementations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeImplementationProvider',
                mainDocUri,
                position
            );
            
            assert.ok(implementations && implementations.length > 0, 'Should find implementation');
            assert.strictEqual(implementations[0].uri.fsPath, utilsDocUri.fsPath, 'Should navigate to utils.clw');
            assert.strictEqual(implementations[0].range.start.line, 33, 'Should navigate to line 34 (0-indexed 33)');
        });
    });
    
    describe('TEST 3: Module-local variable in same file', () => {
        it('should navigate to ModuleData within utils.clw', async () => {
            const doc = await vscode.workspace.openTextDocument(utilsDocUri);
            
            // Line 38 (0-indexed line 37): ModuleData = 99
            const position = new vscode.Position(37, 5);
            
            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                utilsDocUri,
                position
            );
            
            assert.ok(definitions && definitions.length > 0, 'Should find definition for ModuleData');
            assert.strictEqual(definitions[0].uri.fsPath, utilsDocUri.fsPath, 'Should stay in utils.clw');
            assert.strictEqual(definitions[0].range.start.line, 31, 'Should navigate to line 32 (0-indexed 31)');
        });
        
        it('should show hover for ModuleData in utils.clw', async () => {
            const doc = await vscode.workspace.openTextDocument(utilsDocUri);
            const position = new vscode.Position(37, 5);
            
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                utilsDocUri,
                position
            );
            
            assert.ok(hovers && hovers.length > 0, 'Should show hover for ModuleData');
            const hoverText = hovers[0].contents.map(c => (c as vscode.MarkdownString).value).join('\n');
            assert.ok(hoverText.includes('ModuleData'), 'Hover should mention ModuleData');
            assert.ok(hoverText.includes('Module') || hoverText.includes('📦'), 'Hover should indicate module scope');
        });
    });
    
    describe('TEST 4: Module-local variable blocked cross-file', () => {
        it('should NOT navigate to ModuleData from main.clw', async () => {
            const doc = await vscode.workspace.openTextDocument(mainDocUri);
            
            // Line 80 (0-indexed line 79): ModuleData = 999 (should be uncommented in test file)
            const position = new vscode.Position(79, 5);
            
            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                mainDocUri,
                position
            );
            
            // Should either return empty array or not navigate to utils.clw
            if (definitions && definitions.length > 0) {
                assert.notStrictEqual(definitions[0].uri.fsPath, utilsDocUri.fsPath, 
                    'Should NOT navigate to module-local variable in different file');
            }
        });
        
        it('should NOT show hover for ModuleData in main.clw', async () => {
            const doc = await vscode.workspace.openTextDocument(mainDocUri);
            const position = new vscode.Position(79, 5);
            
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                mainDocUri,
                position
            );
            
            // Should either have no hover or not show module-local variable info
            if (hovers && hovers.length > 0) {
                const hoverText = hovers[0].contents.map(c => (c as vscode.MarkdownString).value).join('\n');
                // If hover exists, it shouldn't be showing the module-local variable from utils.clw
                assert.ok(!hoverText.includes('module-local') || !hoverText.includes('utils.clw'),
                    'Should not show module-local variable info from different file');
            }
        });
    });
    
    describe('TEST 5: Local procedure variable scope', () => {
        it('should show hover for local variable Counter in GetCounter', async () => {
            const doc = await vscode.workspace.openTextDocument(utilsDocUri);
            
            // Line 43 (0-indexed line 42): Counter = GlobalCounter
            const position = new vscode.Position(42, 5);
            
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                utilsDocUri,
                position
            );
            
            assert.ok(hovers && hovers.length > 0, 'Should show hover for Counter');
            const hoverText = hovers[0].contents.map(c => (c as vscode.MarkdownString).value).join('\n');
            assert.ok(hoverText.includes('Counter'), 'Hover should mention Counter');
            assert.ok(hoverText.includes('LONG'), 'Hover should show type');
        });
    });
    
    describe('TEST 6: Global procedure cross-file call', () => {
        it('should navigate to GlobalHelper from utils.clw', async () => {
            const doc = await vscode.workspace.openTextDocument(utilsDocUri);
            
            // Find the line with GlobalHelper() call in GetCounter
            // This will be added to the test file
            const position = new vscode.Position(44, 5); // Adjust based on actual line
            
            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                utilsDocUri,
                position
            );
            
            assert.ok(definitions && definitions.length > 0, 'Should find global procedure');
            assert.strictEqual(definitions[0].uri.fsPath, mainDocUri.fsPath, 'Should navigate to main.clw');
        });
    });
});
