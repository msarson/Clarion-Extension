import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { ClarionProjectInfo } from '../../../common/types';
import LoggerManager from './LoggerManager';

const logger = LoggerManager.getLogger("ProjectDependencyResolver");
logger.setLevel("info"); // Enable info logging for debugging

export interface ProjectReference {
    projectGuid: string;
    projectName: string;
    projectFile: string;
}

export interface ProjectNode {
    project: ClarionProjectInfo;
    guid: string;
    references: string[]; // GUIDs of projects this depends on
    outputType?: string; // "Library" or "WinExe"
}

export class ProjectDependencyResolver {
    private projectNodes: Map<string, ProjectNode> = new Map();
    private guidToProject: Map<string, ClarionProjectInfo> = new Map();

    constructor(private solutionDir: string, private projects: ClarionProjectInfo[]) {}

    /**
     * Analyzes all projects and builds the dependency graph
     */
    public async analyzeDependencies(): Promise<void> {
        logger.info(`Analyzing dependencies for ${this.projects.length} projects`);

        // First pass: Extract project GUIDs and basic info
        for (const project of this.projects) {
            try {
                const projectFilePath = path.join(project.path, project.filename || `${project.name}.cwproj`);
                const projectData = await this.parseProjectFile(projectFilePath);
                
                if (projectData) {
                    const guid = projectData.guid;
                    const node: ProjectNode = {
                        project,
                        guid,
                        references: projectData.references.map(ref => ref.projectGuid),
                        outputType: projectData.outputType
                    };

                    this.projectNodes.set(guid, node);
                    this.guidToProject.set(guid, project);
                    
                    logger.info(`  Project: ${project.name}, GUID: ${guid}, OutputType: ${projectData.outputType}, Dependencies: ${projectData.references.length}`);
                }
            } catch (error) {
                logger.error(`Failed to parse project ${project.name}: ${error}`);
            }
        }

        logger.info(`Built dependency graph with ${this.projectNodes.size} nodes`);
    }

    /**
     * Parses a .cwproj file to extract GUID, references, and output type
     */
    private async parseProjectFile(projectFilePath: string): Promise<{
        guid: string;
        references: ProjectReference[];
        outputType?: string;
    } | null> {
        if (!fs.existsSync(projectFilePath)) {
            logger.warn(`Project file not found: ${projectFilePath}`);
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

            // Extract OutputType
            let outputType: string | undefined;
            if (project.PropertyGroup) {
                for (const propGroup of project.PropertyGroup) {
                    if (propGroup.OutputType && propGroup.OutputType[0]) {
                        outputType = propGroup.OutputType[0];
                        break;
                    }
                }
            }

            // Extract ProjectReferences
            const references: ProjectReference[] = [];
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

            return { guid, references, outputType };
        } catch (error) {
            logger.error(`Error parsing project file ${projectFilePath}: ${error}`);
            return null;
        }
    }

    /**
     * Performs topological sort to determine build order
     * Returns projects in the order they should be built
     */
    public getBuildOrder(): ClarionProjectInfo[] {
        const sorted: ClarionProjectInfo[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        // Helper function for depth-first search
        const visit = (guid: string): boolean => {
            if (visited.has(guid)) {
                return true;
            }

            if (visiting.has(guid)) {
                logger.error(`Circular dependency detected involving project with GUID: ${guid}`);
                return false;
            }

            visiting.add(guid);

            const node = this.projectNodes.get(guid);
            if (node) {
                // Visit all dependencies first
                for (const depGuid of node.references) {
                    if (!visit(depGuid)) {
                        return false;
                    }
                }

                visited.add(guid);
                visiting.delete(guid);
                sorted.push(node.project);
            }

            return true;
        };

        // First, sort nodes to prioritize libraries over executables
        const nodeArray = Array.from(this.projectNodes.values());
        nodeArray.sort((a, b) => {
            // Libraries come before executables
            if (a.outputType === 'Library' && b.outputType !== 'Library') {
                return -1;
            }
            if (a.outputType !== 'Library' && b.outputType === 'Library') {
                return 1;
            }
            return 0;
        });

        // Visit all nodes
        for (const node of nodeArray) {
            if (!visited.has(node.guid)) {
                if (!visit(node.guid)) {
                    logger.error('Topological sort failed due to circular dependencies');
                    // Return projects in original order as fallback
                    return this.projects;
                }
            }
        }

        logger.info(`Before reverse: First=${sorted[0]?.name}, Last=${sorted[sorted.length-1]?.name}`);
        
        // Reverse the array because DFS post-order gives us reverse topological order
        // Dependencies are added last, but should be built first
        sorted.reverse();
        
        logger.info(`After reverse: First=${sorted[0]?.name}, Last=${sorted[sorted.length-1]?.name}`);
        logger.info(`Build order determined: ${sorted.map(p => p.name).join(' -> ')}`);
        return sorted;
    }

    /**
     * Gets a summary of the dependency graph for debugging
     */
    public getDependencySummary(): string {
        const lines: string[] = [];
        lines.push('=== Project Dependency Graph ===');
        
        for (const [guid, node] of this.projectNodes) {
            const depNames = node.references
                .map(depGuid => {
                    const depNode = this.projectNodes.get(depGuid);
                    return depNode ? depNode.project.name : `Unknown(${depGuid})`;
                })
                .join(', ');
            
            lines.push(`${node.project.name} (${node.outputType || 'Unknown'})${depNames ? ` -> ${depNames}` : ''}`);
        }
        
        return lines.join('\n');
    }
}
