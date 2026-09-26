import * as crypto from 'crypto';

/**
 * #680 — a watched file (.sln, .cwproj, .red) counts as changed only when its CONTENT changed. A
 * file touched without being changed (a build step, git, a tool rewriting the same bytes) raises a
 * change event too, and each one reloaded the solution and announced "… updated". vscode-free.
 */
export class ContentChangeTracker {
    private readonly hashes = new Map<string, string>();

    constructor(private readonly read: (filePath: string) => string | null) {}

    /** Record the file's current content (when its watcher is created). */
    remember(filePath: string): void {
        const hash = this.hashOf(filePath);
        if (hash !== null) this.hashes.set(filePath.toLowerCase(), hash);
    }

    /**
     * True when the content differs from what was last recorded (and records the new content). A file
     * never recorded, or one that cannot be read, counts as changed: the watcher then does what it
     * always did.
     */
    changed(filePath: string): boolean {
        const key = filePath.toLowerCase();
        const hash = this.hashOf(filePath);
        if (hash === null) return true;
        const before = this.hashes.get(key);
        this.hashes.set(key, hash);
        return before !== hash;
    }

    private hashOf(filePath: string): string | null {
        const content = this.read(filePath);
        return content === null ? null : crypto.createHash('sha1').update(content).digest('hex');
    }
}
