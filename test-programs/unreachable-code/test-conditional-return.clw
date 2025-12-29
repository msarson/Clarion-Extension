! Test case for bug: RETURN inside IF should NOT dim code after IF...END
! Expected: Only code AFTER line 18 (final RETURN) should be dimmed
! Bug was: Code after line 11 (RETURN 0) was being dimmed incorrectly

ctArkansasBasis.GetStateTax PROCEDURE(Real Amount, REAL OvertimeAmount)
TaxableAmount REAL
  CODE
  ! Calculate taxable amount
  TaxableAmount = Amount

  ! Early exit for non-positive amounts
  IF TaxableAmount <= 0 THEN
    RETURN 0                         ! Line 11: Conditional RETURN - should NOT mark code after END as unreachable
  END

  ! This code should NOT be dimmed (it's reachable when TaxableAmount > 0)
  LOOP a# = 1 TO RECORDS(Self.BQ)
    GET(Self.BQ, a#)
    IF TaxableAmount >= Self.BQ.AmountFrom AND TaxableAmount <= Self.BQ.AmountTo
      BREAK
    END
  END

  RETURN ((TaxableAmount * Self.BQ.Percentage) - Self.BQ.AddOn)   ! Line 18: Top-level RETURN

  ! This code SHOULD be dimmed (unreachable after line 18)
  MESSAGE('This is unreachable')
  x = 1


! Test case 2: Single-line IF with RETURN should also NOT dim following code
TestSingleLineIf PROCEDURE()
  CODE
  IF x = 1 THEN RETURN         ! Single-line IF - following code is reachable
  MESSAGE('This should NOT be dimmed')
  
  IF y = 2 THEN                ! Multi-line IF
    RETURN
  END
  MESSAGE('This should NOT be dimmed either')
  
  RETURN                       ! Top-level RETURN
  MESSAGE('This SHOULD be dimmed')


! Test case 3: Nested IF structures
TestNestedIf PROCEDURE()
  CODE
  IF x = 1 THEN
    IF y = 2 THEN
      RETURN
    END
    MESSAGE('This should NOT be dimmed - outer IF continues')
  END
  MESSAGE('This should NOT be dimmed - outside both IFs')
  
  RETURN
  MESSAGE('This SHOULD be dimmed')
