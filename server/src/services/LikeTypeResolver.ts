import * as fs from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { SymbolFinderService, SymbolInfo } from './SymbolFinderService';
import { Token } from '../ClarionTokenizer';
import { TokenHelper } from '../utils/TokenHelper';
import { getCrossFileEpoch } from '../utils/crossFileEpoch';
import { pathToCanonicalUri } from '../utils/UriUtils';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';
import { MemberLocatorService } from './MemberLocatorService';

/** `LIKE(name)` as written, and the definition it takes when that resolves. */
export interface LikeResolution {
    written: string;
    resolved?: string;
}

/** Label, LIKE and its argument, capturing where the argument starts. */
const LIKE_DECLARATION = /^([A-Za-z_][\w:]*)(\s+LIKE\s*\(\s*)([A-Za-z_][\w:]*)\s*\)/i;

/** The first type on a declaration line after its label, with its parenthesised arguments. */
const DECLARED_TYPE = /^[A-Za-z_][\w:]*\s+(&?[A-Za-z_][\w:]*)(\s*\([^()]*\))?/;

/** A chain longer than this is broken or cyclic; the compiler would have said so. */
const MAX_HOPS = 8;

/**
 * #656 — what a `LIKE(name)` declaration is. The new declaration takes the liked one's whole
 * definition (Language Reference > 3 - Variable Declarations > Special Data Types > LIKE), so a
 * chain is followed to the first declaration that is not itself LIKE; LIKE of a QUEUE or RECORD
 * is a GROUP and LIKE of a MEMO a STRING of the MEMO's size.
 *
 * Each hop names its declaration from the argument's own position (see `locate`). A generated
 * queue field `LOC:Flag LIKE(LOC:Flag)` copies the local of the same label, and the lookup never
 * answers with the declaration on the hop's own line.
 */
export class LikeTypeResolver {
    constructor(
        private readonly symbolFinder: SymbolFinderService,
        private readonly tokenCache: TokenCache,
        private readonly memberLocator: MemberLocatorService
    ) {}

    /** Resolutions by declaring file, version and line; cleared when any workspace file changes. */
    private memo = new Map<string, LikeResolution>();
    private memoEpoch = -1;

    /** Null when the declaration on `line` is not `Label LIKE(name)`. */
    async resolve(uri: string, line: number, document?: TextDocument): Promise<LikeResolution | null> {
        const start = document?.uri === uri ? document : this.load(uri);
        if (!start) return null;
        const first = LIKE_DECLARATION.exec(this.lineOf(start, line));
        if (!first) return null;

        const epoch = getCrossFileEpoch();
        if (epoch !== this.memoEpoch) {
            this.memo.clear();
            this.memoEpoch = epoch;
        }
        const key = `${uri.toLowerCase()}|${start.version}|${line}|${first[0]}`;
        const known = this.memo.get(key);
        if (known) return known;
        const resolution = await this.follow(start, line, `LIKE(${first[3]})`);
        this.memo.set(key, resolution);
        return resolution;
    }

    private async follow(start: TextDocument, line: number, written: string): Promise<LikeResolution> {
        let doc: TextDocument = start;

        const visited = new Set<string>();
        let at = line;
        for (let hop = 0; hop < MAX_HOPS; hop++) {
            visited.add(`${doc.uri.toLowerCase()}|${at}`);
            const like = LIKE_DECLARATION.exec(this.lineOf(doc, at));
            if (!like) {
                const resolved = LikeTypeResolver.definitionOf(this.lineOf(doc, at));
                return resolved ? { written, resolved } : { written };
            }
            const character = like[1].length + like[2].length + 1;
            const target = await this.locate(like[3], doc, at, character);
            if (!target || visited.has(`${target.uri.toLowerCase()}|${target.line}`)) return { written };
            const next: TextDocument | undefined = target.doc ?? (target.uri === doc.uri ? doc : this.load(target.uri));
            if (!next) return { written };
            doc = next;
            at = target.line;
        }
        return { written };
    }

