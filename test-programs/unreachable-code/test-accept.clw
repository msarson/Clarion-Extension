! Test ACCEPT block with RETURN

TestAccept PROCEDURE()
  CODE
  ACCEPT
    CASE EVENT()
    OF EVENT:OpenWindow
      ! do something
    END
  END
  RETURN
  MESSAGE('This should be unreachable')

! Simpler test

SimpleTest PROCEDURE()
  CODE
  RETURN
  MESSAGE('This should also be unreachable')
