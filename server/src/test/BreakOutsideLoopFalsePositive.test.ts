import * as assert from 'assert';
import { ClarionTokenizer, Token } from '../ClarionTokenizer';
import { DocumentStructure } from '../DocumentStructure';
import { validateCycleBreakOutsideLoop } from '../providers/diagnostics/ControlFlowDiagnostics';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Issue #178 — BREAK false positive: `'BREAK' used outside of a LOOP or ACCEPT
 * structure.` fires on a BREAK that IS nested inside a `LOOP UNTIL …` block.
 *
 * Reported repro: Frame_AcctsMap.clw:9185 — BREAK nested 4-deep inside a
 * `LOOP UNTIL Access:TaxRates.Next()` whose body is full of compound-label
 * method calls (`RC:CFG_TaxRates:Accura.SetRowCellValue(...)`).
 *
 * KEY DISTINCTION from the existing `validateCycleBreakOutsideLoop` suite in
 * DiagnosticProvider.test.ts: those helpers tokenize WITHOUT running
 * DocumentStructure, so they exercise the raw-token *fallback* path. The
 * production bug lives in the `hasFinishesAt` path, which only activates once
 * DocumentStructure.process() has stamped `finishesAt` on the LOOP/ACCEPT
 * tokens. This fixture therefore runs the full production pipeline.
 * (feedback_red_fixture_matches_user_repro)
 */

function createDocument(code: string): TextDocument {
    return TextDocument.create('file:///test.clw', 'clarion', 1, code);
}

// Production path: tokenize → DocumentStructure.process() (stamps finishesAt) →
// run the diagnostic against the same processed tokens.
function diagsProductionPath(code: string): ReturnType<typeof validateCycleBreakOutsideLoop> {
    const doc = createDocument(code);
    const tokens: Token[] = new ClarionTokenizer(code).tokenize();
    new DocumentStructure(tokens).process();
    return validateCycleBreakOutsideLoop(tokens, doc);
}

suite('Issue #178 — BREAK false positive inside LOOP UNTIL', () => {

    // ── Positive pin: the user's repro must produce NO diagnostic ───────────
    // The trigger is an INNER `LOOP UNTIL …` nested inside an OUTER counted
    // LOOP — the same-line UNTIL header was being misattributed to the outer
    // loop, prematurely closing the inner loop on its own line. The outer
    // wrapper is load-bearing: without it the false positive does not surface.
    test('BREAK nested deep inside LOOP UNTIL (inside an outer LOOP) — no warning', () => {
        const code = `MapProc PROCEDURE()
  CODE
  LOOP pcvCntr = 1 TO RECORDS(lqExt) BY 1
    GET(lqExt, pcvCntr)
    LOOP UNTIL Access:TaxRates.Next()
      IF CLIP(TAX:SLDescription) = CLIP(lqExt.Name)
        TAX:SLExternalID = lqExt.ID
      END
      IF lvTaxRateError = FALSE
        IF ERRORCODE() = 0
          IF CLIP(TAX:SLExternalID) <> ''
            RC:CFG_TaxRates:Accura.SetRowCellValue(TAX:TaxRateID, 'SLEXT.ID', lqExt.ID)
          END
          IF    CLIP(TAX:SLExternalID) <> '' AND CLIP(TAX:PLExternalID) <> ''
            RC:CFG_TaxRates:Accura.SetRowCellValue(TAX:TaxRateID, 'LINK.TYPE', 'both')
          ELSIF CLIP(TAX:SLExternalID) <> '' AND CLIP(TAX:PLExternalID) =  ''
            RC:CFG_TaxRates:Accura.SetRowCellValue(TAX:TaxRateID, 'LINK.TYPE', 'sales')
          ELSE
            RC:CFG_TaxRates:Accura.SetRowCellValue(TAX:TaxRateID, 'LINK.TYPE', '')
          END
          BREAK
        END
      END
    END
  END
  RETURN`;
        const diags = diagsProductionPath(code);
        const breakDiags = diags.filter(d => d.message.includes('BREAK'));
        assert.deepStrictEqual(
            breakDiags.map(d => d.message),
            [],
            'BREAK is inside LOOP UNTIL — must not warn'
        );
    });

    // ── Negative regression sentinel: genuinely-outside BREAK STILL warns ───
    // (feedback_bidirectional_pin_assertion — assert the diagnostic is not
    //  silently disabled wholesale.)
    test('BREAK outside any LOOP/ACCEPT — still warns', () => {
        const code = `MapProc PROCEDURE()
  CODE
  IF SomeCondition
    BREAK
  END
  RETURN`;
        const diags = diagsProductionPath(code);
        const breakDiags = diags.filter(d => d.message.includes('BREAK'));
        assert.strictEqual(breakDiags.length, 1, 'BREAK truly outside a loop must still warn');
    });

    // ── Minimal isolation: inner `LOOP UNTIL` nested in an outer LOOP. ──────
    // The tightest shape that reproduces #178 — no compound-label calls, no
    // deep IF nesting. Pins the actual mechanism: the inner header-form UNTIL
    // must not be misattributed to the outer LOOP.
    test('BREAK inside inner LOOP UNTIL nested in outer LOOP — no warning', () => {
        const code = `MapProc PROCEDURE()
  CODE
  LOOP pcvCntr = 1 TO 10 BY 1
    LOOP UNTIL Access:TaxRates.Next()
      BREAK
    END
  END
  RETURN`;
        const diags = diagsProductionPath(code);
        const breakDiags = diags.filter(d => d.message.includes('BREAK'));
        assert.deepStrictEqual(breakDiags.map(d => d.message), [],
            'inner LOOP UNTIL must own its BREAK; outer LOOP must not swallow the UNTIL header');
    });
});
