export interface ClarionSourcerFileInfo {
    name: string;
    relativePath: string;
    project?: {
        name: string;
        type: string;
        path: string;
        guid: string;
    };
}

export interface ClarionSolutionTreeNode {
    name: string;
    path: string;
    guid?: string;
    type: 'solution' | 'project' | 'file';
    children?: ClarionSolutionTreeNode[];
}

export interface ClarionProjectInfo {
    name: string;
    type: string;
    path: string;
    guid: string;
    sourceFiles: ClarionSourcerFileInfo[];
}

export interface ClarionSolutionInfo {
    name: string;
    path: string;
    projects: ClarionProjectInfo[];
}