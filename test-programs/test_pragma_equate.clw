PROGRAM

  ! Test EQUATE declarations
TRUE      EQUATE(1)                    ! Boolean constant
FALSE     EQUATE(0)                    ! Boolean constant
PI        EQUATE(3.1415927)            ! Math constant
MaxItems  EQUATE(100)                  ! Numeric constant
AppName   EQUATE('My Application')     ! String constant
SSNPic    EQUATE(@P###-##-####P)       ! Picture token equate

  ! Test PRAGMA statements
  PRAGMA('compile(/debug)')            ! Enable debug info
  PRAGMA('link(/debug)')               ! Link with debug info
  PRAGMA('project(#compile /w3)')     ! Set warning level
  
  MAP
  END
  
  CODE
  
  ! Use the equated constants
  IF TRUE
    MESSAGE('PI value is: ' & PI)
  END
  
  ! PRAGMA can be used anywhere in code
  PRAGMA('compile(/optimize)')         ! Enable optimization