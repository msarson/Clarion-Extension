import { DocumentLink } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import LoggerManager from '../logger';

function uriToFsPath(uri: string): string {
    let p = decodeURIComponent(uri.replace(/^file:\/\/\//, ''));
    return p.replace(/\//g, path.sep);
}

function fsPathToUri(fsPath: string): string {
    return 'file:///' + fsPath.replace(/\\/g, '/');
}

const logger = LoggerManager.getLogger("DocumentLinkProvider");
logger.setLevel("error");

// Matches the first single-quoted string on a line: 'filename.ext'
const QUOTED_FILE_RE = /'([^']+)'/;

export class DocumentLinkProvider {

    provideDocumentLinks(document: TextDocument): DocumentLink[] {
        const frg = FileRelationshipGraph.getInstance();
        if (!frg.isBuilt) return [];

        const filePath = uriToFsPath(document.uri);
        const edges = frg.getForwardEdges(filePath);
        if (edges.length === 0) return [];

        const lines = document.getText().split(/\r?\n/);
        const links: DocumentLink[] = [];

        for (const edge of edges) {
            if (edge.type === 'IMPLICIT_INCLUDE') continue;
            if (edge.fromLine === undefined) continue;

            const lineText = lines[edge.fromLine];
            if (!lineText) continue;

            const m = QUOTED_FILE_RE.exec(lineText);
            if (!m) continue;

            const charStart = m.index;
            const charEnd = charStart + m[0].length;

            links.push({
                range: {
                    start: { line: edge.fromLine, character: charStart },
                    end:   { line: edge.fromLine, character: charEnd   },
                },
                target: fsPathToUri(edge.toFile),
                tooltip: path.basename(edge.toFile),
            });
        }

        logger.info(`🔗 [DocumentLinkProvider] ${links.length} links for ${path.basename(filePath)}`);
        return links;
    }
}
