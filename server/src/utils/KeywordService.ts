import * as keywordsData from '../data/clarion-keywords.json';

export interface KeywordEntry {
    name: string;
    syntax: string;
    description: string;
    category: string;
}

interface KeywordsData {
    keywords: KeywordEntry[];
}

/**
 * Lookup service for Clarion language keywords (control-flow,
 * program-structure, OOP, operators). Mirrors DirectiveService — same
 * entry shape, different domain. Singleton via getInstance().
 */
export class KeywordService {
    private static instance: KeywordService;
    private keywords: Map<string, KeywordEntry> = new Map();

    private constructor() {
        this.load();
    }

    public static getInstance(): KeywordService {
        if (!KeywordService.instance) {
            KeywordService.instance = new KeywordService();
        }
        return KeywordService.instance;
    }

    private load(): void {
        const data: KeywordsData = keywordsData as unknown as KeywordsData;
        for (const entry of data.keywords) {
            this.keywords.set(entry.name.toUpperCase(), entry);
        }
    }

    public isKeyword(word: string): boolean {
        return this.keywords.has(word.toUpperCase());
    }

    public getKeyword(word: string): KeywordEntry | undefined {
        return this.keywords.get(word.toUpperCase());
    }

    public getAllByPrefix(prefix: string): KeywordEntry[] {
        const upper = prefix.toUpperCase();
        return [...this.keywords.values()].filter(e => e.name.toUpperCase().startsWith(upper));
    }
}
