import { Hover, Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { HoverFormatter } from './HoverFormatter';
import { ClarionPatterns } from '../../utils/ClarionPatterns';
import { TokenHelper } from '../../utils/TokenHelper';
import { TokenCache } from '../../TokenCache';
import { Token } from '../../tokenizer/TokenTypes';
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
                        ...this.ownerLine(structure, routineToken),
                        `📍 ${this.formatter.locationLink(document.uri, routineToken.line)}`,
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

    /**
     * Hover for a ROUTINE's own declaration label (`SyncDisplay ROUTINE`).
     *
     * There was no resolver for this, so it fell through to the variable tiers and
     * was rendered by `HoverFormatter.formatVariable` as a variable whose declared
     * type happens to be the word ROUTINE. That produced "🔐 Local routine
     * variable" — which reads as "a variable local to a routine", the one thing a
     * routine label is not.
     *
     * Names the owning procedure for the same reason the DO-reference hover does:
     * routine labels legally repeat across procedures, so the name alone does not
     * identify which routine is on screen.
     */
    resolveRoutineDeclaration(
        document: TextDocument,
        position: Position,
        line: string
    ): Hover | null {
        const declMatch = line.match(ClarionPatterns.ROUTINE_LABEL);
        if (!declMatch) return null;

        // A Clarion label starts in column 1, so the label occupies [0, length).
        const routineName = declMatch[1];
        if (position.character > routineName.length) return null;

        const structure = TokenCache.getInstance().getStructure(document);
        const routineToken = structure.findRoutines(routineName)
            .find(t => t.line === position.line);
        if (!routineToken) return null;

        return {
            contents: {
                kind: 'markdown',
                value: [
                    `**Routine:** \`${routineName}\``,
                    '',
                    ...this.ownerLine(structure, routineToken),
                    '```clarion',
                    (document.getText().split(/\r?\n/)[routineToken.line] ?? '').trimEnd(),
                    '```'
                ].join('\n')
            }
        };
    }

    /**
     * The "belongs to" line shared by both routine hovers, as markdown lines ready
     * to splice in (empty when the owner cannot be resolved, which keeps the card
     * well-formed rather than printing a dangling label).
     *
     * 🔐 matches the scope icon `HoverFormatter` already uses for routine scope.
     * The method/procedure noun is chosen the way `formatVariable` chooses it — a
     * dotted owner label is a method implementation.
     */
    private ownerLine(structure: ReturnType<TokenCache['getStructure']>, routineToken: Token): string[] {
        const owner = TokenHelper.getParentScopeOfRoutine(structure, routineToken);
        const ownerName = owner?.label ?? owner?.value;
        if (!ownerName) return [];
        const noun = ownerName.includes('.') ? 'method' : 'procedure';
        return [`🔐 Routine in ${noun} \`${ownerName}\``, ''];
    }

    /**
     * #321 — hover for a GOTO target: resolves the statement label under
     * GOTO's one-unit scope (same resolver FAR and F12 use, so all three
     * agree) and shows the label with its source line.
     */
    resolveGotoLabelReference(
        document: TextDocument,
        position: Position,
        line: string
    ): Hover | null {
        const gotoMatch = line.match(ClarionPatterns.GOTO_LABEL);
        if (!gotoMatch) {
            return null;
        }

        const labelName = gotoMatch[1];
        const gotoPos = line.toUpperCase().indexOf('GOTO');
        const nameStart = line.indexOf(labelName, gotoPos);
        const nameEnd = nameStart + labelName.length;
        if (position.character < nameStart || position.character > nameEnd) {
            return null;
        }

        const tokens = TokenCache.getInstance().getTokens(document);
        const structure = TokenCache.getInstance().getStructure(document);
        const labelToken = TokenHelper.findScopedStatementLabelToken(structure, tokens, labelName, position.line);
        if (!labelToken) {
            logger.info(`❌ GOTO target label not found in unit: ${labelName}`);
            return null;
        }

        const allLines = document.getText().split(/\r?\n/);
        const sourceLine = (allLines[labelToken.line] ?? '').trimEnd();
        return {
            contents: {
                kind: 'markdown',
                value: [
                    `**Label:** \`${labelToken.value}\``,
                    '',
                    `📍 ${this.formatter.locationLink(document.uri, labelToken.line)}`,
                    '',
                    '```clarion',
                    sourceLine,
                    '```'
                ].join('\n')
            }
        };
    }
}
