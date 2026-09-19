import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { Token, TokenType } from '../ClarionTokenizer';
import { TokenCache } from '../TokenCache';
import { TokenHelper } from './TokenHelper';
import { ChainedPropertyResolver } from './ChainedPropertyResolver';
import { SymbolFinderService } from '../services/SymbolFinderService';
import { StructureDeclarationIndexer } from './StructureDeclarationIndexer';
import { pathToCanonicalUri } from './UriUtils';

/** Where a CLASS is declared: the target of a bare SELF or PARENT (#606). */
export interface ClassDeclarationSite {
    className: string;
    /** Canonical file URI of the declaration. */
    uri: string;
    /** 0-based line of the CLASS declaration. */
    line: number;
    parentName?: string;
    isType: boolean;
}

/**
 * Resolves a bare SELF or PARENT - not SELF.member - to the CLASS it stands for.
 * SELF is the class whose method is being implemented; PARENT is that class's parent.
 */
export class SelfParentClassResolver {
    private tokenCache = TokenCache.getInstance();
    private chainedResolver = new ChainedPropertyResolver();
    private sdi = StructureDeclarationIndexer.getInstance();
    constructor(private symbolFinder: SymbolFinderService) {}

    /**
     * 'SELF' or 'PARENT' when the cursor is on that keyword as a word of its own;
     * null otherwise, including for a member spelled like one (`Stuff.Parent`).
     */
    static keywordAt(line: string, character: number): 'SELF' | 'PARENT' | null {
        let start = character;
        while (start > 0 && /[\w:]/.test(line[start - 1])) start--;
        let end = character;
        while (end < line.length && /[\w:]/.test(line[end])) end++;
        const word = line.substring(start, end).toUpperCase();
        if (word !== 'SELF' && word !== 'PARENT') return null;
        if (line.substring(0, start).trimEnd().endsWith('.')) return null;
        return word;
    }

    async resolve(keyword: 'SELF' | 'PARENT', document: TextDocument, position: Position): Promise<ClassDeclarationSite | null> {
        const tokens = this.tokenCache.getTokens(document);
        const className = this.chainedResolver.resolveCurrentClassName(document, position, tokens);
        if (!className) return null;

        const self = await this.locate(className, document, tokens, position.line);
        if (keyword === 'SELF') return self;

        if (!self?.parentName) return null;
        return this.locate(self.parentName, document, tokens, position.line);
    }

    /**
     * The CLASS declaration labelled `className`: in this document the nearest one
     * above `atLine` (a generated module can declare the same local class label in
     * several procedures), otherwise the structure index.
     */
    private async locate(className: string, document: TextDocument, tokens: Token[], atLine: number): Promise<ClassDeclarationSite | null> {
        const wanted = className.toLowerCase();
        const lines = document.getText().split(/\r?\n/);
        let best: Token | null = null;
        for (const classToken of TokenHelper.findClassStructures(tokens)) {
            const label = tokens.find(t =>
                t.type === TokenType.Label && t.line === classToken.line && t.value.toLowerCase() === wanted);
            if (!label) continue;
            if (!best || (label.line <= atLine && (best.line > atLine || label.line > best.line))) best = label;
        }
        if (best) {
            const text = lines[best.line] ?? '';
            const parent = text.match(/\bCLASS\s*\(\s*([A-Za-z_][\w:]*)\s*\)/i);
            return {
                className: best.value,
                uri: document.uri,
                line: best.line,
                parentName: parent?.[1],
                isType: /,\s*TYPE\b/i.test(text),
            };
        }

        // A built index answers at once, in the file's redirection order (#571) - the same
        // tier PARENT.member uses. Walking a loose file's INCLUDE chain cost about a second
        // per class on ABBROWSE.CLW, so that walk is only the fallback with no index yet.
        const indexed = this.sdi.findFor(className, document.uri).find(d => d.structureType === 'CLASS');
        if (indexed) {
            return {
                className: indexed.name,
                uri: pathToCanonicalUri(indexed.filePath),
                line: indexed.line,
                parentName: indexed.parentName,
                isType: indexed.isType,
            };
        }

        const info = await this.symbolFinder.findIndexedTypeDeclaration(className, document);
        if (!info || info.structureType !== 'CLASS') return null;
        return {
            className: info.name,
            uri: pathToCanonicalUri(info.filePath),
            line: info.line,
            parentName: info.parentName,
            isType: info.isType,
        };
    }
}
