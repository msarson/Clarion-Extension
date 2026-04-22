import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import { Token, TokenType } from '../../ClarionTokenizer';
import { StructureDeclarationIndexer } from '../../utils/StructureDeclarationIndexer';
import { IncludeVerifier } from '../../utils/IncludeVerifier';
import { ClassConstantParser } from '../../utils/ClassConstantParser';
import { ProjectConstantsChecker } from '../../utils/ProjectConstantsChecker';
import { SolutionManager } from '../../solution/solutionManager';
import * as path from 'path';
import LoggerManager from '../../logger';

const logger = LoggerManager.getLogger('MissingIncludeDiagnostics');
logger.setLevel('error');

const includeVerifier = new IncludeVerifier();

/**
 * Shared: resolve project/cwproj paths from document URI.
 */
function resolveProjectPaths(document: TextDocument): {
    fromPath: string;
    projectPath: string;
    cwprojPath: string | undefined;
} {
    const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
    const sm = SolutionManager.getInstance();
    const projectPath = sm?.getProjectPathForFile(fromPath) ?? path.dirname(fromPath);
    const cwprojPath = sm?.getProjectCwprojForFile(fromPath);
    return { fromPath, projectPath, cwprojPath };
}

/**
 * Shared: collect Variable/ReferenceVariable type tokens at col 0 global scope,
 * skipping structure definitions and already-warned types.
 */
function collectGlobalTypeTokens(tokens: Token[]): Array<{ label: Token; typeToken: Token; typeName: string }> {
    const localTypes = new Set<string>();
    for (const t of tokens) {
        if (t.type === TokenType.Structure && t.label) {
            localTypes.add(t.label.toUpperCase());
        }
    }

    const result: Array<{ label: Token; typeToken: Token; typeName: string }> = [];
    const seen = new Set<string>();

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type !== TokenType.Label || token.start !== 0) continue;
        if (token.structureType) continue;

        const next = tokens[i + 1];
        if (!next || next.line !== token.line) continue;

        let typeName: string | undefined;
        if (next.type === TokenType.Variable) {
            typeName = next.value;
        } else if (next.type === TokenType.ReferenceVariable) {
            typeName = next.value.replace(/^&\s*/, '');
        }

        if (!typeName) continue;
        const typeUpper = typeName.toUpperCase();
        if (seen.has(typeUpper) || localTypes.has(typeUpper)) continue;
        seen.add(typeUpper);

        result.push({ label: token, typeToken: next, typeName });
    }

    return result;
}

/**
 * Detects variables declared with a user-defined class type that is not included
 * in the current file or its MEMBER parent.
 *
 * Pattern detected (at global scope, col 0):
 *   st   StringTheory
 *   st   &StringTheory
 *
 * Closes #83 (stage 1)
 */
export async function validateMissingIncludes(
    tokens: Token[],
    document: TextDocument
): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    const { projectPath } = resolveProjectPaths(document);

    // Always invalidate the current document's include cache — it just changed
    includeVerifier.clearCache(document.uri);

    const sdi = StructureDeclarationIndexer.getInstance();
    await sdi.getOrBuildIndex(projectPath);

    for (const { typeToken, typeName } of collectGlobalTypeTokens(tokens)) {
        const definitions = sdi.find(typeName, projectPath).length > 0
            ? sdi.find(typeName, projectPath)
            : sdi.find(typeName);

        if (definitions.length === 0) continue;

        const incFileName = path.basename(definitions[0].filePath);

        const alreadyIncluded = await includeVerifier.isClassIncluded(incFileName, document);
        if (alreadyIncluded) continue;

        logger.error(`⚠️ Missing include for type "${typeName}" (defined in "${incFileName}") at line ${typeToken.line + 1}`);

        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: { line: typeToken.line, character: typeToken.start },
                end:   { line: typeToken.line, character: typeToken.start + typeName.length },
            },
            message: `'${typeName}' is defined in '${incFileName}' which is not included.`,
            source: 'clarion',
            code: 'missing-include',
            data: { typeName, incFileName },
        });
    }

    return diagnostics;
}

/**
 * Detects variables whose type is included, but the class requires Link/DLL
 * constants (DefineConstants in the .cwproj) that are not yet defined.
 *
 * Only fires when:
 *   - The type's .inc IS included (missing-include would otherwise cover it)
 *   - The project context (cwproj) is known
 *   - The class has Link()/DLL() attributes in its declaration
 *
 * Severity: Information — the code compiles but will link/run incorrectly.
 *
 * Closes #83 (stage 3)
 */
export async function validateMissingConstants(
    tokens: Token[],
    document: TextDocument
): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    const { projectPath, cwprojPath } = resolveProjectPaths(document);

    // Without a project file we can't check constants — skip silently
    if (!cwprojPath) {
        logger.error(`[MissingConstants] No cwproj path for ${document.uri.split('/').pop()} — skipping`);
        return diagnostics;
    }

    const sdi = StructureDeclarationIndexer.getInstance();
    await sdi.getOrBuildIndex(projectPath);

    const constantParser = new ClassConstantParser();
    const constantsChecker = new ProjectConstantsChecker();

    for (const { typeToken, typeName } of collectGlobalTypeTokens(tokens)) {
        const definitions = sdi.find(typeName, projectPath).length > 0
            ? sdi.find(typeName, projectPath)
            : sdi.find(typeName);

        if (definitions.length === 0) continue;

        const incFilePath = definitions[0].filePath;
        const incFileName = path.basename(incFilePath);

        // Only fire when the include IS present — missing-include covers the other case
        const isIncluded = await includeVerifier.isClassIncluded(incFileName, document);
        if (!isIncluded) continue;

        // Parse class for Link()/DLL() constants
        const classConstants = await constantParser.parseFile(incFilePath);
        const thisClass = classConstants.find(c => c.className.toLowerCase() === typeName.toLowerCase());
        if (!thisClass || thisClass.constants.length === 0) continue;

        // Check which constants are missing
        const missing: string[] = [];
        for (const constant of thisClass.constants) {
            const isDefined = await constantsChecker.isConstantDefined(constant.name, cwprojPath);
            if (!isDefined) missing.push(constant.name);
        }

        if (missing.length === 0) continue;

        logger.error(`⚠️ Missing constants for "${typeName}": ${missing.join(', ')}`);

        diagnostics.push({
            severity: DiagnosticSeverity.Information,
            range: {
                start: { line: typeToken.line, character: typeToken.start },
                end:   { line: typeToken.line, character: typeToken.start + typeName.length },
            },
            message: `'${typeName}' requires ${missing.length === 1 ? 'a project constant' : 'project constants'} that ${missing.length === 1 ? 'is' : 'are'} not defined: ${missing.join(', ')}.`,
            source: 'clarion',
            code: 'missing-define-constants',
            data: { typeName, incFileName, missingConstants: missing, projectPath, cwprojPath },
        });
    }

    return diagnostics;
}

