import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverFormatter } from './HoverFormatter';
import { ClarionPatterns } from '../../utils/ClarionPatterns';
import { TokenHelper } from '../../utils/TokenHelper';
import { TokenCache } from '../../TokenCache';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger("RoutineHoverResolver");
logger.setLevel("error");

/**
 * Resolves hover information for routine references (DO statements)
 */
export class RoutineHoverResolver {
    constructor(private formatter: HoverFormatter) {}

    /**
     * Resolves hover for a routine reference in a DO statement
     * Supports namespace prefixes (e.g., DO DumpQue::SaveQState)
     */
    async resolveRoutineReference(
        document: TextDocument,
        position: Position,
        line: string
    ): Promise<Hover | null> {
        // Check if this is a DO statement with a routine name
        const doMatch = line.match(ClarionPatterns.DO_ROUTINE);
        if (!doMatch) {
            return null;
        }

        const routineName = doMatch[1];
        const doPos = line.toUpperCase().indexOf('DO');
        const nameStart = line.indexOf(routineName, doPos);
        const nameEnd = nameStart + routineName.length;

        // Check if cursor is on the routine name (including namespace prefix)
        if (position.character < nameStart || position.character > nameEnd) {
            return null;
        }

        logger.info(`Looking for routine hover: ${routineName}`);

        // #264: scope the lookup to the ENCLOSING PROCEDURE (the #211 rule) — routine
        // labels repeat across procedures, and the previous whole-file first-match text
        // scan showed the WRONG procedure's routine. Shares DefinitionProvider's
        // algorithm via TokenHelper so hover, F12, and Ctrl+F12 always agree.
        const structure = TokenCache.getInstance().getStructure(document);
        const routineToken = TokenHelper.findScopedRoutineToken(structure, routineName, position.line);
        if (routineToken) {
            logger.info(`✅ Found routine at line ${routineToken.line}`);
            // #320: source preview — up to 10 lines from the label, stopping before
            // the next column-0 label (the next routine/procedure). Replaces the
            // preview the legacy client-side routine hover used to add (that hover
            // split `Menu::MENUBAR1` at the colons and doubled the tooltip).
            const allLines = document.getText().split(/\r?\n/);
            const start = routineToken.line;
            let end = Math.min(allLines.length, start + 10);
            for (let i = start + 1; i < end; i++) {
                if (/^[A-Za-z_]/.test(allLines[i])) { end = i; break; }
            }
            return {
                contents: {
                    kind: 'markdown',
                    value: [
                        `**Routine:** \`${routineName}\``,
                        '',
                        `📍 Line ${routineToken.line + 1}`,
                        '',
                        '```clarion',
                        ...allLines.slice(start, end),
                        '```'
                    ].join('\n')
                }
            };
        }

        logger.info(`❌ Routine not found: ${routineName}`);
        return null;
    }
}
