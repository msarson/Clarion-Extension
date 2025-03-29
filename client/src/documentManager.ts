import {
    Uri,
    workspace,
    Disposable,
    TextDocument,
    TextDocumentChangeEvent,
    Position,
    Range,
    FileDeleteEvent,
    FileRenameEvent,
    DocumentLink
} from 'vscode';

import LocationProvider from './providers/LocationProvider'; // Adjust the import path based on your project structure
import { ClarionLocation } from './providers/LocationProvider'; // Make sure this import is correct

import * as path from 'path';
import * as fs from 'fs';

import { globalSettings } from './globals';
import LoggerManager from './logger';
import { SolutionCache } from './SolutionCache';
const logger = LoggerManager.getLogger("DocumentManager");

interface DocumentInfo {
    statementLocations: ClarionLocation[];
}

/**
 * The DocumentManager class is responsible for scanning, tracking, and managing document-related
 * information within a Clarion environment. It monitors workspace events such as opening, editing,
 * saving, renaming, and deleting text documents, and updates the document locations accordingly.
 *
 * This class utilizes several regular expressions to identify specific Clarion constructs including:
 * - MODULE: Identifies module declarations.
 * - INCLUDE: Handles file inclusion statements.
 * - MEMBER: Extracts member statements.
 *
 * Additionally, DocumentManager leverages a LocationProvider to determine the precise positions (ranges)
 * in documents for each recognized statement, enabling features like document link generation and
 * navigation to specific document locations (including sections).
 *
 * @remarks
 * - The class registers event listeners upon instantiation to keep the openDocuments map in sync with
 *   the state of the workspace.
 * - It integrates with a SolutionCache for solution-specific context and configuration.
 * - The public API provides methods for initializing, analyzing document contents, and retrieving link URIs.
 *
 * @example
 * ```typescript
 * const solutionCache: SolutionCache = SolutionCache.getInstance();
 * const documentManager = new DocumentManager();
 * await documentManager.initialize();
 * 
 * // Retrieve a document's links
 * const documentLinks = documentManager.generateDocumentLinks(documentUri);
 * ```
 *
 * @see LocationProvider - Handles the extraction of location details using regex patterns.
 * @see Disposable - Implements cleanup logic for registered event listeners.
 */
export class DocumentManager implements Disposable {

