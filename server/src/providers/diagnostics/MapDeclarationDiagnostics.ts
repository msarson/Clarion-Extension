import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { CrossFileResolver } from '../../utils/CrossFileResolver';
import { ProcedureSignatureUtils } from '../../utils/ProcedureSignatureUtils';
import { TokenCache } from '../../TokenCache';
import LoggerManager from '../../logger';
import * as fs from 'fs';

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

    // Build a set of procedure names already declared in this file's own MAP blocks.
    // A MEMBER file can have its own MAP/END (e.g. for local procedures) — those are
    // valid declarations and must not trigger the warning.
    const locallyDeclared = new Set<string>(
        tokens
            .filter(t => t.subType === TokenType.MapProcedure && t.label)
            .map(t => t.label!.toUpperCase())
    );

    const resolver = new CrossFileResolver(TokenCache.getInstance());
    const diagnostics: Diagnostic[] = [];

    for (const proc of implementations) {
        const procName = proc.label!;

        // Skip procedures declared in this file's own MAP block
        if (locallyDeclared.has(procName.toUpperCase())) {
            continue;
        }

        try {
            const result = await resolver.findMapDeclarationInMemberFile(
                procName,
                memberToken.referencedFile,
                document
            );

            const range: Range = {
                start: { line: proc.line, character: 0 },
                end:   { line: proc.line, character: procName.length }
            };

            if (!result) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range,
                    message: `Procedure '${procName}' has no matching declaration in the MAP.`,
                    source: 'clarion'
                });
                logger.info(`⚠️ No MAP declaration for '${procName}' in ${memberToken.referencedFile}`);
            } else {
                // Declaration found — compare signatures to catch parameter mismatches
                try {
                    const docLines = document.getText().split('\n');
                    const implLine = docLines[proc.line] ?? '';
                    const implParams = ProcedureSignatureUtils.extractParameterTypes(implLine);

                    const parentLines = fs.readFileSync(result.file, 'utf8').split('\n');
                    const declLine = parentLines[result.line] ?? '';
                    const declParams = ProcedureSignatureUtils.extractParameterTypes(declLine);

                    if (!ProcedureSignatureUtils.parametersMatch(implParams, declParams)) {
                        diagnostics.push({
                            severity: DiagnosticSeverity.Warning,
                            range,
                            message: `Procedure '${procName}' signature does not match its MAP declaration.`,
                            source: 'clarion'
                        });
                        logger.info(`⚠️ Signature mismatch for '${procName}': impl=(${implParams.join(',')}) decl=(${declParams.join(',')})`);
                    }
                } catch (sigErr) {
                    logger.error(`Error comparing signatures for '${procName}': ${sigErr instanceof Error ? sigErr.message : String(sigErr)}`);
                }
            }
        } catch (err) {
            logger.error(`Error checking MAP declaration for '${procName}': ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    return diagnostics;
}
