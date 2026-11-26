import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-protocol';
import { HoverProvider } from '../providers/HoverProvider';
import { TokenCache } from '../TokenCache';

// A column-0 label is the name being declared, whatever word it is. CODE, MAP, MODULE,
// SELF and PARENT are keywords that may still label data (`Code  STRING(128)` is a
// common field name), and CODE, MAP, PARENT, SELF are entries in clarion-keywords.json.
//
// HoverRouter step 9.8 (handleKeyword) returned the keyword card for any word found in
// clarion-keywords.json, with no declaration-label check, so hovering the field `Code`
// showed "CODE - Begins the executable code section" instead of the field. The
// attribute (step 9) and built-in (step 10) steps already return null for a declaration
// label (isDeclarationLabel); the keyword step now does the same, and the variable
// resolution after the router gives the label its own card.
suite('HoverProvider - a declaration label spelled like a language keyword', () => {
    let provider: HoverProvider;
    let tokenCache: TokenCache;

    setup(() => {
        provider = new HoverProvider();
        tokenCache = TokenCache.getInstance();
        tokenCache.clearAllTokens();
    });

    teardown(() => {
        tokenCache.clearAllTokens();
    });

    function hoverText(hover: any): string {
        if (!hover) return '';
        return typeof hover.contents === 'string'
            ? hover.contents
            : 'value' in hover.contents ? hover.contents.value : '';
    }

    async function hoverAt(uri: string, code: string, line: number, character: number): Promise<string> {
        const doc = TextDocument.create(uri, 'clarion', 1, code);
        tokenCache.getTokens(doc);
        return hoverText(await provider.provideHover(doc, Position.create(line, character)));
    }

    const CODE_KEYWORD_CARD = 'Begins the executable code section';

    test('a field named Code in a GROUP,TYPE shows the field, not the CODE keyword card', async () => {
        const code = [
            'ErrorInfoType  GROUP,TYPE',
            'Code             STRING(128)',
            'Message          STRING(256)',
            '               END',
        ].join('\r\n');

        const hover = await hoverAt('test://keyword-label-group-type.inc', code, 1, 1);
        assert.ok(!hover.includes(CODE_KEYWORD_CARD), `Must not show the CODE keyword card; got: ${hover}`);
        assert.ok(hover.includes('STRING(128)') && hover.includes('ErrorInfoType'),
            `Should show the field's own declaration in ErrorInfoType; got: ${hover}`);
    });

    test('a procedure-local variable named Code shows the variable, not the CODE keyword card', async () => {
        const code = [
            '  MEMBER()',
            'MyProc PROCEDURE()',
            'Code   LONG',
            '  CODE',
            '  RETURN',
        ].join('\r\n');

        const hover = await hoverAt('test://keyword-label-local.clw', code, 2, 1);
        assert.ok(!hover.includes(CODE_KEYWORD_CARD), `Must not show the CODE keyword card; got: ${hover}`);
        assert.ok(hover.includes('LONG'), `Should show the local variable's LONG type; got: ${hover}`);
    });

    test('a global variable named Map shows the variable, not the MAP keyword card', async () => {
        const code = [
            '  PROGRAM',
            'Map    LONG',
            '  MAP',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\r\n');

        const hover = await hoverAt('test://keyword-label-map.clw', code, 1, 1);
        assert.ok(!hover.includes('**MAP**'), `Must not show the MAP keyword card; got: ${hover}`);
        assert.ok(hover.includes('LONG'), `Should show the global variable's LONG type; got: ${hover}`);
    });

    test('sentinel - a reserved word starting a statement in column 0 keeps its keyword card', async () => {
        // Every column-0 token is a Label token, but a reserved word is never a label: the
        // compiler accepts it in column 1 as the statement keyword.
        const code = [
            '  MEMBER()',
            'MyProc PROCEDURE()',
            'X      LONG',
            '  CODE',
            'IF X = 1',
            '  X = 2',
            '  END',
            'RETURN',
        ].join('\r\n');

        const ifHover = await hoverAt('test://keyword-sentinel-column0-if.clw', code, 4, 1);
        assert.ok(ifHover.includes('**IF**') && !ifHover.includes('variable'),
            `A column-0 IF keeps its keyword card; got: ${ifHover}`);

        const returnHover = await hoverAt('test://keyword-sentinel-column0-return.clw', code, 7, 1);
        assert.ok(returnHover.includes('**RETURN**') && !returnHover.includes('variable'),
            `A column-0 RETURN keeps its keyword card; got: ${returnHover}`);
    });

    test('sentinel - an indented CODE statement still shows the CODE keyword card', async () => {
        const code = [
            '  MEMBER()',
            'MyProc PROCEDURE()',
            'Count  LONG',
            '  CODE',
            '  RETURN',
        ].join('\r\n');

        const hover = await hoverAt('test://keyword-sentinel-indented-code.clw', code, 3, 3);
        assert.ok(hover.includes(CODE_KEYWORD_CARD), `An indented CODE statement keeps its keyword card; got: ${hover}`);
    });

    test('sentinel - a bare CODE statement at column 0 still shows the CODE keyword card', async () => {
        const code = [
            '  MEMBER()',
            'MyProc PROCEDURE()',
            'Count  LONG',
            'CODE',
            '  RETURN',
        ].join('\r\n');

        const hover = await hoverAt('test://keyword-sentinel-column0-code.clw', code, 3, 1);
        assert.ok(hover.includes(CODE_KEYWORD_CARD), `A bare column-0 CODE statement keeps its keyword card; got: ${hover}`);
    });

    test('sentinel - an indented MAP structure still shows its keyword card', async () => {
        const code = [
            '  PROGRAM',
            '  MAP',
            'MyProc PROCEDURE()',
            '  END',
            '  CODE',
            '  RETURN',
        ].join('\r\n');

        const hover = await hoverAt('test://keyword-sentinel-map.clw', code, 1, 3);
        assert.ok(hover.includes('**MAP**'), `An indented MAP keeps its keyword card; got: ${hover}`);
    });
});
