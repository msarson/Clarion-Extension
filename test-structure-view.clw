  PROGRAM

GlobalVar  LONG

  MAP
    MyProc1()
    MyProc2()
  END

CODE
  MyProc1()
  MyProc2()
  RETURN

MyProc1 PROCEDURE
LocalVar1  LONG
CODE
  LocalVar1 = 1
  RETURN

MyProc2 PROCEDURE  
LocalVar2  LONG
MyRoutine  ROUTINE
RoutineVar LONG
  CODE
    RoutineVar = 2
  RETURN
CODE
  LocalVar2 = 3
  DO MyRoutine
  RETURN
