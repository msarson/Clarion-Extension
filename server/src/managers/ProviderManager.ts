import * as fs from 'fs';
import {
    Connection,
    DocumentSymbolParams,
    FoldingRangeParams,
    DocumentFormattingParams,
    TextEdit,
    Range,
    Position,
    DocumentColorParams,
    ColorInformation,
    ColorPresentationParams,
    ColorPresentation
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionDocumentSymbolProvider } from '../ClarionDocumentSymbolProvider';
import ClarionFormatter from '../ClarionFormatter';
import { ClarionColorResolver } from '../ClarionColorResolver';
import ClarionFoldingProvider from '../ClarionFoldingProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import LoggerManager from '../logger';
import { getTokenManager } from '../managers/TokenManager';
import { getServerDocumentManager } from '../managers/ServerDocumentManager';
import { getServerConnectionManager } from '../managers/ServerConnectionManager';

const logger = LoggerManager.getLogger("ProviderManager");
logger.setLevel("error");

/**
 * Manages language feature providers
 */
export class ProviderManager {
    private clarionDocumentSymbolProvider: ClarionDocumentSymbolProvider;
    private definitionProvider: DefinitionProvider;

    constructor() {
        // Initialize providers
        this.clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();
        this.definitionProvider = new DefinitionProvider();
    }

    /**
     * Register all providers with the connection
     * @param connection The connection
     */
    public registerProviders(connection: Connection): void {
        this.registerFoldingRangeProvider(connection);
        this.registerDocumentFormattingProvider(connection);
        this.registerDocumentSymbolProvider(connection);
        this.registerColorProvider(connection);
        this.registerDefinitionProvider(connection);
    }

