  PROGRAM

  MAP
  END

MyVar   LONG  ! Global at line 6

  CODE

MyProc  PROCEDURE
MyVar     LONG  ! Procedure-local at line 11
  CODE
    MyVar = 5  ! This should go to line 11, not line 6

OtherProc PROCEDURE
  CODE
    MyVar = 10 ! This should go to line 6 (global), not line 11
