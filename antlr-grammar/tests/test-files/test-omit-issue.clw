  PROGRAM

TestProc PROCEDURE()
SomeVar  LONG
QuickWindow WINDOW('Test'),AT(,,100,100)
  BUTTON('OK'),AT(10,10,40,14),USE(?OK)
END
  omit('***')
OtherVar LONG
  !***
CODE
  RETURN
