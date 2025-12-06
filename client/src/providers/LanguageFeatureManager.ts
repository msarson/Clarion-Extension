import { languages, ExtensionContext, Disposable } from 'vscode';
import { DocumentManager } from '../documentManager';
import { ClarionDocumentLinkProvider } from './documentLinkProvier';
import { ClarionHoverProvider } from './hoverProvider';
import { ClarionImplementationProvider } from './implementationProvider';
import { ClarionDecorator } from '../ClarionDecorator';
import { globalSettings } from '../globals';
import LoggerManager from '../logger';

const logger = LoggerManager.getLogger("LanguageFeatureManager");

// Track disposables to ensure only one instance of each provider
let hoverProviderDisposable: Disposable | null = null;
let documentLinkProviderDisposable: Disposable | null = null;
let implementationProviderDisposable: Disposable | null = null;
let definitionProviderDisposable: Disposable | null = null;
let semanticTokensProviderDisposable: Disposable | null = null;

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

    logger.info("📝 Registering Hover Provider...");
    hoverProviderDisposable = languages.registerHoverProvider(
        documentSelectors,
        new ClarionHoverProvider(documentManager)
    );
    context.subscriptions.push(hoverProviderDisposable);

    logger.info(`📄 Registered Hover Provider for extensions: ${lookupExtensions.join(', ')}`);
    
    // ✅ Register Implementation Provider for "Go to Implementation" functionality
    if (implementationProviderDisposable) {
        implementationProviderDisposable.dispose(); // Remove old provider if it exists
    }
    
    logger.info("🔍 Registering Implementation Provider...");
    implementationProviderDisposable = languages.registerImplementationProvider(
        documentSelectors,
        new ClarionImplementationProvider(documentManager)
    );
    context.subscriptions.push(implementationProviderDisposable);
    
    logger.info(`📄 Registered Implementation Provider for extensions: ${lookupExtensions.join(', ')}`);
    
    // ✅ DISABLED: Client-side Definition Provider blocks server-side providers
    // All definition requests now handled by:
    // 1. Middleware for reverse MAP navigation (implementation → declaration)
    // 2. Server-side DefinitionProvider for everything else
    // This includes: variables, parameters, methods, structures, etc.
    if (definitionProviderDisposable) {
        definitionProviderDisposable.dispose();
    }
    
    // REMOVED: Client-side Definition Provider
    // logger.info("🔍 Registering Definition Provider for class methods...");
    // definitionProviderDisposable = languages.registerDefinitionProvider(
    //     documentSelectors,
    //     new ClarionDefinitionProvider(documentManager)
    // );
    // context.subscriptions.push(definitionProviderDisposable);
    // 
    // logger.info(`📄 Registered Definition Provider for extensions: ${lookupExtensions.join(', ')}`);
    
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
    if (implementationProviderDisposable) {
        implementationProviderDisposable.dispose();
        implementationProviderDisposable = null;
    }
    if (definitionProviderDisposable) {
        definitionProviderDisposable.dispose();
        definitionProviderDisposable = null;
    }
    if (semanticTokensProviderDisposable) {
        semanticTokensProviderDisposable.dispose();
        semanticTokensProviderDisposable = null;
    }
}
