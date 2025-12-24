import { commands, window as vscodeWindow, Disposable, ExtensionContext } from 'vscode';
import { SolutionTreeDataProvider } from '../SolutionTreeDataProvider';
import { StructureViewProvider } from '../views/StructureViewProvider';
import LoggerManager from '../utils/LoggerManager';
import { showExtensionStatus } from './StatusCommands';

const logger = LoggerManager.getLogger("ViewCommands");

/**
 * Registers solution view commands (filter, clear filter)
 * @param context - Extension context
 * @param solutionTreeDataProvider - Solution tree data provider
 * @returns Array of disposables for the registered commands
 */
export function registerSolutionViewCommands(
    context: ExtensionContext | undefined,
    solutionTreeDataProvider: SolutionTreeDataProvider | undefined
): Disposable[] {
    const disposables: Disposable[] = [];

    // Register filter command
    const filterCommand = commands.registerCommand('clarion.solutionView.filter', async () => {
        const filterText = await vscodeWindow.showInputBox({
            placeHolder: 'Filter solution tree...',
            prompt: 'Enter text to filter the solution tree',
            value: solutionTreeDataProvider?.getFilterText() || ''
        });
        
        if (filterText !== undefined) { // User didn't cancel
            if (solutionTreeDataProvider) {
                solutionTreeDataProvider.setFilterText(filterText);
            }
        }
    });
    
    if (context) {
        context.subscriptions.push(filterCommand);
    }
    disposables.push(filterCommand);

    // Register clear filter command
    const clearFilterCommand = commands.registerCommand('clarion.solutionView.clearFilter', () => {
        if (solutionTreeDataProvider) {
            solutionTreeDataProvider.clearFilter();
        }
    });
    
    if (context) {
        context.subscriptions.push(clearFilterCommand);
    }
    disposables.push(clearFilterCommand);

    return disposables;
}

/**
 * Registers structure view commands (expand all, filter, clear filter, follow cursor)
 * @param context - Extension context
 * @param structureViewProvider - Structure view provider
 * @returns Array of disposables for the registered commands
 */
export function registerStructureViewCommands(
    context: ExtensionContext,
    structureViewProvider: StructureViewProvider | undefined
): Disposable[] {
    const disposables: Disposable[] = [];

    // Register the expand all command
    const expandAllCommand = commands.registerCommand('clarion.structureView.expandAll', async () => {
        if (structureViewProvider) {
            await structureViewProvider.expandAll();
        }
    });
    context.subscriptions.push(expandAllCommand);
    disposables.push(expandAllCommand);

    // Register filter command
    const filterCommand = commands.registerCommand('clarion.structureView.filter', async () => {
        const filterText = await vscodeWindow.showInputBox({
            placeHolder: 'Filter structure view...',
            prompt: 'Enter text to filter the structure view',
            value: structureViewProvider?.getFilterText() || ''
        });
        
        if (filterText !== undefined) { // User didn't cancel
            if (structureViewProvider) {
                structureViewProvider.setFilterText(filterText);
            }
        }
    });
    context.subscriptions.push(filterCommand);
    disposables.push(filterCommand);

    // Register clear filter command
    const clearFilterCommand = commands.registerCommand('clarion.structureView.clearFilter', () => {
        if (structureViewProvider) {
            structureViewProvider.clearFilter();
        }
    });
    context.subscriptions.push(clearFilterCommand);
    disposables.push(clearFilterCommand);

    // Register the enable follow cursor command
    const enableFollowCursorCommand = commands.registerCommand('clarion.structureView.enableFollowCursor', async () => {
        logger.debug(`🎯 enableFollowCursor command invoked`);
        if (structureViewProvider) {
            structureViewProvider.setFollowCursor(true);
            await commands.executeCommand('setContext', 'clarion.followCursorEnabled', true);
            logger.debug(`   Enabled follow cursor`);
        }
    });
    context.subscriptions.push(enableFollowCursorCommand);
    disposables.push(enableFollowCursorCommand);
    
    // Register the disable follow cursor command
    const disableFollowCursorCommand = commands.registerCommand('clarion.structureView.disableFollowCursor', async () => {
        logger.debug(`🎯 disableFollowCursor command invoked`);
        if (structureViewProvider) {
            structureViewProvider.setFollowCursor(false);
            await commands.executeCommand('setContext', 'clarion.followCursorEnabled', false);
            logger.debug(`   Disabled follow cursor`);
        }
    });
    context.subscriptions.push(disableFollowCursorCommand);
    disposables.push(disableFollowCursorCommand);
    
    // Register the structure view menu command (empty handler for the submenu)
    const structureViewMenuCommand = commands.registerCommand('clarion.structureView.menu', () => {
        // This is just a placeholder for the submenu
        logger.info('Structure view menu clicked');
    });
    context.subscriptions.push(structureViewMenuCommand);
    disposables.push(structureViewMenuCommand);

    return disposables;
}

/**
 * Registers status command to show extension status in terminal
 * @param context - Extension context
 * @returns Array of disposables for the registered command
 */
export function registerStatusCommands(
    context: ExtensionContext
): Disposable[] {
    const disposables: Disposable[] = [];

    const statusCommand = commands.registerCommand('clarion.showExtensionStatus', async () => {
        logger.info('Showing extension status in terminal');
        await showExtensionStatus();
    });
    context.subscriptions.push(statusCommand);
    disposables.push(statusCommand);

    return disposables;
}
