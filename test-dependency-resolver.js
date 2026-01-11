// Quick test script to debug ProjectDependencyResolver locally
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const solutionDir = 'F:\\github\\Clarion-Extension\\Clarion-Extension\\ai\\analysis\\compile\\ap1';

// Parse a .cwproj file
async function parseProjectFile(projectFilePath) {
    if (!fs.existsSync(projectFilePath)) {
        console.log(`Project file not found: ${projectFilePath}`);
        return null;
    }

    try {
        const content = fs.readFileSync(projectFilePath, 'utf8');
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(content);

        const project = result.Project;
        if (!project) {
            return null;
        }

        // Extract ProjectGuid
        let guid = '';
        if (project.PropertyGroup) {
            for (const propGroup of project.PropertyGroup) {
                if (propGroup.ProjectGuid && propGroup.ProjectGuid[0]) {
                    guid = propGroup.ProjectGuid[0].replace(/[{}]/g, '');
                    break;
                }
            }
        }

        // Extract ProjectReferences
        const references = [];
        if (project.ItemGroup) {
            for (const itemGroup of project.ItemGroup) {
                if (itemGroup.ProjectReference) {
                    for (const ref of itemGroup.ProjectReference) {
                        const refGuid = ref.Project?.[0]?.replace(/[{}]/g, '') || '';
                        const refName = ref.Name?.[0] || '';
                        const refFile = ref.$?.Include || '';
                        
                        if (refGuid) {
                            references.push({
                                projectGuid: refGuid,
                                projectName: refName,
                                projectFile: refFile
                            });
                        }
                    }
                }
            }
        }

        return { guid, references };
    } catch (error) {
        console.error(`Error parsing project file ${projectFilePath}: ${error}`);
        return null;
    }
}

// Test IBSMBZ specifically
async function testIBSMBZ() {
    console.log('=== Testing IBSMBZ.cwproj ===\n');
    
    const ibsmbzPath = path.join(solutionDir, 'IBSMBZ.cwproj');
    const data = await parseProjectFile(ibsmbzPath);
    
    if (data) {
        console.log(`IBSMBZ GUID: ${data.guid}`);
        console.log(`Dependencies (${data.references.length}):`);
        for (const ref of data.references) {
            console.log(`  - ${ref.projectName} (${ref.projectGuid}) [${ref.projectFile}]`);
            
            // Now check if this dependency also depends on IBSMBZ
            const depPath = path.join(solutionDir, ref.projectFile);
            if (fs.existsSync(depPath)) {
                const depData = await parseProjectFile(depPath);
                if (depData) {
                    const hasIBSMBZRef = depData.references.some(r => 
                        r.projectName.toLowerCase() === 'ibsmbz' || 
                        r.projectGuid === data.guid
                    );
                    if (hasIBSMBZRef) {
                        console.log(`    ⚠️ ${ref.projectName} ALSO depends on IBSMBZ - CIRCULAR!`);
                    }
                }
            }
        }
    }
}

testIBSMBZ().catch(console.error);
