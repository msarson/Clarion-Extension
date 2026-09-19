/**
 * `StructureLabel:Member` is the colon form of Field Qualification (#610).
 *
 * Language Reference > 2 > Field Qualification: "You may use a colon (:) instead of a period
 * (StructureName:FieldLabel) to reference member variables of any structure except CLASS", and
 * the RECORD label of a FILE may be omitted. Generated code writes `DEBUGHOOK(Customer:Record)`
 * for every file. On ap1, F12 on `DAVanLineAgent:Record` went to the RECORD of a different FILE
 * (the first one in the program) and hover showed nothing - 27 of 456 sampled positions.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { hoverLocations, definitionLocations } from './support/hoverDefinitionAgreement';

const LINES = [
    '  PROGRAM',                                        // 0
    '  MAP',                                            // 1
    '  END',                                            // 2
    'First     FILE,DRIVER(\'TOPSPEED\'),PRE(FIR)',     // 3
    'Record      RECORD,PRE()',                         // 4
    'Id            LONG',                               // 5
    '            END',                                  // 6
    '          END',                                    // 7
    'Second    FILE,DRIVER(\'TOPSPEED\'),PRE(SEC)',     // 8
    'Record      RECORD,PRE()',                         // 9
    'Id            LONG',                               // 10
    'Name          STRING(20)',                         // 11
    '            END',                                  // 12
    '          END',                                    // 13
    'Totals    GROUP',                                  // 14 — no PRE
    'Count       LONG',                                 // 15
    '          END',                                    // 16
    '  CODE',                                           // 17
    '  DEBUGHOOK(Second:Record)',                       // 18
    '  Second:Name = \'x\'',                            // 19
    '  Totals:Count = 1',                               // 20
    '  SEC:Name = \'y\'',                               // 21
    '  DEBUGHOOK(First:Record)',                        // 22
];
const SOURCE = LINES.join('\r\n');

suite('StructureLabel:Member resolves to that structure\'s member (#610)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test610/Files.clw', 'clarion', 1, SOURCE);
    });

    async function both(line: number, word: string) {
        const position = { line, character: LINES[line].indexOf(word) + word.length - 1 };
        const def = definitionLocations(await new DefinitionProvider().provideDefinition(doc, position)).map(l => l.line);
        const hover = hoverLocations(await new HoverProvider().provideHover(doc, position)).map(l => l.line);
        return { def, hover };
    }

    const cases: Array<[string, number, string, number]> = [
        ['FileLabel:Record is that FILE\'s RECORD',            18, 'Second:Record', 9],
        ['the first FILE\'s own FileLabel:Record still works',   22, 'First:Record', 4],
        ['FileLabel:Field skips the RECORD label',             19, 'Second:Name', 11],
        ['GroupLabel:Field on a GROUP without PRE',            20, 'Totals:Count', 15],
        ['Prefix:Field still resolves by PRE',                 21, 'SEC:Name', 11],
    ];

    for (const [name, line, word, expected] of cases) {
        test(`F12: ${name}`, async () => {
            const { def } = await both(line, word);
            assert.deepStrictEqual(def, [expected], `${word}: F12 -> ${JSON.stringify(def)}`);
        });
        test(`hover: ${name}`, async () => {
            const { hover } = await both(line, word);
            assert.ok(hover.includes(expected), `${word}: hover -> ${JSON.stringify(hover)}`);
        });
    }
});
