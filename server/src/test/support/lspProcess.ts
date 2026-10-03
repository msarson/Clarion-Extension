import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';

/**
 * #715 — the compiled server over stdio, for tests that need the real request/notification
 * ordering (debounce, yields, the diagnostics status sequence) rather than a provider in-process.
 * A minimal LSP client: Content-Length framing, requests, notifications, and a log of every
 * notification the server sends, in arrival order.
 */
export interface ServerMessage { method: string; params: any; at: number }

export class LspProcess {
    readonly notifications: ServerMessage[] = [];
    private readonly child: ChildProcess;
    private buf = Buffer.alloc(0);
    private seq = 0;
    private readonly pending = new Map<number, (m: any) => void>();
    private readonly waiters: Array<{ method: string; test: (p: any) => boolean; resolve: (p: any) => void }> = [];

    constructor() {
        // out/server/src/test/support -> out/server/src/server.js
        const server = path.join(__dirname, '..', '..', 'server.js');
        this.child = spawn(process.execPath, [server, '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
        this.child.stderr!.on('data', () => { /* the server logs here */ });
        this.child.stdout!.on('data', (chunk: Buffer) => this.receive(chunk));
    }

    private receive(chunk: Buffer): void {
        this.buf = Buffer.concat([this.buf, chunk]);
        for (;;) {
            const head = this.buf.indexOf('\r\n\r\n');
            if (head < 0) return;
            const len = Number(/Content-Length: (\d+)/i.exec(this.buf.slice(0, head).toString())?.[1]);
            if (this.buf.length < head + 4 + len) return;
            const msg = JSON.parse(this.buf.slice(head + 4, head + 4 + len).toString('utf8'));
            this.buf = this.buf.slice(head + 4 + len);
            if (msg.id !== undefined && msg.method === undefined) {
                const p = this.pending.get(msg.id); this.pending.delete(msg.id); p?.(msg);
            } else if (msg.id !== undefined) {
                // server -> client request: configuration gets defaults, everything else null
                this.send({ id: msg.id, result: msg.method === 'workspace/configuration' ? (msg.params.items || []).map(() => null) : null });
            } else {
                this.notifications.push({ method: msg.method, params: msg.params, at: Date.now() });
                for (let i = this.waiters.length - 1; i >= 0; i--) {
                    const w = this.waiters[i];
                    if (w.method === msg.method && w.test(msg.params)) { this.waiters.splice(i, 1); w.resolve(msg.params); }
                }
            }
        }
    }

    private send(msg: object): void {
        const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }), 'utf8');
        this.child.stdin!.write(`Content-Length: ${body.length}\r\n\r\n`);
        this.child.stdin!.write(body);
    }

    request(method: string, params: unknown): Promise<any> {
        return new Promise(resolve => { const id = ++this.seq; this.pending.set(id, resolve); this.send({ id, method, params }); });
    }

    notify(method: string, params: unknown): void { this.send({ method, params }); }

    waitFor(method: string, test: (p: any) => boolean = () => true, timeoutMs = 60000): Promise<any> {
        const seen = this.notifications.find(n => n.method === method && test(n.params));
        if (seen) return Promise.resolve(seen.params);
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), timeoutMs);
            this.waiters.push({ method, test, resolve: p => { clearTimeout(t); resolve(p); } });
        });
    }

    async stop(): Promise<void> {
        await Promise.race([this.request('shutdown', null), new Promise(r => setTimeout(r, 5000))]);
        this.notify('exit', null);
        await new Promise(r => setTimeout(r, 300));
        this.child.kill();
    }
}

export const toUri = (p: string): string => 'file:///' + p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d: string) => d.toLowerCase() + '%3A');
