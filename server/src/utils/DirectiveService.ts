import * as directivesData from '../data/clarion-directives.json';

export interface DirectiveEntry {
    name: string;
    syntax: string;
    description: string;
    category: string;
}

interface DirectivesData {
    directives: DirectiveEntry[];
}

export class DirectiveService {
    private static instance: DirectiveService;
    private directives: Map<string, DirectiveEntry> = new Map();

    private constructor() {
        this.load();
    }

    public static getInstance(): DirectiveService {
        if (!DirectiveService.instance) {
            DirectiveService.instance = new DirectiveService();
        }
        return DirectiveService.instance;
    }

    private load(): void {
        const data: DirectivesData = directivesData as unknown as DirectivesData;
        for (const entry of data.directives) {
            this.directives.set(entry.name.toUpperCase(), entry);
        }
    }

    public isDirective(word: string): boolean {
        return this.directives.has(word.toUpperCase());
    }

    public getDirective(word: string): DirectiveEntry | undefined {
        return this.directives.get(word.toUpperCase());
    }

    public getAllByPrefix(prefix: string): DirectiveEntry[] {
        const upper = prefix.toUpperCase();
        return [...this.directives.values()].filter(e => e.name.toUpperCase().startsWith(upper));
    }
}
