"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_languageserver_1 = require("vscode-languageserver");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const ClarionFoldingRangeProvider_1 = require("./ClarionFoldingRangeProvider");
let connection = vscode_languageserver_1.createConnection(vscode_languageserver_1.ProposedFeatures.all);
let documents = new vscode_languageserver_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
connection.onInitialize(params => {
    connection.onFoldingRanges(params => {
        return getFoldingRanges(params);
    });
    return {
        capabilities: {
            foldingRangeProvider: true
        }
    };
});
connection.onInitialized(() => {
    connection.window.showInformationMessage('Clarion Server Initialized');
});
function getFoldingRanges(params) {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }
    let clarionFolding = new ClarionFoldingRangeProvider_1.ClarionFoldingRangeProvider;
    return clarionFolding.provideFoldingRanges(document);
}
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map