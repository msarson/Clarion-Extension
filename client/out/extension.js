"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode_1 = require("vscode");
const ClarionFoldingRangeProvider_1 = require("./ClarionFoldingRangeProvider");
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
let disposables = [];
function activate(context) {
    context.subscriptions.push(vscode_1.languages.registerFoldingRangeProvider({ scheme: 'file', language: 'clarion' }, new ClarionFoldingRangeProvider_1.ClarionFoldingRangeProvider()));
}
exports.activate = activate;
function deactivate() {
    if (disposables) {
        disposables.forEach(item => item.dispose());
    }
    disposables = [];
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map