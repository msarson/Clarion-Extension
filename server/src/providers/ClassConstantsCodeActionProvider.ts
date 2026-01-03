import {
    TextDocument,
    Range,
    CodeActionContext,
    CancellationToken,
    CodeAction,
    CodeActionKind,
    Command
} from 'vscode-languageserver/node';
import { ClassDefinitionIndexer } from '../utils/ClassDefinitionIndexer';
import { ClassConstantParser } from '../utils/ClassConstantParser';
import { ProjectConstantsChecker } from '../utils/ProjectConstantsChecker';
import { IncludeVerifier } from '../utils/IncludeVerifier';
import LoggerManager from '../logger';
import * as path from 'path';

const logger = LoggerManager.getLogger('ClassConstantsCodeActionProvider');
logger.setLevel('info');

/**
 * Provides Code Actions (lightbulb) for adding missing class constants
 */
export class ClassConstantsCodeActionProvider {
    private classIndexer: ClassDefinitionIndexer;
    private includeVerifier: IncludeVerifier;

    constructor() {
        this.classIndexer = new ClassDefinitionIndexer();
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
            
            // Check if we're on an INCLUDE line
            const includeMatch = line.match(/INCLUDE\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
            if (includeMatch) {
                const includeFile = includeMatch[1];
                logger.info(`Detected INCLUDE statement for: ${includeFile}`);
                
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

            logger.info(`Checking for code actions on word: ${word}`);

            // Check if this is a class type with missing constants
            const projectPath = path.dirname(decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'));
            
            logger.info(`Project path: ${projectPath}`);
            
            // Build or get index for this project
            const index = await this.classIndexer.getOrBuildIndex(projectPath);
            logger.info(`Index has ${index.classes.size} classes`);
            
            // Look up the class
            const definitions = this.classIndexer.findClass(word, projectPath);
            logger.info(`Found ${definitions?.length || 0} definitions for ${word}`);
            
            if (!definitions || definitions.length === 0) {
                return actions;
            }

            const def = definitions[0];
            const fileName = path.basename(def.filePath);
            logger.info(`Class file: ${fileName}, checking if included`);

            // Verify the class file is included
            const isIncluded = await this.includeVerifier.isClassIncluded(fileName, document);
            logger.info(`Class ${fileName} included: ${isIncluded}`);
            if (!isIncluded) {
                logger.info(`Class ${fileName} not included, offering to add INCLUDE`);
                // Offer Code Action to add the missing INCLUDE
                const addIncludeActions = await this.getActionsForMissingInclude(word, fileName, document);
                actions.push(...addIncludeActions);
                return actions;
            }

            logger.info(`Found included class: ${word}, checking for missing constants`);

            // Parse class constants
            const constantParser = new ClassConstantParser();
            const classConstants = await constantParser.parseFile(def.filePath);
            const thisClassConstants = classConstants.find(c => c.className.toLowerCase() === def.className.toLowerCase());

            if (!thisClassConstants || thisClassConstants.constants.length === 0) {
                return actions;
            }

            // Check which constants are missing
            const constantsChecker = new ProjectConstantsChecker();
            const missingConstants = [];

            for (const constant of thisClassConstants.constants) {
                const isDefined = await constantsChecker.isConstantDefined(constant.name, projectPath);
                if (!isDefined) {
                    missingConstants.push(constant);
                }
            }

            if (missingConstants.length === 0) {
                return actions;
            }

            logger.info(`Found ${missingConstants.length} missing constants for ${word}`);

            // Create Code Actions for Link Mode and DLL Mode
            const linkModeAction = CodeAction.create(
                `Add ${word} Constants (Link Mode)`,
                Command.create(
                    'Add Constants',
                    'clarion.addClassConstants',
                    {
                        className: def.className,
                        projectPath: projectPath,
                        constants: missingConstants.map(c => ({
                            name: c.name,
                            type: c.type,
                            relatedFile: c.relatedFile
                        })),
                        mode: 'link'
                    }
                ),
                CodeActionKind.QuickFix
            );
            linkModeAction.isPreferred = true; // Make Link Mode the default

            const dllModeAction = CodeAction.create(
                `Add ${word} Constants (DLL Mode)`,
                Command.create(
                    'Add Constants',
                    'clarion.addClassConstants',
                    {
                        className: def.className,
                        projectPath: projectPath,
                        constants: missingConstants.map(c => ({
                            name: c.name,
                            type: c.type,
                            relatedFile: c.relatedFile
                        })),
                        mode: 'dll'
                    }
                ),
                CodeActionKind.QuickFix
            );

            actions.push(linkModeAction, dllModeAction);
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
            const projectPath = path.dirname(decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'));
            
            // Build or get index for this project
            await this.classIndexer.getOrBuildIndex(projectPath);
            
            // Find all classes in this include file
            const allClasses = this.classIndexer.findClassesByFile(includeFile, projectPath);
            
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
                const thisClassConstants = classConstants.find(c => c.className.toLowerCase() === classDef.className.toLowerCase());
                
                if (thisClassConstants && thisClassConstants.constants.length > 0) {
                    for (const constant of thisClassConstants.constants) {
                        const isDefined = await constantsChecker.isConstantDefined(constant.name, projectPath);
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
            
            // Create Code Actions
            const linkModeAction = CodeAction.create(
                `Add ${path.basename(includeFile, '.inc')} Constants (Link Mode)`,
                Command.create(
                    'Add Constants',
                    'clarion.addClassConstants',
                    {
                        className: path.basename(includeFile, '.inc'),
                        projectPath: projectPath,
                        constants: allMissingConstants.map(c => ({
                            name: c.name,
                            type: c.type,
                            relatedFile: c.relatedFile
                        })),
                        mode: 'link'
                    }
                ),
                CodeActionKind.QuickFix
            );
            linkModeAction.isPreferred = true;
            
            const dllModeAction = CodeAction.create(
                `Add ${path.basename(includeFile, '.inc')} Constants (DLL Mode)`,
                Command.create(
                    'Add Constants',
                    'clarion.addClassConstants',
                    {
                        className: path.basename(includeFile, '.inc'),
                        projectPath: projectPath,
                        constants: allMissingConstants.map(c => ({
                            name: c.name,
                            type: c.type,
                            relatedFile: c.relatedFile
                        })),
                        mode: 'dll'
                    }
                ),
                CodeActionKind.QuickFix
            );
            
            actions.push(linkModeAction, dllModeAction);
            logger.info(`Provided ${actions.length} code actions for INCLUDE ${includeFile}`);
            
        } catch (error) {
            logger.error(`Error getting actions for INCLUDE: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return actions;
    }

    /**
     * Gets Code Actions for adding a missing INCLUDE statement
     */
    private async getActionsForMissingInclude(className: string, includeFile: string, document: TextDocument): Promise<CodeAction[]> {
        const actions: CodeAction[] = [];
        
        try {
            const projectPath = path.dirname(decodeURIComponent(document.uri.replace('file:///', '')).replace(/\//g, '\\'));
            
            // Create action to add include to current file
            const addToCurrentFileAction = CodeAction.create(
                `Add INCLUDE('${includeFile}',ONCE) to current file`,
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
                    `Add INCLUDE('${includeFile}',ONCE) to ${memberFile}`,
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