    /**
     * Register the folding range provider
     * @param connection The connection
     */
    private registerFoldingRangeProvider(connection: Connection): void {
        connection.onFoldingRanges((params: FoldingRangeParams) => {
            try {
                logger.info(`📂 [DEBUG] Received onFoldingRanges request for: ${params.textDocument.uri}`);
                const documentManager = getServerDocumentManager();
                const document = documentManager.getDocument(params.textDocument.uri);
                if (!document) {
                    logger.warn(`⚠️ [DEBUG] Document not found for folding: ${params.textDocument.uri}`);
                    return [];
                }

                const uri = document.uri;
                
                // Skip XML files
                if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [DEBUG] Skipping XML file in onFoldingRanges: ${uri}`);
                    return [];
                }

                const serverConnectionManager = getServerConnectionManager();
                if (!serverConnectionManager.isServerInitialized()) {
                    logger.info(`⚠️ [DEBUG] Server not initialized yet, delaying folding range request for ${uri}`);
                    return [];
                }

                logger.info(`📂 [DEBUG] Computing folding ranges for: ${uri}, language: ${document.languageId}`);
                
                const tokenManager = getTokenManager();
                const tokens = tokenManager.getTokens(document);
                logger.info(`🔍 [DEBUG] Got ${tokens.length} tokens for folding ranges`);
                
                const foldingProvider = new ClarionFoldingProvider(tokens);
                const ranges = foldingProvider.computeFoldingRanges();
                logger.info(`📂 [DEBUG] Computed ${ranges.length} folding ranges for: ${uri}`);
                
                return ranges;
            } catch (error) {
                logger.error(`❌ [DEBUG] Error computing folding ranges: ${error instanceof Error ? error.message : String(error)}`);
                return [];
            }
        });
    }

    /**
     * Register the document formatting provider
     * @param connection The connection
     */
    private registerDocumentFormattingProvider(connection: Connection): void {
        connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
            try {
                logger.info(`📐 [DEBUG] Received onDocumentFormatting request for: ${params.textDocument.uri}`);
                const documentManager = getServerDocumentManager();
                const document = documentManager.getDocument(params.textDocument.uri);
                if (!document) {
                    logger.warn(`⚠️ [DEBUG] Document not found for formatting: ${params.textDocument.uri}`);
                    return [];
                }

                const uri = document.uri;
                
                // Skip XML files
                if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [DEBUG] Skipping XML file in onDocumentFormatting: ${uri}`);
                    return [];
                }

                const text = document.getText();
                logger.info(`🔍 [DEBUG] Getting tokens for formatting document: ${uri}, language: ${document.languageId}`);
                
                // Use getTokens() instead of manually tokenizing
                const tokenManager = getTokenManager();
                const tokens = tokenManager.getTokens(document);
                logger.info(`🔍 [DEBUG] Got ${tokens.length} tokens for formatting`);

                const formatter = new ClarionFormatter(tokens, text, {
                    formattingOptions: params.options
                });

                const formattedText = formatter.format();
                if (formattedText !== text) {
                    logger.info(`🔍 [DEBUG] Document formatting changed text: ${uri}`);
                    return [TextEdit.replace(
                        Range.create(Position.create(0, 0), Position.create(document.lineCount, 0)),
                        formattedText
                    )];
                }
                logger.info(`🔍 [DEBUG] Document formatting made no changes: ${uri}`);
                return [];
            } catch (error) {
                logger.error(`❌ [DEBUG] Error formatting document: ${error instanceof Error ? error.message : String(error)}`);
                return [];
            }
        });
    }

    /**
     * Register the document symbol provider
     * @param connection The connection
     */
    private registerDocumentSymbolProvider(connection: Connection): void {
        connection.onDocumentSymbol((params: DocumentSymbolParams) => {
            try {
                logger.info(`📂 [DEBUG] Received onDocumentSymbol request for: ${params.textDocument.uri}`);
                const documentManager = getServerDocumentManager();
                const document = documentManager.getDocument(params.textDocument.uri);
                if (!document) {
                    logger.warn(`⚠️ [DEBUG] Document not found for symbols: ${params.textDocument.uri}`);
                    return [];
                }

                const uri = document.uri;
                
                // Skip XML files
                if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [DEBUG] Skipping XML file in onDocumentSymbol: ${uri}`);
                    return [];
                }

                const serverConnectionManager = getServerConnectionManager();
                if (!serverConnectionManager.isServerInitialized()) {
                    logger.info(`⚠️ [DEBUG] Server not initialized yet, delaying document symbol request for ${uri}`);
                    return [];
                }

                // Check if a solution operation is in progress - if so, prioritize solution view
                if ((global as any).solutionOperationInProgress) {
                    logger.info(`⚠️ [DEBUG] Solution operation in progress, deferring document symbol request for: ${uri}`);
                    return [];
                }

                logger.info(`📂 [DEBUG] Computing document symbols for: ${uri}, language: ${document.languageId}`);
                const tokenManager = getTokenManager();
                const tokens = tokenManager.getTokens(document);
                logger.info(`🔍 [DEBUG] Got ${tokens.length} tokens for document symbols`);
                
                const symbols = this.clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, uri);
                logger.info(`🧩 [DEBUG] Returned ${symbols.length} document symbols for ${uri}`);

                return symbols;
            } catch (error) {
                logger.error(`❌ [DEBUG] Error providing document symbols: ${error instanceof Error ? error.message : String(error)}`);
                return [];
            }
        });

        // Register document symbols request handler
        connection.onRequest('clarion/documentSymbols', async (params: { uri: string }) => {
            let document = getServerDocumentManager().getDocument(params.uri);

            if (!document) {
                logger.warn(`⚠️ Document not open, attempting to locate on disk: ${params.uri}`);

                try {
                    const { SolutionManager } = require('../solution/solutionManager');
                    const solutionManager = SolutionManager.getInstance();
                    if (solutionManager) {
                        const fileName = decodeURIComponent(params.uri.split('/').pop() || '');
                        const result = solutionManager.findFileWithExtension(fileName);

                        if (result.path && fs.existsSync(result.path)) {
                            const fileContent = fs.readFileSync(result.path, 'utf8');
                            document = TextDocument.create(params.uri, 'clarion', 1, fileContent);
                            logger.info(`✅ Successfully loaded file from disk: ${result.path} (source: ${result.source})`);
                        } else {
                            logger.warn(`⚠️ Could not find file on disk: ${fileName}`);
                            return [];
                        }
                    } else {
                        logger.warn(`⚠️ No SolutionManager instance available for symbol request.`);
                        return [];
                    }
                } catch (err) {
                    logger.error(`❌ Error reading file for documentSymbols: ${params.uri} — ${err instanceof Error ? err.message : String(err)}`);
                    return [];
                }
            }

            logger.info(`📜 [Server] Handling documentSymbols request for ${params.uri}`);
            const tokenManager = getTokenManager();
            const tokens = tokenManager.getTokens(document);
            const symbols = this.clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, params.uri);
            logger.info(`✅ [Server] Returning ${symbols.length} symbols`);
            return symbols;
        });
    }

    /**
     * Register the color provider
     * @param connection The connection
     */
    private registerColorProvider(connection: Connection): void {
        connection.onDocumentColor((params: DocumentColorParams): ColorInformation[] => {
            try {
                logger.info(`🎨 [DEBUG] Received onDocumentColor request for: ${params.textDocument.uri}`);
                const documentManager = getServerDocumentManager();
                const document = documentManager.getDocument(params.textDocument.uri);
                if (!document) {
                    logger.warn(`⚠️ [DEBUG] Document not found for colors: ${params.textDocument.uri}`);
                    return [];
                }

                const uri = document.uri;
                
                // Skip XML files
                if (uri.toLowerCase().endsWith('.xml') || uri.toLowerCase().endsWith('.cwproj')) {
                    logger.info(`🔍 [DEBUG] Skipping XML file in onDocumentColor: ${uri}`);
                    return [];
                }

                logger.info(`🎨 [DEBUG] Getting tokens for document colors: ${uri}`);
                const tokenManager = getTokenManager();
                const tokens = tokenManager.getTokens(document);
                const colors = ClarionColorResolver.provideDocumentColors(tokens, document);
                logger.info(`🎨 [DEBUG] Found ${colors.length} colors in document: ${uri}`);
                
                return colors;
            } catch (error) {
                logger.error(`❌ [DEBUG] Error providing document colors: ${error instanceof Error ? error.message : String(error)}`);
                return [];
            }
        });

        connection.onColorPresentation((params: ColorPresentationParams): ColorPresentation[] => {
            try {
                logger.info(`🎨 [DEBUG] Received onColorPresentation request`);
                const { color, range } = params;
                const presentations = ClarionColorResolver.provideColorPresentations(color, range);
                logger.info(`🎨 [DEBUG] Provided ${presentations.length} color presentations`);
                return presentations;
            } catch (error) {
                logger.error(`❌ [DEBUG] Error providing color presentations: ${error instanceof Error ? error.message : String(error)}`);
                return [];
            }
        });
    }

    /**
     * Register the definition provider
     * @param connection The connection
     */
    private registerDefinitionProvider(connection: Connection): void {
        connection.onDefinition(async (params) => {
            logger.info(`📂 Received definition request for: ${params.textDocument.uri} at position ${params.position.line}:${params.position.character}`);
            
            const serverConnectionManager = getServerConnectionManager();
            if (!serverConnectionManager.isServerInitialized()) {
                logger.info(`⚠️ [DELAY] Server not initialized yet, delaying definition request`);
                return null;
            }
            
            const documentManager = getServerDocumentManager();
            const document = documentManager.getDocument(params.textDocument.uri);
            if (!document) {
                logger.info(`⚠️ Document not found: ${params.textDocument.uri}`);
                return null;
            }
            
            try {
                const definition = await this.definitionProvider.provideDefinition(document, params.position);
                if (definition) {
                    logger.info(`✅ Found definition for ${params.textDocument.uri}`);
                } else {
                    logger.info(`⚠️ No definition found for ${params.textDocument.uri}`);
                }
                return definition;
            } catch (error) {
                logger.error(`❌ Error providing definition: ${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        });
    }
}

// Singleton instance
let instance: ProviderManager | undefined;

/**
 * Get the ProviderManager instance
 * @returns The ProviderManager instance
 */
export function getProviderManager(): ProviderManager {
    if (!instance) {
        instance = new ProviderManager();
    }
    return instance;
}