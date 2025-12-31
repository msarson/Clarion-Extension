PROGRAM

MAP
END

MyVar LONG  ! Global at line 5

CODE

MyProc PROCEDURE
MyVar LONG  ! Procedure-local at line 10
  CODE
  MyVar = 5  ! This should go to line 10, not line 5
  END

OtherProc PROCEDURE
  CODE
  MyVar = 10 ! This should go to line 5 (global), not line 10
  END
