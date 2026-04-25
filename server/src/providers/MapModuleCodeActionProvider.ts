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

            // Find the MAP block that contains the cursor and get its END line
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

            const action: CodeAction = {
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
            };

            actions.push(action);
        } catch (error) {
            logger.error(`❌ Error providing MAP module code actions: ${error instanceof Error ? error.message : String(error)}`);
        }

        return actions;
    }
}
