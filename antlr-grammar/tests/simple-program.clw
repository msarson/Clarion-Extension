  PROGRAM

  MAP
MyProc PROCEDURE(LONG pValue)
  !MyProc(LONG pValue)
  END

MyVar  LONG
Result STRING(100)

  CODE
    MyVar = 123
    Result = 'Hello World'
    MyProc(MyVar)
  
MyProc PROCEDURE(LONG pValue)
LocalVar LONG
  CODE
    LocalVar = pValue * 2
    RETURN
