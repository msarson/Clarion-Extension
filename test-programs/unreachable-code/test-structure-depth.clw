! Comprehensive test for structure depth tracking

! Test 1: ACCEPT block with RETURN after
TestAcceptBlock PROCEDURE()
  CODE
  ACCEPT
    CASE EVENT()
    OF EVENT:OpenWindow
      MESSAGE('Inside ACCEPT')
    END
  END
  RETURN
  MESSAGE('UNREACHABLE - after RETURN following ACCEPT')
  x = 1

! Test 2: Nested structures
TestNested PROCEDURE()
  CODE
  LOOP
    IF x = 1 THEN
      CASE y
      OF 1
        MESSAGE('nested')
      END
    END
  END
  RETURN
  MESSAGE('UNREACHABLE - after complex nesting')

! Test 3: Statement with dot terminator (NOT structure ender)
TestDotStatement PROCEDURE()
  CODE
  RETURN.
  MESSAGE('UNREACHABLE - RETURN. has dot but still terminates')
  IF A=1 THEN RETURN.
  MESSAGE('UNREACHABLE - even IF with RETURN. should make this unreachable')

! Test 4: Actual dot structure ender
TestDotStructure PROCEDURE()
  CODE
  IF x = 1
    MESSAGE('inside IF')
  .   ! Dot alone on line ends IF structure
  RETURN
  MESSAGE('UNREACHABLE - after dot-terminated IF and RETURN')

! Test 5: EXECUTE structure
TestExecute PROCEDURE()
  CODE
  EXECUTE choice
    MESSAGE('option 1')
    MESSAGE('option 2')
  END
  RETURN
  MESSAGE('UNREACHABLE - after EXECUTE block')

! Test 6: BEGIN...END structure
TestBegin PROCEDURE()
  CODE
  BEGIN
    x = 1
    y = 2
  END
  RETURN
  MESSAGE('UNREACHABLE - after BEGIN block')

! Test 7: Multiple returns with dots
TestMultipleDots PROCEDURE()
  CODE
  IF test1 THEN RETURN.
  MESSAGE('REACHABLE - conditional return')
  RETURN.
  MESSAGE('UNREACHABLE - after unconditional RETURN.')
  x = 1.
  y = 2.
