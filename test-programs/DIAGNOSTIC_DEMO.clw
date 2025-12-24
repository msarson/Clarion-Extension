  PROGRAM

  MAP
  END

GlobalVar LONG

  CODE
  
TestProc1 PROCEDURE()
  CODE
  IF x > 0 THEN
    y = 1
  ! Missing END or . here - should generate diagnostic
  RETURN

TestProc2 PROCEDURE()
  CODE
  LOOP i=1 TO 10
    Message('Value: ' & i)
  ! Missing END or . here - should generate diagnostic
  RETURN

TestProc3 PROCEDURE()
  CODE
  IF x > 0 THEN
    y = 1
  .                   ! Correct - dot terminator
  RETURN

TestProc4 PROCEDURE()
MyGroup GROUP
  Field1 LONG
  Field2 STRING(20)
  .                   ! Correct - dot terminator
  CODE
  RETURN

TestProc5 PROCEDURE()
  CODE
  CASE x
  OF 1
    Message('One')
  OF 2
    Message('Two')
  ! Missing END here - should generate diagnostic
  RETURN
