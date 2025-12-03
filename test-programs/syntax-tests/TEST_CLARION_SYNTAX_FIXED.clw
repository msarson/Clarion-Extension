  PROGRAM
! TEST_CLARION_SYNTAX_FIXED.CLW
! Fixed version of test program - all syntax errors corrected based on KB
! This version should compile successfully with the Clarion compiler

  MAP
TestProc1  PROCEDURE()
TestProc2  PROCEDURE()
TestProc3  PROCEDURE()
TestProc4  PROCEDURE()
TestProc5  PROCEDURE()
TestProc6  PROCEDURE()
TestProc7  PROCEDURE()
TestProc8  PROCEDURE()
TestProc9  PROCEDURE()
TestProc10 PROCEDURE()
TestProc11 PROCEDURE()
TestProc12 PROCEDURE()
TestProc13 PROCEDURE()
TestProc14 PROCEDURE()
TestProc15 PROCEDURE()
TestProc16 PROCEDURE()
TestProc17 PROCEDURE()
TestProc18 PROCEDURE()
TestProc19 PROCEDURE()
TestProc20 PROCEDURE()
  END

  CODE
  MESSAGE('Testing Clarion Syntax - Dot and Semicolon Tests (FIXED)')
  
  ! Run all tests
  TestProc1()
  TestProc2()
  TestProc3()
  TestProc4()
  TestProc5()
  TestProc6()
  TestProc7()
  TestProc8()
  TestProc9()
  TestProc10()
  TestProc11()
  TestProc12()
  TestProc13()
  TestProc14()
  TestProc15()
  TestProc16()
  TestProc17()
  TestProc18()
  TestProc19()
  TestProc20()
  
  MESSAGE('All tests completed successfully!')
  RETURN

!===================================================================
! TEST 1: Single-line IF with dot terminator
! STATUS: OK - Already correct
!===================================================================
TestProc1 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 1
  b = 1
  IF a=b THEN c=d.
  RETURN

!===================================================================
! TEST 2: IF-THEN-statement on same line with dot
! STATUS: OK - Already correct
!===================================================================
TestProc2 PROCEDURE()
x LONG
result LONG
  CODE
  x = 15
  IF x > 10 THEN result = 1.
  RETURN

!===================================================================
! TEST 3: IF with statement on next line and dot terminator
! STATUS: FIXED - dot after c=d terminates statement, not IF
! FIXED: Added explicit dot on separate line to terminate IF structure
!===================================================================
TestProc3 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 5
  b = 5
  IF a=b THEN
    c=d
  .
  RETURN

!===================================================================
! TEST 4: IF with dot terminator on separate line
! STATUS: OK - Already correct
!===================================================================
TestProc4 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  a = 10
  b = 10
  IF a=b THEN
    c=d
  .
  RETURN

!===================================================================
! TEST 5: IF-ELSIF-ELSE with single dot terminator
! STATUS: OK - Already correct
!===================================================================
TestProc5 PROCEDURE()
x LONG
result LONG
  CODE
  x = 5
  IF x < 0 THEN
    result = -1
  ELSIF x = 0 THEN
    result = 0
  ELSE
    result = 1
  .
  RETURN

!===================================================================
! TEST 6: LOOP with dot terminator
! STATUS: OK - Already correct
!===================================================================
TestProc6 PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
    IF i > 5 THEN BREAK.
  .
  RETURN

!===================================================================
! TEST 7: LOOP with END keyword
! STATUS: FIXED - IF needs terminator
! FIXED: Added dot after BREAK or changed to use END
!===================================================================
TestProc7 PROCEDURE()
i LONG
  CODE
  i = 0
  LOOP
    i += 1
    IF i > 5 THEN BREAK.
  END
  RETURN

!===================================================================
! TEST 8: Nested IF with mixed dot and END
! STATUS: OK - Already correct
!===================================================================
TestProc8 PROCEDURE()
x LONG
y LONG
result LONG
  CODE
  x = 10
  y = 20
  IF x > 0 THEN
    IF y > 0 THEN result = 1.
  .
  RETURN

