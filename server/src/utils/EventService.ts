import * as eventsData from '../data/clarion-events.json';

export interface EventEntry {
    name: string;
    description: string;
    category: string;
}

interface EventsData {
    events: EventEntry[];
}

export class EventService {
    private static instance: EventService;
    private events: Map<string, EventEntry> = new Map();

    private constructor() {
        this.load();
    }

    public static getInstance(): EventService {
        if (!EventService.instance) {
            EventService.instance = new EventService();
        }
        return EventService.instance;
    }

    private load(): void {
        const data: EventsData = eventsData as unknown as EventsData;
        for (const entry of data.events) {
            this.events.set(entry.name.toUpperCase(), entry);
        }
    }

    /** Returns all entries whose name starts with the given prefix (case-insensitive). */
    public getAllByPrefix(prefix: string): EventEntry[] {
        const upper = prefix.toUpperCase();
        return [...this.events.values()].filter(e => e.name.toUpperCase().startsWith(upper));
    }

    /** Returns true if the word (case-insensitive) matches a known EVENT: equate. */
    public isEventEquate(word: string): boolean {
        return this.events.has(word.toUpperCase());
    }

    /** Returns the entry for the given EVENT: equate, or undefined if not found. */
    public getEventEntry(word: string): EventEntry | undefined {
        return this.events.get(word.toUpperCase());
    }
}
