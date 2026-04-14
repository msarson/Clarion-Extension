/**
 * FAR regression tests using the real kanban-far-test.clw file.
 *
 * Key scenario: KanbanProcess_Kanban is a local MAP procedure declared inside
 * the KanbanProcess_Kanban PROCEDURE scope. It appears in 3 places:
 *   line 26 (0-based: 25) — MAP declaration
 *   line 150 (0-based: 149) — call site inside ThisWindow.TakeEvent
 *   line 373 (0-based: 372) — procedure implementation
 *
 * FAR should return all 3 regardless of which position the cursor is on.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ReferencesProvider } from '../providers/ReferencesProvider';
import { setServerInitialized } from '../serverState';

// Resolved at runtime: out/server/src/test → repo root → test-programs
const CLW_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'test-programs', 'kanban-far-test.clw');

suite('KanbanFAR – local MAP procedure Find All References', function () {
    let provider: ReferencesProvider;
    let doc: TextDocument;

    suiteSetup(function () {
        if (!fs.existsSync(CLW_PATH)) {
            this.skip(); // file not present — skip gracefully
        }
        setServerInitialized(true);
        const content = fs.readFileSync(CLW_PATH, 'utf8');
        const uri = 'file:///' + CLW_PATH.replace(/\\/g, '/');
        doc = TextDocument.create(uri, 'clarion', 1, content);
        TokenCache.getInstance().clearAllTokens();
        TokenCache.getInstance().getTokens(doc);
        provider = new ReferencesProvider();
    });

    teardown(() => {
        // Keep cache between tests — all use the same document
    });

    /**
     * Convenience: run FAR and return 0-based line numbers, sorted.
     */
    async function farLines(line: number, character: number): Promise<number[]> {
        const refs = await provider.provideReferences(doc, { line, character }, { includeDeclaration: true });
        if (!refs) return [];
        return refs.map(r => r.range.start.line).sort((a, b) => a - b);
    }

    test('FAR from MAP declaration line (line 26) finds all 3 occurrences', async function () {
        this.timeout(10000);
        // Line 26 in 1-based = line 25 in 0-based; col 1 in 1-based = char 0 in 0-based
        const lines = await farLines(25, 0);
        assert.ok(lines.length >= 3,
            `Expected ≥3 results from declaration line, got ${lines.length}: [${lines.join(', ')}]`);
        assert.ok(lines.includes(25), `Should include declaration line 25, got [${lines.join(', ')}]`);
        assert.ok(lines.includes(149), `Should include call-site line 149, got [${lines.join(', ')}]`);
        assert.ok(lines.includes(372), `Should include implementation line 372, got [${lines.join(', ')}]`);
    });

    test('FAR from call site (line 150) finds all 3 occurrences', async function () {
        this.timeout(10000);
        // Line 150 in 1-based = line 149 in 0-based; col 5 in 1-based = char 4 in 0-based
        const lines = await farLines(149, 4);
        assert.ok(lines.length >= 3,
            `Expected ≥3 results from call site, got ${lines.length}: [${lines.join(', ')}]`);
        assert.ok(lines.includes(25), `Should include declaration line 25, got [${lines.join(', ')}]`);
        assert.ok(lines.includes(149), `Should include call-site line 149, got [${lines.join(', ')}]`);
        assert.ok(lines.includes(372), `Should include implementation line 372, got [${lines.join(', ')}]`);
    });

    test('FAR from implementation line (line 373) finds all 3 occurrences', async function () {
        this.timeout(10000);
        // Line 373 in 1-based = line 372 in 0-based; col 1 = char 0
        const lines = await farLines(372, 0);
        assert.ok(lines.length >= 3,
            `Expected ≥3 results from implementation, got ${lines.length}: [${lines.join(', ')}]`);
        assert.ok(lines.includes(25), `Should include declaration line 25, got [${lines.join(', ')}]`);
        assert.ok(lines.includes(149), `Should include call-site line 149, got [${lines.join(', ')}]`);
        assert.ok(lines.includes(372), `Should include implementation line 372, got [${lines.join(', ')}]`);
    });
});
