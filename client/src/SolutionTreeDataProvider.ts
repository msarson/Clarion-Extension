// import { TreeDataProvider, TreeItem, Event, EventEmitter, TreeItemCollapsibleState } from 'vscode';
// import { SolutionParser, SourceFile } from './SolutionParser';
// export class TreeNode extends TreeItem {
//     /**
//      * Creates a new instance of the SolutionTreeDataProvider class.
//      * @constructor
//      * @param {string} label - The label for the tree node.
//      * @param {TreeItemCollapsibleState} collapsibleState - The collapsible state of the tree node.
//      * @param {any} [data] - Optional data associated with the tree node.
//      * @param {TreeNode[]} [children] - Optional children of the tree node.
//      */
//     constructor(public label: string, public collapsibleState: TreeItemCollapsibleState, public data?: any, public children?: TreeNode[]) {
//         super(label, collapsibleState);
//     }
// }


// export class SolutionTreeDataProvider implements TreeDataProvider<TreeNode> {
//     private _onDidChangeTreeData: EventEmitter<TreeNode | undefined> = new EventEmitter<TreeNode | undefined>();
//     readonly onDidChangeTreeData: Event<TreeNode | undefined> = this._onDidChangeTreeData.event;

//     public solutionParser: SolutionParser;

//     constructor(solutionParser: SolutionParser) {
//         this.solutionParser = solutionParser;
//     }

//     getParent(element: TreeNode): TreeNode | null {
//         // Implement your logic here to find the parent of the given element
//         // Return the parent node or null if there's no parent
//         return null;
//     }

//     getChildren(element?: TreeNode): TreeNode[] {
//         if (element && element.children) {
//             return element.children;
//         }
    
//         // If no element is provided, return top-level project nodes
//         return this.getTreeItems();
//     }
    

//     getTreeItem(element: TreeNode): TreeItem {
//         const treeItem = new TreeItem(element.label, element.collapsibleState);
    
//         if (element.data instanceof SourceFile) {
//             const relativePath = element.data.relativePath; // Extract relativePath from the sourceFile object
//             treeItem.command = {
//                 title: 'Open File',
//                 command: 'clarion.openFile',
//                 arguments: [relativePath] // Pass the relativePath to the openFile command
//             };
//         }
    
//         return treeItem;
//     }
    
    
    
    
    
//     getTreeItems(): TreeNode[] {
//         const solution = this.solutionParser.solution;
    
//         // Create top-level tree nodes for projects and source files
//         const projectNodes = solution.projects.map((project) => {
//             const projectNode = new TreeNode(project.name, TreeItemCollapsibleState.Expanded, project);
            
//             const sourceFileNodes = project.sourceFiles.map((sourceFile) => {
//                 return new TreeNode(sourceFile.name, TreeItemCollapsibleState.None, sourceFile);
//             });
    
//             projectNode.children = sourceFileNodes;
    
//             return projectNode;
//         });
    
//         return projectNodes;
//     }
    
    

// }
