import {
    TextDocument,
    Range,
    CodeAction,
    CodeActionKind,
    Command
} from 'vscode-languageserver/node';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import LoggerManager from '../logger';
import * as path from 'path';

const logger = LoggerManager.getLogger('MapModuleCodeActionProvider');
logger.setLevel('error');

/**
 * Provides a 'Add MODULE with PROCEDURE' code action when the cursor is inside a MAP block.
 */
export class MapModuleCodeActionProvider {

    provideCodeActions(document: TextDocument, range: Range): CodeAction[] {
        const actions: CodeAction[] = [];

        try {
            const cache = TokenCache.getInstance();
            const docStructure = cache.getStructure(document);
            if (!docStructure) return actions;

            const line = range.start.line;
            if (!docStructure.isInMapBlock(line)) return actions;

            if (docStructure.isInModuleBlock(line)) {
                // Cursor is inside an existing MODULE block — offer "Add PROCEDURE to MODULE"
                for (const modToken of docStructure.getModuleBlocks()) {
                    if (
                        modToken.line < line &&
                        modToken.finishesAt !== undefined &&
                        line < modToken.finishesAt &&
                        modToken.referencedFile
                    ) {
                        actions.push({
                            title: 'Add PROCEDURE to MODULE',
                            kind: CodeActionKind.QuickFix,
                            command: Command.create(
                                'Add PROCEDURE to MODULE',
                                'clarion.addProcedureToModule',
                                {
                                    documentUri: document.uri,
                                    moduleEndLine: modToken.finishesAt,
                                    referencedFile: modToken.referencedFile,
                                    projectGuid: ''  // resolved in command handler
                                }
                            )
                        });
                        break;
                    }
                }
                return actions;
            }

            // Cursor is in MAP but outside any MODULE — offer "Add MODULE with PROCEDURE"
            // and "Add PROCEDURE" (to existing module or current MEMBER file)
            let mapEndLine: number | undefined;
            for (const mapToken of docStructure.getMapBlocks()) {
                if (
                    mapToken.line < line &&
                    mapToken.finishesAt !== undefined &&
                    line < mapToken.finishesAt
                ) {
                    mapEndLine = mapToken.finishesAt;
                    break;
                }
            }
            if (mapEndLine === undefined) return actions;

            // Find the project that owns this file
            const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
            const sm = SolutionManager.getInstance();
            if (!sm) return actions;

            const project = sm.solution?.projects.find(p =>
                p.sourceFiles.some(f => {
                    const absPath = path.join(p.path, f.relativePath || f.name);
                    return absPath.toLowerCase() === fromPath.toLowerCase();
                })
            );

            // Find the first CLW in the project for use in the MEMBER statement
            const firstClwFile = project?.sourceFiles.find(f =>
                f.name.toLowerCase().endsWith('.clw')
            )?.name ?? '';

            actions.push({
                title: 'Add MODULE with PROCEDURE',
                kind: CodeActionKind.QuickFix,
                command: Command.create(
                    'Add MODULE with PROCEDURE',
                    'clarion.addMapModule',
                    {
                        documentUri: document.uri,
                        mapEndLine,
                        firstClwFile,
                        projectGuid: project?.guid ?? ''
                    }
                )
            });

            // Always offer "Add PROCEDURE" — targets the current file
            actions.push({
                title: 'Add PROCEDURE',
                kind: CodeActionKind.QuickFix,
                command: Command.create(
                    'Add PROCEDURE',
                    'clarion.addProcedureFromMap',
                    {
                        documentUri: document.uri,
                        mapEndLine
                    }
                )
            });
        } catch (error) {
            logger.error(`❌ Error providing MAP module code actions: ${error instanceof Error ? error.message : String(error)}`);
        }

        return actions;
    }
}
