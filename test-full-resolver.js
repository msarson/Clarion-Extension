// Full test of ProjectDependencyResolver with ap1 solution
const path = require('path');

// Import the compiled ProjectDependencyResolver
const { ProjectDependencyResolver } = require('./out/client/src/utils/ProjectDependencyResolver');

const solutionDir = 'F:\\github\\Clarion-Extension\\Clarion-Extension\\ai\\analysis\\compile\\ap1';

// Mock projects from ap1.sln
const projects = [
    { name: 'ap1', path: solutionDir, filename: 'ap1.cwproj' },
    { name: 'IBSMBZ', path: solutionDir, filename: 'IBSMBZ.cwproj' },
    { name: 'IBSQuery', path: solutionDir, filename: 'IBSQuery.cwproj' },
    { name: 'XMLFunctions', path: solutionDir, filename: 'XMLFunctions.cwproj' },
    { name: 'DMCommon', path: solutionDir, filename: 'DMCommon.cwproj' },
    { name: 'IBSBilling', path: solutionDir, filename: 'IBSBilling.cwproj' },
    { name: 'AR1', path: solutionDir, filename: 'AR1.cwproj' },
    { name: 'BekinsStatement', path: solutionDir, filename: 'BekinsStatement.cwproj' },
    { name: 'BM1', path: solutionDir, filename: 'BM1.cwproj' },
    { name: 'cm1', path: solutionDir, filename: 'cm1.cwproj' },
    { name: 'CRSInvoice', path: solutionDir, filename: 'CRSInvoice.cwproj' },
    { name: 'CRS', path: solutionDir, filename: 'CRS.cwproj' },
    { name: 'DMS', path: solutionDir, filename: 'DMS.cwproj' },
    { name: 'DMX', path: solutionDir, filename: 'DMX.cwproj' },
    { name: 'GLReports', path: solutionDir, filename: 'GLReports.cwproj' },
    { name: 'gl1', path: solutionDir, filename: 'gl1.cwproj' },
    { name: 'glc', path: solutionDir, filename: 'glc.cwproj' },
    { name: 'IBS2SQL', path: solutionDir, filename: 'IBS2SQL.cwproj' },
    { name: 'IBSMenu', path: solutionDir, filename: 'IBSMenu.cwproj' },
    { name: 'IBSSetUp', path: solutionDir, filename: 'IBSSetUp.cwproj' },
    { name: 'jm1', path: solutionDir, filename: 'jm1.cwproj' },
    { name: 'py1', path: solutionDir, filename: 'py1.cwproj' },
    { name: 'SIRVAStatement', path: solutionDir, filename: 'SIRVAStatement.cwproj' },
    { name: 'sm1', path: solutionDir, filename: 'sm1.cwproj' },
    { name: 'UniGroupStatement', path: solutionDir, filename: 'UniGroupStatement.cwproj' },
    { name: 'VL1', path: solutionDir, filename: 'VL1.cwproj' },
    { name: 'vm1', path: solutionDir, filename: 'vm1.cwproj' },
    { name: 'wls', path: solutionDir, filename: 'wls.cwproj' },
    { name: 'UpdateSQL', path: solutionDir, filename: 'UpdateSQL.cwproj' },
    { name: 'IBSEmail', path: solutionDir, filename: 'IBSEmail.cwproj' },
    { name: 'IBSPrintForm', path: solutionDir, filename: 'IBSPrintForm.cwproj' },
    { name: 'SQLInstallAndUpgrade', path: solutionDir, filename: 'SQLInstallAndUpgrade.cwproj' },
    { name: 'AtlasPRVService', path: solutionDir, filename: 'AtlasPRVService.cwproj' },
    { name: 'IBSUtils', path: solutionDir, filename: 'IBSUtils.cwproj' },
    { name: 'StateCalc', path: solutionDir, filename: 'StateCalc.cwproj' },
    { name: 'PRVAnalysis', path: solutionDir, filename: 'PRVAnalysis.cwproj' },
    { name: 'PRVData', path: solutionDir, filename: 'PRVData.cwproj' },
    { name: 'Loggger', path: solutionDir, filename: 'Loggger.cwproj' },
    { name: 'IBSCommon', path: solutionDir, filename: 'IBSCommon.cwproj' },
    { name: 'Upgrader', path: solutionDir, filename: 'Upgrader.cwproj' }
];

async function test() {
    console.log('=== Testing ProjectDependencyResolver with ap1.sln ===\n');
    
    const resolver = new ProjectDependencyResolver(solutionDir, projects);
    
    console.log('Analyzing dependencies...\n');
    await resolver.analyzeDependencies();
    
    console.log('\nGetting build order...\n');
    const buildOrder = resolver.getBuildOrder();
    
    console.log('\n=== Build Order ===');
    buildOrder.forEach((proj, idx) => {
        console.log(`${idx + 1}. ${proj.name}`);
    });
    
    console.log(`\nTotal: ${buildOrder.length} projects`);
    console.log(`First 5: ${buildOrder.slice(0, 5).map(p => p.name).join(', ')}`);
    console.log(`Last 5: ${buildOrder.slice(-5).map(p => p.name).join(', ')}`);
}

test().catch(console.error);
