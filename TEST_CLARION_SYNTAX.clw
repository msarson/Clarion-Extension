! Test file for dot-as-END and semicolon syntax
! Copy each test case into Clarion compiler to verify behavior

!===================================================================
! TEST 1: Single-line IF with dot terminator
!===================================================================
TestProc1 PROCEDURE()
  CODE
  IF a=b THEN c=d.
  END

!===================================================================
! TEST 2: IF-THEN-statement on same line with dot
!===================================================================
TestProc2 PROCEDURE()
x LONG
result BOOL
  CODE
  IF x > 10 THEN result = true.
  RETURN
  END

!===================================================================
! TEST 3: IF with statement on next line and dot terminator
!===================================================================
TestProc3 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  IF a=b THEN
    c=d.
  END

!===================================================================
! TEST 4: IF with dot terminator on separate line
!===================================================================
TestProc4 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  IF a=b THEN
    c=d
    .
  END

!===================================================================
! TEST 5: IF with multiple statements before dot
!===================================================================
TestProc5 PROCEDURE()
x LONG
y LONG
z LONG
condition BOOL
  CODE
  IF condition THEN
    x = 1
    y = 2
    z = 3.
  END

!===================================================================
! TEST 6: LOOP with dot terminator instead of END
!===================================================================
TestProc6 PROCEDURE()
Counter LONG
  CODE
  LOOP
    Counter += 1
    IF Counter > 10 THEN BREAK.
    .
  END

!===================================================================
! TEST 7: Nested LOOP with dot terminators
!===================================================================
TestProc7 PROCEDURE()
  CODE
  LOOP
    LOOP
      !Process().
      .
    .
  END

!===================================================================
! TEST 8: CASE with dot terminators
!===================================================================
TestProc8 PROCEDURE()
Value LONG
Result STRING(20)
  CODE
  CASE Value
  OF 1
    Result = 'One'.
  OF 2
    Result = 'Two'.
    .
  END

!===================================================================
! TEST 9: CASE OF clause with dot on separate line
!===================================================================
TestProc9 PROCEDURE()
Status STRING(20)
Count LONG
Total LONG
Amount LONG
Skip BOOL
  CODE
  CASE Status
  OF 'Active'
    Count += 1
    Total += Amount
    .
  OF 'Inactive'
    Skip = true.
    .
  END

!===================================================================
! TEST 10: IF-ELSE both with dot terminators
!===================================================================
TestProc10 PROCEDURE()
x LONG
Positive BOOL
Negative BOOL
  CODE
  IF x > 0 THEN
    Positive = true.
  ELSE
    Negative = true.
    .
  END

!===================================================================
! TEST 11: Mixed dot and END terminators
!===================================================================
TestProc11 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
x LONG
y LONG
z LONG
result LONG
ok LONG
  CODE
  IF a=b THEN c=d.
  LOOP
    x += 1
  END
  IF y=z THEN result=ok.
  END

!===================================================================
! TEST 12: Distinguish dot terminator from decimal point
!===================================================================
TestProc12 PROCEDURE()
x REAL
result REAL
  CODE
  IF x > 3.14 THEN result = 1.5.
  END

!===================================================================
! TEST 13: Dot terminator after parentheses (function call)
!===================================================================
TestProc13 PROCEDURE()
a LONG
b LONG
x LONG
y LONG
  CODE
  IF a=b THEN DoSomething(x, y).
  END

DoSomething PROCEDURE(LONG pX, LONG pY)
  CODE
  END

!===================================================================
! TEST 14: Dot terminator in nested structures
!===================================================================
TestProc14 PROCEDURE()
outer BOOL
inner BOOL
x LONG
y LONG
  CODE
  IF outer THEN
    IF inner THEN x=1.
    y=2.
  END

!===================================================================
! TEST 15: Empty statement with just dot
!===================================================================
TestProc15 PROCEDURE()
condition BOOL
  CODE
  IF condition THEN
    .
  END

!===================================================================
! SEMICOLON TESTS
!===================================================================

!===================================================================
! TEST 16: Two statements on one line with semicolon
!===================================================================
TestProc16 PROCEDURE()
x LONG
y LONG
  CODE
  x = 1; y = 2
  END

!===================================================================
! TEST 17: Three statements on one line with semicolons
!===================================================================
TestProc17 PROCEDURE()
a LONG
b LONG
c LONG
  CODE
  a = 1; b = 2; c = 3
  END

!===================================================================
! TEST 18: Statements without semicolon on separate lines
!===================================================================
TestProc18 PROCEDURE()
x LONG
y LONG
z LONG
  CODE
  x = 1
  y = 2
  z = 3
  END

!===================================================================
! TEST 19: IF-THEN with multiple statements and semicolon
!===================================================================
TestProc19 PROCEDURE()
a LONG
b LONG
x LONG
y LONG
  CODE
  IF a=b THEN x=1; y=2.
  END

!===================================================================
! TEST 20: LOOP with semicolon-separated statements
!===================================================================
TestProc20 PROCEDURE()
Counter LONG
Total LONG
  CODE
  LOOP
    Counter += 1; Total += Counter
    IF Counter > 10 THEN BREAK.
  END
  END

!===================================================================
! TEST 21: Function calls with semicolons on one line
!===================================================================
TestProc21 PROCEDURE()
  CODE
  !Open(File); Read(File); Process()
  END

!===================================================================
! TEST 22: Mixed semicolons and newlines
!===================================================================
TestProc22 PROCEDURE()
x LONG
y LONG
z LONG
a LONG
b LONG
c LONG
  CODE
  x = 1; y = 2
  z = 3
  a = 4; b = 5; c = 6
  END

!===================================================================
! TEST 23: String literal containing semicolon
!===================================================================
TestProc23 PROCEDURE()
Msg STRING(20)
x LONG
  CODE
  Msg = 'Hello; World'; x = 1
  END

!===================================================================
! TEST 24: Semicolon with dot terminator
!===================================================================
TestProc24 PROCEDURE()
condition BOOL
x LONG
y LONG
z LONG
  CODE
  IF condition THEN x=1; y=2; z=3.
  END

!===================================================================
! TEST 25: Trailing semicolon (no statement after)
!===================================================================
TestProc25 PROCEDURE()
x LONG
y LONG
  CODE
  x = 1;
  y = 2
  END

!===================================================================
! INVALID SYNTAX TESTS - These should FAIL to compile
!===================================================================

!===================================================================
! TEST 26: INVALID - IF without THEN, just dot
!===================================================================
TestProc26 PROCEDURE()
a LONG
b LONG
  CODE
  IF a=b.
  END

!===================================================================
! TEST 27: INVALID - IF without THEN keyword
!===================================================================
TestProc27 PROCEDURE()
condition BOOL
x LONG
  CODE
  IF condition x=1.
  END

!===================================================================
! TEST 28: VALID - LOOP with inline statement and dot (a=1 TO 10)
!===================================================================
TestProc28 PROCEDURE()
a LONG
  CODE
  LOOP a=1 TO 10.
  END

!===================================================================
! TEST 29: VALID - IF with THEN and dot (baseline valid test)
!===================================================================
TestProc29 PROCEDURE()
a LONG
b LONG
c LONG
d LONG
  CODE
  IF a=b THEN c=d.
  END

!===================================================================
! TEST 30: Dot in expression (decimal number)
!===================================================================
TestProc30 PROCEDURE()
a REAL
c LONG
d LONG
  CODE
  IF a=0.5 THEN c=d
  END
