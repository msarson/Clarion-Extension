/**
 * Test script to examine GlobalSolutionHistory behavior
 * Run with: node test-solution-history.js
 */

// Simulate the global state storage
class MockGlobalState {
    constructor() {
        this.storage = new Map();
    }

    get(key, defaultValue) {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue;
    }

    async update(key, value) {
        this.storage.set(key, value);
        console.log(`✅ Updated storage[${key}] with ${JSON.stringify(value, null, 2)}`);
    }
}

// Mock context
const mockContext = {
    globalState: new MockGlobalState()
};

const GLOBAL_STATE_KEY = 'clarion.recentSolutionReferences';

// Simulate adding solutions
async function testAddSolution(solutionFile, folderPath) {
    console.log(`\n🔵 Adding solution: ${solutionFile}`);
    
    const reference = {
        folderPath,
        settingsPath: folderPath + '\\.vscode\\settings.json',
        solutionFile,
        lastOpened: new Date()
    };

    // Get existing references
    const references = mockContext.globalState.get(GLOBAL_STATE_KEY, []);
    console.log(`📊 Current references: ${references.length}`);

    // Remove any existing reference to this solution
    const filtered = references.filter(ref => 
        ref.solutionFile.toLowerCase() !== solutionFile.toLowerCase()
    );

    // Add to the beginning
    filtered.unshift(reference);

    // Limit to 20
    const limited = filtered.slice(0, 20);

    // Save
    await mockContext.globalState.update(GLOBAL_STATE_KEY, limited);
    console.log(`✅ Total solutions after add: ${limited.length}`);
}

async function testGetReferences() {
    console.log(`\n🔵 Getting references...`);
    const references = mockContext.globalState.get(GLOBAL_STATE_KEY, []);
    console.log(`📊 Retrieved ${references.length} references`);
    references.forEach((ref, idx) => {
        console.log(`  ${idx + 1}. ${ref.solutionFile}`);
    });
    return references;
}

// Run tests
async function runTests() {
    console.log('🧪 Starting GlobalSolutionHistory Tests\n');
    
    // Test 1: Add first solution
    await testAddSolution('C:\\Projects\\Solution1.sln', 'C:\\Projects');
    await testGetReferences();
    
    // Test 2: Add second solution
    await testAddSolution('C:\\Projects\\Solution2.sln', 'C:\\Projects');
    await testGetReferences();
    
    // Test 3: Add third solution
    await testAddSolution('C:\\Projects\\Solution3.sln', 'C:\\Projects');
    await testGetReferences();
    
    // Test 4: Re-add first solution (should move to top)
    await testAddSolution('C:\\Projects\\Solution1.sln', 'C:\\Projects');
    await testGetReferences();
    
    console.log('\n✅ All tests complete!');
}

runTests().catch(console.error);
