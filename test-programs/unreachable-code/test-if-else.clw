! Test case for IF...ELSE...END unreachable code detection
! The RETURN is inside the IF branch, code after END should NOT be dimmed

StateCalc:Kill PROCEDURE
StateCalc:Kill_Called    BYTE,STATIC

  CODE
  IF StateCalc:Kill_Called
     RETURN
  ELSE
     StateCalc:Kill_Called = True
  END
  IBSCOMMON:Kill()                                         ! Should NOT be dimmed - it's reachable via ELSE branch

! Test 2: RETURN in both branches should dim code after END
TestBothBranches PROCEDURE
  CODE
  IF x = 1
    RETURN
  ELSE
    RETURN
  END
  MESSAGE('This SHOULD be dimmed - both branches return')
