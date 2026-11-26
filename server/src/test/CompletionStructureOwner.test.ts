/**
 * Dot completion walks a member-access chain through the same owners hover and Go to
 * Definition use (DottedAccessResolver.resolveOwner / enumerateMembers).
 *
 * Completion used its own chain walk, which asked for the class named by each member's type.
 * Three shapes have no such class, so the list came back empty or short while hover and F12
 * on the same access worked:
 *
 *  - an inline GROUP declared in a CLASS body (`SELF.G.`, `SELF.G.Sub.`), or nested in a local
 *    GROUP (`Request.Inner.`): a bare `GROUP` names no type (#552 taught the chain resolver
 *    this; completion never used it);
 *  - a structure with a type argument AND fields of its own (`TG GROUP(GT)` + `Extra2`,
 *    `ModQ3 QUEUE(QT)` + `Extra`): the walk jumped to the type argument and lost the own fields;
 *  - an interface the class implements (`SELF.MyIface.`, and `SELF.` itself not offering it).
 *
 * The declarations live in an INCLUDEd file, as a class declared in an .inc and implemented
 * in a .clw does, so nothing in the document under test declares them. Every shape here
 * compiles; a QUEUE or RECORD is not valid inside a CLASS, so only GROUPs appear there.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Location } from 'vscode-languageserver-protocol';
import { CompletionProvider } from '../providers/CompletionProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { DottedAccessResolver } from '../services/DottedAccessResolver';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';
import { createDiskSolution, DiskSolution } from './support/diskSolutionFixture';

const INC = [
    'QT          QUEUE,TYPE',                        // 0
    'Name          STRING(20)',                      // 1
    '            END',                               // 2
    'GT          GROUP,TYPE',                        // 3
    'Code          LONG',                            // 4
    '            END',                               // 5
    'MyIface     INTERFACE',                         // 6
    'Ping          PROCEDURE()',                     // 7
    '            END',                               // 8
    'MyIface2    INTERFACE(MyIface)',                // 9
    'Pong          PROCEDURE(LONG x),STRING',        // 10
    '            END',                               // 11
    'OtherClass  CLASS,TYPE',                        // 12
    'Count         LONG',                            // 13
    'Run           PROCEDURE()',                     // 14
    '            END',                               // 15
    'TestClass   CLASS,IMPLEMENTS(MyIface),TYPE',    // 16
    'Hits          LONG',                            // 17
    'G             GROUP',                           // 18
    'Name            STRING(20)',                    // 19
    'Sub             GROUP',                         // 20
    'Deep              LONG',                        // 21
    '                END',                           // 22
    '              END',                             // 23
    'TG            GROUP(GT)',                       // 24
    'Extra2          LONG',                          // 25
    '              END',                             // 26
    'Obj           &OtherClass',                     // 27
    'Init          PROCEDURE()',                     // 28
    '            END',                               // 29
    'Handler     CLASS,IMPLEMENTS(MyIface2),TYPE',   // 30
    '            END',                               // 31
    'ModQ        QUEUE',                             // 32
    'Name          STRING(20)',                      // 33
    '            END',                               // 34
    'ModQ2       QT',                                // 35
    'ModQ3       QUEUE(QT)',                         // 36
    'Extra         LONG',                            // 37
    '            END',                               // 38
    'ModG        GROUP(GT)',                         // 39
    '            END',                               // 40
    'T           TestClass',                         // 41
];

const CLW = [
    '  PROGRAM',                                     // 0
    '  MAP',                                         // 1
    'TakeTyped     PROCEDURE(QT pQ)',                // 2
    'TakeGroup     PROCEDURE(*GT pG)',               // 3
    'TakeUntyped   PROCEDURE(QUEUE pQ)',             // 4
    'SecondProc    PROCEDURE',                       // 5
    'ProcA         PROCEDURE',                       // 6
    'ProcB         PROCEDURE',                       // 7
    '  END',                                         // 8
    "  INCLUDE('types.inc'),ONCE",                   // 9
    '  CODE',                                        // 10
    '  ModQ.',                                       // 11
    '  ModQ2.',                                      // 12
    '  ModQ3.',                                      // 13
    '  ModG.',                                       // 14
    'TakeTyped PROCEDURE(QT pQ)',                    // 15
    '  CODE',                                        // 16
    '  pQ.',                                         // 17
    'TakeGroup PROCEDURE(*GT pG)',                   // 18
    '  CODE',                                        // 19
    '  pG.',                                         // 20
    'TakeUntyped PROCEDURE(QUEUE pQ)',               // 21
    '  CODE',                                        // 22
    '  pQ.',                                         // 23
    'SecondProc PROCEDURE',                          // 24
    'Request     GROUP',                             // 25
    'Kind          STRING(16)',                      // 26
    'Inner         GROUP',                           // 27
    'Flag            LONG',                          // 28
    '              END',                             // 29
    '            END',                               // 30
    '  CODE',                                        // 31
    '  Request.',                                    // 32
    '  Request.Inner.',                              // 33
    'ProcA PROCEDURE',                               // 34
    'LocT        GROUP,TYPE',                        // 35
    'AOnly         LONG',                            // 36
    '            END',                               // 37
    'X           GROUP(LocT)',                       // 38
    '            END',                               // 39
    '  CODE',                                        // 40
    '  X.',                                          // 41
    'ProcB PROCEDURE',                               // 42
    'LocT        GROUP,TYPE',                        // 43
    'BOnly         LONG',                            // 44
    'BSub          GROUP',                           // 45
    'BF              LONG',                          // 46
    '              END',                             // 47
    '            END',                               // 48
    'X           GROUP(LocT)',                       // 49
    'Own           LONG',                            // 50
    '            END',                               // 51
    '  CODE',                                        // 52
    '  X.',                                          // 53
    '  X.BSub.BF = 1',                               // 54
    'OtherClass.Run PROCEDURE()',                    // 55
    '  CODE',                                        // 56
    '  SELF.Count += 1',                             // 57
    'TestClass.Init PROCEDURE()',                    // 58
    '  CODE',                                        // 59
    '  SELF.G.',                                     // 60
    '  SELF.G.Sub.',                                 // 61
    '  SELF.Obj.',                                   // 62
    '  SELF.MyIface.',                               // 63
    '  SELF.TG.',                                    // 64
    '  SELF.',                                       // 65
    '  SELF.G.N',                                    // 66
    '  SELF.TG.Extra2 = 1',                          // 67
    '  SELF.TG.Code = 1',                            // 68
    'TestClass.MyIface.Ping PROCEDURE()',            // 69
    '  CODE',                                        // 70
    '  SELF.Hits += 1',                              // 71
    'Handler.MyIface2.Ping PROCEDURE()',             // 72
    '  CODE',                                        // 73
    'Handler.MyIface2.Pong PROCEDURE(LONG x)',       // 74
    '  CODE',                                        // 75
    '  SELF.',                                       // 76
    '  SELF.MyIface2.',                              // 77
    "  RETURN 'a'",                                  // 78
];

suite('Dot completion through structure and interface owners', () => {
    let fx: DiskSolution;
    let doc: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'types.inc': INC, 'prog.clw': CLW });
        doc = fx.open('prog.clw');
        TokenCache.getInstance().getTokens(doc);
    });
    suiteTeardown(() => fx.dispose());

    async function itemsAt(line: number) {
        const text = CLW[line];
        const params = {
            textDocument: { uri: doc.uri },
            position: { line, character: text.length },
            context: text.endsWith('.') ? { triggerKind: 2, triggerCharacter: '.' } : { triggerKind: 1 },
        } as never;
        return new CompletionProvider().onCompletion(params, doc);
    }

    /** The member names offered, upper-cased, sorted, once each. */
    async function namesAt(line: number): Promise<string[]> {
        // A field's label carries its type ("Name STRING(20)"), a method's its parameters.
        const names = (await itemsAt(line)).map(i => String(i.label).split(/[\s(]/)[0].toUpperCase());
        return [...new Set(names)].sort();
    }

    async function assertOffersExactly(line: number, expected: string[]) {
        const what = CLW[line].trim();
        assert.deepStrictEqual(await namesAt(line), expected.map(e => e.toUpperCase()).sort(), what);
    }

    // ---- shapes that already worked: kept as controls -------------------------------------

    test('CONTROL: a module QUEUE, a queue typed by a QUEUE type, a typed GROUP', async function () {
        this.timeout(10000);
        await assertOffersExactly(11, ['Name']);
        await assertOffersExactly(12, ['Name']);
        await assertOffersExactly(14, ['Code']);
    });

    test('CONTROL: parameters typed by a QUEUE or GROUP type', async function () {
        this.timeout(10000);
        await assertOffersExactly(17, ['Name']);
        await assertOffersExactly(20, ['Code']);
    });

    test('CONTROL: an untyped QUEUE parameter offers nothing', async function () {
        this.timeout(10000);
        await assertOffersExactly(23, []);
    });

    test('CONTROL: a reference member offers the referenced class', async function () {
        this.timeout(10000);
        await assertOffersExactly(62, ['Count', 'Run']);
    });

    test('CONTROL: a local GROUP offers its own fields', async function () {
        this.timeout(10000);
        await assertOffersExactly(32, ['Kind', 'Inner']);
    });

    // ---- inline GROUP -----------------------------------------------------------------------

    test('an inline GROUP member of a class offers its own fields, not its nested group\'s', async function () {
        this.timeout(10000);
        await assertOffersExactly(60, ['Name', 'Sub']);
    });

    test('a GROUP nested in an inline GROUP chains one level further', async function () {
        this.timeout(10000);
        await assertOffersExactly(61, ['Deep']);
    });

    test('a GROUP nested in a local GROUP chains the same way', async function () {
        this.timeout(10000);
        await assertOffersExactly(33, ['Flag']);
    });

    test('a letter after the dot filters the inline GROUP fields (#370)', async function () {
        this.timeout(10000);
        // Only the group's own field: an unresolved chain falls back to the word list, which
        // offers every N... word in scope (NEW, NOT, NULL, ...).
        await assertOffersExactly(66, ['Name']);
    });

    // ---- structure with a type argument and fields of its own -------------------------------

    test('GROUP(Type) with own fields in a class offers both', async function () {
        this.timeout(10000);
        await assertOffersExactly(64, ['Code', 'Extra2']);
    });

    test('QUEUE(Type) with own fields in module data offers both', async function () {
        this.timeout(10000);
        await assertOffersExactly(13, ['Name', 'Extra']);
    });

    test('a local GROUP(Type) reads the TYPE its own procedure declares (#829)', async function () {
        this.timeout(10000);
        await assertOffersExactly(41, ['AOnly']);
        await assertOffersExactly(53, ['BOnly', 'BSub', 'Own']);
    });

    // ---- implemented interface --------------------------------------------------------------

    test('SELF. offers an interface the class implements', async function () {
        this.timeout(10000);
        await assertOffersExactly(65, ['Hits', 'G', 'TG', 'Obj', 'Init', 'MyIface']);
    });

    test('SELF.Interface. offers the interface methods', async function () {
        this.timeout(10000);
        await assertOffersExactly(63, ['Ping']);
    });

    test('a class whose only members are implemented interfaces offers them', async function () {
        this.timeout(10000);
        await assertOffersExactly(76, ['MyIface2']);
    });

    test('an interface offers the methods it inherits, with their prototypes', async function () {
        this.timeout(10000);
        await assertOffersExactly(77, ['Ping', 'Pong']);
        const pong = (await itemsAt(77)).find(i => /^Pong\b/i.test(String(i.label)));
        assert.ok(pong && String(pong.label).includes('(LONG x)'), `Pong keeps its parameters: ${pong?.label}`);
    });
});

