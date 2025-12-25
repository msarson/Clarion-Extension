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
import LoggerManager from './utils/LoggerManager';
import { SolutionCache } from './SolutionCache';
import { isInsideMapBlock } from '../../common/clarionUtils';
const logger = LoggerManager.getLogger("DocumentManager");
logger.setLevel("info");
logger.setLevel("info");

/**
 * Interface representing document information including statement locations
 */
interface DocumentInfo {
    statementLocations: ClarionLocation[];
}

/**
 * Interface representing cached document links with metadata
 */
interface CachedDocumentLinks {
    /** The cached document links */
    links: DocumentLink[];
    /** Timestamp when the links were generated */
    timestamp: number;
    /** Document version number when the links were generated */
    version: number;
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
 * LAZY LOADING IMPLEMENTATION:
 * ----------------------------
 * The DocumentManager implements a lazy loading approach for method implementations to improve performance
 * with large files. Instead of eagerly resolving all method implementations during document parsing:
 *
 * 1. During document parsing, only method metadata is stored (class name, method name, module file)
 *    without searching for the actual implementation location.
 *
 * 2. When a user hovers over a method declaration, the implementation is resolved on-demand by:
 *    - Looking up the stored metadata
 *    - Searching for the implementation in the module file
 *    - Caching the result to avoid repeated lookups
 *
 * This approach significantly reduces the initial parsing time for large files with many method
 * declarations, as the expensive file I/O and regex searches are deferred until actually needed.
 *
 * OVERLOADED METHOD MATCHING:
 * ---------------------------
 * The DocumentManager now supports matching overloaded methods based on parameter signatures:
 *
 * 1. Parameter Signature Parsing:
 *    - For method declarations: During document parsing, parameter signatures are extracted and stored
 *      in the ClarionLocation object as an array of parameter types.
 *    - For method implementations: When resolving implementations, parameter signatures are extracted
 *      from potential matches in the module file.
 *
 * 2. Matching Algorithm:
 *    - When resolving a method implementation, all potential implementations with the same class and
 *      method name are found in the module file.
 *    - Each implementation's parameter signature is compared with the declaration's parameter signature.
 *    - The implementation with the matching parameter signature is returned.
 *    - If no exact match is found, the first implementation is returned as a fallback.
 *
 * 3. Parameter Comparison:
 *    - Parameters are compared based on their types (ignoring parameter names).
 *    - The number of parameters must match.
 *    - Parameter types are normalized to lowercase for case-insensitive comparison.
 *
 * This approach ensures that "Go to Definition" and "Go to Implementation" navigate to the correct
 * overloaded method implementation based on the parameter signature.
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
    // INCLUDE pattern: first param is filename (required extension), second param is section name (no extension required) or ONCE
    private readonly includePattern = /INCLUDE\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*(?:,\s*'([^']+?)'\s*)?(?:,\s*ONCE)?\)/ig;
    private readonly memberPattern = /\bMEMBER\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'\s*\).*?/ig;
    private readonly linkPattern = /LINK\s*\(\s*'([^']+\.[a-zA-Z0-9]+)'(?:\s*,\s*[^)]+)?\s*\)/ig;
    // Pattern to detect class method declarations
    private readonly methodPattern = /\b([A-Za-z0-9_]+)\s+PROCEDURE\s*\([^)]*\)/ig;


    /** Cache expiration time in milliseconds (5 minutes) */
    private static readonly CACHE_EXPIRATION_MS: number = 5 * 60 * 1000;
    
    /** Map to store document info by URI */
    private openDocuments: Map<string, DocumentInfo> = new Map();
    /** Map to store cached document links by URI */
    private documentLinksCache: Map<string, CachedDocumentLinks> = new Map();
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

        logger.info("✅ DocumentManager event listeners registered.");
        
        // Defer INCLUDE/MODULE scanning to avoid blocking activation
        setTimeout(() => {
            this.processOpenDocumentsInBackground();
        }, 0);
    }
    
    /**
     * Process open documents in the background without blocking activation
     */
    private async processOpenDocumentsInBackground() {
        logger.info("🔄 Starting background processing of open documents");
        const startTime = performance.now();
        
        // Create a counter to track progress
        let processedCount = 0;
        const totalDocuments = workspace.textDocuments.length;
        
        // Process documents in batches to avoid UI freezing
        for (const document of workspace.textDocuments) {
            const ext = path.extname(document.uri.fsPath).toLowerCase();
            if (ext === '.xml' || ext === '.cwproj') {
                logger.info(`⚠ Skipping open XML-like file during startup: ${document.uri.fsPath}`);
                continue;
            }

            try {
                await this.updateDocumentInfo(document);
                processedCount++;
                
                // Log progress every 5 documents
                if (processedCount % 5 === 0 || processedCount === totalDocuments) {
                    logger.info(`📊 Processed ${processedCount}/${totalDocuments} documents in background`);
                }
            } catch (error) {
                logger.error(`❌ Error processing document in background: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        
        // Log completion instead of showing a notification to avoid import issues
        logger.info(`✅ Background document processing completed: ${processedCount} files in ${duration}ms`);
    }

    private async onDidSaveTextDocument(document: TextDocument) {
        logger.info(`Document saved: ${document.uri.fsPath}`);
        await this.updateDocumentInfo(document);
    }

    /**
     * Handles file deletion events
     *
     * This method is called when files are deleted. It invalidates the cache entries
     * for the deleted files and removes them from the openDocuments map.
     *
     * @param event - The file delete event
     */
    private async onDidDeleteFiles(event: FileDeleteEvent) {
        for (const fileDelete of event.files) {
            const deletedUri = fileDelete;
            const normalizedUri = deletedUri.toString().toLowerCase();
            
            // Remove from openDocuments map
            if (this.openDocuments.has(normalizedUri)) {
                logger.info(`🗑️ Removing document info for deleted file: ${deletedUri.fsPath}`);
                this.openDocuments.delete(normalizedUri);
            }
            
            // Invalidate cache for the deleted file
            if (this.documentLinksCache.has(normalizedUri)) {
                logger.info(`🗑️ Invalidating cache for deleted file: ${deletedUri.fsPath}`);
                this.documentLinksCache.delete(normalizedUri);
            }
            
            // Also invalidate cache for any documents that might reference this file
            // This is a more aggressive approach to ensure consistency
            this.invalidateAllCacheEntries();
        }
    }

    /**
     * Handles file rename events
     *
     * This method is called when files are renamed. It invalidates the cache entries
     * for the renamed files and updates the openDocuments map.
     *
     * @param event - The file rename event
     */
    private async onDidRenameFiles(event: FileRenameEvent) {
        for (const fileRename of event.files) {
            const oldUri = fileRename.oldUri;
            const newUri = fileRename.newUri;
            const normalizedOldUri = oldUri.toString().toLowerCase();
            const normalizedNewUri = newUri.toString().toLowerCase();
            
            // Update openDocuments map
            const documentInfo = this.openDocuments.get(normalizedOldUri);
            if (documentInfo) {
                logger.info(`📝 Updating document info for renamed file: ${oldUri.fsPath} -> ${newUri.fsPath}`);
                this.openDocuments.delete(normalizedOldUri);
                this.openDocuments.set(normalizedNewUri, documentInfo);
            }
            
            // Invalidate cache for the renamed file
            if (this.documentLinksCache.has(normalizedOldUri)) {
                logger.info(`🗑️ Invalidating cache for renamed file: ${oldUri.fsPath}`);
                this.documentLinksCache.delete(normalizedOldUri);
            }
            
            // Also invalidate cache for any documents that might reference this file
            // This is a more aggressive approach to ensure consistency
            this.invalidateAllCacheEntries();
        }
    }
    
    /**
     * Invalidates all cache entries
     *
     * This method is called when a file is renamed or deleted, as these operations
     * might affect multiple documents that reference the renamed or deleted file.
     */
    private invalidateAllCacheEntries() {
        const cacheSize = this.documentLinksCache.size;
        if (cacheSize > 0) {
            logger.info(`🗑️ Invalidating all ${cacheSize} cache entries due to file system changes`);
            this.documentLinksCache.clear();
        }
    }

    private async onDidOpenTextDocument(document: TextDocument) {
        logger.info(`📄 [EVENT] Document opened: ${document.uri.fsPath}`);
        await this.updateDocumentInfo(document);
    }

    /**
     * Handles document change events
     *
     * This method is called when a document is changed. It invalidates the cache entry
     * for the changed document and updates the document info.
     *
     * @param event - The document change event
     */
    private async onDidChangeTextDocument(event: TextDocumentChangeEvent) {
        const doc = event.document;
        const normalizedUri = doc.uri.toString().toLowerCase();
        
        // Invalidate cache for the changed document
        if (this.documentLinksCache.has(normalizedUri)) {
            logger.info(`🗑️ Invalidating cache for changed document: ${doc.uri.fsPath}`);
            this.documentLinksCache.delete(normalizedUri);
        }
        
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

            if ((location.statementType?.toUpperCase() === "SECTION" || location.statementType?.toUpperCase() === "METHOD") &&
                location.sectionLineLocation) {
                const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
                targetUri = targetUri.with({ fragment: lineQueryParam });
                logger.info(`Created link to ${location.fullFileName}#${lineQueryParam} for ${location.statementType}`);
            } else {
                logger.info(`Created link to ${location.fullFileName} for ${location.statementType}`);
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

    /**
     * Gets the current version of a document
     *
     * @param uri - The URI of the document
     * @returns The document version or undefined if the document is not found
     */
    private getDocumentVersion(uri: Uri): number | undefined {
        const document = workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        return document?.version;
    }

    /**
     * Generates document links for a provided URI based on the locations
     * and types of statements found in the document.
     *
     * This method first checks if there's a valid cache entry for the document.
     * If there is and the document version hasn't changed, it returns the cached links.
     * Otherwise, it generates new links and caches them.
     *
     * @param uri - The URI of the document to generate links for.
     * @returns An array of DocumentLink objects representing the navigable code links within the document.
     */
    generateDocumentLinks(uri: Uri): DocumentLink[] {
        const normalizedUri = uri.toString().toLowerCase();
        const currentVersion = this.getDocumentVersion(uri);
        
        // Check if we have a valid cache entry
        const cachedEntry = this.documentLinksCache.get(normalizedUri);
        
        if (cachedEntry && currentVersion !== undefined) {
            const isVersionMatch = cachedEntry.version === currentVersion;
            const isNotExpired = (Date.now() - cachedEntry.timestamp) < DocumentManager.CACHE_EXPIRATION_MS;
            
            if (isVersionMatch && isNotExpired) {
                logger.info(`🔍 Cache HIT for ${uri.fsPath} (version: ${currentVersion})`);
                return cachedEntry.links;
            } else if (!isVersionMatch) {
                logger.info(`🔄 Cache MISS for ${uri.fsPath} - version changed (cached: ${cachedEntry.version}, current: ${currentVersion})`);
            } else {
                logger.info(`⏰ Cache MISS for ${uri.fsPath} - cache expired (age: ${(Date.now() - cachedEntry.timestamp) / 1000}s)`);
            }
        } else {
            logger.info(`🔄 Cache MISS for ${uri.fsPath} - no cache entry`);
        }
        
        // Generate links if no valid cache entry
        const documentInfo = this.getDocumentInfo(uri);

        if (!documentInfo) {
            logger.error(`❌ No document info available for ${uri.fsPath}`);
            return [];
        }

        const links: DocumentLink[] = [];
        // Note: METHOD is intentionally excluded - methods are handled by hover/definition providers, not as clickable links
        const supportedTypes = ["INCLUDE", "MODULE", "MEMBER", "SECTION", "LINK"];
        
        logger.info(`Generating links for ${uri.fsPath} with ${documentInfo.statementLocations.length} locations`);
        
        // 🔹 Process existing document statements from `documentInfo`
        for (const location of documentInfo.statementLocations) {
            logger.info(`Processing location: type=${location.statementType}, file=${location.fullFileName}, pos=${location.linePosition?.line}:${location.linePosition?.character}`);

            // Case-insensitive check for statement type
            if (!supportedTypes.some(type => type.toUpperCase() === (location.statementType ?? "").toUpperCase())) {
                logger.info(`Skipping unsupported type: ${location.statementType}`);
                continue;
            }
            
            if (!location.fullFileName) {
                logger.info(`Skipping location with no file name`);
                continue;
            }
            
            if (!location.linePosition || !location.linePositionEnd) {
                logger.info(`Skipping location with invalid position`);
                continue;
            }

            let targetUri = Uri.file(location.fullFileName);

            // For INCLUDE with section, SECTION, or METHOD types, add line fragment for cursor positioning
            if (location.sectionLineLocation &&
                (location.statementType?.toUpperCase() === "SECTION" || 
                 location.statementType?.toUpperCase() === "METHOD" ||
                 location.statementType?.toUpperCase() === "INCLUDE")) {
                const lineQueryParam = `${location.sectionLineLocation.line + 1}:1`;
                targetUri = targetUri.with({ fragment: lineQueryParam });
                logger.info(`Created link with fragment for ${location.statementType}: ${targetUri.toString()}`);
            }

            const link = new DocumentLink(
                new Range(location.linePosition, location.linePositionEnd),
                targetUri
            );
            links.push(link);
            logger.info(`Added link for ${location.statementType} at line ${location.linePosition.line} to ${targetUri.toString()}`);
        }

        logger.info(`Generated ${links.length} links for ${uri.fsPath}`);
        
        // Cache the generated links if we have a document version
        if (currentVersion !== undefined) {
            this.documentLinksCache.set(normalizedUri, {
                links,
                timestamp: Date.now(),
                version: currentVersion
            });
            logger.info(`💾 Cached ${links.length} links for ${uri.fsPath} (version: ${currentVersion})`);
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
    /**
     * Resolves a method implementation lazily when needed.
     *
     * This function is called when a user hovers over a method declaration.
     * It searches for the implementation in the module file and updates the location
     * with the implementation details.
     *
     * Enhanced to match overloaded methods based on parameter signatures.
     *
     * @param location - The method location with metadata
     * @returns The updated location with implementation details, or the original location if implementation not found
     */
    async resolveMethodImplementation(location: ClarionLocation): Promise<ClarionLocation> {
        // If implementation is already resolved or this is not a method/MAP procedure, return as is
        if (location.implementationResolved || (location.statementType !== "METHOD" && location.statementType !== "MAPPROCEDURE")) {
            return location;
        }

        logger.info(`Lazily resolving implementation for ${location.className}.${location.methodName}`);
        
        if (location.parameterSignature) {
            logger.info(`Method has parameter signature: [${location.parameterSignature.join(', ')}]`);
        } else {
            logger.info(`Method has no parameter signature`);
        }

        // Ensure we have the necessary metadata
        if (!location.methodName) {
            logger.error(`Missing metadata for method implementation resolution: method=${location.methodName}`);
            location.implementationResolved = true; // Mark as resolved to avoid repeated attempts
            return location;
        }
        
        // If no MODULE file, implementation must be in the same file
        if (!location.moduleFile) {
            logger.info(`No MODULE file specified for ${location.className}.${location.methodName}, searching in same file`);
            
            try {
                // Try to find implementation in the current document
                const currentDocument = workspace.textDocuments.find(doc =>
                    doc.uri.toString() === Uri.file(location.fullFileName).toString()
                );
                
                if (currentDocument) {
                    const currentContent = currentDocument.getText();
                    const implLine = this.findMethodImplementationLine(
                        currentContent,
                        location.className || "", // Empty string for MAP procedures
                        location.methodName,
                        location.parameterSignature
                    );
                    
                    if (implLine !== null) {
                        logger.info(`✅ Found method implementation for ${location.className}.${location.methodName} in same file at line ${implLine}`);
                        location.sectionLineLocation = new Position(implLine, 0);
                    } else {
                        logger.info(`❌ Could not find implementation for ${location.className}.${location.methodName} in same file`);
                    }
                } else {
                    logger.info(`❌ Could not find open document for ${location.fullFileName}`);
                }
                
                location.implementationResolved = true;
                return location;
            } catch (error) {
                logger.error(`Error resolving implementation in same file: ${error instanceof Error ? error.message : String(error)}`);
                location.implementationResolved = true;
                return location;
            }
        }

        try {
            // Cache for file path resolution
            const filePathCache: Map<string, string | null> = new Map();
            
            // Resolve the module file path
            const moduleFilePath = await this.locationProvider.getFullPath(location.moduleFile, location.fullFileName, filePathCache);
            
            if (!moduleFilePath || !fs.existsSync(moduleFilePath)) {
                logger.info(`❌ Could not resolve MODULE path: ${location.moduleFile} for class ${location.className}`);
                location.implementationResolved = true; // Mark as resolved to avoid repeated attempts
                return location;
            }

            // Try to read from open editor first (to include unsaved changes), fallback to disk
            let moduleContent: string;
            try {
                const moduleUri = Uri.file(moduleFilePath);
                const openDoc = workspace.textDocuments.find(doc => 
                    doc.uri.toString().toLowerCase() === moduleUri.toString().toLowerCase()
                );
                
                if (openDoc) {
                    logger.info(`Reading MODULE content from open editor: ${moduleFilePath}`);
                    moduleContent = openDoc.getText();
                } else {
                    logger.info(`Reading MODULE content from disk: ${moduleFilePath}`);
                    moduleContent = fs.readFileSync(moduleFilePath, 'utf8');
                }
            } catch (error) {
                logger.error(`Error reading MODULE file: ${error instanceof Error ? error.message : String(error)}`);
                location.implementationResolved = true;
                return location;
            }
            
            // Search for the implementation with parameter matching
            const implLineNumber = this.findMethodImplementationLine(
                moduleContent,
                location.className || "", // Empty string for MAP procedures
                location.methodName,
                location.parameterSignature
            );
            
            if (implLineNumber !== null) {
                logger.info(`✅ Found method implementation for ${location.className}.${location.methodName} at line ${implLineNumber} in ${moduleFilePath}`);
                
                // Update the location with implementation details
                location.fullFileName = moduleFilePath;
                location.sectionLineLocation = new Position(implLineNumber, 0);
            } else {
                // Try to find implementation in the current document (fallback)
                const currentDocument = workspace.textDocuments.find(doc =>
                    doc.uri.toString() === Uri.file(location.fullFileName).toString()
                );
                
                if (currentDocument) {
                    const currentContent = currentDocument.getText();
                    const currentImplLine = this.findMethodImplementationLine(
                        currentContent,
                        location.className || "", // Empty string for MAP procedures
                        location.methodName,
                        location.parameterSignature
                    );
                    
                    if (currentImplLine !== null) {
                        logger.info(`✅ Found method implementation for ${location.className}.${location.methodName} in current document at line ${currentImplLine}`);
                        location.sectionLineLocation = new Position(currentImplLine, 0);
                    } else {
                        logger.info(`❌ Could not find implementation for ${location.className}.${location.methodName} in MODULE ${location.moduleFile} or current document`);
                    }
                }
            }
            
            // Mark as resolved regardless of whether we found the implementation
            location.implementationResolved = true;
            
        } catch (error) {
            logger.error(`Error resolving method implementation: ${error instanceof Error ? error.message : String(error)}`);
            location.implementationResolved = true; // Mark as resolved to avoid repeated attempts
        }
        
        return location;
    }
    
    /**
     * Helper function to extract and parse parameter signature from a method implementation line
     *
     * @param line - The full method implementation line (e.g., "MyClass.Method PROCEDURE(STRING s, LONG n)")
     * @returns An array of parameter types (normalized for comparison)
     */
    private parseMethodParameterSignature(line: string): string[] {
        // Extract parameters from PROCEDURE(...) or FUNCTION(...)
        const match = line.match(/(?:PROCEDURE|FUNCTION)\s*\(([^)]*)\)/i);
        if (!match) {
            return [];
        }
        
        const paramString = match[1];
        return this.parseImplementationParameters(paramString);
    }

    /**
     * Helper function to parse parameter signatures from Clarion method implementations
     *
     * @param paramString - The parameter string from a method implementation
     * @returns An array of parameter types (normalized for comparison)
     */
    private parseImplementationParameters(paramString?: string): string[] {
        if (!paramString || paramString.trim() === '') {
            return [];
        }
        
        logger.info(`parseImplementationParameters input: "${paramString}"`);
        
        // Split by commas, trim each parameter, and extract type information
        const result = paramString.split(',')
            .map(param => {
                const trimmed = param.trim();
                logger.info(`  Processing parameter: "${trimmed}"`);
                
                // Handle omittable parameters: <TYPE name> -> extract <TYPE>
                if (trimmed.startsWith('<')) {
                    const match = trimmed.match(/^<([^>]+)>/);
                    if (match) {
                        logger.info(`    Matched omittable: match[1]="${match[1]}"`);
                        // Extract just the type from <TYPE name>
                        const innerContent = match[1].trim();
                        const typePart = innerContent.split(/\s+/)[0];
                        const result = `<${typePart.toLowerCase()}>`;
                        logger.info(`    Returning: "${result}"`);
                        return result;
                    }
                }
                
                // Handle regular parameters: TYPE name, *TYPE name, &TYPE name
                const paramParts = trimmed.split(/\s+/);
                const result = paramParts[0].toLowerCase();
                logger.info(`    Returning: "${result}"`);
                // Return just the type in lowercase for comparison
                return result;
            });
        
        logger.info(`parseImplementationParameters result: [${result.join(', ')}]`);
        return result;
    }

    /**
     * Helper function to compare two parameter signatures
     *
     * @param declaredParams - Parameter signature from method declaration
     * @param implParams - Parameter signature from method implementation
     * @returns True if the signatures match, false otherwise
     */
    private parametersMatch(declaredParams: string[] | undefined, implParams: string[]): boolean {
        // If declaration has no parameters defined, treat as empty array
        const declParams = declaredParams || [];
        
        // If parameter counts don't match, they can't be the same method
        if (declParams.length !== implParams.length) {
            return false;
        }
        
        // Special case: both empty parameter lists
        if (declParams.length === 0 && implParams.length === 0) {
            return true;
        }
        
        // Compare each parameter type
        for (let i = 0; i < declParams.length; i++) {
            // Simple string comparison of normalized parameter types
            if (declParams[i] !== implParams[i]) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Helper function to find a method implementation line in a file content.
     * Enhanced to match overloaded methods based on parameter signatures.
     *
     * @param content - The file content to search in
     * @param className - The class name
     * @param methodName - The method name
     * @param parameterSignature - The parameter signature to match (optional)
     * @returns The line number of the implementation or null if not found
     */
    private findMethodImplementationLine(
        content: string,
        className: string,
        methodName: string,
        parameterSignature?: string[]
    ): number | null {
        const lowerContent = content.toLowerCase();
        const cls = className.toLowerCase();
        const mth = methodName.toLowerCase();
        
        // Find all potential implementations of this method
        const implementations: Array<{line: number, params: string[]}> = [];
        
        // Determine if this is a MAP procedure (no class) or CLASS method
        const isMapProcedure = !cls || cls === '';
        
        let implRegex: RegExp;
        if (isMapProcedure) {
            // For MAP procedures: just "ProcedureName PROCEDURE(...)"
            // Use [\s\S] to match across lines for parameters
            implRegex = new RegExp(
                String.raw`(^|\r?\n)[ \t]*` + mth +
                String.raw`\s+(?:procedure|function)\s*\(([^)]*(?:\)|\r?\n[\s\S]*?\)))\s*(?:,|!|$|\r?\n)`,
                'gi'
            );
            logger.info(`Searching for MAP procedure implementation: ${mth} as PROCEDURE or FUNCTION`);
        } else {
            // For CLASS methods: "ClassName.MethodName PROCEDURE(...)"
            // Use [\s\S] to match across lines for parameters
            implRegex = new RegExp(
                String.raw`(^|\r?\n)[ \t]*` + cls + String.raw`(?:\.|::)` + mth +
                String.raw`\s+(?:procedure|function)\s*\(([^)]*(?:\)|\r?\n[\s\S]*?\)))\s*(?:,|!|$|\r?\n)`,
                'gi'
            );
            logger.info(`Searching for CLASS method implementation: ${cls}.${mth} as PROCEDURE or FUNCTION`);
        }
        
        let match;
        while ((match = implRegex.exec(lowerContent)) !== null) {
            const implPos = match.index + (match[1] ? match[1].length : 0);
            const lineNumber = content.substring(0, implPos).split('\n').length - 1;
            const paramString = match[2];
            const params = this.parseImplementationParameters(paramString);
            
            // For MAP procedures, skip if this line is inside a MAP block (declaration, not implementation)
            if (isMapProcedure && isInsideMapBlock(lowerContent, match.index)) {
                logger.info(`Skipping line ${lineNumber} - inside MAP block (declaration, not implementation)`);
                continue;
            }
            
            logger.info(`Found potential implementation at line ${lineNumber} with parameters: [${params.join(', ')}]`);
            
            implementations.push({
                line: lineNumber,
                params: params
            });
        }
        
        // If no implementations found, try the old regex without parameter capture as fallback
        if (implementations.length === 0) {
            logger.info(`No implementations found with parameter capture, trying fallback regex`);
            
            let fallbackRegex: RegExp;
            if (isMapProcedure) {
                fallbackRegex = new RegExp(
                    String.raw`(^|\r?\n)[ \t]*` + mth +
                    String.raw`\s+(?:procedure|function)\s*(?:\([^)]*\))?`,
                    'i'
                );
            } else {
                fallbackRegex = new RegExp(
                    String.raw`(^|\r?\n)[ \t]*` + cls + String.raw`(?:\.|::)` + mth +
                    String.raw`\s+(?:procedure|function)\s*(?:\([^)]*\))?`,
                    'i'
                );
            }
            
            const m = fallbackRegex.exec(lowerContent);
            if (m) {
                const implPos = m.index + (m[1] ? m[1].length : 0);
                const implLineNumber = content.substring(0, implPos).split('\n').length - 1;
                logger.info(`Found implementation using fallback regex at line ${implLineNumber}`);
                return implLineNumber;
            }
            
            return null;
        }
        
        // If we have parameter signature, try to find an exact match
        if (parameterSignature && parameterSignature.length > 0) {
            logger.info(`Looking for implementation matching parameter signature: [${parameterSignature.join(', ')}]`);
            
            for (const impl of implementations) {
                if (this.parametersMatch(parameterSignature, impl.params)) {
                    logger.info(`Found exact parameter match at line ${impl.line}`);
                    return impl.line;
                }
            }
            
            logger.info(`No exact parameter match found for signature [${parameterSignature.join(', ')}]`);
            // Don't fall back to first implementation when we have a signature - that would be wrong for overloads
            return null;
        }
        
        // If no parameter signature provided, return the first implementation as fallback
        logger.info(`No parameter signature provided, returning first implementation at line ${implementations[0].line}`);
        return implementations[0].line;
    }

    /**
     * Finds a link at the specified position in the document.
     * For method declarations, it lazily resolves the implementation when needed.
     *
     * @param documentUri - The URI of the document to search
     * @param position - The position within the document
     * @returns The location of the link if found, otherwise undefined
     */
    findLinkAtPosition(documentUri: Uri, position: Position): ClarionLocation | undefined {
        const documentInfo = this.getDocumentInfo(documentUri);
        logger.info(`Finding link at position ${position.line}:${position.character} in ${documentUri.fsPath}`);

        if (!documentInfo) {
            logger.info(`No document info available for ${documentUri.fsPath}`);
            return undefined;
        }
        
        // First, check stored statement locations (declarations from MAP blocks, CLASS definitions, etc.)
        if (documentInfo) {
            for (const location of documentInfo.statementLocations) {
                if (!location.linePosition || !location.linePositionEnd) {
                    continue;
                }
                
                const linkRange = new Range(
                    location.linePosition,
                    location.linePositionEnd
                );

                if (linkRange.contains(position)) {
                    logger.info(`Found link at position: ${location.statementType} to ${location.fullFileName}`);
                    
                    // For method declarations, we don't need to resolve the implementation here
                    // The hover provider will call resolveMethodImplementation when needed
                    return location;
                }
            }
        }
        
        // If not in stored locations, check if this is a method implementation line
        const doc = workspace.textDocuments.find(d => d.uri.toString() === documentUri.toString());
        if (doc) {
            const line = doc.lineAt(position.line).text;
            
            // Check for CLASS method implementation: "ClassName.MethodName PROCEDURE(...)"
            const methodImplMatch = line.match(/^(\w+)\.(\w+)\s+PROCEDURE\s*\(/i);
            if (methodImplMatch) {
                const className = methodImplMatch[1];
                const methodName = methodImplMatch[2];
                const classStart = line.indexOf(className);
                const classEnd = classStart + className.length;
                const methodStart = line.indexOf(methodName, classEnd);
                const methodEnd = methodStart + methodName.length;
                
                // Check if cursor is on the class or method name
                if ((position.character >= classStart && position.character <= classEnd) ||
                    (position.character >= methodStart && position.character <= methodEnd)) {
                    
                    logger.info(`Detected method implementation line: ${className}.${methodName}`);
                    
                    // Parse parameter signature from implementation
                    const paramSignature = this.parseMethodParameterSignature(line);
                    
                    // Create a synthetic location pointing to the declaration in the INC file
                    // The hover provider will resolve the actual declaration location
                    const location: ClarionLocation = {
                        fullFileName: documentUri.fsPath,
                        linePosition: new Position(position.line, classStart),
                        linePositionEnd: new Position(position.line, methodEnd),
                        statementType: "METHOD",
                        className: className,
                        methodName: methodName,
                        parameterSignature: paramSignature,
                        implementationResolved: false
                    };
                    
                    return location;
                }
            }
            
            // Check for MAP procedure implementation: "ProcedureName PROCEDURE(...)"
            const mapProcMatch = line.match(/^(\w+)\s+PROCEDURE\s*\(/i);
            if (mapProcMatch) {
                const procName = mapProcMatch[1];
                const procStart = mapProcMatch.index!;
                const procEnd = procStart + procName.length;
                
                // Check if cursor is on the procedure name
                if (position.character >= procStart && position.character <= procEnd) {
                    logger.info(`Detected MAP procedure implementation line: ${procName}`);
                    
                    // Parse parameter signature from implementation
                    const paramSignature = this.parseMethodParameterSignature(line);
                    
                    const location: ClarionLocation = {
                        fullFileName: documentUri.fsPath,
                        linePosition: new Position(position.line, procStart),
                        linePositionEnd: new Position(position.line, procEnd),
                        statementType: "MAPPROCEDURE",
                        methodName: procName,
                        parameterSignature: paramSignature,
                        implementationResolved: false
                    };
                    
                    return location;
                }
            }
        }

        logger.info(`No link found at position ${position.line}:${position.character}`);
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
        const parseStartTime = performance.now();
        logger.info(`📄 Processing document: ${document.uri.fsPath}`);

        // 🔹 Get latest lookup extensions
        const lookupExtensions = globalSettings.defaultLookupExtensions;

        if (document.uri.scheme !== 'file' || document.uri.fsPath.endsWith('.code-workspace')) {
            logger.info(`⚠ Skipping document: ${document.uri.fsPath}`);
            return;
        }

        // Early exit for XML-related files to avoid triggering Red Hat XML extension
        const ext = path.extname(document.uri.fsPath).toLowerCase();
        if (ext === '.xml' || ext === '.cwproj') {
            logger.info(`⚠ Skipping XML-related file to avoid extension conflict: ${document.uri.fsPath}`);
            return;
        }

        // Check if this is a Clarion file based on the extension
        const fileExt = path.extname(document.uri.fsPath).toLowerCase();

        // Only process files with extensions in the lookupExtensions array from workspace settings
        const isClarionFile = lookupExtensions.some(ext => ext.toLowerCase() === fileExt);

        if (!isClarionFile) {
            logger.info(`⚠ Skipping non-Clarion file: ${document.uri.fsPath} (extension not in lookupExtensions)`);
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

            // Process method declarations in class files
            const methodLocations = await this.processMethodDeclarations(document);
            
            logger.info(`Found ${methodLocations.length} method locations for ${document.uri.fsPath}`);
            if (methodLocations.length > 0) {
                for (const loc of methodLocations) {
                    logger.info(`Method location: ${loc.statementType} at line ${loc.linePosition?.line} to ${loc.fullFileName}`);
                }
            }
            
            const statementLocations: ClarionLocation[] = [
                ...includeLocations,
                ...moduleLocations,
                ...memberLocations,
                ...linkLocations,
                ...methodLocations
            ];

            logger.info(`📊 Found ${includeLocations.length} INCLUDE, ${moduleLocations.length} MODULE, ${memberLocations.length} MEMBER, ${linkLocations.length} LINK, and ${methodLocations.length} METHOD statements`);

            // Always store document info even if there are no statement locations
            // This prevents repeated processing of the same document
            this.openDocuments.set(document.uri.toString().toLowerCase(), { statementLocations });

            const parseEndTime = performance.now();
            const parseDuration = parseEndTime - parseStartTime;
            const lineCount = document.lineCount;
            const fileExtension = path.extname(document.uri.fsPath).toLowerCase();
            
            // Track document parse performance
            const { trackPerformance } = await import('./telemetry');
            trackPerformance('DocumentParse', parseDuration, { 
                lineCount: lineCount.toString(), 
                fileExtension,
                statementCount: statementLocations.length.toString()
            });

            if (statementLocations.length > 0) {
                logger.info(`✅ Stored document info for ${document.uri.fsPath} with ${statementLocations.length} statement locations in ${parseDuration.toFixed(2)}ms (${lineCount} lines)`);

                // Log a sample of the statement locations for debugging
                if (statementLocations.length > 0) {
                    const sample = statementLocations[0];
                    logger.info(`🔍 Sample statement: Type=${sample.statementType}, File=${sample.fullFileName}, Position=${sample.linePosition?.line}:${sample.linePosition?.character}`);
                }
            } else {
                logger.info(`ℹ️ Stored empty document info for ${document.uri.fsPath} in ${parseDuration.toFixed(2)}ms (${lineCount} lines)`);
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

    /**
     * Processes a document to find class method declarations and their implementations in module files.
     *
     * This method scans the document for class declarations with Module links, extracts method declarations,
     * and attempts to find their implementations in the linked module files.
     *
     * @param document - The text document to be analyzed.
     * @returns An array of ClarionLocation objects representing the method declarations and their implementations.
     */
    /**
     * Processes a document to find class method declarations and stores their metadata.
     *
     * This method scans the document for class declarations with Module links and extracts method declarations,
     * but DOES NOT search for implementations. Instead, it stores metadata that will be used later
     * for lazy resolution when the user hovers over a method.
     *
     * @param document - The text document to be analyzed.
     * @returns An array of ClarionLocation objects representing the method declarations with metadata.
     */
    /**
     * Helper function to parse parameter signatures from Clarion method declarations
     *
     * @param paramString - The parameter string from a method declaration
     * @returns An array of parameter types (normalized for comparison)
     */
    private parseDeclarationParameters(paramString?: string): string[] {
        if (!paramString || paramString.trim() === '') {
            return [];
        }
        
        // Split by commas, trim each parameter, and extract type information
        return paramString.split(',')
            .map(param => {
                const trimmed = param.trim();
                
                // Handle omittable parameters: <TYPE name> -> extract <TYPE>
                if (trimmed.startsWith('<')) {
                    const match = trimmed.match(/^<([^>]+)>/);
                    if (match) {
                        // Extract just the type from <TYPE name>
                        const innerContent = match[1].trim();
                        const typePart = innerContent.split(/\s+/)[0];
                        return `<${typePart.toLowerCase()}>`;
                    }
                }
                
                // Handle regular parameters: TYPE name, *TYPE name, &TYPE name
                const paramParts = trimmed.split(/\s+/);
                // Return just the type in lowercase for comparison
                return paramParts[0].toLowerCase();
            });
    }

    private async processMethodDeclarations(document: TextDocument): Promise<ClarionLocation[]> {
        if (!this.locationProvider) {
            logger.error(`❌ Error: locationProvider is not initialized when processing method declarations.`);
            return [];
        }

        const methodLocations: ClarionLocation[] = [];
        logger.info(`Processing method declarations in: ${document.uri.fsPath}`);
        logger.info(`File extension: ${path.extname(document.uri.fsPath).toLowerCase()}`);

        // Cache for file path resolution only (we don't read module files at this stage)
        const filePathCache: Map<string, string | null> = new Map();

        try {
            const originalText = document.getText();
            const lowerText = originalText.toLowerCase();

            // Match CLASS definitions: ClassName CLASS,TYPE or ClassName CLASS
            const classRegex = /^\s*([a-z_][a-z0-9_]*)\s+CLASS\b/gim;
            const moduleRegex = /module\s*\(\s*'([^']+)'\s*(?:[^)]*)\)/gis;
            const linkRegex = /link\s*\(\s*'([^']+)'(?:[^)]*)*\)/gis;
            logger.info(`Searching for class definitions with improved regex pattern`);

            let classMatch: RegExpExecArray | null;
            while ((classMatch = classRegex.exec(lowerText)) !== null) {
                // Find where the class name actually starts in the match (skip leading whitespace)
                const leadingWhitespaceMatch = classMatch[0].match(/^\s*/);
                const leadingWhitespaceLen = leadingWhitespaceMatch ? leadingWhitespaceMatch[0].length : 0;
                const classStartPos = classMatch.index + leadingWhitespaceLen;
                const classNameEndPos = classStartPos + classMatch[1].length;
                const originalClassName = originalText.substring(classStartPos, classNameEndPos);
                const classTail = lowerText.slice(classMatch.index);
                const endInTail = /^\s*end\b/mi.exec(classTail);
                if (!endInTail) {
                    logger.info(`No END found for class ${originalClassName} starting at ${classMatch.index}, skipping.`);
                    continue;
                }
                const classEndPos = classMatch.index + endInTail.index;
                logger.info(`Class ${originalClassName} ends at position ${classEndPos}`);
                const fullClassText = lowerText.substring(classMatch.index, classEndPos);
                
                // Check if CLASS has MODULE declaration
                let moduleFile: string | null = null;
                let linkFile: string | null = null;
                let moduleFilePath: string | null = null;
                
                if (fullClassText.includes('module')) {
                    moduleRegex.lastIndex = 0;
                    const moduleMatch = moduleRegex.exec(fullClassText);
                    if (moduleMatch) {
                        moduleFile = moduleMatch[1];
                        linkRegex.lastIndex = 0;
                        const linkMatch = linkRegex.exec(fullClassText);
                        linkFile = linkMatch ? linkMatch[1] : null;
                        logger.info(`Found class ${originalClassName} with MODULE ${moduleFile}${linkFile ? ` and LINK ${linkFile}` : ''}`);
                        
                        // Resolve the module file path (but don't read its content yet)
                        moduleFilePath = await this.locationProvider.getFullPath(moduleFile, document.uri.fsPath, filePathCache);
                        if (!moduleFilePath) {
                            logger.info(`❌ Could not resolve MODULE path: ${moduleFile} for class ${originalClassName}`);
                            // Continue anyway to record the method declarations
                        }
                    } else {
                        logger.info(`MODULE keyword found but no pattern matched for class ${originalClassName}`);
                    }
                } else {
                    logger.info(`No MODULE keyword found for class ${originalClassName}, assuming implementation in same file`);
                    // For classes without MODULE, use the current document as the implementation file
                    moduleFilePath = document.uri.fsPath;
                }
                
                const lowerClassContent = fullClassText;
                const originalClassContent = originalText.substring(classMatch.index, classEndPos);
                const methodDeclRegex = /([a-z0-9_:]+(?:\.[a-z0-9_:]+)*)\s+(?:procedure|function)\s*(?:\(([^)]*)\))?/gi;
                logger.info(`Searching for method declarations (PROCEDURE or FUNCTION) in class ${originalClassName}`);
                
                let methodMatch: RegExpExecArray | null;
                while ((methodMatch = methodDeclRegex.exec(lowerClassContent)) !== null) {
                    const methodStartPos = methodMatch.index;
                    const methodNameEndPos = methodStartPos + methodMatch[1].length;
                    const originalMethodName = originalClassContent.substring(methodStartPos, methodNameEndPos);
                    const methodParams = methodMatch[2];
                    const documentMethodPos = classMatch.index + methodMatch.index;
                    const methodLine = document.positionAt(documentMethodPos).line;
                    const methodChar = document.positionAt(documentMethodPos).character;
                    const methodEndChar = methodChar + originalMethodName.length;
                    
                    // Parse parameter signature for method matching
                    const parameterSignature = this.parseDeclarationParameters(methodParams);
                    
                    logger.info(`Found method declaration: ${originalClassName}.${originalMethodName}(${methodParams}) at line ${methodLine}`);
                    logger.info(`Parsed parameter signature: [${parameterSignature.join(', ')}]`);
                    
                    // Store method metadata without resolving implementation
                    methodLocations.push({
                        fullFileName: moduleFilePath || "", // Use empty string if module path couldn't be resolved
                        linePosition: new Position(methodLine, methodChar),
                        linePositionEnd: new Position(methodLine, methodEndChar),
                        statementType: "METHOD",
                        // Store metadata for lazy implementation resolution
                        className: originalClassName,
                        methodName: originalMethodName,
                        moduleFile: moduleFile || undefined, // Convert null to undefined for type compatibility
                        implementationResolved: false,
                        // Store parameter signature for matching overloaded methods
                        parameterSignature: parameterSignature
                    });
                    
                    logger.info(`Stored metadata for method ${originalClassName}.${originalMethodName} (implementation will be resolved on demand)`);
                }
            }
            
            logger.info(`Found ${methodLocations.length} CLASS method declarations`);
            
            // Process MAP procedure declarations
            const mapRegex = /\bmap\b/gis;
            const mapMatch = mapRegex.exec(lowerText);
            
            if (mapMatch) {
                logger.info(`Found MAP at position ${mapMatch.index}`);
                
                // Find the END of the MAP
                const mapStart = mapMatch.index;
                const mapTail = lowerText.slice(mapStart);
                const mapEndMatch = /^\s*end\b/mi.exec(mapTail);
                
                if (mapEndMatch) {
                    const mapEnd = mapStart + mapEndMatch.index;
                    const mapText = lowerText.substring(mapStart, mapEnd);
                    const originalMapText = originalText.substring(mapStart, mapEnd);
                    
                    logger.info(`MAP ends at position ${mapEnd}`);
                    
                    // Look for PROCEDURE declarations in MAP
                    const procRegex = /^[ \t]*([a-z0-9_]+)\s+procedure\s*\(([^)]*)\)/gim;
                    let procMatch;
                    
                    while ((procMatch = procRegex.exec(mapText)) !== null) {
                        // Extract original case from originalMapText
                        const matchStart = procMatch.index;
                        const matchEnd = matchStart + procMatch[0].length;
                        const originalMatch = originalMapText.substring(matchStart, matchEnd);
                        const nameMatch = originalMatch.match(/^[ \t]*([a-z0-9_]+)/i);
                        if (!nameMatch) continue; // Skip if no match
                        const originalProcName = nameMatch[1];
                        
                        const params = procMatch[2];
                        const procPos = mapStart + procMatch.index;
                        const procLine = document.positionAt(procPos).line;
                        const procChar = document.positionAt(procPos).character;
                        const procEndChar = procChar + originalProcName.length;
                        
                        // Parse parameter signature
                        const parameterSignature = this.parseDeclarationParameters(params);
                        
                        logger.info(`Found MAP procedure: ${originalProcName}(${params}) at line ${procLine}`);
                        logger.info(`Parsed parameter signature: [${parameterSignature.join(', ')}]`);
                        
                        // Store procedure metadata
                        methodLocations.push({
                            fullFileName: document.uri.fsPath, // MAP procedures are in same file
                            linePosition: new Position(procLine, procChar),
                            linePositionEnd: new Position(procLine, procEndChar),
                            statementType: "MAPPROCEDURE", // MAP procedures are not class methods
                            className: "", // No class for MAP procedures
                            methodName: originalProcName, // Use original case (store procedure name in methodName for compatibility)
                            moduleFile: undefined, // No MODULE for MAP procedures
                            implementationResolved: false,
                            parameterSignature: parameterSignature
                        });
                        
                        logger.info(`Stored metadata for MAP procedure ${originalProcName}`);
                    }
                }
            }
            
            logger.info(`Found ${methodLocations.length} total declarations (CLASS methods + MAP procedures)`);
        } catch (error) {
            logger.error(`Error processing method declarations: ${error instanceof Error ? error.message : String(error)}`);
        }
        return methodLocations;
    }


    /**
     * Gets document information for a URI
     *
     * @param uri - The URI of the document
     * @returns The document information or undefined if not found
     */
    public getDocumentInfo(uri: Uri): DocumentInfo | undefined {
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

    /**
     * Gets the document content
     *
     * @param uri - The URI of the document
     * @returns The document content or undefined if the document is not found
     */
    getDocumentContent(uri: Uri): string | undefined {
        const document = workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
        if (document) {
            return document.getText();
        }
        return undefined;
    }

    /**
     * Gets cache statistics for debugging and testing
     *
     * @returns An object with cache statistics
     */
    getCacheStats() {
        return {
            cacheSize: this.documentLinksCache.size,
            openDocumentsSize: this.openDocuments.size
        };
    }

    /**
     * Clears the document links cache
     *
     * This method is useful for testing and debugging.
     */
    clearCache() {
        const cacheSize = this.documentLinksCache.size;
        logger.info(`🗑️ Manually clearing cache with ${cacheSize} entries`);
        this.documentLinksCache.clear();
    }

    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
    }
}
