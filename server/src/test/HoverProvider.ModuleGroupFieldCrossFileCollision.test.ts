import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * Real repro: a module/global-scope `GROUP,TYPE` field
 * declared with no PRE() — e.g.
 *
 *   SomeErrorGroupType GROUP,TYPE
 *   error                 STRING(256), NAME('error')
 *   description           STRING(256), NAME('description')
 *                       END
 *
 * Hovering `error`'s OWN declaration line showed an unrelated same-named field
 * from a COMPLETELY DIFFERENT `GROUP,TYPE` reachable via the file's INCLUDE
 * chain, several includes away — wrong type, wrong line, wrong file.
 *
 * Root cause: the same-file lookup (SymbolFinderService.findGlobalVariableInCurrentFile)
 * correctly excludes a structure field from a BARE-name match (fields need their
 * PRE()/dot qualifier — `t.parent === undefined` guard) and returns null, so
 * resolution falls through to VariableHoverResolver.findGlobalVariableHover's
 * cross-file INCLUDE-chain walk (MemberLocatorService.findVariableTokenInParentChain).
 * That walk's candidate predicate, `isVariableLookupCandidate`, had NO equivalent
 * `t.parent` exclusion — so it matched the first same-named field in ANY
 * unrelated structure reachable via the chain, instead of reporting "not a bare
 * global" the way the same-file check does.
 *
 * Fix: `isVariableLookupCandidate` now rejects any token with `t.parent` set,
 * mirroring the same-file guard. A second, related gap this surfaces: with the
 * wrong cross-file match now correctly rejected, hovering the field's own
 * declaration returned NOTHING (no `currentScope` exists for module-scope data,
 * so `findLocalVariable`'s "exact token under cursor" fast path — the local-
 * procedure-GROUP equivalent of this fix — never runs). Added
 * `VariableHoverResolver.findStructureFieldDeclarationHover`, wired into
 * `HoverProvider`'s no-scope branch, so the declaration line resolves to
 * itself via `SymbolFinderService.findStructureField` (a line-anchored lookup,
 * immune to name collisions elsewhere).
 */

let tmpDir: string;

function makeDoc(filename: string, content: string): TextDocument {
    const uri = `file:///${path.join(tmpDir, filename).replace(/\\/g, '/')}`;
    return TextDocument.create(uri, 'clarion', 1, content);
}

function cursorOn(source: string, needle: string, occurrence = 1): Position {
    const lines = source.split(/\r?\n/);
    let seen = 0;
    for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].indexOf(needle);
        if (idx !== -1) {
            seen++;
            if (seen === occurrence) return { line: i, character: idx };
        }
    }
    throw new Error(`cursorOn: '${needle}' occurrence ${occurrence} not found`);
}

function hoverText(hover: any): string {
    if (!hover) return '';
    return typeof hover.contents === 'string' ? hover.contents : hover.contents.value ?? '';
}

suite('HoverProvider — module-scope GROUP,TYPE field declaration vs. cross-file name collision', () => {
    const tokenCache = TokenCache.getInstance();

    suiteSetup(() => {
        setServerInitialized(true);
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'group_field_xfile_'));

        // Unrelated GROUP,TYPE in a totally different include, reachable via the
        // host file's own INCLUDE chain.
        fs.writeFileSync(path.join(tmpDir, 'Other.inc'), [
            'OtherGroupType  GROUP, TYPE',
            'Error             LONG',
            '                END',
        ].join('\n'));
    });

    suiteTeardown(() => {
        tokenCache.clearAllTokens();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    const HOST_CONTENT = [
        "INCLUDE('Other.inc'), ONCE",
        '',
        'OwnGroupType  GROUP,TYPE',
        "error           STRING(256), NAME('error')",
        "description     STRING(256), NAME('description')",
        '              END',
    ].join('\n');

    test('hovering the field\'s own declaration shows ITS OWN group/type, not the cross-file same-named field', async () => {
        const doc = makeDoc('Host.inc', HOST_CONTENT);
        const provider = new HoverProvider();

        const pos = cursorOn(HOST_CONTENT, 'error');
        const hover = await provider.provideHover(doc, pos);
        const text = hoverText(hover);

        assert.ok(text.length > 0, 'Expected a hover, got none');
        assert.ok(text.includes('STRING'),
            `Should show the field's own STRING(256) type, not the cross-file LONG; got:\n${text}`);
        assert.ok(!text.includes('OtherGroupType'),
            `Must not resolve to the unrelated cross-file OtherGroupType; got:\n${text}`);
        assert.ok(text.includes('OwnGroupType'),
            `Should note it belongs to its own OwnGroupType; got:\n${text}`);
        assert.ok(text.includes('Host.inc:4') || /Host\.inc.*[:#]4\b/.test(text),
            `Should cite its own declaration line (4, 1-based); got:\n${text}`);
    });

    test('hovering a field with no name collision anywhere still resolves to itself (not nothing)', async () => {
        const doc = makeDoc('Host.inc', HOST_CONTENT);
        const provider = new HoverProvider();

        const pos = cursorOn(HOST_CONTENT, 'description');
        const hover = await provider.provideHover(doc, pos);
        const text = hoverText(hover);

        assert.ok(text.length > 0, 'Expected a hover for the non-colliding field, got none');
        assert.ok(text.includes('STRING'), `Should resolve the field's own STRING type; got:\n${text}`);
        assert.ok(text.includes('OwnGroupType'), `Should note it belongs to OwnGroupType; got:\n${text}`);
    });
});
