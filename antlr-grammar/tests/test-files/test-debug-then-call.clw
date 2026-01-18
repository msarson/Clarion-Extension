  PROGRAM

TestProc PROCEDURE()
CODE
? DEBUGHOOK(BMBankAccount:Record)
? DEBUGHOOK(GLAccount:Record)
  GlobalResponse = ThisWindow.Run()
DefineStyle ROUTINE
  a = 4
