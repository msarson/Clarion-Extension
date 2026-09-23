/**
 * #609 phase 1 - hover and Go to Definition must agree about the same word.
 *
 * The two resolve a word through separate pipelines, and a fix to one has repeatedly not
 * reached the other (#607 fixed a scan both used; #131/#182 had to be ported by hand to
 * "stay symmetric"). This pins, for one position of each common kind, that the location
 * the hover links to is where F12 goes. A case added here that disagrees is a bug in one
 * of the two pipelines, not in the test.
 */
import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { HoverProvider } from '../providers/HoverProvider';
import { DefinitionProvider } from '../providers/DefinitionProvider';
import { setServerInitialized } from '../serverState';
import { ImplementationProvider } from '../providers/ImplementationProvider';
import {
    classifyAgreement, hoverLocations, definitionLocations, classifyImplementation, normaliseFile
} from './support/hoverDefinitionAgreement';

const LINES = [
    '  PROGRAM',                                        // 0
    '  MAP',                                            // 1
    'DoThing   PROCEDURE(LONG pValue)',                 // 2
    '  END',                                            // 3
    'MaxItems  EQUATE(10)',                             // 4
    'GlobCount LONG',                                   // 5
    'Grp       GROUP,PRE(GRP)',                         // 6
    'Name        STRING(20)',                           // 7
    '          END',                                    // 8
    'Base      CLASS,TYPE',                             // 9
    'Size        LONG',                                 // 10
    'Work        PROCEDURE(LONG n)',                    // 11
    '          END',                                    // 12
    'Thing     CLASS(Base),TYPE',                       // 13
    'Label       STRING(10)',                           // 14
    'Work        PROCEDURE(LONG n),DERIVED',            // 15
    'Show        PROCEDURE',                            // 16
    '          END',                                    // 17
    'Obj       Thing',                                  // 18
    'Ref       &Thing',                                 // 19
    '  CODE',                                           // 20
    '  GlobCount = MaxItems',                           // 21
    '  Grp.Name = \'x\'',                               // 22
    '  GRP:Name = \'y\'',                               // 23
    '  DoThing(GlobCount)',                             // 24
    '  Obj.Show()',                                     // 25
    '  Obj.Label = \'z\'',                              // 26
    '  Ref &= Obj',                                     // 27
    '',                                                 // 28
    'DoThing   PROCEDURE(LONG pValue)',                 // 29
    'Local       LONG',                                 // 30
    '  CODE',                                           // 31
    '  Local = pValue',                                 // 32
    '  DO Tidy',                                        // 33
    'Tidy      ROUTINE',                                // 34
    '  Local = 0',                                      // 35
    '',                                                 // 36
    'Thing.Show PROCEDURE',                             // 37
    '  CODE',                                           // 38
    '  SELF.Label = \'a\'',                             // 39
    '  SELF.Work(1)',                                   // 40
    '  SELF.Size = 2',                                  // 41
    '  PARENT.Work(3)',                                 // 42
    '  x# = SELF',                                      // 43
    '',                                                 // 44
    'Thing.Work PROCEDURE(LONG n)',                     // 45
    '  CODE',                                           // 46
    '  PARENT.Work(n)',                                 // 47
    '',                                                 // 48
    'Base.Work  PROCEDURE(LONG n)',                     // 49
    '  CODE',                                           // 50
];
const SOURCE = LINES.join('\r\n');

/** [description, line, word, occurrence on the line (0 = first)] */
const CASES: Array<[string, number, string, number?]> = [
    ['global variable',                     21, 'GlobCount'],
    ['equate',                              21, 'MaxItems'],
    ['GROUP field via dot',                 22, 'Name'],
    ['GROUP field via prefix',              23, 'GRP:Name'],
    ['MAP procedure call',                  24, 'DoThing'],
    ['typed variable',                      25, 'Obj'],
    ['typed variable method',               25, 'Show'],
    ['typed variable property',             26, 'Label'],
    ['reference variable',                  27, 'Ref'],
    ['procedure local',                     32, 'Local'],
    ['procedure parameter',                 32, 'pValue'],
    ['routine',                             33, 'Tidy'],
    ['local from inside a routine',         35, 'Local'],
    ['SELF property',                       39, 'Label'],
    ['SELF method',                         40, 'Work'],
    ['SELF inherited property',             41, 'Size'],
    ['PARENT method',                       42, 'Work'],
    ['bare SELF',                           43, 'SELF'],
    ['class type name',                     18, 'Thing'],
];

