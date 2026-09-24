import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { NoSolutionFixture, buildNoSolutionFixture, teardownNoSolutionFixture } from './helpers/NoSolutionFixture';

/**
 * #656 — a field or variable declared `LIKE(name)` takes the liked declaration's definition
 * (Language Reference > 3 - Variable Declarations > Special Data Types > LIKE): chains follow
 * through (`YTDAmount LIKE(QTDAmount)`), LIKE of a QUEUE or RECORD is a GROUP, LIKE of a MEMO a
 * STRING of the MEMO's size. Every generated browse and drop-list queue declares its fields
 * `LOC:Flag LIKE(LOC:Flag)` - the same label as the local it copies.
 *
 * The dot-form card said `— LIKE` and rebuilt the declaration from tokens
 * (`LIKE  (  LOC:ActiveFlag  )`); the declaration and variable cards said `LIKE(LOC:ActiveFlag)`
 * without what that is. Every card now shows the declaration as written and what it resolves
 * to. Hovering the name inside `LIKE(...)` answered with the field being declared on that line
 * rather than the declaration it names.
 */

const SRC = [
    "  PROGRAM",                                                               // 0
    "  MAP",                                                                   // 1
    "  END",                                                                   // 2
    "Customer             FILE,DRIVER('TOPSPEED'),PRE(CUS)",                   // 3
    "Record                   RECORD,PRE()",                                   // 4
    "Name                        STRING(30)",                                  // 5
    "Notes                       MEMO(2000)",                                  // 6
    "                         END",                                            // 7
    "                     END",                                                // 8
    "Main PROCEDURE",                                                          // 9
    "LOC:ActiveFlag       BYTE",                                               // 10
    "LOC:Amount           DECIMAL(7,2)",                                       // 11
    "LOC:Other            LIKE(LOC:ActiveFlag)",                               // 12
    "LOC:Third            LIKE(LOC:Other)",                                    // 13
    "LOC:Orphan           LIKE(NoSuchThing)",                                  // 14
    "LOC:Loop1            LIKE(LOC:Loop2)",                                    // 15
    "LOC:Loop2            LIKE(LOC:Loop1)",                                    // 16
    "LOC:Rec              LIKE(CUS:Record)",                                   // 17
    "LOC:NoteCopy         LIKE(CUS:Notes)",                                    // 18
    "Queue:Browse:1       QUEUE",                                              // 19
    "LOC:ActiveFlag         LIKE(LOC:ActiveFlag)    !List box control field",  // 20
    "CUS:Name               LIKE(CUS:Name)          !List box control field",  // 21
    "LOC:Amount             LIKE(LOC:Amount)",                                 // 22
    "                     END",                                                // 23
    "  CODE",                                                                  // 24
    "  X = Queue:Browse:1.LOC:ActiveFlag",                                     // 25
    "  X = Queue:Browse:1.CUS:Name",                                           // 26
    "  X = Queue:Browse:1.LOC:Amount",                                         // 27
    "  X = LOC:Other",                                                         // 28
    "  X = LOC:Third",                                                         // 29
    "  X = LOC:Orphan",                                                        // 30
    "  X = LOC:Loop1",                                                         // 31
    "  X = LOC:Rec",                                                           // 32
    "  X = LOC:NoteCopy",                                                      // 33
    "  RETURN",                                                                // 34
].join('\n');
const LINES = SRC.split('\n');

