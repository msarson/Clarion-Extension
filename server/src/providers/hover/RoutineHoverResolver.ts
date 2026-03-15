import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverFormatter } from './HoverFormatter';
import { ClarionPatterns } from '../../utils/ClarionPatterns';
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

        // Search for routine label at column 0
        const text = document.getText();
        const lines = text.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const routineLine = lines[i];

            // Check if line starts at column 0 (no leading whitespace)
            if (routineLine.length > 0 && routineLine[0] !== ' ' && routineLine[0] !== '\t') {
                const match = routineLine.match(ClarionPatterns.ROUTINE_LABEL);
                if (match && match[1].toUpperCase() === routineName.toUpperCase()) {
                    logger.info(`✅ Found routine at line ${i}`);
                    
                    return {
                        contents: {
                            kind: 'markdown',
                            value: [
                                `**Routine:** \`${routineName}\``,
                                '',
                                `📍 Line ${i + 1}`,
                                '',
                                `*Ctrl+F12 to navigate*`
                            ].join('\n')
                        }
                    };
                }
            }
        }

        logger.info(`❌ Routine not found: ${routineName}`);
        return null;
    }
}
