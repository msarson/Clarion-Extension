import * as vscode from 'vscode';
import { globalSolutionFile } from '../globals';
import { isClientReady } from '../LanguageClientManager';
import * as path from 'path';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("StatusCommands");
logger.setLevel("error");

// Create a persistent output channel for status
let statusOutputChannel: vscode.OutputChannel | undefined;

function getStatusOutputChannel(): vscode.OutputChannel {
    if (!statusOutputChannel) {
        statusOutputChannel = vscode.window.createOutputChannel('Clarion Extension Status');
    }
    return statusOutputChannel;
}

/**
 * Shows extension status information in the Output panel
 */
export async function showExtensionStatus(): Promise<void> {
    const outputChannel = getStatusOutputChannel();
    outputChannel.clear();
    outputChannel.show(true); // Show but don't steal focus
    
    // Get status information
    const hasFolder = !!(vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0);
    const isTrusted = vscode.workspace.isTrusted;
    const hasSolution = !!globalSolutionFile;
    const serverActive = isClientReady();
    
    // Build status output
    const lines: string[] = [];
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  CLARION EXTENSION STATUS');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');
    
    // Language Server Status
    lines.push('LANGUAGE FEATURES');
    lines.push('─────────────────────────────────────────────────────────');
    if (serverActive) {
        lines.push('  ✅ Language Server: Active');
        lines.push('     Server is running and ready');
        lines.push('');
        lines.push('  ✅ Document Symbols: Working');
        lines.push('     Outline view available');
        lines.push('');
        lines.push('  ✅ Code Folding: Working');
        lines.push('     Fold/unfold code sections');
        lines.push('');
        lines.push('  ✅ Hover Information: Working');
        lines.push('     Hover over symbols for details');
    } else {
        lines.push('  ❌ Language Server: Not Started');
        lines.push('     Server failed to start or not initialized');
        lines.push('     💡 Use "View Logs" command to troubleshoot');
        lines.push('');
        lines.push('  ⚠️  Document Symbols: Waiting for server');
        lines.push('     Server must be active');
        lines.push('');
        lines.push('  ⚠️  Code Folding: Waiting for server');
        lines.push('     Server must be active');
        lines.push('');
        lines.push('  ⚠️  Hover Information: Limited');
        lines.push('     Server must be active');
    }
    lines.push('');
    lines.push('  ✅ Syntax Highlighting: Working');
    lines.push('     Provided by base Clarion extension');
    lines.push('');
    
    // Workspace Status
    lines.push('WORKSPACE');
    lines.push('─────────────────────────────────────────────────────────');
    if (!hasFolder) {
        lines.push('  ⚠️  Workspace: Not Saved');
        lines.push('     Solution management requires a workspace');
        lines.push('');
        lines.push('     💡 Save a workspace to enable:');
        lines.push('        • Solution management');
        lines.push('        • Cross-file navigation');
        lines.push('        • Build tasks');
    } else if (!isTrusted) {
        lines.push('  ❌ Workspace: Not Trusted');
        lines.push('     Trust the workspace to enable full features');
        lines.push('');
        lines.push('     💡 Use "Manage Workspace Trust" command');
    } else {
        lines.push('  ✅ Workspace: Saved & Trusted');
        lines.push(`     ${vscode.workspace.workspaceFolders![0].uri.fsPath}`);
    }
    lines.push('');
    
    // Solution Status
    lines.push('SOLUTION MANAGEMENT');
    lines.push('─────────────────────────────────────────────────────────');
    if (!hasFolder) {
        lines.push('  ❌ Solution Management: Disabled');
        lines.push('     Workspace required');
    } else if (!isTrusted) {
        lines.push('  ❌ Solution Management: Disabled');
        lines.push('     Workspace trust required');
    } else if (!hasSolution) {
        lines.push('  ⚠️  Solution: Not Opened');
        lines.push('     Open a solution to enable project management');
        lines.push('');
        lines.push('     💡 Use "Open Clarion Solution" command');
    } else {
        const solutionName = path.basename(globalSolutionFile);
        lines.push(`  ✅ Solution: ${solutionName}`);
        lines.push(`     ${globalSolutionFile}`);
    }
    lines.push('');
    
    // Cross-file Navigation
    lines.push('NAVIGATION');
    lines.push('─────────────────────────────────────────────────────────');
    if (!hasFolder || !isTrusted) {
        lines.push('  ⚠️  Cross-file Navigation: Limited');
        lines.push('     Current folder only (workspace required)');
    } else if (!hasSolution) {
        lines.push('  ⚠️  Cross-file Navigation: Basic');
        lines.push('     Current folder only (solution required)');
    } else {
        lines.push('  ✅ Cross-file Navigation: Full');
        lines.push('     Redirection-based file resolution active');
    }
    lines.push('');
    
    // Build Tasks
    lines.push('BUILD TASKS');
    lines.push('─────────────────────────────────────────────────────────');
    if (!hasFolder || !isTrusted || !hasSolution) {
        lines.push('  ❌ Build Tasks: Disabled');
        lines.push('     Requires workspace and solution');
    } else {
        lines.push('  ✅ Build Tasks: Available');
        lines.push('     Solution build commands available');
    }
    lines.push('');
    
    // Summary
    const { errors, warnings } = countIssues(hasFolder, isTrusted, hasSolution, serverActive);
    lines.push('═══════════════════════════════════════════════════════════');
    if (errors === 0 && warnings === 0) {
        lines.push('  STATUS: ALL SYSTEMS GO ✅');
    } else {
        lines.push(`  STATUS: ${errors} Error${errors !== 1 ? 's' : ''} ❌, ${warnings} Warning${warnings !== 1 ? 's' : ''} ⚠️`);
    }
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');
    
    // Output all lines to channel
    lines.forEach(line => outputChannel.appendLine(line));
    
    logger.info('Extension status displayed in Output panel');
}

function countIssues(
    hasFolder: boolean,
    isTrusted: boolean,
    hasSolution: boolean,
    serverActive: boolean
): { errors: number; warnings: number } {
    let errors = 0;
    let warnings = 0;
    
    // Count errors (❌)
    if (!serverActive) errors++;
    if (!isTrusted) errors++;
    if (!hasFolder) errors++;
    
    // Count warnings (⚠️)
    if (!hasSolution && hasFolder && isTrusted) warnings++;
    if (!serverActive) warnings += 2; // Document symbols and folding
    
    return { errors, warnings };
}
