! Test CASE statement branch handling
! RETURN in one branch should NOT mark other branches as unreachable

TestCaseAllBranches PROCEDURE(LONG something)
  CODE
  CASE something
    OF 1
      RETURN 100
    OF 2
      RETURN 200
    OROF 3
      RETURN 300
    ELSE
      RETURN 0
  END
  MESSAGE('Should NOT be dimmed - all branches return but we are conservative')

TestCaseSomeBranches PROCEDURE(LONG something)
  CODE
  CASE something
    OF 1
      RETURN 100
    OF 2
      a = 2  ! No RETURN in this branch
    ELSE
      RETURN 0
  END
  MESSAGE('Should NOT be dimmed - OF 2 branch does not return')

TestCaseNestedReturn PROCEDURE(LONG something)
  CODE
  CASE something
    OF 1
      IF x = 5
        RETURN 100
      END
      MESSAGE('Should NOT be dimmed - RETURN was inside IF')
    ELSE
      RETURN 0
  END
  MESSAGE('Should NOT be dimmed - after CASE...END')