    /**
     * The declaration `name` stands for at its place inside `LIKE(...)`, in Clarion's scope order
     * and within a fixed reach: this file (the procedure's data, the declaration on this line
     * excluded; the module's; a `PRE:Field`), its MEMBER parent (the program's global data and
     * `PRE:Field`s), then the structure index for a GROUP, QUEUE or CLASS declared anywhere.
     * That is where every generated LIKE points ("type derived from local data / field / global
     * data"). Anything else stays unresolved, and the card shows `LIKE(name)` alone.
     *
     * Not `findSymbol`: its later tiers walk the sibling MEMBER modules and the include chain,
     * tokenizing each file into the cache every validation pass scans. On the generated browse
     * queues a LIKE card took 30ms -> ~400ms that way, and one global it could not place 22-37s.
     */
    private async locate(name: string, doc: TextDocument, line: number, character: number): Promise<{ uri: string; line: number; doc?: TextDocument } | null> {
        const tokens = this.tokenCache.getTokens(doc);
        const scope = TokenHelper.getInnermostScopeAtLine(this.tokenCache.getStructure(doc), line);
        const here = (scope ? this.symbolFinder.findLocalVariable(name, tokens, scope, doc, undefined, line, character) : null)
            ?? this.symbolFinder.findModuleVariable(name, tokens, doc)
            ?? this.prefixedField(name, tokens, doc.uri);
        if (here) return { uri: here.location.uri, line: here.location.line, doc };

        const parent = await this.memberLocator.loadMemberParent(doc);
        if (parent) {
            const global = this.symbolFinder.findModuleVariable(name, parent.tokens, parent.doc)
                ?? this.prefixedField(name, parent.tokens, parent.doc.uri);
            if (global) return { uri: parent.doc.uri, line: global.location.line, doc: parent.doc };
        }

        const docPath = decodeURIComponent(doc.uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
        const declared = StructureDeclarationIndexer.getInstance().findFor(name, docPath)[0];
        return declared ? { uri: pathToCanonicalUri(declared.filePath), line: declared.line } : null;
    }

    private prefixedField(name: string, tokens: Token[], uri: string): SymbolInfo | null {
        const colon = name.indexOf(':');
        return colon > 0
            ? this.symbolFinder.findPrefixedFieldInTokens(name.substring(0, colon).toUpperCase(), name.substring(colon + 1), tokens, uri)
            : null;
    }

    /** The definition a LIKE takes from this declaration line, as the card shows it. */
    static definitionOf(lineText: string): string | undefined {
        const m = DECLARED_TYPE.exec(lineText);
        if (!m) return undefined;
        const keyword = m[1].toUpperCase();
        const args = (m[2] ?? '').trim();
        if (keyword === 'GROUP' || keyword === 'QUEUE' || keyword === 'RECORD') return 'GROUP';
        if (keyword === 'MEMO') return `STRING${args}`;
        return `${m[1]}${args}`;
    }

    private lineOf(doc: TextDocument, line: number): string {
        return doc.getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } }).replace(/\r?\n$/, '');
    }

    /**
     * The text of a hop's file, for reading its declaration line. Not tokenized here: the last
     * hop needs one line, and a further hop's `findSymbol` tokenizes through the cache itself
     * (a generated program file is large; tokenizing it on every hover cost ~180ms warm).
     */
    private load(uri: string): TextDocument | undefined {
        const text = this.tokenCache.getDocumentTextByUriCaseInsensitive(uri);
        if (text !== undefined && text !== null) return TextDocument.create(uri, 'clarion', 1, text);
        try {
            const fsPath = decodeURIComponent(uri.replace(/^file:\/\/\//i, '')).replace(/\//g, '\\');
            return TextDocument.create(uri, 'clarion', 1, fs.readFileSync(fsPath, 'utf8'));
        } catch {
            return undefined;
        }
    }
}
