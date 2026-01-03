import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { SolutionManager } from '../solution/solutionManager';
import { ClassDefinitionIndexer } from '../utils/ClassDefinitionIndexer';
import { serverSettings } from '../serverSettings';

/**
 * Test suite for ClassDefinitionIndexer
 * 
 * This test uses the real Clarion library files and the scope-test-suite solution
 * to test the class definition indexer functionality.
 */
suite('ClassDefinitionIndexer Tests', () => {
    let solutionManager: SolutionManager | null = null;
    
    suiteSetup(async function() {
        this.timeout(30000);
        
        console.log('\n🔧 Setting up ClassDefinitionIndexer tests...');
        
        try {
            // Configure serverSettings for redirection file parsing
            // These would normally be set by the client when opening a solution
            serverSettings.redirectionFile = 'Clarion111.RED';
            serverSettings.redirectionPaths = ['C:\\Clarion\\Clarion11.1\\bin']; // Default Clarion bin path
            serverSettings.macros = {
                'root': 'C:\\Clarion\\Clarion11.1',
                'bin': 'C:\\Clarion\\Clarion11.1\\bin'
            };
            serverSettings.configuration = 'Debug';
            
            console.log('✅ ServerSettings configured');
            console.log(`   📂 Redirection file: ${serverSettings.redirectionFile}`);
            console.log(`   📂 Primary redirection path: ${serverSettings.primaryRedirectionPath}`);
            
            // Load the test solution
            const testSolutionPath = path.resolve(__dirname, 
                '..', '..', '..', '..', 'test-programs', 'scope-test-suite', 'ScopeTestSuite.sln');
            
            console.log(`📂 Test solution path: ${testSolutionPath}`);
            
            if (!fs.existsSync(testSolutionPath)) {
                throw new Error(`Test solution not found: ${testSolutionPath}`);
            }
            
            console.log('🔄 Loading solution...');
            solutionManager = await SolutionManager.create(testSolutionPath);
            
            console.log(`✅ Solution loaded with ${solutionManager.solution.projects.length} project(s)`);
            
        } catch (error) {
            console.error('❌ Failed to load solution:', error);
            throw error;
        }
    });
    
    suiteTeardown(() => {
        console.log('🧹 Cleaning up ClassDefinitionIndexer tests...');
        if (solutionManager) {
            SolutionManager.clearAllCaches();
        }
    });
    
    suite('Phase 1: Index Building', () => {
        
        test('Should build index from redirection paths', async function() {
            this.timeout(10000);
            
            const indexer = new ClassDefinitionIndexer();
            const projectPath = solutionManager!.solution.projects[0].path;
            console.log(`   📂 Project path: ${projectPath}`);
            
            const index = await indexer.buildIndex(projectPath);
            
            assert.ok(index, 'Index should be created');
            assert.ok(index.classes.size > 0, 'Index should contain classes');
            
            console.log(`   ✅ Index created with ${index.classes.size} unique class names`);
        });
        
        test('Should find StringTheory class in index', async function() {
            this.timeout(10000);
            
            const indexer = new ClassDefinitionIndexer();
            const projectPath = solutionManager!.solution.projects[0].path;
            const index = await indexer.buildIndex(projectPath);
            
            const stringTheoryDef = index.classes.get('stringtheory'); // lowercase key
            assert.ok(stringTheoryDef, 'Should find StringTheory class');
            assert.ok(stringTheoryDef.length > 0, 'Should have at least one definition');
            assert.ok(stringTheoryDef[0].filePath.toLowerCase().includes('stringtheory.inc'), 'Should be in StringTheory.inc');
            
            console.log(`   ✅ Found StringTheory at: ${stringTheoryDef[0].filePath}:${stringTheoryDef[0].lineNumber}`);
        });
        
        test('Should complete index build in reasonable time (<5 seconds)', async function() {
            this.timeout(10000);
            
            const indexer = new ClassDefinitionIndexer();
            const projectPath = solutionManager!.solution.projects[0].path;
            
            const startTime = Date.now();
            const index = await indexer.buildIndex(projectPath);
            const duration = Date.now() - startTime;
            
            console.log(`   ⏱️  Index built in ${duration}ms`);
            console.log(`   📊 Found ${index.classes.size} unique class names`);
            console.log(`   📦 Total definitions: ${Array.from(index.classes.values()).flat().length}`);
            
            assert.ok(duration < 5000, `Index build took ${duration}ms, should be under 5000ms`);
        });
    });
    
    suite('Phase 2: Class Definition Lookup', () => {
        
        test.skip('Should find class definition by name (case-insensitive)', async function() {
            this.timeout(10000);
            
            // TODO: Implement ClassDefinitionIndexer
            // const indexer = new ClassDefinitionIndexer();
            // const projectPath = solutionManager!.solution.projects[0].projectDirectory;
            // await indexer.buildIndex(projectPath);
            
            // // Test case-insensitive lookup
            // const result1 = indexer.findClass('StringTheory');
            // const result2 = indexer.findClass('stringtheory');
            // const result3 = indexer.findClass('STRINGTHEORY');
            
            // assert.ok(result1, 'Should find StringTheory');
            // assert.ok(result2, 'Should find stringtheory (lowercase)');
            // assert.ok(result3, 'Should find STRINGTHEORY (uppercase)');
            
            console.log('⏭️  Test skipped - waiting for ClassDefinitionIndexer implementation');
        });
        
        test.skip('Should return null for non-existent class', async function() {
            this.timeout(10000);
            
            // TODO: Implement ClassDefinitionIndexer
            // const indexer = new ClassDefinitionIndexer();
            // const projectPath = solutionManager!.solution.projects[0].projectDirectory;
            // await indexer.buildIndex(projectPath);
            
            // const result = indexer.findClass('NonExistentClass');
            // assert.strictEqual(result, null, 'Should return null for non-existent class');
            
            console.log('⏭️  Test skipped - waiting for ClassDefinitionIndexer implementation');
        });
        
        test.skip('Should handle classes with multiple definitions', async function() {
            this.timeout(10000);
            
            // TODO: Implement ClassDefinitionIndexer
            // Some classes might be defined in multiple files (e.g., base class and derived)
            // The indexer should return all definitions
            
            console.log('⏭️  Test skipped - waiting for ClassDefinitionIndexer implementation');
        });
    });
    
    suite('Phase 3: Performance & Caching', () => {
        
        test.skip('Should cache index and reuse on subsequent calls', async function() {
            this.timeout(10000);
            
            // TODO: Implement ClassDefinitionIndexer
            // const indexer = new ClassDefinitionIndexer();
            // const projectPath = solutionManager!.solution.projects[0].projectDirectory;
            
            // // First call should build index
            // const start1 = Date.now();
            // await indexer.getOrBuildIndex(projectPath);
            // const duration1 = Date.now() - start1;
            
            // // Second call should use cache
            // const start2 = Date.now();
            // await indexer.getOrBuildIndex(projectPath);
            // const duration2 = Date.now() - start2;
            
            // console.log(`   ⏱️  First call: ${duration1}ms`);
            // console.log(`   ⏱️  Second call (cached): ${duration2}ms`);
            
            // assert.ok(duration2 < duration1 / 10, 'Cached call should be at least 10x faster');
            
            console.log('⏭️  Test skipped - waiting for ClassDefinitionIndexer implementation');
        });
        
        test.skip('Should handle different projects with different redirection files', async function() {
            this.timeout(10000);
            
            // TODO: Implement ClassDefinitionIndexer
            // Different projects might have different redirection files pointing to different paths
            // The indexer should maintain separate indexes per project
            
            console.log('⏭️  Test skipped - waiting for ClassDefinitionIndexer implementation');
        });
    });
    
    suite('Phase 4: Edge Cases', () => {
        
        test.skip('Should handle files with multiple class definitions', async function() {
            this.timeout(10000);
            
            // TODO: Implement ClassDefinitionIndexer
            // Files like secwin.inc have 28 classes
            // All should be indexed correctly
            
            console.log('⏭️  Test skipped - waiting for ClassDefinitionIndexer implementation');
        });
        
        test.skip('Should correctly parse CLASS with attributes', async function() {
            this.timeout(10000);
            
            // TODO: Implement ClassDefinitionIndexer
            // Should handle:
            // - ClassName CLASS
            // - ClassName CLASS()
            // - ClassName CLASS(ParentClass)
            // - ClassName CLASS,TYPE
            // - ClassName CLASS,MODULE('file.clw')
            
            console.log('⏭️  Test skipped - waiting for ClassDefinitionIndexer implementation');
        });
        
        test.skip('Should handle invalid or missing redirection files gracefully', async function() {
            this.timeout(10000);
            
            // TODO: Implement ClassDefinitionIndexer
            // Should not crash if redirection file is missing or invalid
            
            console.log('⏭️  Test skipped - waiting for ClassDefinitionIndexer implementation');
        });
    });
});
