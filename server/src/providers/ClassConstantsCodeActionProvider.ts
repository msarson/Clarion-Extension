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
            // Get the word at the cursor position
            const text = document.getText();
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
