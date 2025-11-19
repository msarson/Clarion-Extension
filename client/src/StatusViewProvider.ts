import * as vscode from 'vscode';
import { globalSolutionFile } from './globals';
import { isClientReady } from './LanguageClientManager';
import * as path from 'path';

export class StatusItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly tooltip: string,
        public readonly commandId?: string,
        public readonly children?: StatusItem[]
    ) {
        super(
            label,
            children && children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );

        this.tooltip = tooltip;
        
        if (commandId) {
            this.command = {
                command: commandId,
                title: label,
                arguments: []
            };
        }
    }
}

export class StatusViewProvider implements vscode.TreeDataProvider<StatusItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StatusItem | undefined | null | void> = new vscode.EventEmitter<StatusItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StatusItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StatusItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: StatusItem): Thenable<StatusItem[]> {
        if (element) {
            return Promise.resolve(element.children || []);
        }

        return Promise.resolve(this.getStatusItems());
    }

    private getStatusItems(): StatusItem[] {
        const items: StatusItem[] = [];
        const hasWorkspace = !!vscode.workspace.workspaceFolders;
        const isTrusted = vscode.workspace.isTrusted;
        const hasSolution = !!globalSolutionFile;

        // Language Server Status
        const serverActive = isClientReady();
        items.push(new StatusItem(
            serverActive ? "✅ Language Server: Active" : "❌ Language Server: Not Started",
            serverActive ? "Server is running and ready" : "Server failed to start or not initialized",
            undefined,
            serverActive ? undefined : [
                new StatusItem("    View Logs", "Open Output panel", "clarion.viewLogs"),
            ]
        ));

        // Document Symbols
        items.push(new StatusItem(
            serverActive ? "✅ Document Symbols: Working" : "⚠️ Document Symbols: Waiting for server",
            serverActive ? "Outline view available" : "Server must be active",
            undefined
        ));

        // Code Folding
        items.push(new StatusItem(
            serverActive ? "✅ Code Folding: Working" : "⚠️ Code Folding: Waiting for server",
            serverActive ? "Fold/unfold code sections" : "Server must be active",
            undefined
        ));

        // Syntax Highlighting
        items.push(new StatusItem(
            "✅ Syntax Highlighting: Working",
            "Provided by base Clarion extension",
            undefined
        ));

        // Hover Information
        items.push(new StatusItem(
            serverActive ? "✅ Hover Information: Working" : "⚠️ Hover Information: Limited",
            serverActive ? "Hover over symbols for details" : "Server must be active",
            undefined
        ));

        // Workspace Status
        if (!hasWorkspace) {
            items.push(new StatusItem(
                "⚠️ Workspace: Not Saved",
                "Solution management and advanced features require a workspace",
                undefined,
                [
                    new StatusItem("    💡 Save a workspace to enable:", "", undefined),
                    new StatusItem("       • Solution management", "", undefined),
                    new StatusItem("       • Cross-file navigation", "", undefined),
                    new StatusItem("       • Build tasks", "", undefined),
                    new StatusItem("    [Save Workspace]", "Click to save workspace", "workbench.action.files.saveWorkspaceAs")
                ]
            ));
        } else if (!isTrusted) {
            items.push(new StatusItem(
                "❌ Workspace: Not Trusted",
                "Trust the workspace to enable full features",
                undefined,
                [
                    new StatusItem("    [Manage Trust]", "Review workspace trust", "workbench.trust.manage")
                ]
            ));
        } else {
            items.push(new StatusItem(
                "✅ Workspace: Saved & Trusted",
                vscode.workspace.workspaceFolders![0].uri.fsPath,
                undefined
            ));
        }

        // Solution Status
        if (!hasWorkspace) {
            items.push(new StatusItem(
                "❌ Solution Management: Disabled",
                "Workspace required",
                undefined
            ));
        } else if (!isTrusted) {
            items.push(new StatusItem(
                "❌ Solution Management: Disabled",
                "Workspace trust required",
                undefined
            ));
        } else if (!hasSolution) {
            items.push(new StatusItem(
                "⚠️ Solution: Not Opened",
                "Open a solution to enable project management",
                undefined,
                [
                    new StatusItem("    [Open Solution]", "Click to open a solution", "clarion.openSolution")
                ]
            ));
        } else {
            const solutionName = path.basename(globalSolutionFile);
            items.push(new StatusItem(
                `✅ Solution: ${solutionName}`,
                globalSolutionFile,
                undefined
            ));
        }

        // Cross-file Navigation
        if (!hasWorkspace || !isTrusted) {
            items.push(new StatusItem(
                "⚠️ Cross-file Navigation: Limited",
                "Current folder only (workspace required for full navigation)",
                undefined
            ));
        } else if (!hasSolution) {
            items.push(new StatusItem(
                "⚠️ Cross-file Navigation: Basic",
                "Current folder only (solution required for redirection-based navigation)",
                undefined
            ));
        } else {
            items.push(new StatusItem(
                "✅ Cross-file Navigation: Full",
                "Redirection-based file resolution active",
                undefined
            ));
        }

        // Build Tasks
        if (!hasWorkspace || !isTrusted || !hasSolution) {
            items.push(new StatusItem(
                "❌ Build Tasks: Disabled",
                "Requires workspace and solution",
                undefined
            ));
        } else {
            items.push(new StatusItem(
                "✅ Build Tasks: Available",
                "Solution build commands available",
                undefined
            ));
        }

        // Add separator
        items.push(new StatusItem("", "", undefined));
        
        // Help section
        items.push(new StatusItem(
            "💡 Tips",
            "",
            undefined,
            [
                new StatusItem("    • Open a Clarion file to see symbols", "", undefined),
                new StatusItem("    • Save workspace for solution features", "", undefined),
                new StatusItem("    • Trust workspace to enable full features", "", undefined)
            ]
        ));

        return items;
    }
}