!===================================================================
! TEST 9: CASE with dot terminator
! STATUS: OK - Already correct
!===================================================================
TestProc9 PROCEDURE()
choice LONG
result LONG
  CODE
  choice = 2
  CASE choice
  OF 1
    result = 10
  OF 2
    result = 20
  OF 3
    result = 30
  ELSE
    result = 0
  .
  RETURN

!===================================================================
! TEST 10: CASE with END keyword
! STATUS: OK - Already correct (END is indented)
!===================================================================
TestProc10 PROCEDURE()
choice LONG
result LONG
  CODE
  choice = 1
  CASE choice
  OF 1
    result = 10
  OF 2
    result = 20
  ELSE
    result = 0
  END
  RETURN

!===================================================================
! TEST 11: GROUP with dot terminator on same line
! STATUS: OK - Already correct
!===================================================================
TestProc11 PROCEDURE()
MyGroup GROUP.
  CODE
  RETURN

!===================================================================
! TEST 12: GROUP with fields and dot terminator
! STATUS: OK - Already correct
!===================================================================
TestProc12 PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
.
  CODE
  MyGroup.Field1 = 100
  MyGroup.Field2 = 'Test'
  RETURN

!===================================================================
! TEST 13: GROUP with END keyword
! STATUS: ERROR FIXED - END was at column 0
! FIXED: Indented END to comply with KB rules
!===================================================================
TestProc13 PROCEDURE()
MyGroup GROUP
Field1 LONG
Field2 STRING(20)
  END
  CODE
  MyGroup.Field1 = 100
  RETURN

!===================================================================
! TEST 14: IF with END on same line (space separator)
! STATUS: OK - Already correct
!===================================================================
TestProc14 PROCEDURE()
a LONG
b LONG
  CODE
  a = 5
  b = 5
  IF a = b THEN MESSAGE('Equal') END
  RETURN

!===================================================================
! TEST 15: Multiple IFs with dots
! STATUS: OK - Already correct
!===================================================================
TestProc15 PROCEDURE()
x LONG
y LONG
  CODE
  x = 10
  y = 20
  IF x > 0 THEN y += 1.
  IF y > 0 THEN x += 1.
  RETURN

!===================================================================
! TEST 16: Two statements on one line with semicolon
! STATUS: OK - Already correct
!===================================================================
TestProc16 PROCEDURE()
x LONG
y LONG
  CODE
  x = 1; y = 2
  RETURN

!===================================================================
! TEST 17: Three statements on one line with semicolons
! STATUS: OK - Already correct
!===================================================================
TestProc17 PROCEDURE()
a LONG
b LONG
c LONG
  CODE
  a = 1; b = 2; c = 3
  RETURN

!===================================================================
! TEST 18: Statements without semicolon on separate lines
! STATUS: OK - Already correct
!===================================================================
TestProc18 PROCEDURE()
x LONG
y LONG
z LONG
  CODE
  x = 1
  y = 2
  z = 3
  RETURN

!===================================================================
! TEST 19: IF-THEN with multiple statements and semicolon
! STATUS: OK - Already correct
!===================================================================
TestProc19 PROCEDURE()
a LONG
b LONG
x LONG
y LONG
  CODE
  a = 1
  b = 1
  IF a = b THEN x = 1; y = 2.
  RETURN

!===================================================================
! TEST 20: ROUTINE with and without DATA section
! STATUS: OK - Already correct
!===================================================================
TestProc20 PROCEDURE()
ProcVar LONG
  CODE
  ProcVar = 10
  DO MyRoutine
  DO SimpleRoutine
  RETURN
  
MyRoutine ROUTINE
DATA
RoutineVar LONG
CODE
  RoutineVar = 5
  ProcVar += RoutineVar
  
SimpleRoutine ROUTINE
  MESSAGE('Simple routine executed')
  ProcVar += 1
