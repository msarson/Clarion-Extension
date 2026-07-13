import * as assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenCache } from '../TokenCache';
import { ScopeAnalyzer } from '../utils/ScopeAnalyzer';

/**
 * Issue #339 — F12 on globals declared in INCLUDEd files was blocked by
 * `ScopeAnalyzer.canAccess`: cross-file Rule 1 accepted globals only from
 * PROGRAM-headed files, so a pure data include (Globals.inc — no PROGRAM, no
 * MEMBER header) fell to the default deny. Hover doesn't run the gate, so the
 * two surfaces disagreed ("hover works, Go To Definition doesn't" — Mark's
 * SmokeTest101 smoke, follow-up to #334/#337).
 *
 * Fix under test: Rule 1b — global-scope declarations in header-less files
 * take the scope of their inclusion site and are accessible cross-file.
 */

let docCounter = 0;
function makeDoc(name: string, lines: string[]): TextDocument {
    const doc = TextDocument.create(`file:///c:/test339/${name}?v=${++docCounter}`, 'clarion', 1, lines.join('\r\n'));
    TokenCache.getInstance().getTokens(doc);
    return doc;
}

suite('Issue #339 — canAccess for include-file globals', () => {

    function analyzer(): ScopeAnalyzer {
        return new ScopeAnalyzer(TokenCache.getInstance(), undefined as never);
    }

    const memberRef = () => makeDoc('BetaWin.clw', [
        "  MEMBER('ProjBeta.clw')",
        '  MAP',
        '  END',
        'BetaWin              PROCEDURE()',
        '  CODE',
        '  SmokeRequest = 2',      // line 5 — the reference
        '  RETURN',
    ]);

    test('global in a header-less include file is accessible cross-file (Edin/smoke shape)', () => {
        const refDoc = memberRef();
        const declDoc = makeDoc('Globals.inc', [
            '! per-project globals include - no PROGRAM/MEMBER header',
            'SmokeRequest         LONG(0),THREAD',   // line 1 — the declaration
            'BetaSpecialFlag      BYTE(0)',
        ]);

        const ok = analyzer().canAccess({ line: 5, character: 2 }, { line: 1, character: 0 }, refDoc, declDoc);
        assert.strictEqual(ok, true, 'include-file global must be accessible (hover surfaces it; F12 must agree)');
    });

    test('regression: global in a PROGRAM file still accessible cross-file', () => {
        const refDoc = memberRef();
        const declDoc = makeDoc('ProjBeta.clw', [
            '  PROGRAM',
            '  MAP',
            '  END',
            'ParentGlobal         LONG',              // line 3
            '  CODE',
            '  RETURN',
        ]);

        const ok = analyzer().canAccess({ line: 5, character: 2 }, { line: 3, character: 0 }, refDoc, declDoc);
        assert.strictEqual(ok, true);
    });

    test('sentinel: module-scope data in another MEMBER still denied cross-file', () => {
        const refDoc = memberRef();
        const declDoc = makeDoc('OtherMember.clw', [
            "  MEMBER('ProjBeta.clw')",
            '  MAP',
            '  END',
            'ModuleLocal          LONG',              // line 3 — module scope
            'SomeProc             PROCEDURE()',
            '  CODE',
            '  RETURN',
        ]);

        const ok = analyzer().canAccess({ line: 5, character: 2 }, { line: 3, character: 0 }, refDoc, declDoc);
        assert.strictEqual(ok, false, 'module-scope data must stay invisible cross-file (Rule 2)');
    });

    test('sentinel: procedure-local in a header-less include still denied cross-file', () => {
        const refDoc = memberRef();
        // Pathological include containing a procedure with locals — Rule 3
        // must still deny even though the file is header-less.
        const declDoc = makeDoc('WeirdInclude.inc', [
            'IncGlobal            LONG',
            'IncProc              PROCEDURE()',
            'ProcLocal              LONG',            // line 2 — procedure-local
            '  CODE',
            '  RETURN',
        ]);

        const ok = analyzer().canAccess({ line: 5, character: 2 }, { line: 2, character: 0 }, refDoc, declDoc);
        assert.strictEqual(ok, false, 'procedure-local data in an include must stay invisible (Rule 3)');
    });
});