/**
 * Known disagreements, each with its issue and the verdict it gives today. The test pins that
 * verdict, so a fix that makes the case agree fails here with a reminder to drop the entry.
 */
const KNOWN: Record<string, { issue: number; verdict: string }> = {
};

suite('Hover and F12 agree on the same word (#609)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test609/Agree.clw', 'clarion', 1, SOURCE);
    });

    for (const [name, line, word, nth] of CASES) {
        test(name, async () => {
            let col = -1;
            for (let i = 0; i <= (nth ?? 0); i++) col = LINES[line].indexOf(word, col + 1);
            assert.ok(col >= 0, `fixture: "${word}" not on line ${line}`);
            const position = { line, character: col + 1 };
            const hover = await new HoverProvider().provideHover(doc, position);
            const def = await new DefinitionProvider().provideDefinition(doc, position);
            const verdict = classifyAgreement(hover, def);
            const show = (l: { file: string; line: number }[]) => l.map(x => `${x.file.split('/').pop()}:${x.line}`).join(', ') || '-';
            const detail = `${name} (${word} @${line}): ${verdict}; hover -> ${show(hoverLocations(hover))}; F12 -> ${show(definitionLocations(def))}`;
            const known = KNOWN[name];
            if (known) {
                assert.notStrictEqual(verdict, 'agree', `${detail} - #${known.issue} now agrees: remove it from KNOWN`);
                assert.strictEqual(verdict, known.verdict, `${detail} - known #${known.issue} changed shape`);
            } else {
                assert.strictEqual(verdict, 'agree', detail);
            }
        });
    }
});

/**
 * #636 - Go to Implementation must be consistent with Go to Definition on the same word: to the
 * body when F12 names a procedure, method or routine, and nowhere else otherwise. Same fixture
 * and positions as above; the rule is classifyImplementation's.
 *
 * `declaration` (Ctrl+F12 returns F12's own target for a dotted data member) is the provider's
 * deliberate fallback, accepted here; the fixture has a body for every callable, so `no-body`
 * is a failure.
 */
const IMPLEMENTATION_OK = ['agree', 'declaration'];

/** Known inconsistencies, pinned by the verdict they give today, as KNOWN above. */
const KNOWN_IMPLEMENTATION: Record<string, { issue: number; verdict: string }> = {
    'typed variable':        { issue: 639, verdict: 'impl-on-data' },
    'typed variable method': { issue: 640, verdict: 'no-body' },
};

suite('Go to Implementation agrees with F12 on the same word (#636)', () => {
    let doc: TextDocument;

    setup(() => {
        setServerInitialized(true);
        TokenCache.getInstance().clearAllTokens();
        doc = TextDocument.create('file:///c:/test609/Agree.clw', 'clarion', 1, SOURCE);
    });

    for (const [name, line, word, nth] of CASES) {
        test(name, async () => {
            let col = -1;
            for (let i = 0; i <= (nth ?? 0); i++) col = LINES[line].indexOf(word, col + 1);
            const position = { line, character: col + 1 };
            const def = await new DefinitionProvider().provideDefinition(doc, position);
            const impl = await new ImplementationProvider().provideImplementation(doc, position);
            const verdict = classifyImplementation(word, def, impl,
                file => file === normaliseFile(doc.uri) ? LINES : undefined);
            const show = (l: { line: number }[]) => l.map(x => x.line).join(', ') || '-';
            const detail = `${name} (${word} @${line}): ${verdict}; F12 -> ${show(definitionLocations(def))}; ` +
                `Ctrl+F12 -> ${show(definitionLocations(impl))}`;
            const known = KNOWN_IMPLEMENTATION[name];
            if (known) {
                assert.ok(!IMPLEMENTATION_OK.includes(verdict), `${detail} - #${known.issue} now agrees: remove it from KNOWN_IMPLEMENTATION`);
                assert.strictEqual(verdict, known.verdict, `${detail} - known #${known.issue} changed shape`);
            } else {
                assert.ok(IMPLEMENTATION_OK.includes(verdict), detail);
            }
        });
    }
});
