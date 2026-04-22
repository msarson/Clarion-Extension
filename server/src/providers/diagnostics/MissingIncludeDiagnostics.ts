import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { StructureDeclarationIndexer } from '../../utils/StructureDeclarationIndexer';
import { IncludeVerifier } from '../../utils/IncludeVerifier';
import { SolutionManager } from '../../solution/solutionManager';
import * as path from 'path';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger('MissingIncludeDiagnostics');
logger.setLevel('error');

const includeVerifier = new IncludeVerifier();

/**
 * Detects variables declared with a user-defined class type that is not included
 * in the current file or its MEMBER parent.
 *
 * Pattern detected (at global scope, col 0):
 *   st   StringTheory
 *   st   &StringTheory
 *
 * The type name is looked up in the StructureDeclarationIndexer (which scans .inc
 * files via RED paths). If found there but NOT in the current file's INCLUDE chain,
 * a warning is emitted.
 *
 * Closes #83 (stage 1)
 */
export async function validateMissingIncludes(
    tokens: Token[],
    document: TextDocument
): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    // Build set of class/structure names declared directly in this file
    const localTypes = new Set<string>();
    for (const t of tokens) {
        if (t.type === TokenType.Structure && t.label) {
            localTypes.add(t.label.toUpperCase());
        }
    }

    // Get the project path for the SDI lookup
    const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
    const solutionManager = SolutionManager.getInstance();
    const projectPath = solutionManager?.getProjectPathForFile(fromPath) ?? path.dirname(fromPath);

    const sdi = StructureDeclarationIndexer.getInstance();
    await sdi.getOrBuildIndex(projectPath);

    // Track which types we've already warned about to avoid duplicate diagnostics
    const warned = new Set<string>();

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        // Only labels at column 0 (global data declarations)
        if (token.type !== TokenType.Label || token.start !== 0) continue;

        // Skip if this label IS itself a structure definition
        if (token.structureType) continue;

        // Find the next token on the same line
        const next = tokens[i + 1];
        if (!next || next.line !== token.line) continue;

        // Must be a Variable or ReferenceVariable (the type name)
        let typeName: string | undefined;
        if (next.type === TokenType.Variable) {
            typeName = next.value;
        } else if (next.type === TokenType.ReferenceVariable) {
            // Strip leading & and whitespace
            typeName = next.value.replace(/^&\s*/, '');
        }

        if (!typeName) continue;
        const typeUpper = typeName.toUpperCase();

        if (warned.has(typeUpper)) continue;
        if (localTypes.has(typeUpper)) continue;

        // See if the SDI knows this type (exists in an .inc via RED paths)
        const definitions = sdi.find(typeName, projectPath).length > 0
            ? sdi.find(typeName, projectPath)
            : sdi.find(typeName);

        if (definitions.length === 0) continue;

        const incFilePath = definitions[0].filePath;
        const incFileName = path.basename(incFilePath);

        // Check whether the .inc is already included
        const alreadyIncluded = await includeVerifier.isClassIncluded(incFileName, document);
        if (alreadyIncluded) continue;

        warned.add(typeUpper);

        logger.error(`⚠️ Missing include for type "${typeName}" (defined in "${incFileName}") at line ${token.line + 1}`);

        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: next.line, character: next.start },
                end:   { line: next.line, character: next.start + typeName.length },
            },
            message: `'${typeName}' is defined in '${incFileName}' which is not included.`,
            source: 'clarion',
            code: 'missing-include',
            data: { typeName, incFileName },
        });
    }

    return diagnostics;
}