    //added detection for extensions
    private readonly modulePattern = /MODULE\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*(?:,\s*'([^']+\.[a-zA-Z0-9]+)'\s*)?\)/ig;
    private readonly includePattern = /INCLUDE\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*(?:,\s*'([^']+\.[a-zA-Z0-9]+)'\s*)?(?:,\s*ONCE)?\)/ig;
    private readonly memberPattern = /\bMEMBER\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*\).*?/ig;
    private readonly linkPattern = /LINK\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*\)/ig;


    private openDocuments: Map<string, DocumentInfo> = new Map(); // Store document info by URI
    private locationProvider!: LocationProvider;
    private disposables: Disposable[] = [];
    private solutionCache: SolutionCache;

    private constructor() {
        this.solutionCache = SolutionCache.getInstance();
    }
    
    // ✅ Static factory method to ensure proper async initialization
    public static async create(): Promise<DocumentManager> {
        const manager = new DocumentManager();
        await manager.initialize();
        return manager;
    }
    
    private async initialize() {
        logger.info("✅ DocumentManager.initialize() called");
        this.locationProvider = new LocationProvider();
    
        this.disposables.push(
            workspace.onDidOpenTextDocument(this.onDidOpenTextDocument, this),
            workspace.onDidChangeTextDocument(this.onDidChangeTextDocument, this),
            workspace.onDidSaveTextDocument(this.onDidSaveTextDocument, this),
            workspace.onDidRenameFiles(this.onDidRenameFiles, this),
            workspace.onDidDeleteFiles(this.onDidDeleteFiles, this)
        );

        // ✅ Manually process currently open documents
        for (const document of workspace.textDocuments) {
            await this.updateDocumentInfo(document);
        }

        logger.info("✅ DocumentManager event listeners registered.");
    }

    private async onDidSaveTextDocument(document: TextDocument) {
        logger.info(`Document saved: ${document.uri.fsPath}`);
        await this.updateDocumentInfo(document);
    }

    private async onDidDeleteFiles(event: FileDeleteEvent) {
        for (const fileDelete of event.files) {
            const deletedUri = fileDelete;
            // Handle deletion by removing entries from openDocuments map
        }
    }
    
    private async onDidRenameFiles(event: FileRenameEvent) {
        for (const fileRename of event.files) {
            const oldUri = fileRename.oldUri;
            const newUri = fileRename.newUri;
            // Handle renaming by updating the entries in openDocuments map
            // You might need to adjust the keys in the map accordingly
        }
    }
    
    private async onDidOpenTextDocument(document: TextDocument) {
        logger.info(`📄 [EVENT] Document opened: ${document.uri.fsPath}`);
        await this.updateDocumentInfo(document);
    }

    private async onDidChangeTextDocument(event: TextDocumentChangeEvent) {
        const doc = event.document;
        logger.info(`Document changed: ${doc.uri.fsPath}`);
        await this.updateDocumentInfo(event.document);
    }

    /**
     * Retrieves the URI for a link found at the specified position in the document.
     *
     * This function searches for a link in the document at the given position using an internal lookup.
     * If a link is found, it constructs a file URI from the link's file path. Additionally, if the link 
     * corresponds to a section and the section line information is available, the URI is updated with a 
     * fragment indicating the line number (incremented by one) and column position.
     *
     * @param documentUri - The URI of the document where the link search is performed.
     * @param position - The position within the document to locate the link.
     * @returns The constructed URI with an optional fragment if successful, or undefined if no link is found.
     */
    getLinkUri(documentUri: Uri, position: Position): Uri | undefined {
        const location = this.findLinkAtPosition(documentUri, position);
        if (location) {
            let targetUri = Uri.file(location.fullFileName);

            if (location.statementType === "SECTION" && location.sectionLineLocation) {
                const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
                targetUri = targetUri.with({ fragment: lineQueryParam });
            }
            return targetUri;
        }

        return undefined;
    }

    /**
     * Generates document links for a provided URI based on the locations
     * and types of statements found in the document.
     *
     * This method retrieves document information associated with the supplied URI.
     * For each statement location in the document, it creates a DocumentLink if:
     * - The statement type is either "INCLUDE", "MODULE", "MEMBER", or "SECTION".
     * - Both the start and end positions (line positions) are defined.
     *
     * For "SECTION" statement types with an additional section line location, the generated
     * target URI is modified to include a fragment indicating the line (offset by one) and column.
     *
     * @param uri - The URI of the document to generate links for.
     * @returns An array of DocumentLink objects representing the navigable code links within the document.
     */

    generateDocumentLinks(uri: Uri): DocumentLink[] {
        const documentInfo = this.getDocumentInfo(uri);

        if (!documentInfo) {
            logger.error(`❌ No document info available for ${uri.fsPath}`);
            return [];
        }

        const links: DocumentLink[] = [];
        const supportedTypes = ["INCLUDE", "MODULE", "MEMBER", "SECTION", "LINK"];
        // 🔹 Process existing document statements from `documentInfo`
        for (const location of documentInfo.statementLocations) {

            if (!supportedTypes.includes(location.statementType ?? "") || !location.fullFileName || !location.linePosition || !location.linePositionEnd) {
                continue; // Skip invalid or unsupported entries
            }

            let targetUri = Uri.file(location.fullFileName);

            if (location.statementType === "SECTION" && location.sectionLineLocation) {
                const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
                targetUri = targetUri.with({ fragment: lineQueryParam });
            }

            const link = new DocumentLink(
                new Range(location.linePosition, location.linePositionEnd),
                targetUri
            );
            links.push(link);
        }

        return links;
    }

    /**
     * Searches for a link within the document at the specified position.
     *
     * @param documentUri - The URI of the document to search.
     * @param position - The position within the document to check for a link.
     *
     * @returns The location of the link if the given position falls within any known link range, otherwise undefined.
     */
    findLinkAtPosition(documentUri: Uri, position: Position): ClarionLocation | undefined {
        const documentInfo = this.getDocumentInfo(documentUri);

        if (documentInfo) {
            for (const location of documentInfo.statementLocations) {
                const linkRange = new Range(
                    location.linePosition || new Position(0, 0),
                    location.linePositionEnd || new Position(0, 0)
                );

                if (linkRange.contains(position)) {
                    return location;
                }
            }
        }

        return undefined;
    }

    /**
     * Updates the document information by processing text patterns for include, module, and member declarations.
     *
     * @param document - The text document to be analyzed.
     *
     * @remarks
     * This method ignores documents that do not use the 'file' URI scheme or have a file path ending with '.code-workspace'.
     * It extracts locations for "INCLUDE", "MODULE", and "MEMBER" patterns and stores these locations in the openDocuments map.
     */
    public async updateDocumentInfo(document: TextDocument) {
        logger.info(`📄 Processing document: ${document.uri.fsPath}`);

        // 🔹 Get latest lookup extensions
        const lookupExtensions = globalSettings.defaultLookupExtensions;

        if (document.uri.scheme !== 'file' || document.uri.fsPath.endsWith('.code-workspace')) {
            logger.info(`⚠ Skipping document: ${document.uri.fsPath}`);
            return;
        }

        // Check if this is a Clarion file
        const fileExt = path.extname(document.uri.fsPath).toLowerCase();
        const isClarionFile = lookupExtensions.some(ext => ext.toLowerCase() === fileExt);
        
        if (!isClarionFile && !document.uri.fsPath.toLowerCase().endsWith('.clw')) {
            logger.info(`⚠ Skipping non-Clarion file: ${document.uri.fsPath}`);
            return;
        }

        logger.info(`📄 Updating document info: ${document.uri.fsPath}`);

        // Try to find a corresponding source file for this document
        const documentPath = document.uri.fsPath;
        const fileName = path.basename(documentPath);
        
        // Find which project this file belongs to using SolutionCache
        const sourceFile = this.solutionCache.findSourceInProject(fileName);
        const project = this.solutionCache.findProjectForFile(fileName);

        if (project) {
            logger.info(`📄 File ${fileName} belongs to project ${project.name}`);
        }

        try {
            // Always process all patterns regardless of whether we found a source file
            // This ensures we catch all possible links
            const includeLocations = await this.processPattern(document, this.includePattern, "INCLUDE");
            const moduleLocations = await this.processPattern(document, this.modulePattern, "MODULE");
            const memberLocations = await this.processPattern(document, this.memberPattern, "MEMBER");
            const linkLocations = await this.processPattern(document, this.linkPattern, "LINK");
            
            const statementLocations: ClarionLocation[] = [
                ...includeLocations,
                ...moduleLocations,
                ...memberLocations,
                ...linkLocations
            ];

            logger.info(`📊 Found ${includeLocations.length} INCLUDE, ${moduleLocations.length} MODULE, ${memberLocations.length} MEMBER, and ${linkLocations.length} LINK statements`);

            // Always store document info even if there are no statement locations
            // This prevents repeated processing of the same document
            this.openDocuments.set(document.uri.toString().toLowerCase(), { statementLocations });

            if (statementLocations.length > 0) {
                logger.info(`✅ Stored document info for ${document.uri.fsPath} with ${statementLocations.length} statement locations`);
                
                // Log a sample of the statement locations for debugging
                if (statementLocations.length > 0) {
                    const sample = statementLocations[0];
                    logger.info(`🔍 Sample statement: Type=${sample.statementType}, File=${sample.fullFileName}, Position=${sample.linePosition?.line}:${sample.linePosition?.character}`);
                }
            } else {
                logger.info(`ℹ️ Stored empty document info for ${document.uri.fsPath}`);
            }
        } catch (error) {
            logger.error(`❌ Error updating document info: ${error instanceof Error ? error.message : String(error)}`);
            // Store an empty document info to prevent repeated processing
            this.openDocuments.set(document.uri.toString().toLowerCase(), { statementLocations: [] });
        }
    }
    
    /**
     * Processes a document to extract and map locations that match the provided regular expression pattern.
     *
     * This method retrieves locations from the document that adhere to the given pattern. Each matched location is converted 
     * into a ClarionLocation object with the specified statement type. If the match result contains section information, an 
     * additional ClarionLocation is created with adjusted start and end positions to reflect the section's location within the document.
     *
     * @param document - The text document to search in.
     * @param pattern - The regular expression pattern used to identify locations within the document.
     * @param statementType - A string specifying the type of statement to assign to the discovered locations.
     * @returns An array of ClarionLocation objects representing the statement and, if applicable, its associated section.
     */
    private async processPattern(document: TextDocument, pattern: RegExp, statementType: string): Promise<ClarionLocation[]> {
        if (!this.locationProvider) {
            logger.error(`❌ Error: locationProvider is not initialized when processing ${statementType}.`);
            return [];
        }
        
        // Reset the pattern's lastIndex to ensure we start from the beginning
        pattern.lastIndex = 0;
        
        const statementLocations: ClarionLocation[] = [];
        logger.info(`Processing ${statementType} pattern in: ${document.uri.fsPath}`);
        
        try {
            // Get locations from the pattern
            const clarionLocation = await this.locationProvider.getLocationFromPattern(document, pattern);

            if (!clarionLocation || clarionLocation.length === 0) {
                logger.info(`No ${statementType} matches found in ${document.uri.fsPath}`);
                return statementLocations;
            }

            logger.info(`Found ${clarionLocation.length} ${statementType} matches in ${document.uri.fsPath}`);

            for (const location of clarionLocation) {
                // Skip locations with invalid file paths
                if (!location.fullFileName) {
                    logger.info(`Skipping ${statementType} match with no file path`);
                    continue;
                }

                // Verify the file exists
                try {
                    const fileExists = fs.existsSync(location.fullFileName);
                    if (!fileExists) {
                        logger.info(`File not found: ${location.fullFileName}`);
                        // Still include it as a link, but log the issue
                    } else {
                        logger.info(`Verified file exists: ${location.fullFileName}`);
                    }
                } catch (error) {
                    logger.error(`Error checking file existence: ${error}`);
                    // Continue anyway to create the link
                }

                const statementLocation: ClarionLocation = {
                    fullFileName: location.fullFileName,
                    sectionLineLocation: location.sectionLineLocation,
                    linePosition: location.linePosition,
                    linePositionEnd: location.linePositionEnd,
                    statementType: statementType,
                    result: location.result
                };

                statementLocations.push(statementLocation);
                logger.info(`Added ${statementType} link to ${location.fullFileName}`);
            }
        } catch (error) {
            logger.error(`Error processing ${statementType} pattern: ${error instanceof Error ? error.message : String(error)}`);
        }

        logger.info(`Returning ${statementLocations.length} ${statementType} locations for ${document.uri.fsPath}`);
        return statementLocations;
    }

    getDocumentInfo(uri: Uri): DocumentInfo | undefined {
        try {
            // Normalize the URI for consistency in lookups
            const normalizedUri = uri.toString().toLowerCase();
            logger.info(`🔍 Checking document info for URI: ${normalizedUri}`);

            // Debugging: Show all stored documents
            if (this.openDocuments.size === 0) {
                logger.info("⚠ openDocuments map is EMPTY.");
            }

            // Attempt to retrieve document info
            const docInfo = this.openDocuments.get(normalizedUri);

            if (docInfo) {
                //logger.info(`✅ Document info FOUND for URI: ${normalizedUri}`);
            } else {
                // logger.info(`⚠ No document info found for URI: ${normalizedUri}`);
            }

            return docInfo;
        } catch (error) {
            logger.error("❌ Error in getDocumentInfo:", error);
            return undefined;
        }
    }

    getDocumentContent(uri: Uri): string | undefined {
        const document = workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        if (document) {
            return document.getText();
        }
        return undefined;
    }
    
    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
    }
}
