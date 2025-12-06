import { window as vscodeWindow, workspace, TextDocument, TextEditor, Uri } from 'vscode';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ExtensionHelpers");

/**
 * Escapes special regex characters in a string
 * @param string - String to escape
 * @returns Escaped string safe for use in RegExp
 */
export function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Gets all currently open documents from VS Code
 * Uses the tabGroups API when available, falls back to visibleTextEditors
 * @returns Promise resolving to array of open TextDocuments
 */
export async function getAllOpenDocuments(): Promise<TextDocument[]> {
    const openDocuments: TextDocument[] = [];

    if ("tabGroups" in window) {
        logger.info("✅ Using `window.tabGroups.all` to fetch open tabs.");

        const tabGroups = (window as any).tabGroups.all;

        for (const group of tabGroups) {
            for (const tab of group.tabs) {
                if (tab.input && "uri" in tab.input) {
                    const documentUri = (tab.input as any).uri as Uri;

                    // Check if this is a file URI (not a settings or other special URI)
                    if (documentUri.scheme === 'file') {
                        let doc = workspace.textDocuments.find(d => d.uri.toString() === documentUri.toString());

                        if (!doc) {
                            try {
                                doc = await workspace.openTextDocument(documentUri);
                            } catch (error) {
                                logger.error(`❌ Failed to open document: ${documentUri.fsPath}`, error);
                            }
                        }

                        if (doc) {
                            openDocuments.push(doc);
                            logger.info(`📄 Added document to open list: ${documentUri.fsPath}`);
                        }
                    } else {
                        logger.info(`⚠️ Skipping non-file URI: ${documentUri.toString()}`);
                    }
                } else {
                    logger.warn("⚠️ Tab does not contain a valid document URI:", tab);
                }
            }
        }
    } else {
        logger.warn("⚠️ `tabGroups` API not available, falling back to `visibleTextEditors`.");
        return vscodeWindow.visibleTextEditors.map((editor: TextEditor) => editor.document);
    }

    logger.info(`🔍 Found ${openDocuments.length} open documents.`);
    return openDocuments;
}

/**
 * Extracts configuration names from a Clarion solution file content
 * Parses the GlobalSection(SolutionConfigurationPlatforms) section
 * @param solutionContent - Raw content of the .sln file
 * @returns Array of configuration names (e.g., ["Debug", "Release"])
 */
export function extractConfigurationsFromSolution(solutionContent: string): string[] {
    // Extract the SolutionConfigurationPlatforms section
    const sectionPattern = /GlobalSection\(SolutionConfigurationPlatforms\)\s*=\s*preSolution([\s\S]*?)EndGlobalSection/;
    const match = sectionPattern.exec(solutionContent);

    if (!match) {
        logger.warn("⚠️ No configurations found in solution file. Defaulting to Debug/Release.");
        return ["Debug", "Release"];
    }

    const sectionContent = match[1];
    const configurations = sectionContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("GlobalSection")) // ✅ Remove section header
        .map(line => line.split('=')[0].trim()) // ✅ Extract left-hand side (config name)
        .map(config => config.split('|')[0].trim()) // ✅ Extract everything before the pipe
        .filter(config => config.length > 0); // ✅ Ensure only valid names remain

    logger.info(`📂 Extracted configurations from solution: ${JSON.stringify(configurations)}`);
    return configurations.length > 0 ? configurations : ["Debug", "Release"];
}
