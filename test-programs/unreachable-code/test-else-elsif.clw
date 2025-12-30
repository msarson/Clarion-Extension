! Test ELSE/ELSIF branch handling
! RETURN in IF branch should NOT mark ELSE branch as unreachable

TestElse PROCEDURE()
  CODE
  IF x = 1
    RETURN  ! Terminates IF branch only
  ELSE
    MESSAGE('This should NOT be dimmed - in ELSE branch')
  END
  MESSAGE('This should NOT be dimmed - after IF...END')

TestElsif PROCEDURE()
  CODE
  IF x = 1
    RETURN  ! Terminates first IF branch
  ELSIF x = 2
    MESSAGE('This should NOT be dimmed - in ELSIF branch')
    RETURN  ! Terminates ELSIF branch
  ELSE
    MESSAGE('This should NOT be dimmed - in ELSE branch')
  END
  MESSAGE('This should NOT be dimmed - after IF...END')

TestTopLevelReturn PROCEDURE()
  CODE
  RETURN
  MESSAGE('This SHOULD be dimmed - after top-level RETURN')
