import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Hover } from 'vscode-languageserver/node';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';
import { setServerInitialized } from '../serverState';

/**
 * A parameter's card names the procedure that declares it, before the link to its PROCEDURE line
 * (#617: "<procedure>, line N"). It printed the scope token's value, which is the PROCEDURE keyword
 * itself, so every parameter card read "PROCEDURE, file:line".
 */

const LINES = [
    '  PROGRAM',
    '  MAP',
    'Compute   PROCEDURE(LONG pCount, STRING pName)',
    '  END',
    'Counter CLASS',
    'Add       PROCEDURE(LONG pStep)',
    '        END',
    '  CODE',
    '',
    'Compute PROCEDURE(LONG pCount, STRING pName)',
    'Total   LONG',
    '  CODE',
    '  Total = pCount',
    '',
    'Counter.Add PROCEDURE(LONG pStep)',
    '  CODE',
    '  SELF.Value += pStep',
];

let counter = 0;

/** The card with the cursor on `word` on the line equal to `lineText` after trimming. */
async function hoverOn(lineText: string, word: string): Promise<string> {
    const line = LINES.findIndex(l => l.trim() === lineText);
    assert.ok(line >= 0, `no line ${lineText}`);
    const at = LINES[line].indexOf(word);
    assert.ok(at >= 0, `${word} not on ${LINES[line]}`);
    const doc = TextDocument.create(`file:///C:/temp/paramcard-${++counter}.clw`, 'clarion', 1, LINES.join('\r\n'));
    TokenCache.getInstance().clearAllTokens();
    const h: Hover | null = await new HoverProvider().provideHover(doc, { line, character: at + 1 });
    return (h?.contents as { value?: string } | undefined)?.value ?? '';
}

/** The card's last line: "<procedure>, [file:line](link)". */
const whereLine = (card: string) => card.split('\n').filter(l => l.trim()).pop() ?? '';

suite('Hover — a parameter card names its procedure', () => {
    suiteSetup(() => setServerInitialized(true));

    test('a parameter in a procedure body names the procedure', async () => {
        const card = await hoverOn('Total = pCount', 'pCount');
        assert.ok(card.startsWith('**Parameter:** `pCount`'), `expected a parameter card, got: ${card}`);
        assert.ok(whereLine(card).startsWith('Compute, ['), `expected "Compute, [link]", got: ${whereLine(card)}`);
        assert.ok(whereLine(card).includes(':10]'), `expected the link to the PROCEDURE line 10, got: ${whereLine(card)}`);
    });

    test('a parameter in a method body names the method', async () => {
        const card = await hoverOn('SELF.Value += pStep', 'pStep');
        assert.ok(card.startsWith('**Parameter:** `pStep`'), `expected a parameter card, got: ${card}`);
        assert.ok(whereLine(card).startsWith('Counter.Add, ['), `expected "Counter.Add, [link]", got: ${whereLine(card)}`);
    });
});
