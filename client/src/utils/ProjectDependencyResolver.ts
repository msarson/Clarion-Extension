import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { ClarionProjectInfo } from '../../../common/types';
import LoggerManager from './LoggerManager';

const logger = LoggerManager.getLogger("ProjectDependencyResolver");

export interface ProjectReference {
    projectGuid: string;
    projectName: string;
    projectFile: string;
}

export interface ProjectNode {
    project: ClarionProjectInfo;
    guid: string;
    references: ProjectReference[]; // Full reference info (name, GUID, file)
    outputType?: string; // "Library" or "WinExe"
}

export class ProjectDependencyResolver {
    private projectNodes: Map<string, ProjectNode> = new Map();
    private guidToProject: Map<string, ClarionProjectInfo> = new Map();
    private nameToNode: Map<string, ProjectNode> = new Map(); // Name-based lookup

    constructor(private solutionDir: string, private projects: ClarionProjectInfo[]) {}

    /**
     * Analyzes all projects and builds the dependency graph
     */
    public async analyzeDependencies(): Promise<void> {
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
                        references: projectData.references,
                        outputType: projectData.outputType
                    };

                    this.projectNodes.set(guid, node);
                    this.guidToProject.set(guid, project);
                    this.nameToNode.set(project.name.toLowerCase(), node); // Case-insensitive name lookup
                }
            } catch (error) {
                logger.error(`Failed to parse project ${project.name}: ${error}`);
            }
        }
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

        // Helper function to resolve a project reference by name first, then GUID
        const resolveReference = (ref: ProjectReference): ProjectNode | null => {
            // Try name-based lookup first (preferred)
            if (ref.projectName) {
                const nodeByName = this.nameToNode.get(ref.projectName.toLowerCase());
                if (nodeByName) {
                    return nodeByName;
                }
            }
            
            // Fallback to GUID lookup
            const nodeByGuid = this.projectNodes.get(ref.projectGuid);
            if (nodeByGuid) {
                return nodeByGuid;
            }
            
            // Not found by either method
            logger.warn(`Cannot resolve project reference: name="${ref.projectName}", GUID=${ref.projectGuid}`);
            return null;
        };

        // Helper function for depth-first search
        const visit = (guid: string, pathStack: string[] = []): boolean => {
            if (visited.has(guid)) {
                return true;
            }

            if (visiting.has(guid)) {
                // Circular dependency detected - log it with full path
                const node = this.projectNodes.get(guid);
                const cyclePath = [...pathStack, node?.project.name || guid].join(' -> ');
                logger.warn(`⚠️ Circular dependency detected: ${cyclePath}`);
                logger.warn(`   Skipping this circular edge to allow sort to continue`);
                return true; // Don't fail, just skip this circular edge
            }

            const node = this.projectNodes.get(guid);
            if (!node) {
                // Project reference doesn't exist in solution - skip it
                logger.warn(`Skipping missing project reference: ${guid}`);
                return true;
            }

            visiting.add(guid);
            const newPath = [...pathStack, node.project.name];

            // Visit all dependencies first
            for (const ref of node.references) {
                const depNode = resolveReference(ref);
                if (depNode) {
                    if (!visit(depNode.guid, newPath)) {
                        return false;
                    }
                }
            }

            visited.add(guid);
            visiting.delete(guid);
            sorted.push(node.project);

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
                visit(node.guid, []);
            }
        }

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
                .map(ref => ref.projectName || `Unknown(${ref.projectGuid})`)
                .join(', ');
            
            lines.push(`${node.project.name} (${node.outputType || 'Unknown'})${depNames ? ` -> ${depNames}` : ''}`);
        }
        
        return lines.join('\n');
    }
}