suite('Go to Definition through the same structure owners', () => {
    let fx: DiskSolution;
    let doc: TextDocument;

    suiteSetup(() => {
        setServerInitialized(true);
        fx = createDiskSolution({ 'types.inc': INC, 'prog.clw': CLW });
        doc = fx.open('prog.clw');
        TokenCache.getInstance().getTokens(doc);
    });
    suiteTeardown(() => fx.dispose());

    async function f12(line: number, word: string): Promise<Location | null> {
        const character = CLW[line].lastIndexOf(word) + 1;
        const r = await new DefinitionProvider().provideDefinition(doc, { line, character });
        if (!r) return null;
        return (Array.isArray(r) ? r[0] : r) as Location;
    }

    function landsOn(loc: Location | null, file: RegExp, line: number, what: string) {
        assert.ok(loc, `${what}: no definition`);
        assert.ok(file.test(decodeURIComponent(loc!.uri)), `${what}: wrong file ${loc!.uri}`);
        assert.strictEqual(loc!.range.start.line, line, `${what}: wrong line`);
    }

    test('an own field of a GROUP(Type) in a class lands on the field', async function () {
        this.timeout(10000);
        landsOn(await f12(67, 'Extra2'), /types\.inc$/i, 25, 'SELF.TG.Extra2');
    });

    test('a field the GROUP(Type) takes from its type lands on the type\'s field', async function () {
        this.timeout(10000);
        landsOn(await f12(68, 'Code'), /types\.inc$/i, 4, 'SELF.TG.Code');
    });

    test('a chain through a local GROUP(Type) reads the TYPE its own procedure declares', async function () {
        this.timeout(10000);
        landsOn(await f12(54, 'BF'), /prog\.clw$/i, 46, 'X.BSub.BF');
    });

    test('a field from the type argument still answers as a member of that type', async function () {
        this.timeout(10000);
        const r = await new DottedAccessResolver().resolve('SELF.TG', 'Code', doc, 68, undefined);
        assert.ok(r, 'resolved');
        assert.strictEqual(r!.receiverClass, 'GT');
    });
});
