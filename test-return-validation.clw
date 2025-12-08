  PROGRAM
MyClass CLASS
MyProc  PROCEDURE(STRING param), LONG
        END

MyClass.MyProc PROCEDURE(STRING param)
CODE
  x = 1
  ! Missing RETURN
  RETURN
