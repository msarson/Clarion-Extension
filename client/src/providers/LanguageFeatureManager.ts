import { ExtensionContext, Disposable } from 'vscode';
// Implementation provider, document links AND hover all live server-side now;
// the dead client copies were deleted under #326, and the DocumentManager that
// fed them went in the #341 sweep. Hover retirement (the last surface) landed
// after Mark's IDE smoke confirmed the server's INCLUDE/MODULE/SECTION
// file-link hovers cover everything the client card showed.
import { ClarionDecorator } from '../ClarionDecorator';
import { UnreachableCodeDecorator } from '../UnreachableCodeDecorator';
import { LanguageClientManager } from '../LanguageClientManager';

import LoggerManager from '../utils/LoggerManager';

const logger = LoggerManager.getLogger("LanguageFeatureManager");
logger.setLevel("error");

// Track disposables to ensure only one instance of each provider
let semanticTokensProviderDisposable: Disposable | null = null;
let unreachableCodeDecoratorDisposable: Disposable | null = null;

/**
 * Registers all language feature providers
 * @param context - Extension context
 */
export function registerLanguageFeatures(context: ExtensionContext) {
    logger.info("registerLanguageFeatures called");


    // Document links are now served by the language server (DocumentLinkProvider.ts)
    // which uses the FileRelationshipGraph — no client-side registration needed.

    // Hover is served entirely by the language server (#326): variables,
    // procedures, methods AND the INCLUDE/MODULE/SECTION file-link cards.
    // The client provider deferred everything but the file-link case since
    // #320/#265; the server's file-link hover covers that too, so the client
    // registration is gone — one card per hover, no client/server merge.
    logger.info("ℹ️  Hover is handled by the language server");

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
    const client = LanguageClientManager.getInstance().getClient();
    if (client) {
        const unreachableCodeDecorator = new UnreachableCodeDecorator(client);
        unreachableCodeDecoratorDisposable = {
            dispose: () => unreachableCodeDecorator.dispose()
        };
        context.subscriptions.push(unreachableCodeDecoratorDisposable);
        logger.info(`🔍 Registered Unreachable Code Decorator`);
    } else {
        logger.warn("⚠️ Language client not available, unreachable code detection will be unavailable");
    }
}

/**
 * Disposes all language feature providers
 */
export function disposeLanguageFeatures() {
    // Hover, implementation provider and document links are now server-side, no client disposal needed
    if (semanticTokensProviderDisposable) {
        semanticTokensProviderDisposable.dispose();
        semanticTokensProviderDisposable = null;
    }
    if (unreachableCodeDecoratorDisposable) {
        unreachableCodeDecoratorDisposable.dispose();
        unreachableCodeDecoratorDisposable = null;
    }
}
