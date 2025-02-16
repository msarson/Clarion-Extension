import * as fs from 'fs';
import * as path from 'path';

enum DependencyType {
    Include = 'INCLUDE',
    Module = 'MODULE',
}

/**
 * Class responsible for analyzing dependencies in Clarion files.
 */
export class ClarionDependencyAnalyzer {
    private dependencyGraph: Map<string, { type: DependencyType, modulePath: string, lineNumber: number }[]>;

    /**
     * Creates an instance of ClarionDependencyAnalyzer.
     * @param filePath - The path to the Clarion file to analyze.
     */
    constructor(private filePath: string) {
        this.dependencyGraph = new Map<string, { type: DependencyType, modulePath: string, lineNumber: number }[]>();
    }

    /**
     * Parses the dependencies of a given Clarion file.
     * @param filePath - The path to the Clarion file to parse.
     */
    private parseDependencies(filePath: string) {
        if (!fs.existsSync(filePath)) {
            return;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        const dependencies: { type: DependencyType, modulePath: string, lineNumber: number }[] = [];

        for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
            const line = lines[lineNumber];
            const includeMatch = line.match(/INCLUDE\('([^']+)'\)/i);
            const moduleMatch = line.match(/MODULE\('([^']+)'\)/i);

            if (includeMatch) {
                const includePath = includeMatch[1];
                dependencies.push({ type: DependencyType.Include, modulePath: includePath, lineNumber });
            }

            if (moduleMatch) {
                const modulePath = moduleMatch[1];
                dependencies.push({ type: DependencyType.Module, modulePath, lineNumber });
            }
        }

        this.dependencyGraph.set(filePath, dependencies);

        for (const dep of dependencies) {
            if (dep.type === DependencyType.Include || dep.type === DependencyType.Module) {
                const absoluteDepPath = path.join(path.dirname(filePath), dep.modulePath);
                if (!this.dependencyGraph.has(absoluteDepPath)) {
                    this.parseDependencies(absoluteDepPath);
                }
            }
        }
    }

    /**
     * Analyzes the dependencies of the initial Clarion file.
     * @returns A map representing the dependency graph.
     */
    public analyze() {
        this.parseDependencies(this.filePath);
        return this.dependencyGraph;
    }
}

