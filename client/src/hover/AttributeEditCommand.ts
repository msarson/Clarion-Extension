import { commands, ExtensionContext, Hover, MarkdownString, Position, Range, Selection, SnippetString, Uri, window, workspace, WorkspaceEdit } from 'vscode';
import { ClientCapabilities, FeatureState, StaticFeature } from 'vscode-languageclient/node';
import { ATTRIBUTE_EDIT_COMMAND, AttributeEditAnchor, bindAttributeEditLinks, planAttributeEdit } from './attributeEditLinks';

/**
 * #739: the VS Code half of the control card's attribute edit links (#731). The server emits the
 * links only for a client that announces the capability; see attributeEditLinks.ts for the form.
 */

/** Announces `capabilities.experimental.clarionAttributeEditLinks` in `initialize`. */
export const attributeEditLinksFeature: StaticFeature = {
    fillClientCapabilities(capabilities: ClientCapabilities): void {
        capabilities.experimental = { ...(capabilities.experimental as object ?? {}), clarionAttributeEditLinks: true };
    },
    initialize(): void { /* nothing to set up */ },
    getState(): FeatureState { return { kind: 'static' }; },
    clear(): void { /* nothing to clear */ },
};

/**
 * Hover middleware: binds the hovered position into each edit link, and trusts the card for
 * that one command. Hover markdown is untrusted otherwise, and VS Code would not run the link.
 */
export function trustAttributeEditLinks(hover: Hover | null | undefined, uri: Uri, position: Position): Hover | null | undefined {
    if (!hover) return hover;
    const anchor: AttributeEditAnchor = { uri: uri.toString(), line: position.line, character: position.character };
    let bound = false;
    const contents = hover.contents.map(content => {
        const value = typeof content === 'string' ? content : content.value;
        if (!value.includes(`command:${ATTRIBUTE_EDIT_COMMAND}?`)) return content;
        bound = true;
        const md = new MarkdownString(bindAttributeEditLinks(value, anchor));
        md.isTrusted = { enabledCommands: [ATTRIBUTE_EDIT_COMMAND] };
        if (content instanceof MarkdownString) md.supportThemeIcons = content.supportThemeIcons;
        return md;
    });
    return bound ? new Hover(contents, hover.range) : hover;
}

/**
 * `clarion.applyAttributeEdit(payload, anchor)`: checks the lines the edit touches still read as
 * they did, applies every edit as one undo step and shows the card again. Resolves to whether
 * the edit was applied.
 */
export function registerAttributeEditCommand(context: ExtensionContext): void {
    context.subscriptions.push(commands.registerCommand(ATTRIBUTE_EDIT_COMMAND, async (payload: unknown, anchor?: AttributeEditAnchor): Promise<boolean> => {
        if (!anchor || typeof anchor.uri !== 'string' || !Number.isInteger(anchor.line)) {
            void window.showWarningMessage('Clarion: this attribute link has no position. Hover the control again.');
            return false;
        }
        const uri = Uri.parse(anchor.uri);
        const editor = window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
        const document = editor?.document ?? await workspace.openTextDocument(uri);
        const plan = planAttributeEdit(payload, anchor.line, n => n < document.lineCount ? document.lineAt(n).text : undefined);
        if ('refused' in plan) {
            void window.showWarningMessage(plan.refused === 'changed'
                ? 'Clarion: the declaration has changed since the card was shown. Hover the control again.'
                : 'Clarion: the attribute link could not be read.');
            return false;
        }
        const ranges = plan.edits.map(e => ({ range: new Range(e.startLine, e.startCharacter, e.endLine, e.endCharacter), text: e.text }));
        if (plan.edits[0].snippet) {
            // #743: a value attribute goes in as a snippet, the cursor on its first placeholder.
            // The card stays closed while the value is typed.
            const target = editor ?? await window.showTextDocument(document);
            await commands.executeCommand('editor.action.hideHover');
            return target.insertSnippet(new SnippetString(ranges[0].text), ranges[0].range, { undoStopBefore: true, undoStopAfter: true });
        }
        let applied: boolean;
        if (editor) {
            applied = await editor.edit(b => { for (const r of ranges) b.replace(r.range, r.text); }, { undoStopBefore: true, undoStopAfter: true });
        } else {
            const edit = new WorkspaceEdit();
            for (const r of ranges) edit.replace(uri, r.range, r.text);
            applied = await workspace.applyEdit(edit);
        }
        if (applied && editor) {
            // The card is for the keyword under the cursor; the edits are all after it on its
            // line, so its position still holds.
            const at = new Position(anchor.line, anchor.character);
            editor.selection = new Selection(at, at);
            // While a hover is visible, showHover only focuses it and keeps the old card (#742):
            // close it first, so the card is asked for again and shows the new lists.
            await commands.executeCommand('editor.action.hideHover');
            await commands.executeCommand('editor.action.showHover');
        }
        return applied;
    }));
}
