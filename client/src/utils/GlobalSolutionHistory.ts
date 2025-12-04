import { ExtensionContext } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("GlobalSolutionHistory");

export interface SolutionReference {
    folderPath: string;           // e.g., "F:\\MyProject"
    settingsPath: string;         // e.g., "F:\\MyProject\\.vscode\\settings.json"
    solutionFile: string;         // e.g., "F:\\MyProject\\MySolution.sln"
    lastOpened: Date;
}

const MAX_RECENT_SOLUTIONS = 20;
const GLOBAL_STATE_KEY = 'clarion.recentSolutionReferences';

export class GlobalSolutionHistory {
    private static context: ExtensionContext;

    /**
     * Initialize with extension context
     */
    static initialize(context: ExtensionContext): void {
        this.context = context;
    }

    /**
     * Add or update a solution reference in the global history
     */
    static async addSolution(solutionFile: string, folderPath: string): Promise<void> {
        if (!this.context) {
            logger.error("GlobalSolutionHistory not initialized");
            return;
        }

        const settingsPath = path.join(folderPath, '.vscode', 'settings.json');
        
        const reference: SolutionReference = {
            folderPath,
            settingsPath,
            solutionFile,
            lastOpened: new Date()
        };

        // Get existing references
        const references = await this.getReferences();

        // Remove any existing reference to this solution (to update timestamp)
        const filtered = references.filter(ref => 
            ref.solutionFile.toLowerCase() !== solutionFile.toLowerCase()
        );

        // Add to the beginning (most recent first)
        filtered.unshift(reference);

        // Limit to MAX_RECENT_SOLUTIONS
        const limited = filtered.slice(0, MAX_RECENT_SOLUTIONS);

        // Save back to global state
        await this.context.globalState.update(GLOBAL_STATE_KEY, limited);
        
        logger.info(`✅ Added solution to global history: ${solutionFile}`);
    }

    /**
     * Get all solution references from global history
     */
    static async getReferences(): Promise<SolutionReference[]> {
        if (!this.context) {
            logger.error("GlobalSolutionHistory not initialized");
            return [];
        }

        const references = this.context.globalState.get<SolutionReference[]>(GLOBAL_STATE_KEY, []);
        
        // Convert date strings back to Date objects (they get serialized as strings)
        return references.map(ref => ({
            ...ref,
            lastOpened: new Date(ref.lastOpened)
        }));
    }

    /**
     * Get valid solution references (where files still exist)
     */
    static async getValidReferences(): Promise<SolutionReference[]> {
        const references = await this.getReferences();
        const valid: SolutionReference[] = [];

        for (const ref of references) {
            // Check if solution file exists
            if (!fs.existsSync(ref.solutionFile)) {
                logger.warn(`⚠️ Solution file not found: ${ref.solutionFile}`);
                continue;
            }

            // Check if folder exists
            if (!fs.existsSync(ref.folderPath)) {
                logger.warn(`⚠️ Folder not found: ${ref.folderPath}`);
                continue;
            }

            // Check if settings.json exists (optional - will be created if needed)
            // We don't require it to exist, just log if it doesn't
            if (!fs.existsSync(ref.settingsPath)) {
                logger.info(`ℹ️ Settings file not found (will be created): ${ref.settingsPath}`);
            }

            valid.push(ref);
        }

        // If we filtered out some invalid references, update the stored list
        if (valid.length !== references.length) {
            await this.context.globalState.update(GLOBAL_STATE_KEY, valid);
            logger.info(`🧹 Cleaned up ${references.length - valid.length} invalid references`);
        }

        return valid;
    }

    /**
     * Clear all solution references
     */
    static async clear(): Promise<void> {
        if (!this.context) {
            logger.error("GlobalSolutionHistory not initialized");
            return;
        }

        await this.context.globalState.update(GLOBAL_STATE_KEY, []);
        logger.info("🧹 Cleared all solution references");
    }

    /**
     * Remove a specific solution reference
     */
    static async removeSolution(solutionFile: string): Promise<void> {
        if (!this.context) {
            logger.error("GlobalSolutionHistory not initialized");
            return;
        }

        const references = await this.getReferences();
        const filtered = references.filter(ref => 
            ref.solutionFile.toLowerCase() !== solutionFile.toLowerCase()
        );

        await this.context.globalState.update(GLOBAL_STATE_KEY, filtered);
        logger.info(`🗑️ Removed solution from global history: ${solutionFile}`);
    }
}
