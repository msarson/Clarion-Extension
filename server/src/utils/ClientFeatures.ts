/**
 * Optional features a client announced in `initialize` under `capabilities.experimental`.
 * Set once by the server's onInitialize; read by the providers that shape their output for it.
 */
export const clientFeatures = {
    /**
     * `clarionAttributeEditLinks`: the client applies the attribute edit links on a control card
     * (command:clarion.applyAttributeEdit?<args>, see DeclaredAttributes.ts). Off by default: a
     * client without the command would show links that lead nowhere.
     */
    attributeEditLinks: false,
};

/** Read the experimental client capabilities from an `initialize` request. */
export function readClientFeatures(capabilities: { experimental?: unknown } | undefined): void {
    const experimental = (capabilities?.experimental ?? {}) as Record<string, unknown>;
    clientFeatures.attributeEditLinks = experimental.clarionAttributeEditLinks === true;
}
