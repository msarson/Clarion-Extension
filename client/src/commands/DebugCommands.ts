/**
 * Debug commands for inspecting internal extension state.
 */
import { commands, window, workspace, Disposable, ExtensionContext } from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("DebugCommands");
logger.setLevel("error");

export function registerDebugCommands(context: ExtensionContext, client: LanguageClient | undefined): Disposable[] {
    const disposables: Disposable[] = [];

    const showGraphCommand = commands.registerCommand('clarion.debug.showFileRelationshipGraph', async () => {
        if (!client) {
            window.showWarningMessage('Clarion language server is not running.');
            return;
        }

        try {
            const result = await client.sendRequest<{
                edges: Array<{ type: string; fromFile: string; toFile: string; fromLine?: number; containingProcedure?: string; containingClass?: string }>;
                isBuilt: boolean;
                isBuilding: boolean;
                buildDurationMs: number | undefined;
            }>('clarion/getFileRelationshipGraph');

            const lines: string[] = [];
            lines.push('# Clarion File Relationship Graph');
            lines.push('');

            if (result.isBuilding) {
                lines.push('⚠️  Graph is currently building — results may be incomplete.');
                lines.push('');
            } else if (!result.isBuilt) {
                lines.push('⚠️  Graph has not been built yet. Open a solution first.');
                lines.push('');
            } else {
                const duration = result.buildDurationMs !== undefined
                    ? ` in ${(result.buildDurationMs / 1000).toFixed(1)}s`
                    : '';
                lines.push(`✅ Graph built — ${result.edges.length} edge(s) total${duration}`);
                lines.push('');
            }

            // Group edges by type for readability
            const byType: Record<string, typeof result.edges> = {};
            for (const edge of result.edges) {
                if (!byType[edge.type]) byType[edge.type] = [];
                byType[edge.type].push(edge);
            }

            for (const [edgeType, edges] of Object.entries(byType)) {
                lines.push(`## ${edgeType} edges (${edges.length})`);
                lines.push('');
                for (const edge of edges.sort((a, b) => a.fromFile.localeCompare(b.fromFile))) {
                    const from = edge.fromFile.split(/[/\\]/).pop() ?? edge.fromFile;
                    const to = edge.toFile.split(/[/\\]/).pop() ?? edge.toFile;
                    let proc = '';
                    if (edgeType === 'MODULE') {
                        proc = edge.containingProcedure
                            ? `  **[local MAP inside: ${edge.containingProcedure}]**`
                            : '  *(file-scope MAP)*';
                    } else if (edgeType === 'CLASS_MODULE') {
                        proc = edge.containingClass
                            ? `  *(class: ${edge.containingClass})*`
                            : '  *(class implementation)*';
                    } else if (edgeType === 'IMPLICIT_INCLUDE') {
                        proc = '  *(compiler-injected)*';
                    }
                    const lineAnnotation = edge.fromLine !== undefined ? ` [line ${edge.fromLine + 1}]` : '';
                    lines.push(`  ${from}  →  ${to}${proc}${lineAnnotation}`);
                    lines.push(`    from: ${edge.fromFile}`);
                    lines.push(`    to:   ${edge.toFile}`);
                }
                lines.push('');
            }

            const content = lines.join('\n');
            const doc = await workspace.openTextDocument({ content, language: 'markdown' });
            await window.showTextDocument(doc, { preview: true });

        } catch (error) {
            logger.error(`❌ Error fetching file relationship graph: ${error}`);
            window.showErrorMessage(`Failed to get file relationship graph: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    context.subscriptions.push(showGraphCommand);
    disposables.push(showGraphCommand);

    return disposables;
}
