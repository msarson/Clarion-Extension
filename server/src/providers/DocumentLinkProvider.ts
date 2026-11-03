import { DocumentLink } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
import { FileRelationshipGraph, FileEdge } from '../FileRelationshipGraph';
import { pathToCanonicalUri } from '../utils/UriUtils';
import * as fs from 'fs';
import { TokenCache } from '../TokenCache';
import { resolveViaProjectRedirection } from '../utils/RedirectionResolution';
import LoggerManager from '../logger';

function uriToFsPath(uri: string): string {
    let p = decodeURIComponent(uri.replace(/^file:\/\/\//, ''));
    return p.replace(/\//g, path.sep);
}

function fsPathToUri(fsPath: string): string {
    return pathToCanonicalUri(fsPath); // #251: canonical form (client-facing links)
}

const logger = LoggerManager.getLogger("DocumentLinkProvider");
logger.setLevel("error");

// Matches EVERY single-quoted string on a line: 'filename.ext'
const QUOTED_FILE_RE = /'([^']+)'/g;

export class DocumentLinkProvider {

    provideDocumentLinks(document: TextDocument): DocumentLink[] {
        // #807: an INCLUDE in a COMPILE/OMIT block that does not compile has no graph edge (nothing
        // follows it), but its file name is still a link.
        const inactive = this.inactiveIncludeLinks(document);
        const frg = FileRelationshipGraph.getInstance();
        frg.ensureNoSolutionGraphForDocument(document);
        if (!frg.isBuilt) return inactive;

        const filePath = uriToFsPath(document.uri);
        const edges = frg.getForwardEdges(filePath)
            .filter(e => e.type !== 'IMPLICIT_INCLUDE' && e.fromLine !== undefined);
        if (edges.length === 0) return inactive;

        // Group edges by the line that produced them. A single line can carry more than
        // one file reference (#198: `CLASS,TYPE,MODULE('X.clw'),LINK('X.clw')`), so we
        // underline EVERY quoted filename on the line that matches an edge target on that
        // same line — not just the first quote. Matching by basename keeps non-file quoted
        // args (e.g. an INCLUDE section name) from being linked.
        const edgesByLine = new Map<number, FileEdge[]>();
        for (const e of edges) {
            const arr = edgesByLine.get(e.fromLine!);
            if (arr) arr.push(e); else edgesByLine.set(e.fromLine!, [e]);
        }

        const lines = document.getText().split(/\r?\n/);
        const links: DocumentLink[] = [];

        for (const [lineNum, lineEdges] of edgesByLine) {
            const lineText = lines[lineNum];
            if (!lineText) continue;

            QUOTED_FILE_RE.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = QUOTED_FILE_RE.exec(lineText)) !== null) {
                const quotedBase = path.basename(m[1].replace(/\\/g, '/')).toLowerCase();
                const edge = lineEdges.find(e => path.basename(e.toFile).toLowerCase() === quotedBase);
                if (!edge) continue;

                const charStart = m.index;
                const charEnd = charStart + m[0].length;
                links.push({
                    range: {
                        start: { line: lineNum, character: charStart },
                        end:   { line: lineNum, character: charEnd   },
                    },
                    target: fsPathToUri(edge.toFile),
                    tooltip: path.basename(edge.toFile),
                });
            }
        }

        logger.info(`🔗 [DocumentLinkProvider] ${links.length} links for ${path.basename(filePath)}`);
        return [...links, ...inactive];
    }

    /** The file name of each INCLUDE that is not followed (#807), resolved as the walkers would. */
    private inactiveIncludeLinks(document: TextDocument): DocumentLink[] {
        const tokens = TokenCache.getInstance().getTokens(document).filter(t => t.inactiveByCondition && t.inactiveFile);
        if (tokens.length === 0) return [];
        const fromPath = uriToFsPath(document.uri);
        const lines = document.getText().split(/\r?\n/);
        const links: DocumentLink[] = [];
        for (const t of tokens) {
            const name = t.inactiveFile!;
            let target: string | null = null;
            try { target = resolveViaProjectRedirection(name, fromPath); } catch { target = null; }
            if (!target) {
                const beside = path.join(path.dirname(fromPath), name);
                if (fs.existsSync(beside)) target = beside;
            }
            if (!target) continue;
            const lineText = lines[t.line] ?? '';
            const at = lineText.toLowerCase().indexOf(`'${name.toLowerCase()}'`, t.start);
            if (at < 0) continue;
            links.push({
                range: { start: { line: t.line, character: at }, end: { line: t.line, character: at + name.length + 2 } },
                target: fsPathToUri(target),
                tooltip: path.basename(target),
            });
        }
        return links;
    }
}
