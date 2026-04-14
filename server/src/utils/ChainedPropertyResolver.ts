import { Position } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token } from '../ClarionTokenizer';
import { ClassMemberResolver } from './ClassMemberResolver';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from './TokenHelper';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("ChainedPropertyResolver");
logger.setLevel("error");

/** Same shape as the internal MemberInfo type in ClassMemberResolver */
export interface ChainedMemberInfo {
    type: string;
    className: string;
    line: number;
    file: string;
}

const MAX_CHAIN_DEPTH = 10;

/**
 * Resolves chained dot-notation access like SELF.Order.MainKey or
 * SELF.Order.RangeList.Init where intermediate segments are CLASS, QUEUE,
 * or GROUP type references (e.g. Order  &SortOrder,PROTECTED).
 *
 * Usage:
 *   const resolver = new ChainedPropertyResolver();
 *   const info = await resolver.resolve(beforeDot, memberName, document, position);
 */
export class ChainedPropertyResolver {
    private tokenCache = TokenCache.getInstance();
    private memberResolver = new ClassMemberResolver();

    /**
     * Extracts the rightmost SELF/PARENT chain from a full line prefix.
     * Handles assignment expressions like "SELF.Order.X &= SELF.Primary"
     * where we only want "SELF.Primary" (the rightmost chain).
     */
    public static extractChain(rawBeforeDot: string): string {
        const matches = [...rawBeforeDot.matchAll(/\b(self|parent)\b/gi)];
        if (matches.length === 0) return rawBeforeDot;
        return rawBeforeDot.substring(matches[matches.length - 1].index!);
    }

    /**
     * Resolves a chained member access expression.
     *
     * @param beforeDot  Everything on the current line before the final dot,
     *                   e.g. "SELF.Order" or "SELF.Order.RangeList"
     * @param memberName The final member being accessed, e.g. "MainKey"
     * @param document   The text document
     * @param position   The cursor position (used to find current scope for SELF)
     * @param paramCount Optional parameter count for overload resolution
     * @returns MemberInfo for the resolved member, or null if unresolvable
     */
    public async resolve(
        beforeDot: string,
        memberName: string,
        document: TextDocument,
        position: Position,
        paramCount?: number
    ): Promise<ChainedMemberInfo | null> {
        const tokens = this.tokenCache.getTokens(document);

        // Split beforeDot by dots to get the chain segments.
        // e.g. "SELF.Order.RangeList" → ["SELF", "Order", "RangeList"]
        const segments = beforeDot.split('.').map(s => s.trim()).filter(Boolean);

        if (segments.length < 2) return null;

        const root = segments[0].toUpperCase();
        if (root !== 'SELF' && root !== 'PARENT') return null;

        // Step 1: resolve the initial class from SELF/PARENT scope
        let currentClassName: string | null;
        if (root === 'SELF') {
            currentClassName = this.resolveCurrentClassName(document, position, tokens);
        } else {
            currentClassName = await this.resolveParentClassName(document, position, tokens);
        }

        if (!currentClassName) {
            logger.info(`ChainedPropertyResolver: could not resolve ${root} class`);
            return null;
        }

        logger.info(`ChainedPropertyResolver: root=${root} → class="${currentClassName}", chain=[${segments.slice(1).join('.')}].${memberName}`);

        // Step 2: walk each intermediate segment to get to the final type
        const intermediateSegments = segments.slice(1); // drop SELF/PARENT

        for (let depth = 0; depth < intermediateSegments.length; depth++) {
            if (depth >= MAX_CHAIN_DEPTH) {
                logger.info('ChainedPropertyResolver: max chain depth exceeded');
                return null;
            }

            const segmentName = intermediateSegments[depth];
            logger.info(`ChainedPropertyResolver: resolving segment "${segmentName}" in "${currentClassName}"`);

            const memberInfo = await this.memberResolver.findMemberInNamedStructure(
                segmentName, currentClassName, document
            );

            if (!memberInfo) {
                logger.info(`ChainedPropertyResolver: member "${segmentName}" not found in "${currentClassName}"`);
                return null;
            }

            const nextClass = ClassMemberResolver.extractClassName(memberInfo.type);
            if (!nextClass) {
                logger.info(`ChainedPropertyResolver: type "${memberInfo.type}" of "${segmentName}" is not navigable`);
                return null;
            }

            currentClassName = nextClass;
            logger.info(`ChainedPropertyResolver: "${segmentName}" → type="${memberInfo.type}" → next class="${currentClassName}"`);
        }

        // Step 3: look up the final target member in the resolved class
        logger.info(`ChainedPropertyResolver: looking for final member "${memberName}" in "${currentClassName}"`);
        const result = await this.memberResolver.findMemberInNamedStructure(
            memberName, currentClassName, document, paramCount
        );

        if (result) {
            logger.info(`ChainedPropertyResolver: ✅ resolved "${memberName}" in "${currentClassName}" at ${result.file}:${result.line}`);
        } else {
            logger.info(`ChainedPropertyResolver: ❌ member "${memberName}" not found in "${currentClassName}"`);
        }

        return result ?? null;
    }

    /** Extracts the class name the current scope belongs to (for SELF resolution). Public for CompletionProvider. */
    public resolveCurrentClassName(document: TextDocument, position: Position, tokens: Token[]): string | null {
        const structure = this.tokenCache.getStructure(document);
        let currentScope = TokenHelper.getInnermostScopeAtLine(structure, position.line);
        if (!currentScope) return null;

        if (currentScope.subType !== undefined) {
            const parentScope = TokenHelper.getParentScopeOfRoutine(structure, currentScope);
            if (parentScope) currentScope = parentScope;
        }

        if (currentScope.value.includes('.')) {
            return currentScope.value.split('.')[0];
        }

        const lines = document.getText().split('\n');
        const scopeLine = lines[currentScope.line];
        const m = scopeLine.match(/^(\w+)\.(\w+)\s+PROCEDURE/i);
        return m ? m[1] : null;
    }

    /** Resolves the parent class name for PARENT resolution. */
    private async resolveParentClassName(document: TextDocument, position: Position, tokens: Token[]): Promise<string | null> {
        const info = await this.memberResolver.getParentClassInfo(document, position.line, tokens);
        return info?.parentClassName ?? null;
    }
}
