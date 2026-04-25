import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { TokenCache } from '../../TokenCache';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger('MapDeclarationDiagnostics');
logger.setLevel('error');

/**
 * Warns when a GlobalProcedure implementation in a MEMBER file has no matching
 * declaration inside a MAP/MODULE block in the parent PROGRAM file. (closes #89)
 */
export async function validateMissingMapDeclarations(
    tokens: Token[],
    document: TextDocument
): Promise<Diagnostic[]> {
    // Only relevant for MEMBER files
    const memberToken = tokens.find(t =>
        t.type === TokenType.ClarionDocument &&
        t.value.toUpperCase() === 'MEMBER' &&
        t.line < 5 &&
        t.referencedFile
    );

    if (!memberToken?.referencedFile) {
        return [];
    }

    // Collect GlobalProcedure tokens only — MethodImplementation (dotted names)
    // are declared in CLASS blocks, not MAP, so they are excluded by subtype.
    const implementations = tokens.filter(t =>
        t.type === TokenType.Procedure &&
        t.subType === TokenType.GlobalProcedure &&
        t.label
    );

    if (implementations.length === 0) {
        return [];
    }

    const resolver = new CrossFileResolver(TokenCache.getInstance());
    const diagnostics: Diagnostic[] = [];

    for (const proc of implementations) {
        const procName = proc.label!;
        try {
            const result = await resolver.findMapDeclarationInMemberFile(
                procName,
                memberToken.referencedFile,
                document
            );

            if (!result) {
                const range: Range = {
                    start: { line: proc.line, character: 0 },
                    end:   { line: proc.line, character: procName.length }
                };
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range,
                    message: `Procedure '${procName}' has no matching declaration in the MAP.`,
                    source: 'clarion'
                });
                logger.info(`⚠️ No MAP declaration for '${procName}' in ${memberToken.referencedFile}`);
            }
        } catch (err) {
            logger.error(`Error checking MAP declaration for '${procName}': ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return diagnostics;
}
