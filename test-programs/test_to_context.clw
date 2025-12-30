PROGRAM

  MAP
  END

  CODE
  
  ! Test TO in LOOP context
  LOOP I# = 1 TO 10
    ! Hover over TO should show LOOP context documentation
  END
  
  ! Test TO in LOOP with BY
  LOOP Counter = 100 TO 1 BY -5
    ! Hover over TO should show LOOP context documentation
  END
  
  ! Test TO in CASE context
  CASE Action
  OF 1 TO 5
    ! Hover over TO should show CASE context documentation
    MESSAGE('Action is between 1 and 5')
  OF 10 TO 20
    ! Hover over TO should show CASE context documentation
    MESSAGE('Action is between 10 and 20')
  OROF 25 TO 30
    ! Hover over TO should show CASE context documentation
    MESSAGE('Action is between 25 and 30')
  END
  
  ! Nested example
  LOOP I# = 1 TO 100
    CASE I#
    OF 1 TO 10
      ! Both TO keywords should show correct context
      ! First TO is in LOOP, second TO is in CASE
    END
  END
