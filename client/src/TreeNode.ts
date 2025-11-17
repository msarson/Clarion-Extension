import { TreeItemCollapsibleState } from "vscode";

export class TreeNode {
    label: string;
    collapsibleState: TreeItemCollapsibleState;
    children: TreeNode[];
    data: any;
    parent?: TreeNode; // ✅ Add parent property
    visible: boolean = true; // Default to visible
    description?: string; // Add description property for display in the tree view

    constructor(label: string, collapsibleState: TreeItemCollapsibleState, data: any, parent?: TreeNode, description?: string) {
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.children = [];
        this.data = data;
        this.parent = parent; // ✅ Store parent reference
        this.description = description;
    }
}
