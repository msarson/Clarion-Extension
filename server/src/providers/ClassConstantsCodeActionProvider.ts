import {
    TextDocument,
    Range,
    CodeActionContext,
    CancellationToken,
    CodeAction,
    CodeActionKind,
    Command
} from 'vscode-languageserver/node';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { SolutionManager } from '../solution/solutionManager';
import { ClassConstantParser } from '../utils/ClassConstantParser';
import { ProjectConstantsChecker } from '../utils/ProjectConstantsChecker';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import LoggerManager from '../logger';
import * as path from 'path';

const logger = LoggerManager.getLogger('ClassConstantsCodeActionProvider');
logger.setLevel('warn');

/**
 * Provides Code Actions (lightbulb) for adding missing class constants
 */
export class ClassConstantsCodeActionProvider {
    private sdi: StructureDeclarationIndexer;
    private includeVerifier: IncludeVerifier;

    constructor() {
        this.sdi = StructureDeclarationIndexer.getInstance();
        this.includeVerifier = new IncludeVerifier();
    }

    async provideCodeActions(
        document: TextDocument,
        range: Range,
        context: CodeActionContext,
        token: CancellationToken
    ): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];

        try {
            const text = document.getText();
            const line = document.getText(Range.create(range.start.line, 0, range.start.line, 1000));
            
            logger.warn(`[CodeAction] triggered line=${range.start.line} file="${path.basename(document.uri)}"`);

            const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
            const sm = SolutionManager.getInstance();
            const projectPath = sm?.getProjectPathForFile(fromPath) ?? path.dirname(fromPath);
            const cwprojPath = sm?.getProjectCwprojForFile(fromPath);

            // Respond to missing-include diagnostics (from MissingIncludeDiagnostics)
            const missingIncludeDiags = context.diagnostics.filter(d => d.code === 'missing-include');
            if (missingIncludeDiags.length > 0) {
                for (const diag of missingIncludeDiags) {
                    const data = diag.data as { typeName: string; incFileName: string } | undefined;
                    if (data?.typeName && data?.incFileName) {
                        logger.warn(`[CodeAction] missing-include diag: typeName="${data.typeName}" incFile="${data.incFileName}"`);
                        const diagActions = await this.getActionsForMissingInclude(data.typeName, data.incFileName, document, projectPath, cwprojPath);
                        actions.push(...diagActions);
                    }
                }
                if (actions.length > 0) {
                    return actions;
                }
            }

            // Respond to missing-define-constants diagnostics (from MissingIncludeDiagnostics)
            const missingConstantsDiags = context.diagnostics.filter(d => d.code === 'missing-define-constants');
            if (missingConstantsDiags.length > 0) {
                for (const diag of missingConstantsDiags) {
                    const data = diag.data as { typeName: string; missingConstants: string[]; cwprojPath: string } | undefined;
                    if (data?.typeName && data?.missingConstants?.length) {
                        logger.warn(`[CodeAction] missing-define-constants diag: typeName="${data.typeName}" constants=${data.missingConstants.join(',')}`);
                        const addConstantsAction = CodeAction.create(
                            `Add missing ${data.typeName} link equates to project`,
                            Command.create(
                                'Add Constants',
                                'clarion.addClassConstants',
                                {
                                    className: data.typeName,
                                    projectPath: projectPath,
                                    cwprojPath: cwprojPath,
                                    constants: data.missingConstants.map(name => ({ name, type: 'Link' }))
                                }
                            ),
                            CodeActionKind.QuickFix
                        );
                        addConstantsAction.isPreferred = true;
                        actions.push(addConstantsAction);
                    }
                }
                if (actions.length > 0) {
                    return actions;
                }
            }

            // Check if we're on an INCLUDE line
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
            if (includeMatch) {
                const includeFile = includeMatch[1];
                logger.warn(`[CodeAction] INCLUDE line detected: ${includeFile}`);
                
                // Check if this is a class include file
                const includeActions = await this.getActionsForInclude(includeFile, document);
                actions.push(...includeActions);
                
                if (actions.length > 0) {
                    return actions;
                }
            }
            
            // Otherwise, check the word at cursor position (existing logic)
            const offset = document.offsetAt(range.start);
            const word = this.getWordAtPosition(text, offset);

            if (!word) {
                return actions;
            }

            logger.warn(`[CodeAction] word="${word}" file="${path.basename(document.uri)}"`);

            // Check if this is a class type with missing constants
            logger.warn(`[CodeAction] projectPath="${projectPath}" cwprojPath="${cwprojPath ?? '(none)'}"`);
            
            // Build or get index for this project
            const index = await this.sdi.getOrBuildIndex(projectPath);
            logger.warn(`[CodeAction] SDI index has ${index.byName.size} entries`);
            
            // Look up the class
            const definitions = this.sdi.find(word, projectPath);
            logger.warn(`[CodeAction] found ${definitions.length} definitions for "${word}"`);
            
            if (definitions.length === 0) {
                return actions;
            }

            const def = definitions[0];
            const fileName = path.basename(def.filePath);
            logger.warn(`[CodeAction] class file="${fileName}" filePath="${def.filePath}"`);

            // Verify the class file is included
            const isIncluded = await this.includeVerifier.isClassIncluded(fileName, document);
            logger.warn(`[CodeAction] isIncluded=${isIncluded}`);
            if (!isIncluded) {
                // Offer Code Action to add the missing INCLUDE
                const addIncludeActions = await this.getActionsForMissingInclude(word, fileName, document, projectPath, cwprojPath);
                actions.push(...addIncludeActions);
                return actions;
            }

            logger.warn(`[CodeAction] checking constants for ${word}`);

            // Parse class constants
            const constantParser = new ClassConstantParser();
            const classConstants = await constantParser.parseFile(def.filePath);
            const thisClassConstants = classConstants.find(c => c.className.toLowerCase() === def.name.toLowerCase());

            if (!thisClassConstants || thisClassConstants.constants.length === 0) {
                logger.warn(`[CodeAction] no Link/DLL constants found in ${fileName} for class "${def.name}"`);
                return actions;
            }

            // Check which constants are missing — use specific cwproj path to avoid wrong-project matches
            const constantsChecker = new ProjectConstantsChecker();
            const missingConstants = [];

            for (const constant of thisClassConstants.constants) {
                const isDefined = await constantsChecker.isConstantDefined(constant.name, cwprojPath ?? projectPath);
                logger.warn(`[CodeAction] constant "${constant.name}" defined=${isDefined}`);
                if (!isDefined) {
                    missingConstants.push(constant);
                }
            }

            if (missingConstants.length === 0) {
                logger.warn(`[CodeAction] all constants already defined — no action needed`);
                return actions;
            }

            logger.warn(`[CodeAction] offering action for ${missingConstants.length} missing constants`);

            // Single action — user chooses Link or DLL mode via QuickPick at execution time
            const addConstantsAction = CodeAction.create(
                `Add missing ${word} link equates to project`,
                Command.create(
                    'Add Constants',
                    'clarion.addClassConstants',
                    {
                        className: def.name,
                        projectPath: projectPath,
                        cwprojPath: cwprojPath,
                        constants: missingConstants.map(c => ({
                            name: c.name,
                            type: c.type,
                            relatedFile: c.relatedFile
                        }))
                    }
                ),
                CodeActionKind.QuickFix
            );
            addConstantsAction.isPreferred = true;

            actions.push(addConstantsAction);
            logger.info(`Provided ${actions.length} code actions for ${word}`);

        } catch (error) {
            logger.error(`Error providing code actions: ${error instanceof Error ? error.message : String(error)}`);
        }

        return actions;
    }

    /**
     * Gets Code Actions for an INCLUDE statement
     */
    private async getActionsForInclude(includeFile: string, document: TextDocument): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        
        try {
            const fromPath = decodeURIComponent(document.uri.replace(/^file:\/\/\/?/i, '')).replace(/\//g, '\\');
            const sm = SolutionManager.getInstance();
            const projectPath = sm?.getProjectPathForFile(fromPath) ?? path.dirname(fromPath);
            const cwprojPath = sm?.getProjectCwprojForFile(fromPath);
            
            // Build or get index for this project
            await this.sdi.getOrBuildIndex(projectPath);
            
            // Find all classes in this include file
            const allClasses = this.sdi.findInFile(includeFile, projectPath);
            
            if (allClasses.length === 0) {
                logger.info(`No classes found in ${includeFile}`);
                return actions;
            }
            
            logger.info(`Found ${allClasses.length} classes in ${includeFile}`);
            
            // Parse constants for all classes in this file
            const constantParser = new ClassConstantParser();
            const constantsChecker = new ProjectConstantsChecker();
            
            // Collect all missing constants from all classes in the file
            const allMissingConstants: Array<{name: string, type: string, relatedFile?: string}> = [];
            
            for (const classDef of allClasses) {
                const classConstants = await constantParser.parseFile(classDef.filePath);
                const thisClassConstants = classConstants.find(c => c.className.toLowerCase() === classDef.name.toLowerCase());
                
                if (thisClassConstants && thisClassConstants.constants.length > 0) {
                    for (const constant of thisClassConstants.constants) {
                        const isDefined = await constantsChecker.isConstantDefined(constant.name, cwprojPath ?? projectPath);
                        if (!isDefined) {
                            // Avoid duplicates
                            if (!allMissingConstants.find(c => c.name === constant.name)) {
                                allMissingConstants.push(constant);
                            }
                        }
                    }
                }
            }
            
            if (allMissingConstants.length === 0) {
                logger.info(`No missing constants for classes in ${includeFile}`);
                return actions;
            }
            
            logger.info(`Found ${allMissingConstants.length} missing constants for ${includeFile}`);
            
            // Single action — user chooses Link or DLL mode via QuickPick at execution time
            const addConstantsAction = CodeAction.create(
                `Add missing ${path.basename(includeFile, '.inc')} link equates to project`,
                Command.create(
                    'Add Constants',
                    'clarion.addClassConstants',
                    {
                        className: path.basename(includeFile, '.inc'),
                        projectPath: projectPath,
                        cwprojPath: cwprojPath,
                        constants: allMissingConstants.map(c => ({
                            name: c.name,
                            type: c.type,
                            relatedFile: c.relatedFile
                        }))
                    }
                ),
                CodeActionKind.QuickFix
            );
            addConstantsAction.isPreferred = true;

            actions.push(addConstantsAction);
            logger.info(`Provided ${actions.length} code actions for INCLUDE ${includeFile}`);
            
        } catch (error) {
            logger.error(`Error getting actions for INCLUDE: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return actions;
    }

    /**
     * Gets Code Actions for adding a missing INCLUDE statement
     */
    private async getActionsForMissingInclude(className: string, includeFile: string, document: TextDocument, projectPath: string, cwprojPath: string | undefined): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        
        try {
            // projectPath and cwprojPath are now passed in from the caller
            
            // Create action to add include to current file
            const addToCurrentFileAction = CodeAction.create(
                `Add INCLUDE('${includeFile}'),ONCE to current file`,
                Command.create(
                    'Add INCLUDE',
                    'clarion.addIncludeStatement',
                    {
                        includeFile,
                        targetFile: document.uri,
                        location: 'current'
                    }
                ),
                CodeActionKind.QuickFix
            );
            addToCurrentFileAction.isPreferred = true;
            actions.push(addToCurrentFileAction);
            
            // Check if this is a MEMBER module and offer to add to parent
            const text = document.getText();
            const memberMatch = text.match(/^\s*MEMBER\s*\(\s*['"]([^'"]+)['"]\s*\)/im);
            
            if (memberMatch) {
                const memberFile = memberMatch[1];
                logger.info(`Detected MEMBER file: ${memberFile}, offering to add INCLUDE there`);
                
                const addToMemberAction = CodeAction.create(
                    `Add INCLUDE('${includeFile}'),ONCE to ${memberFile}`,
                    Command.create(
                        'Add INCLUDE',
                        'clarion.addIncludeStatement',
                        {
                            includeFile,
                            targetFile: memberFile,
                            location: 'member'
                        }
                    ),
                    CodeActionKind.QuickFix
                );
                actions.push(addToMemberAction);
            }
            
            // Check if there are also missing constants for this class
            await this.sdi.getOrBuildIndex(projectPath);
            const classDefArray = this.sdi.find(className, projectPath);
            const classDef = classDefArray.length > 0 ? classDefArray[0] : null;
            
            if (classDef) {
                const constantParser = new ClassConstantParser();
                const constantsChecker = new ProjectConstantsChecker();
                const classConstants = await constantParser.parseFile(classDef.filePath);
                const thisClassConstants = classConstants.find(c => c.className.toLowerCase() === className.toLowerCase());
                
                if (thisClassConstants && thisClassConstants.constants.length > 0) {
                    const missingConstants: Array<{name: string, type: string, relatedFile?: string}> = [];
                    
                    for (const constant of thisClassConstants.constants) {
                        const isDefined = await constantsChecker.isConstantDefined(constant.name, cwprojPath ?? projectPath);
                        if (!isDefined) {
                            missingConstants.push(constant);
                        }
                    }
                    
                    if (missingConstants.length > 0) {
                        logger.info(`Found ${missingConstants.length} missing constants for ${className}, adding combined actions`);
                        
                        // Single action — user chooses mode via QuickPick at execution time
                        const addBothAction = CodeAction.create(
                            `Add INCLUDE + link equates (choose mode) to current file`,
                            Command.create(
                                'Add INCLUDE and Constants',
                                'clarion.addIncludeAndConstants',
                                {
                                    includeFile,
                                    targetFile: document.uri,
                                    location: 'current',
                                    className: className,
                                    projectPath: projectPath,
                                    cwprojPath: cwprojPath,
                                    constants: missingConstants.map(c => ({
                                        name: c.name,
                                        type: c.type,
                                        relatedFile: c.relatedFile
                                    }))
                                }
                            ),
                            CodeActionKind.QuickFix
                        );
                        
                        actions.push(addBothAction);
                        
                        // Add same for MEMBER file if applicable
                        if (memberMatch) {
                            const addBothToMemberAction = CodeAction.create(
                                `Add INCLUDE + link equates (choose mode) to ${memberMatch[1]}`,
                                Command.create(
                                    'Add INCLUDE and Constants',
                                    'clarion.addIncludeAndConstants',
                                    {
                                        includeFile,
                                        targetFile: memberMatch[1],
                                        location: 'member',
                                        className: className,
                                        projectPath: projectPath,
                                        cwprojPath: cwprojPath,
                                        constants: missingConstants.map(c => ({
                                            name: c.name,
                                            type: c.type,
                                            relatedFile: c.relatedFile
                                        }))
                                    }
                                ),
                                CodeActionKind.QuickFix
                            );
                            
                            actions.push(addBothToMemberAction);
                        }
                    }
                }
            }
            
            logger.info(`Provided ${actions.length} code actions for missing INCLUDE ${includeFile}`);
            
        } catch (error) {
            logger.error(`Error getting actions for missing INCLUDE: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return actions;
    }

    /**
     * Gets the word at the given position in text
     */
    private getWordAtPosition(text: string, offset: number): string | null {
        // Find word boundaries
        let start = offset;
        let end = offset;

        // Move start back to beginning of word
        while (start > 0 && /[A-Za-z0-9_]/.test(text[start - 1])) {
            start--;
        }

        // Move end forward to end of word
        while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) {
            end++;
        }

        if (start === end) {
            return null;
        }

        return text.substring(start, end);
    }
}
