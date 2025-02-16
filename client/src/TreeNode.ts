import { TreeItem, TreeItemCollapsibleState } from 'vscode';


export class TreeNode extends TreeItem {
    public children: TreeNode[];
    public data?: any;

    constructor(
        label: string | undefined,
        collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
        data?: any,
        children: TreeNode[] = []
    ) {
        super(label ?? "Unknown Node", collapsibleState); // ✅ Ensure label is valid
        this.children = children;
        this.data = data;
    }
}
