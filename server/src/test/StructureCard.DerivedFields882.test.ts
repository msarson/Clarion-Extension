/**
 * #882 — a QUEUE or GROUP declared with a parent, `ExtQ QUEUE(BaseQ)`, inherits the
 * parent's fields ahead of its own (Language Reference, QUEUE: "the QUEUE inherits the
 * fields of the named group"; the parent may be a GROUP, QUEUE or RECORD, TYPE or not).
 * The structure card counted only the fields written inside the structure, so a QUEUE
 * that adds one field to a three-field parent was "1 field".
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { SolutionManager } from '../solution/solutionManager';
import { StructureDeclarationIndexer } from '../utils/StructureDeclarationIndexer';

function hoverText(h: unknown): string {
    const c = (h as { contents: unknown } | null)?.contents;
    return typeof c === 'string' ? c : ((c as { value?: string })?.value ?? '');
}

async function hoverIn(doc: TextDocument, line: number, character: number): Promise<string> {
    const provider = new HoverProvider();
    const tokenCache = TokenCache.getInstance();
    tokenCache.clearAllTokens();
    tokenCache.getTokens(doc);
    const hover = await provider.provideHover(doc, Position.create(line, character));
    assert.ok(hover, `expected a hover at ${line}:${character}`);
    return hoverText(hover);
}

suite('Structure card counts inherited fields (#882)', () => {
    const code = [
        '  PROGRAM',                                  // 0
        '  MAP',                                      // 1
        '  END',                                      // 2
        'BaseQ                QUEUE,TYPE',            // 3
        'Id                     LONG',                // 4
        'Name                   STRING(40)',          // 5
        'Amount                 DECIMAL(9,2)',        // 6
        '                     END',                   // 7
        'ExtQ                 QUEUE(BaseQ)',          // 8
        'Extra                  LONG',                // 9
        '                     END',                   // 10
        'MoreQ                QUEUE(ExtQ),PRE(MQ)',   // 11
        'Flag                   BYTE',                // 12
        'Note                   STRING(20)',          // 13
        '                     END',                   // 14
        'Head                 GROUP,TYPE',            // 15
        'Kind                   STRING(5)',           // 16
        'Stamp                  LONG',                // 17
        '                     END',                   // 18
        'Rec                  GROUP(Head)',           // 19
        'Body                   STRING(100)',         // 20
        '                     END',                   // 21
        'LostQ                QUEUE(NoSuchQ)',        // 22
        'Only                   LONG',                // 23
        '                     END',                   // 24
        'PlainQ               QUEUE',                 // 25
        'A                      LONG',                // 26
        'B                      LONG',                // 27
        '                     END',                   // 28
        '  CODE',                                     // 29
        '  FREE(ExtQ)',                               // 30
        '  FREE(MoreQ)',                              // 31
        '  CLEAR(Rec)',                               // 32
        '  FREE(LostQ)',                              // 33
        '  FREE(PlainQ)',                             // 34
    ].join('\n');
    const doc = () => TextDocument.create('test://derived-fields-882.clw', 'clarion', 1, code);

    test('a QUEUE(parent) counts the parent\'s fields ahead of its own', async () => {
        const text = await hoverIn(doc(), 30, 8); // FREE(ExtQ)
        assert.ok(/\b4 fields\b/.test(text), `3 from BaseQ + Extra = 4; got: ${text}`);
        assert.ok(/3 from `?BaseQ`?/.test(text), `names where the inherited fields come from; got: ${text}`);
        assert.ok(!/\b1 field\b/.test(text), `not only its own field; got: ${text}`);
    });

    test('derivation chains: QUEUE(ExtQ) counts ExtQ\'s inherited fields too', async () => {
        const text = await hoverIn(doc(), 31, 8); // FREE(MoreQ)
        assert.ok(/\b6 fields\b/.test(text), `4 from ExtQ (3 of them BaseQ's) + 2 = 6; got: ${text}`);
        assert.ok(/4 from `?ExtQ`?/.test(text), `got: ${text}`);
        assert.ok(text.includes('PRE(MQ)'), `other facts kept; got: ${text}`);
    });

    test('a GROUP(parent) counts its parent\'s fields', async () => {
        const text = await hoverIn(doc(), 32, 9); // CLEAR(Rec)
        assert.ok(/\b3 fields\b/.test(text), `2 from Head + Body = 3; got: ${text}`);
        assert.ok(/2 from `?Head`?/.test(text), `got: ${text}`);
    });

    test('an unresolved parent keeps the own count and says the parent\'s fields are not counted', async () => {
        const text = await hoverIn(doc(), 33, 8); // FREE(LostQ)
        const facts = text.split('\n').find(l => l.startsWith('🗂️')) ?? '';
        assert.ok(/\b1 field\b/.test(facts), `own field only; got: ${facts}`);
        assert.ok(/NoSuchQ/.test(facts), `the facts line names the parent it could not read; got: ${facts}`);
    });

    test('control: a QUEUE with no parent is unchanged', async () => {
        const text = await hoverIn(doc(), 34, 8); // FREE(PlainQ)
        assert.ok(/\b2 fields\b/.test(text), `got: ${text}`);
        assert.ok(!/ from /.test(text.split('\n').find(l => /fields/.test(l)) ?? ''), `no inherited note; got: ${text}`);
    });

    suite('parent in an INCLUDEd file', () => {
        let dir: string;
        let savedSm: unknown;
        setup(() => {
            // No solution and no index left over from another suite: the file is loose, so
            // the parent is found through its own INCLUDE chain.
            savedSm = (SolutionManager as unknown as { instance: unknown }).instance;
            (SolutionManager as unknown as { instance: unknown }).instance = null;
            StructureDeclarationIndexer.getInstance().clearCache();
            dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ce882-'));
            fs.writeFileSync(path.join(dir, 'types.inc'), [
                'BaseQ                QUEUE,TYPE',
                'Id                     LONG',
                'Name                   STRING(40)',
                '                     END',
            ].join('\r\n'));
        });
        teardown(() => {
            fs.rmSync(dir, { recursive: true, force: true });
            (SolutionManager as unknown as { instance: unknown }).instance = savedSm;
            StructureDeclarationIndexer.getInstance().clearCache();
        });

        test('the parent is read from the include', async () => {
            const mainPath = path.join(dir, 'main.clw');
            const src = [
                '  PROGRAM',                              // 0
                "  INCLUDE('types.inc'),ONCE",            // 1
                '  MAP',                                  // 2
                '  END',                                  // 3
                'ExtQ                 QUEUE(BaseQ)',      // 4
                'Extra                  LONG',            // 5
                '                     END',               // 6
                '  CODE',                                 // 7
                '  FREE(ExtQ)',                           // 8
            ].join('\r\n');
            fs.writeFileSync(mainPath, src);
            const uri = 'file:///' + mainPath.replace(/\\/g, '/');
            const text = await hoverIn(TextDocument.create(uri, 'clarion', 1, src), 8, 8);
            assert.ok(/\b3 fields\b/.test(text), `2 from the included BaseQ + Extra = 3; got: ${text}`);
            assert.ok(/2 from `?BaseQ`?/.test(text), `got: ${text}`);
        });
    });
});
