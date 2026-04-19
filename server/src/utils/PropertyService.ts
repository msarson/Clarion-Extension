import * as propertiesData from '../data/clarion-properties.json';

export interface PropEntry {
    name: string;
    description: string;
    readOnly: boolean;
}

interface PropertiesData {
    properties: PropEntry[];
}

export class PropertyService {
    private static instance: PropertyService;
    private properties: Map<string, PropEntry> = new Map();

    private constructor() {
        this.load();
    }

    public static getInstance(): PropertyService {
        if (!PropertyService.instance) {
            PropertyService.instance = new PropertyService();
        }
        return PropertyService.instance;
    }

    private load(): void {
        const data: PropertiesData = propertiesData as unknown as PropertiesData;
        for (const entry of data.properties) {
            this.properties.set(entry.name.toUpperCase(), entry);
        }
    }

    /** Returns all entries whose name starts with the given prefix (case-insensitive). */
    public getAllByPrefix(prefix: string): PropEntry[] {
        const upper = prefix.toUpperCase();
        return [...this.properties.values()].filter(e => e.name.toUpperCase().startsWith(upper));
    }

    /** Returns true if the word (case-insensitive) matches a known PROP: equate. */
    public isPropEquate(word: string): boolean {
        return this.properties.has(word.toUpperCase());
    }

    /** Returns the entry for the given PROP: equate, or undefined if not found. */
    public getPropEntry(word: string): PropEntry | undefined {
        return this.properties.get(word.toUpperCase());
    }
}
