! Test 1: Simple RETURN followed by unreachable code
! Expected: MESSAGE and assignment should be dimmed

SimpleReturn PROCEDURE()
  CODE
    RETURN
    MESSAGE('This should be dimmed - unreachable')
    x = 1

! Test 2: Conditional RETURN - code after is reachable
! Expected: Nothing should be dimmed

ConditionalReturn PROCEDURE()
  CODE
    IF a = 1 THEN
      RETURN
    END
    MESSAGE('This is reachable')

! Test 3: ROUTINE after RETURN - always reachable
! Expected: ROUTINE content should NOT be dimmed

ProcWithRoutine PROCEDURE()
  CODE
    RETURN
    MESSAGE('This should be dimmed')

MyRoutine ROUTINE
  MESSAGE('This should NOT be dimmed - ROUTINE is always reachable')

! Test 4: ROUTINE with DATA + CODE - still reachable
! Expected: ROUTINE content should NOT be dimmed

ProcWithRoutineData PROCEDURE()
  CODE
    RETURN

MyRoutine ROUTINE
DATA
  x LONG
CODE
  MESSAGE('This should NOT be dimmed - ROUTINE with DATA+CODE is reachable')
  x = 10

! Test 5: Multiple procedures in same file
! Expected: Unreachable code marked separately per procedure

Proc1 PROCEDURE()
  CODE
    RETURN
    MESSAGE('Unreachable in Proc1')

Proc2 PROCEDURE()
  CODE
    MESSAGE('Reachable in Proc2')
    RETURN
    MESSAGE('Unreachable in Proc2')

! Test 6: EXIT as terminator
! Expected: Code after top-level EXIT is dimmed

ExitTest PROCEDURE()
  CODE
    LOOP
      IF done THEN
        EXIT  ! This EXIT only exits the loop
      END
    END
    EXIT    ! This EXIT terminates the procedure
    MESSAGE('This should be dimmed')

! Test 7: HALT as terminator
! Expected: Code after HALT is dimmed

HaltTest PROCEDURE()
  CODE
    HALT
    MESSAGE('This should be dimmed')

! Test 8: STOP is NOT a terminator
! Expected: Nothing should be dimmed

StopTest PROCEDURE()
  CODE
    STOP('Debug point')
    MESSAGE('This should NOT be dimmed - STOP is not a terminator')

! Test 9: RETURN inside CASE - not a top-level terminator
! Expected: Code after CASE is reachable

CaseTest PROCEDURE()
  CODE
    CASE x
    OF 1
      RETURN
    END
    MESSAGE('This should NOT be dimmed - RETURN was inside CASE')

! Test 10: RETURN inside LOOP - not a top-level terminator
! Expected: Code after LOOP is reachable

LoopTest PROCEDURE()
  CODE
    LOOP
      IF done THEN
        RETURN
      END
    END
    MESSAGE('This should NOT be dimmed - RETURN was inside LOOP')

! Test 11: Method implementation
! Expected: Code after RETURN is dimmed

ThisWindow.Init PROCEDURE()
  CODE
    RETURN
    MESSAGE('This should be dimmed')

! Test 12: Complex nested structures
! Expected: Only top-level terminated code is dimmed

ComplexTest PROCEDURE()
  CODE
    LOOP 10 TIMES
      IF x = 1 THEN
        CASE y
        OF 1
          BREAK
        OF 2
          CYCLE
        END
      END
    END
    RETURN
    MESSAGE('This should be dimmed')
    x = 1
