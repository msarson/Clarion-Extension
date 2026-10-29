/**
 * Hover on `Request.Field` reads the GROUP the hovered line sees, when other procedures of the
 * same module declare a GROUP with the same label (the hover half of the completion fix).
 *
 * The member lookup's document tier took the module's FIRST `Request GROUP`. For a field only a
 * later procedure's GROUP has, that was a miss: the lookup walked the declaration index, INCLUDE
 * and MEMBER tiers, asked again through the variable's type and missed again, and the hover
 * finally answered from its own fallback with a different card. The walk is pinned here by
 * counting include-chain lookups; on a large module it was most of a 0.4-0.5s hover.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { MemberLocatorService } from '../services/MemberLocatorService';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const CLW = [
    '  MEMBER()',                           // 0
    '  MAP',                                // 1
    '  END',                                // 2
    'Request      GROUP',                   // 3  module-level
    'ModuleOnly     LONG',                  // 4
    '             END',                     // 5
    'RequestType  GROUP,TYPE',              // 6
    'FromType       LONG',                  // 7
    '             END',                     // 8
    'FirstProc PROCEDURE',                  // 9
    'Request      GROUP',                   // 10
    'FirstOnly      LONG',                  // 11
    '             END',                     // 12
    'Typed        GROUP',                   // 13
    'Other          LONG',                  // 14
    '             END',                     // 15
    '  CODE',                               // 16
    '  Request.FirstOnly = 1',              // 17
    'SecondProc PROCEDURE',                 // 18
    'Request      GROUP',                   // 19
    'Kind           STRING(16)',            // 20
    'Payload        LONG',                  // 21
    '             END',                     // 22
    'Typed        GROUP(RequestType)',      // 23
    '             END',                     // 24
    '  CODE',                               // 25
    '  Request.Payload = 1',                // 26
    '  Typed.FromType = 1',                 // 27
    'ThirdProc PROCEDURE',                  // 28
    '  CODE',                               // 29
    '  Request.ModuleOnly = 1',             // 30
];

suite('Group.Field hover reads the same-named GROUP the hovered line sees', () => {
    let fx: DiskSolution;
    let doc: TextDocument;
    let includeWalks = 0;
    const proto = MemberLocatorService.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const original = proto.findInIncludeChain;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'caller.clw': CLW });
        doc = fx.open('caller.clw');
        TokenCache.getInstance().getTokens(doc);
        proto.findInIncludeChain = function (this: unknown, ...args: unknown[]) {
            includeWalks++;
            return original.apply(this, args);
        };
    });
    suiteTeardown(() => {
        proto.findInIncludeChain = original;
        fx.dispose();
    });

    async function hoverAt(line: number, word: string): Promise<string> {
        includeWalks = 0;
        const character = CLW[line].indexOf(word) + 1;
        const h = await new HoverProvider().provideHover(doc, Position.create(line, character));
        const c = h?.contents as { value?: string } | undefined;
        return c?.value ?? '';
    }

    test('a procedure\'s own GROUP shadows the module-level one, with the structure-field card', async function () {
        this.timeout(10000);
        const card = await hoverAt(17, 'FirstOnly');
        assert.ok(card.includes('**Request.FirstOnly**'), card);
        assert.ok(card.includes('Field of local procedure GROUP'), card);
    });

    test('a later procedure\'s field has the same card, without an include-chain walk', async function () {
        this.timeout(10000);
        const card = await hoverAt(26, 'Payload');
        assert.ok(card.includes('**Request.Payload**'), card);
        assert.ok(card.includes('Field of local procedure GROUP'), card);
        assert.strictEqual(includeWalks, 0, `include chain walked ${includeWalks} time(s)`);
    });

    test('a procedure without its own GROUP reads the module-level one', async function () {
        this.timeout(10000);
        const card = await hoverAt(30, 'ModuleOnly');
        assert.ok(card.includes('ModuleOnly'), card);
        assert.ok(!card.includes('FirstOnly') && !card.includes('Payload'), card);
    });

    test('a field of the local GROUP\'s type argument is found through the type', async function () {
        this.timeout(10000);
        const card = await hoverAt(27, 'FromType');
        assert.ok(card.includes('FromType'), card);
    });
});

/**
 * #831: a method of a CLASS declared in a procedure's local data sees that procedure's GROUP
 * (the scope chain climbs through the declaring procedure), and a local CLASS follows the same
 * rule as a GROUP: a procedure without its own reads the module-level one, not the previous
 * procedure's.
 */
