import * as assert from 'assert';
import { ClarionTokenizer } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { TokenType } from '../tokenizer/TokenTypes';
import { OmitCompileDetector } from '../utils/OmitCompileDetector';

/**
 * #733 — #721 made every edit in a module holding an OMIT split the whole text into lines and
 * search every line from the top of the file for the terminator, stripping string literals from
 * each: about 5 ms a keystroke on a 61,000-line module. The search reads only the lines after a
 * directive, and DocumentStructure takes the lines through an accessor, so the incremental path
 * can hand it the document's lines without splitting the text.
 */
suite('#733 OMIT body detection reads only the lines it needs', () => {

    const FILLER = 1000;
    const lines = [
        ...Array.from({ length: FILLER }, (_, i) => `Var${i}  LONG`),   // 0..999
        "  OMIT('***')",                                                 // 1000
        '  IF a',                                                        // 1001
        "  MESSAGE('***')",                                              // 1002 <- terminator only in a string
        '  ***',                                                         // 1003 <- the terminator
        ...Array.from({ length: FILLER }, (_, i) => `Var${i + FILLER}  LONG`),
    ];
    const text = lines.join('\r\n');

    test('the terminator search reads no line before the directive or after the terminator', () => {
        const tokens = new ClarionTokenizer(text).tokenize();
        const read: number[] = [];
        const blocks = OmitCompileDetector.findDirectiveBlocksInLines(tokens, lines.length, l => { read.push(l); return lines[l]; });
        assert.deepStrictEqual(blocks.map(b => [b.type, b.startLine, b.endLine]), [['OMIT', 1000, 1003]]);
        assert.deepStrictEqual(read, [1001, 1002, 1003], `read ${read.length} lines, from ${read[0]} to ${read[read.length - 1]}`);
    });

    test('a structure parser given a line accessor reads the OMIT body as an array would', () => {
        const program = [
            '  PROGRAM',
            '  MAP',
            '  END',
            'Flag  LONG',
            '  CODE',
            '  IF Flag',                 // 5
            "    OMIT('Cycle')",
            '    IF Flag',
            '      Cycle',
            '  .',                       // 9 <- closes the IF on line 5
        ];
        const ifOn5 = (ds: DocumentStructure, tokens: ReturnType<ClarionTokenizer['tokenize']>) => {
            ds.process();
            return tokens.find(t => t.type === TokenType.Structure && t.line === 5)!.finishesAt;
        };
        const tokA = new ClarionTokenizer(program.join('\r\n')).tokenize();
        const fromArray = ifOn5(new DocumentStructure(tokA, program), tokA);
        const tokB = new ClarionTokenizer(program.join('\r\n')).tokenize();
        const accessor = { length: program.length, at: (i: number) => program[i] };
        const fromAccessor = ifOn5(new DocumentStructure(tokB, accessor as never), tokB);
        assert.strictEqual(fromArray, 9);
        assert.strictEqual(fromAccessor, 9);
    });
});
