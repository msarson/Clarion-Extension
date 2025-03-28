import {
    createConnection,
    TextDocuments,
    ProposedFeatures
} from 'vscode-languageserver/node';

import {
    DocumentFormattingParams,
    DocumentSymbol,
    DocumentSymbolParams,
    FoldingRange,
    FoldingRangeParams,
    InitializeParams,
    InitializeResult,
    TextEdit,
    Range,
    Position,
    DocumentColorParams,
    ColorInformation,
    Color,
    ColorPresentationParams,
    ColorPresentation
} from 'vscode-languageserver-protocol';

import { TextDocument } from 'vscode-languageserver-textdocument';

import { ClarionDocumentSymbolProvider } from './ClarionDocumentSymbolProvider';
import { ClarionFoldingRangeProvider } from './ClarionFoldingRangeProvider';
import { ClarionTokenizer, Token, TokenType } from './ClarionTokenizer';

import LoggerManager from './logger';
import ClarionFormatter from './ClarionFormatter';

import { LexEnum } from './LexEnum';
import { ClarionColorResolver } from './ClarionColorResolver';
const logger = LoggerManager.getLogger("Server");
logger.setLevel("error");
// ✅ Initialize Providers
const clarionFoldingProvider = new ClarionFoldingRangeProvider();
const clarionDocumentSymbolProvider = new ClarionDocumentSymbolProvider();

// ✅ Create Connection and Documents Manager
const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
// ✅ Global Token Cache
interface CachedTokenData {
    version: number;
    tokens: Token[];
}

const tokenCache = new Map<string, CachedTokenData>();

export let globalClarionSettings: any = {};

// ✅ Token Cache for Performance



let debounceTimeout: NodeJS.Timeout | null = null;
/**
 * ✅ Retrieves cached tokens or tokenizes the document if not cached.
 */
const parsedDocuments = new Map<string, boolean>(); // Track parsed state per document

function getTokens(document: TextDocument): Token[] {
    const cached = tokenCache.get(document.uri);
    if (cached && cached.version === document.version) {
        logger.info(`🟢 Using cached tokens for ${document.uri} (version ${document.version})`);
        return cached.tokens;
    }

    logger.info(`🟢 Running tokenizer for ${document.uri} (version ${document.version})`);
    const tokenizer = new ClarionTokenizer(document.getText());
    const tokens = tokenizer.tokenize();
    tokenCache.set(document.uri, { version: document.version, tokens });
    return tokens;
}




// ✅ Handle Folding Ranges (Uses Cached Tokens & Caches Results)
connection.onFoldingRanges((params: FoldingRangeParams) => {
    logger.info(`📂  Received onFoldingRanges request for: ${params.textDocument.uri}`);
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.info(`⚠️  [DELAY] Server not initialized yet, delaying folding range request for ${document.uri}`);
        return [];
    }

    logger.info(`📂  Computing fresh folding ranges for: ${document.uri}`);

    const tokens = getTokens(document);  // ✅ No need for async/wrapping in Promise.resolve
    let ranges = clarionFoldingProvider.provideFoldingRanges(tokens);
    return ranges;
});


// ✅ Handle Content Changes (Recompute Tokens)
documents.onDidChangeContent(event => {
    const document = event.document;

    tokenCache.delete(document.uri); // 🔥 Always delete immediately

    if (debounceTimeout) clearTimeout(debounceTimeout);

    debounceTimeout = setTimeout(() => {
        logger.info(`[REFRESH] Re-parsing tokens after edit: ${document.uri}`);
        getTokens(document); // ⬅️ refreshes the cache
    }, 300);
});



// ✅ Handle Document Formatting (Uses Cached Tokens & Caches Results)
connection.onDocumentFormatting((params: DocumentFormattingParams): TextEdit[] => {
    logger.info(`📐 Received onDocumentFormatting request for: ${params.textDocument.uri}`);
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    try {
        // ✅ Use getTokens() instead of manually tokenizing
        const tokens = getTokens(document);

        const formatter = new ClarionFormatter(tokens, text, {
            formattingOptions: params.options
        });

        const formattedText = formatter.format();
        if (formattedText !== text) {
            return [TextEdit.replace(
                Range.create(Position.create(0, 0), Position.create(document.lineCount, 0)),
                formattedText
            )];
        }
        return [];
    } catch (error) {
        logger.error(`❌ Error formatting document: ${error}`);
        return [];
    }
});


connection.onDocumentSymbol((params: DocumentSymbolParams) => {
    logger.info(`📂  Received onDocumentSymbol request for: ${params.textDocument.uri}`);
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    if (!serverInitialized) {
        logger.info(`⚠️  [DELAY] Server not initialized yet, delaying document symbol request for ${document.uri}`);
        return [];
    }

    logger.info(`📂  Computing fresh document symbols for: ${document.uri}`);
    const tokens = getTokens(document);  // ✅ No need for async
    const symbols = clarionDocumentSymbolProvider.provideDocumentSymbols(tokens, document.uri);
    logger.info(`🧩 Returned ${symbols.length} document symbols`);

    logger.info(`✅ Finished processing tokens. ${symbols.length} top-level symbols`);

    for (const s of symbols) {
        logger.info(`🪵 Top-level: ${s.name}, children: ${s.children?.length ?? 0}`);
        s.children?.forEach(child => {
            logger.info(`   ↪️ Child: ${child.name}`);
        });
    }
    return symbols;

});


connection.onDocumentColor((params: DocumentColorParams): ColorInformation[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const tokens = getTokens(document);
    return ClarionColorResolver.provideDocumentColors(tokens, document);
});

connection.onColorPresentation((params: ColorPresentationParams): ColorPresentation[] => {
    const { color, range } = params;
    return ClarionColorResolver.provideColorPresentations(color, range);
});




// ✅ Handle Save (Ensure Cached Tokens Are Up-To-Date)
documents.onDidSave(event => {
    const document = event.document;

    logger.info(`💾 [SAVE] Document saved: ${document.uri}, ensuring tokens are fresh...`);

    // ✅ Refresh token cache after save
    getTokens(document);
});

// ✅ Clear Cache When Document Closes
// ✅ Clear Cache When Document Closes
documents.onDidClose(event => {
    logger.info(`🗑️  [CACHE CLEAR] Removing cached data for ${event.document.uri}`);

    // ✅ Remove tokens from both caches to free memory
    tokenCache.delete(event.document.uri);
});

// ✅ Server Initialization
connection.onInitialize((params: InitializeParams): InitializeResult => {
    logger.info("⚡  Received onInitialize request from VS Code.");
    globalClarionSettings = params.initializationOptions || {};
    return {
        capabilities: {
            foldingRangeProvider: true,
            documentSymbolProvider: true,
            documentFormattingProvider: true,
            colorProvider: true
        }
    };
});

export let serverInitialized = false;

// ✅ Server Fully Initialized
connection.onInitialized(() => {
    logger.info("✅  Clarion Language Server fully initialized.");
    serverInitialized = true;
});

// ✅ Start Listening
documents.listen(connection);
connection.listen();

logger.info("🟢  Clarion Language Server is now listening for requests.");