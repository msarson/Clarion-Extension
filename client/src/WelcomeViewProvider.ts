import { TreeDataProvider, TreeItem, TreeItemCollapsibleState, ThemeIcon, Command, EventEmitter, Event } from 'vscode';
import { SolutionScanner, DetectedSolution } from './utils/SolutionScanner';
import { ClarionInstallationDetector } from './utils/ClarionInstallationDetector';
import LoggerManager from './logger';
import * as path from 'path';

const logger = LoggerManager.getLogger("WelcomeViewProvider");

interface WelcomeTreeItem {
    type: 'detectedSolution' | 'browseSolution' | 'help';
    label: string;
    solutionPath?: string;
    command?: Command;
}

export class WelcomeViewProvider implements TreeDataProvider<WelcomeTreeItem> {
    private _onDidChangeTreeData: EventEmitter<WelcomeTreeItem | undefined | null | void> = new EventEmitter<WelcomeTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: Event<WelcomeTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: WelcomeTreeItem): TreeItem {
        const treeItem = new TreeItem(element.label, TreeItemCollapsibleState.None);

        switch (element.type) {
            case 'detectedSolution':
                treeItem.iconPath = new ThemeIcon('file-text');
                treeItem.description = path.dirname(element.solutionPath || '');
                treeItem.tooltip = `Click to open: ${element.solutionPath}`;
                treeItem.command = element.command;
                break;

            case 'browseSolution':
                treeItem.iconPath = new ThemeIcon('folder-opened');
                treeItem.description = 'Browse for a solution file';
                treeItem.tooltip = 'Open a Clarion solution file from anywhere';
                treeItem.command = element.command;
                break;

            case 'help':
                treeItem.iconPath = new ThemeIcon('question');
                treeItem.description = element.label;
                treeItem.tooltip = 'Get help with the Clarion extension';
                treeItem.command = element.command;
                break;
        }

        return treeItem;
    }

    async getChildren(element?: WelcomeTreeItem): Promise<WelcomeTreeItem[]> {
        // Root level
        if (!element) {
            const items: WelcomeTreeItem[] = [];

            try {
                // Scan for detected solutions
                const detectedSolutions = await SolutionScanner.scanWorkspaceFolders();
                
                // Check if Clarion is installed
                const installations = await ClarionInstallationDetector.detectInstallations();

                if (detectedSolutions.length > 0 && installations.length > 0) {
                    // Show detected solutions
                    for (const solution of detectedSolutions) {
                        items.push({
                            type: 'detectedSolution',
                            label: solution.solutionName,
                            solutionPath: solution.solutionPath,
                            command: {
                                title: 'Open Solution',
                                command: 'clarion.openDetectedSolution',
                                arguments: [solution.solutionPath]
                            }
                        });
                    }
                } else if (detectedSolutions.length > 0 && installations.length === 0) {
                    // Solutions found but no Clarion installation
                    items.push({
                        type: 'help',
                        label: '⚠️ No Clarion Installation Detected',
                        command: {
                            title: 'Get Help',
                            command: 'vscode.open',
                            arguments: ['https://github.com/msarson/Clarion-Extension/blob/master/GettingStarted.md']
                        }
                    });
                    
                    for (const solution of detectedSolutions) {
                        items.push({
                            type: 'detectedSolution',
                            label: `${solution.solutionName} (requires manual setup)`,
                            solutionPath: solution.solutionPath,
                            command: {
                                title: 'Open Solution',
                                command: 'clarion.openSolution'
                            }
                        });
                    }
                }

                // Always show browse option
                items.push({
                    type: 'browseSolution',
                    label: 'Browse for Solution...',
                    command: {
                        title: 'Open Solution',
                        command: 'clarion.openSolution'
                    }
                });

                // Help links
                items.push({
                    type: 'help',
                    label: 'Getting Started Guide',
                    command: {
                        title: 'Open Getting Started',
                        command: 'vscode.open',
                        arguments: ['https://github.com/msarson/Clarion-Extension/blob/master/GettingStarted.md']
                    }
                });

                items.push({
                    type: 'help',
                    label: 'Report an Issue',
                    command: {
                        title: 'Report Issue',
                        command: 'vscode.open',
                        arguments: ['https://github.com/msarson/Clarion-Extension/issues']
                    }
                });

            } catch (error) {
                logger.error('❌ Error getting welcome view children:', error);
                
                // Fallback items
                items.push({
                    type: 'browseSolution',
                    label: 'Browse for Solution...',
                    command: {
                        title: 'Open Solution',
                        command: 'clarion.openSolution'
                    }
                });
            }

            return items;
        }

        return [];
    }
}
