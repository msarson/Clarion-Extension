/**
 * #322 — module-callout procedures (the ABC pattern Mark's app uses throughout):
 * one INC holds `MODULE('impl.clw')` + the prototype, and EVERY module that
 * calls the procedure INCLUDEs that INC into its own MAP. Visibility is
 * textual inclusion: every including module can call it.
 *
 * Verified against the real app (AppendText_SQLInstallAndUpgrade):
 *  - FAR from the IMPLEMENTATION label returned 2 refs (own label + INC
 *    prototype) — ALL ~120 call sites across consumer modules missed. The
 *    symbol resolves to the INC's MODULE declaration with scope='module',
 *    and getFilesToSearch's module-PROCEDURE branch searched only
 *    declaring-file + MODULE targets.
 *  - FAR from a CALL site found everything but DUPLICATED the current
 *    document's hits as case-variant URIs (CloneScript.clw:196 AND
 *    clonescript.clw:196).
 *
 * Fix under test: (1) the module-PROCEDURE candidate set expands through the
 * FileRelationshipGraph's reverse INCLUDE edges — every file whose MAP
 * includes the declaring INC; (2) results dedup by normalized path at the
 * provider's single exit.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { FileRelationshipGraph } from '../FileRelationshipGraph';
import { ReferenceCountIndex } from '../services/ReferenceCountIndex';
import { ReferencesProvider } from '../providers/ReferencesProvider';

suite('ModuleCallout FAR #322', () => {

    let dir: string;
    const docs = new Map<string, TextDocument>();

    const filesMap: { [rel: string]: string } = {
        'prog.clw': [
            '  PROGRAM',
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\r\n'),
        'callout.inc': [
            "  MODULE('implmod.clw')",
            'AppendIt PROCEDURE(STRING txt)',
            '  END',
        ].join('\r\n'),
        'implmod.clw': [
            "  MEMBER('prog.clw')",                          // 0
            '  MAP',                                          // 1
            "    INCLUDE('callout.inc'),ONCE",                // 2
            '  END',                                          // 3
            'AppendIt PROCEDURE(STRING txt)',                 // 4 — implementation
            '  CODE',                                         // 5
            '  RETURN',                                       // 6
        ].join('\r\n'),
        'consumer.clw': [
            "  MEMBER('prog.clw')",                          // 0
            '  MAP',                                          // 1
            "    INCLUDE('callout.inc'),ONCE",                // 2
            '  END',                                          // 3
            'Caller PROCEDURE()',                             // 4
            '  CODE',                                         // 5
            "  AppendIt('one')",                              // 6 — call site
            "  AppendIt('two')",                              // 7 — call site
            '  RETURN',                                       // 8
        ].join('\r\n'),
        // Same-named procedure in a module that does NOT include the INC —
        // its own MAP declaration, own implementation, own call. Must never
        // appear in the callout procedure's results (bidirectional pin).
        'outsider.clw': [
            "  MEMBER('prog.clw')",                          // 0
            '  MAP',                                          // 1
            '    AppendIt PROCEDURE(STRING txt)',             // 2 — unrelated same-name decl
            '  END',                                          // 3
            'Other PROCEDURE()',                              // 4
            '  CODE',                                         // 5
            "  AppendIt('mine')",                             // 6 — unrelated call
            '  RETURN',                                       // 7
            'AppendIt PROCEDURE(STRING txt)',                 // 8 — unrelated impl
            '  CODE',                                         // 9
            '  RETURN',                                       // 10
        ].join('\r\n'),
    };

    setup(async () => {
        setServerInitialized(true);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'callout322_'));
        const paths: string[] = [];
        docs.clear();
        const tc = TokenCache.getInstance();
        tc.clearAllTokens();
        for (const [rel, content] of Object.entries(filesMap)) {
            const p = path.join(dir, rel);
            fs.writeFileSync(p, content);
            paths.push(p);
            const doc = TextDocument.create(`file:///${p.replace(/\\/g, '/')}`, 'clarion', 1, content);
            tc.getTokens(doc);
            docs.set(rel, doc);
        }
        FileRelationshipGraph.getInstance().reset();
        await FileRelationshipGraph.getInstance().buildInBackground(paths);
        ReferenceCountIndex.getInstance().reset();
        await ReferenceCountIndex.getInstance().buildInBackground(paths);
    });

    teardown(() => {
        FileRelationshipGraph.getInstance().reset();
        ReferenceCountIndex.getInstance().reset();
        TokenCache.getInstance().clearAllTokens();
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    function keyed(refs: { uri: string; range: { start: { line: number } } }[] | null | undefined): string[] {
        return (refs ?? []).map(r =>
            `${path.basename(decodeURIComponent(r.uri)).toLowerCase()}:${r.range.start.line}`);
    }

    test('FAR from the IMPLEMENTATION label reaches call sites in every including module', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('implmod.clw')!, { line: 4, character: 2 }, { includeDeclaration: true });

        const got = keyed(refs);
        assert.ok(got.includes('consumer.clw:6') && got.includes('consumer.clw:7'),
            `consumer call sites must be found; got [${got.join(', ')}]`);
        assert.ok(got.includes('implmod.clw:4'), 'implementation label included');
        assert.ok(!got.some(k => k.startsWith('outsider.clw')),
            `outsider's unrelated same-name procedure must be excluded; got [${got.join(', ')}]`);
    });

    test('FAR from a call site includes the implementation and the other consumers', async () => {
        const refs = await new ReferencesProvider().provideReferences(
            docs.get('consumer.clw')!, { line: 6, character: 4 }, { includeDeclaration: true });

        const got = keyed(refs);
        assert.ok(got.includes('consumer.clw:6') && got.includes('consumer.clw:7'),
            `both consumer call sites present; got [${got.join(', ')}]`);
        assert.ok(got.includes('implmod.clw:4'),
            `implementation reachable from a call site; got [${got.join(', ')}]`);
    });

    test('results contain no case-variant duplicate locations', async () => {
        // Model the real repro: the client's document URI casing differs from
        // the file-walk casing (CloneScript.clw:196 AND clonescript.clw:196).
        const rel = 'consumer.clw';
        const p = path.join(dir, rel);
        const upperUri = `file:///${p.replace(/\\/g, '/').replace(/consumer\.clw$/, 'CONSUMER.CLW')}`;
        const upperDoc = TextDocument.create(upperUri, 'clarion', 1, filesMap[rel]);
        TokenCache.getInstance().getTokens(upperDoc);

        const refs = await new ReferencesProvider().provideReferences(
            upperDoc, { line: 6, character: 4 }, { includeDeclaration: true });

        const norm = (refs ?? []).map(r =>
            `${decodeURIComponent(r.uri).toLowerCase()}:${r.range.start.line}:${r.range.start.character}`);
        const dupes = norm.filter((k, i) => norm.indexOf(k) !== i);
        assert.strictEqual(dupes.length, 0,
            `locations must be unique by normalized path; duplicates: [${[...new Set(dupes)].join(', ')}]`);
        assert.ok(norm.length > 0, 'sanity: results non-empty');
    });
});
