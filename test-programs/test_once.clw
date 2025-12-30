PROGRAM

  ! Test ONCE attribute with INCLUDE
  ! Without ONCE, including the same file multiple times would cause
  ! duplicate definition errors
  
  INCLUDE('KEYCODES.CLW'),ONCE      ! Include keyboard codes once only
  INCLUDE('EQUATES.CLW'),ONCE       ! Include system equates once only
  
  ! Even if the same file is included again, it will be ignored
  INCLUDE('KEYCODES.CLW'),ONCE      ! This is safely ignored
  
  MAP
  END
  
  CODE
  
  ! Use keyboard codes from included file
  IF KEYCODE() = EscKey
    MESSAGE('Escape key pressed')
  END