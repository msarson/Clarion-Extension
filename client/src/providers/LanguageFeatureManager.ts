import { languages, ExtensionContext, Disposable } from 'vscode';
import { DocumentManager } from '../documentManager';
import { ClarionDocumentLinkProvider } from './documentLinkProvier';
import { ClarionHoverProvider } from './hoverProvider';
// Implementation provider moved to server-side
// import { ClarionImplementationProvider } from './implementationProvider';
import { ClarionDecorator } from '../ClarionDecorator';
import { UnreachableCodeDecorator } from '../UnreachableCodeDecorator';
import { globalSettings } from '../globals';
import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("LanguageFeatureManager");
logger.setLevel("error");

// Track disposables to ensure only one instance of each provider
let hoverProviderDisposable: Disposable | null = null;
let documentLinkProviderDisposable: Disposable | null = null;
// Implementation provider now handled by language server
// let implementationProviderDisposable: Disposable | null = null;
let semanticTokensProviderDisposable: Disposable | null = null;
let unreachableCodeDecoratorDisposable: Disposable | null = null;

/**
 * Registers all language feature providers
 * @param context - Extension context
 * @param documentManager - Document manager instance
 */
export function registerLanguageFeatures(context: ExtensionContext, documentManager: DocumentManager | undefined) {
    logger.info("registerLanguageFeatures called");
    
    if (!documentManager) {
        logger.warn("⚠️ Cannot register language features: documentManager is undefined!");
        return;
    }
    
    // ✅ Fix: Ensure only one Document Link Provider is registered
    if (documentLinkProviderDisposable) {
        documentLinkProviderDisposable.dispose(); // Remove old provider if it exists
    }

    logger.info("🔗 Registering Document Link Provider...");

    // Get the default lookup extensions from settings
    const lookupExtensions = globalSettings.defaultLookupExtensions || [".clw", ".inc", ".equ", ".eq", ".int"];

    // Create document selectors for all Clarion file extensions
    const documentSelectors = [
        { scheme: "file", language: "clarion" },
        ...lookupExtensions.map(ext => ({ scheme: "file", pattern: `**/*${ext}` }))
    ];

    // Register the document link provider for all selectors
    documentLinkProviderDisposable = languages.registerDocumentLinkProvider(
        documentSelectors,
        new ClarionDocumentLinkProvider(documentManager)
    );
    context.subscriptions.push(documentLinkProviderDisposable);

    logger.info(`📄 Registered Document Link Provider for extensions: ${lookupExtensions.join(', ')}`);

    // ✅ Fix: Ensure only one Hover Provider is registered
    if (hoverProviderDisposable) {
        hoverProviderDisposable.dispose(); // Remove old provider if it exists
    }

    // ✅ Client and server hover providers work together:
    // - Client handles: declaration → implementation (cross-file lookups)
    // - Server handles: implementation → declaration (same document context)
    // Client detects implementation lines and defers to server to avoid duplicate info
    
    logger.info("📝 Registering Hover Provider...");
    hoverProviderDisposable = languages.registerHoverProvider(
        documentSelectors,
        new ClarionHoverProvider(documentManager)
    );
    context.subscriptions.push(hoverProviderDisposable);
    logger.info(`📄 Registered Hover Provider for extensions: ${lookupExtensions.join(', ')}`);
    
    // ✅ Implementation Provider now handled by language server (server-side)
    // Client-side registration removed - see server/src/providers/ImplementationProvider.ts
    logger.info("ℹ️  Implementation Provider is handled by the language server");
    
    // ✅ Register Prefix Decorator for variable highlighting
    if (semanticTokensProviderDisposable) {
        semanticTokensProviderDisposable.dispose(); // Remove old provider if it exists
    }
    
    logger.info("🎨 Registering Clarion Decorator for variable and comment highlighting...");
    const clarionDecorator = new ClarionDecorator();
    semanticTokensProviderDisposable = {
        dispose: () => clarionDecorator.dispose()
    };
    context.subscriptions.push(semanticTokensProviderDisposable);
    
    logger.info(`🎨 Registered Clarion Decorator for variable and comment highlighting`);
    
    // ✅ Register Unreachable Code Decorator
    if (unreachableCodeDecoratorDisposable) {
        unreachableCodeDecoratorDisposable.dispose();
    }
    
    logger.info("🔍 Registering Unreachable Code Decorator...");
    const unreachableCodeDecorator = new UnreachableCodeDecorator();
    unreachableCodeDecoratorDisposable = {
        dispose: () => unreachableCodeDecorator.dispose()
    };
    context.subscriptions.push(unreachableCodeDecoratorDisposable);
    
    logger.info(`🔍 Registered Unreachable Code Decorator`);
}

/**
 * Disposes all language feature providers
 */
export function disposeLanguageFeatures() {
    if (hoverProviderDisposable) {
        hoverProviderDisposable.dispose();
        hoverProviderDisposable = null;
    }
    if (documentLinkProviderDisposable) {
        documentLinkProviderDisposable.dispose();
        documentLinkProviderDisposable = null;
    }
    // Implementation provider is now server-side, no client disposal needed
    if (semanticTokensProviderDisposable) {
        semanticTokensProviderDisposable.dispose();
        semanticTokensProviderDisposable = null;
    }
    if (unreachableCodeDecoratorDisposable) {
        unreachableCodeDecoratorDisposable.dispose();
        unreachableCodeDecoratorDisposable = null;
    }
}