const METHODS_CLW = [
    '  MEMBER()',                           // 0
    '  MAP',                                // 1
    '  END',                                // 2
    'Shared       CLASS',                   // 3  module-level
    'ModuleVal      LONG',                  // 4
    '             END',                     // 5
    'FirstProc PROCEDURE',                  // 6
    'Request      GROUP',                   // 7
    'FirstOnly      LONG',                  // 8
    '             END',                     // 9
    'ThisWindow   CLASS',                   // 10
    'Init           PROCEDURE',             // 11
    '             END',                     // 12
    '  CODE',                               // 13
    '  RETURN',                             // 14
    'ThisWindow.Init PROCEDURE',            // 15
    '  CODE',                               // 16
    '  Request.FirstOnly = 1',              // 17
    'SecondProc PROCEDURE',                 // 18
    'Request      GROUP',                   // 19
    'Payload        LONG',                  // 20
    '             END',                     // 21
    'Shared       CLASS',                   // 22  SecondProc's own
    'LocalVal       LONG',                  // 23
    '             END',                     // 24
    'ThisWindow   CLASS',                   // 25
    'Init           PROCEDURE',             // 26
    '             END',                     // 27
    '  CODE',                               // 28
    '  RETURN',                             // 29
    'ThisWindow.Init PROCEDURE',            // 30
    '  CODE',                               // 31
    '  Request.Payload = 1',                // 32
    'ThirdProc PROCEDURE',                  // 33
    '  CODE',                               // 34
    '  Shared.ModuleVal = 1',               // 35
];

suite('Group.Field hover follows the scope chain (#831)', () => {
    let fx: DiskSolution;
    let doc: TextDocument;
    let includeWalks = 0;
    const proto = MemberLocatorService.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const original = proto.findInIncludeChain;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'methods.clw': METHODS_CLW });
        doc = fx.open('methods.clw');
        TokenCache.getInstance().getTokens(doc);
        proto.findInIncludeChain = function (this: unknown, ...args: unknown[]) {
            includeWalks++;
            return original.apply(this, args);
        };
    });
    suiteTeardown(() => {
        proto.findInIncludeChain = original;
        fx.dispose();
    });

    async function hoverAt(line: number, word: string): Promise<string> {
        includeWalks = 0;
        const character = METHODS_CLW[line].indexOf(word) + 1;
        const h = await new HoverProvider().provideHover(doc, Position.create(line, character));
        const c = h?.contents as { value?: string } | undefined;
        return c?.value ?? '';
    }

    test('CONTROL: the first procedure\'s local class method reads its procedure\'s GROUP', async function () {
        this.timeout(10000);
        const card = await hoverAt(17, 'FirstOnly');
        assert.ok(card.includes('**Request.FirstOnly**'), card);
    });

    test('a later procedure\'s local class method reads that procedure\'s GROUP, without an include-chain walk', async function () {
        this.timeout(10000);
        const card = await hoverAt(32, 'Payload');
        assert.ok(card.includes('**Request.Payload**'), card);
        assert.strictEqual(includeWalks, 0, `include chain walked ${includeWalks} time(s)`);
    });

    test('a procedure without its own CLASS reads the module-level one, not the previous procedure\'s', async function () {
        this.timeout(10000);
        const card = await hoverAt(35, 'ModuleVal');
        assert.ok(card.includes('ModuleVal') && /LONG/.test(card), card);
        assert.ok(!card.includes('LocalVal'), card);
    });
});