suite('#656 LIKE declarations show what they are like', () => {
    let doc: TextDocument;
    setup(() => {
        doc = TextDocument.create('file:///c%3A/like656/like.clw', 'clarion', 1, SRC);
        TokenCache.getInstance().getTokens(doc);
    });
    teardown(() => TokenCache.getInstance().clearTokens(doc.uri));

    /** Hover text with the cursor on the last occurrence of `word` on `line` (the label: `^`). */
    async function hover(line: number, word: string): Promise<string> {
        const ch = word === '^' ? 1 : LINES[line].lastIndexOf(word) + 1;
        assert.ok(ch > 0, `"${word}" is on line ${line}`);
        const h = await new HoverProvider().provideHover(doc, Position.create(line, ch));
        const c = h?.contents as { value?: string } | undefined;
        return c?.value ?? '';
    }
    const header = (card: string) => card.split('\n')[0];

    test('dot-form field card: the declaration as written and the liked type', async () => {
        const card = await hover(25, 'ActiveFlag');
        assert.ok(header(card).includes('`LIKE(LOC:ActiveFlag)` → `BYTE`'), header(card));
    });

    test('dot-form field card: the code block is the source line, not rebuilt tokens', async () => {
        const card = await hover(25, 'ActiveFlag');
        assert.ok(card.includes(LINES[20].trim()), card);
        assert.ok(!card.includes('LIKE  ('), card);
    });

    test('dot-form field card: a field like a FILE field through its PRE', async () => {
        const card = await hover(26, 'Name');
        assert.ok(header(card).includes('`LIKE(CUS:Name)` → `STRING(30)`'), header(card));
    });

    test('dot-form field card: a type with a comma in its arguments keeps them', async () => {
        const card = await hover(27, 'Amount');
        assert.ok(header(card).includes('`LIKE(LOC:Amount)` → `DECIMAL(7,2)`'), header(card));
    });

    test('the field\'s own declaration card agrees with its dot-form card', async () => {
        const card = await hover(20, '^'); // on the label, not the same name inside LIKE(...)
        assert.ok(header(card).includes('`LIKE(LOC:ActiveFlag)` → `BYTE`'), header(card));
    });

    test('a LIKE local at use and at its declaration', async () => {
        assert.ok(header(await hover(28, 'Other')).includes('`LIKE(LOC:ActiveFlag)` → `BYTE`'));
        assert.ok(header(await hover(12, '^')).includes('`LIKE(LOC:ActiveFlag)` → `BYTE`'));
    });

    test('a chain resolves to the first declaration that is not LIKE', async () => {
        const h = header(await hover(29, 'Third'));
        assert.ok(h.includes('`LIKE(LOC:Other)` → `BYTE`'), h);
    });

    test('LIKE of a RECORD is a GROUP and LIKE of a MEMO a STRING of its size', async () => {
        const rec = header(await hover(32, 'Rec'));
        assert.ok(rec.includes('`LIKE(CUS:Record)` → `GROUP`'), rec);
        const memo = header(await hover(33, 'NoteCopy'));
        assert.ok(memo.includes('`LIKE(CUS:Notes)` → `STRING(2000)`'), memo);
    });

    test('an unresolvable name or a cycle shows the declaration alone', async () => {
        const orphan = header(await hover(30, 'Orphan'));
        assert.ok(orphan.includes('`LIKE(NoSuchThing)`') && !orphan.includes('→'), orphan);
        const loop = header(await hover(31, 'Loop1'));
        assert.ok(loop.includes('`LIKE(LOC:Loop2)`') && !loop.includes('→'), loop);
    });

    test('hovering the name inside LIKE(...) shows the declaration it names, not the field', async () => {
        const card = await hover(20, 'ActiveFlag)');
        assert.ok(header(card).includes('`BYTE`'), header(card));
        assert.ok(card.includes('#L11'), `links to the local on line 11: ${card}`);
    });
});

suite('#656 LIKE in a MEMBER module reaches the program\'s FILEs and globals', () => {
    let fix: NoSolutionFixture | undefined;
    teardown(() => { if (fix) teardownNoSolutionFixture(fix); fix = undefined; });

    // The generated layout: FILEs and global data in the PROGRAM, the browse queue in a MEMBER.
    const PROGRAM = [
        "  PROGRAM",
        "  MAP",
        "  END",
        "GLO:CompanyID        BYTE",
        "Customer             FILE,DRIVER('TOPSPEED'),PRE(CUS)",
        "Record                   RECORD,PRE()",
        "Name                        STRING(30)",
        "                         END",
        "                     END",
        "  CODE",
        "  RETURN",
    ].join('\n');
    const MEMBER = [
        "  MEMBER('Prog656.clw')",
        "Browse PROCEDURE",
        "Queue:Browse:1       QUEUE",
        "CUS:Name               LIKE(CUS:Name)          !type derived from field",
        "GLO:CompanyID          LIKE(GLO:CompanyID)     !type derived from global data",
        "                     END",
        "  CODE",
        "  X = Queue:Browse:1.CUS:Name",
        "  X = Queue:Browse:1.GLO:CompanyID",
        "  RETURN",
    ].join('\n');

    async function headerAt(doc: TextDocument, line: number, word: string): Promise<string> {
        const text = MEMBER.split('\n')[line];
        const h = await new HoverProvider().provideHover(doc, Position.create(line, text.lastIndexOf(word) + 1));
        return ((h?.contents as { value?: string } | undefined)?.value ?? '').split('\n')[0];
    }

    test('a FILE field through its PRE and a program global', async () => {
        fix = buildNoSolutionFixture({
            libsrcs: [{}],
            sourceFile: { filename: 'Browse656.clw', content: MEMBER, siblings: { 'Prog656.clw': PROGRAM } }
        });
        const doc = TextDocument.create(fix.sourceUri!, 'clarion', 1, MEMBER);
        TokenCache.getInstance().getTokens(doc);
        try {
            const field = await headerAt(doc, 7, 'Name');
            assert.ok(field.includes('`LIKE(CUS:Name)` → `STRING(30)`'), field);
            const global = await headerAt(doc, 8, 'CompanyID');
            assert.ok(global.includes('`LIKE(GLO:CompanyID)` → `BYTE`'), global);
        } finally {
            TokenCache.getInstance().clearTokens(doc.uri);
        }
    });
});
