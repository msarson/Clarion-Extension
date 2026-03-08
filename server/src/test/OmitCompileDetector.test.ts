/**
 * Tests for OmitCompileDetector
 * Specifically covers the case where OMIT/COMPILE terminator lines have no tokens
 * (e.g. lines containing only '***'), which caused the old token-driven approach
 * to leave blocks unclosed and flag all subsequent lines as omitted.
 */

import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { OmitCompileDetector } from '../utils/OmitCompileDetector';

function makeDoc(content: string): TextDocument {
    return TextDocument.create('test://test.clw', 'clarion', 1, content);
}

function tokenize(content: string) {
    return new ClarionTokenizer(content).tokenize();
}

suite('OmitCompileDetector', () => {

    suite('findDirectiveBlocks - terminator lines with no tokens', () => {

        test('OMIT block closed by *** line (no tokens on terminator line)', () => {
            const code = [
                'SomeCode      EQUATE(1)',     // line 0
                '  OMIT(\'***\')',              // line 1 - OMIT start
                'HiddenCode    EQUATE(2)',      // line 2 - inside OMIT block
                '  ***',                        // line 3 - terminator (no tokens)
                'NormalCode    EQUATE(3)',      // line 4 - should NOT be omitted
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].type, 'OMIT');
            assert.strictEqual(blocks[0].startLine, 1);
            assert.ok(blocks[0].endLine !== null, 'Block should be closed');

            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(0, blocks), false, 'line 0 not omitted');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(2, blocks), true, 'line 2 should be omitted');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(4, blocks), false, 'line 4 should NOT be omitted');
        });

        test('COMPILE block closed by *** line (no tokens on terminator line)', () => {
            const code = [
                '  COMPILE(\'***\',TraceFiles)', // line 0 - COMPILE start
                'Trace    FILE,DRIVER(\'ASCII\')', // line 1 - inside COMPILE block
                '  ***',                           // line 2 - terminator (no tokens)
                'NormalCode    EQUATE(1)',          // line 3 - should NOT be omitted
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].type, 'COMPILE');
            assert.ok(blocks[0].endLine !== null, 'Block should be closed');

            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), true, 'line 1 inside COMPILE block');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(3, blocks), false, 'line 3 after block NOT omitted');
        });

        test('sequential COMPILE and OMIT blocks both close correctly', () => {
            // Mirrors the pattern in ABFILE.CLW lines 128-139
            const code = [
                '  COMPILE(\'***\',TraceFiles)', // line 0 - COMPILE start
                'Trace    FILE,DRIVER(\'ASCII\')', // line 1 - inside COMPILE block
                '  ***',                           // line 2 - closes COMPILE block (no tokens)
                '  OMIT(\'***\',TraceFiles)',       // line 3 - OMIT start
                'HiddenCode    EQUATE(0)',          // line 4 - inside OMIT block
                '  ***',                            // line 5 - closes OMIT block (no tokens)
                'NormalCode    EQUATE(1)',           // line 6 - should NOT be omitted
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 2, 'should find exactly 2 blocks');

            // line 1 inside COMPILE block
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), true, 'line 1 inside COMPILE');
            // line 4 inside OMIT block
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(4, blocks), true, 'line 4 inside OMIT');
            // line 6 after both blocks
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(6, blocks), false, 'line 6 NOT omitted');
        });

        test('line after OMIT block with comment terminator is NOT omitted', () => {
            // Mirrors the COMPILE('=== DO LINK') pattern where terminator appears in a comment line
            const code = [
                '  COMPILE(\'=== DO LINK\',LinkFlag)', // line 0
                '  PRAGMA(\'link(foo.LIB)\')',          // line 1 - inside COMPILE
                '! === DO LINK',                         // line 2 - terminator in comment
                'NormalCode    EQUATE(1)',                // line 3
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 1);
            assert.ok(blocks[0].endLine !== null, 'Block should be closed');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), true, 'line 1 inside COMPILE');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(3, blocks), false, 'line 3 NOT omitted');
        });

        test('terminator after ! comment marker closes block (!***)', () => {
            const code = [
                '  OMIT(\'***\')',              // line 0 - OMIT start
                'HiddenCode    EQUATE(2)',       // line 1 - inside OMIT block
                '!***',                          // line 2 - terminator after ! comment char
                'NormalCode    EQUATE(3)',        // line 3 - should NOT be omitted
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 1);
            assert.ok(blocks[0].endLine !== null, 'Block closed by !*** line');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), true, 'line 1 inside OMIT');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(3, blocks), false, 'line 3 NOT omitted');
        });

        test('terminator appearing mid-line closes block', () => {
            // e.g. a code line that happens to contain the terminator after a comment marker
            const code = [
                '  OMIT(\'***\')',                    // line 0 - OMIT start
                'HiddenCode    EQUATE(2)',             // line 1 - inside OMIT
                "SomeCode      EQUATE(0) !***",        // line 2 - terminator mid-line after !
                'NormalCode    EQUATE(3)',              // line 3 - should NOT be omitted
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 1);
            assert.ok(blocks[0].endLine !== null, 'block closed by mid-line terminator');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), true, 'line 1 inside OMIT');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(3, blocks), false, 'line 3 NOT omitted');
        });

        test('terminator inside a string literal does NOT close block', () => {
            // OMIT('***',Cond); MESSAGE('***') !***
            // The '***' in MESSAGE('***') must be ignored; only the trailing !*** closes it
            const code = [
                "  OMIT('***')",                          // line 0 - OMIT start
                "  MESSAGE('***')",                        // line 1 - *** only inside string - block stays open
                "  MESSAGE('***') !***",                   // line 2 - *** in string AND after ! - block closes here
                'NormalCode    EQUATE(3)',                  // line 3 - should NOT be omitted
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].endLine, 2, 'block closes at line 2 (not line 1)');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), true, 'line 1 still inside OMIT');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(3, blocks), false, 'line 3 NOT omitted');
        });

        test('terminator inside a string with escaped quotes does NOT close block', () => {
            // String with an escaped quote: MESSAGE('it''s ***') - the *** is inside the string
            const code = [
                "  OMIT('***')",                            // line 0
                "  MESSAGE('it''s ***')",                   // line 1 - *** inside string with '' escape
                '  ***',                                    // line 2 - real terminator
                'NormalCode    EQUATE(1)',                   // line 3
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].endLine, 2, 'block closes at line 2 (not line 1)');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(1, blocks), true, 'line 1 still inside OMIT');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(3, blocks), false, 'line 3 NOT omitted');
        });

        test('no OMIT/COMPILE blocks returns empty array', () => {
            const code = 'SomeProc PROCEDURE()\nCODE\nRETURN\n';
            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);
            assert.strictEqual(blocks.length, 0);
        });

        test('genuinely unclosed block has endLine null', () => {
            const code = [
                '  OMIT(\'END_MARKER\')', // line 0
                'HiddenCode EQUATE(1)',    // line 1
                'MoreCode   EQUATE(2)',    // line 2
                // terminator never appears
            ].join('\n');

            const doc = makeDoc(code);
            const tokens = tokenize(code);
            const blocks = OmitCompileDetector.findDirectiveBlocks(tokens, doc);

            assert.strictEqual(blocks.length, 1);
            assert.strictEqual(blocks[0].endLine, null, 'genuinely unclosed block should have endLine null');
            assert.strictEqual(OmitCompileDetector.isLineOmittedWithBlocks(2, blocks), true, 'line 2 after unclosed block IS omitted');
        });
    });
});
