    PROGRAM

    MAP
        ! Format 1: Indented, no PROCEDURE keyword
        MyProc(STRING pName)
        AnotherProc(LONG pId)
        
        ! Format 2: Column 0 with PROCEDURE keyword
ThirdProc    PROCEDURE(STRING pValue)
FourthProc   PROCEDURE(LONG pCount)
    END

CODE
    MyProc('test')
    RETURN

MyProc PROCEDURE(STRING pName)
CODE
    MESSAGE('Hello ' & pName)
    RETURN

AnotherProc PROCEDURE(LONG pId)
CODE
    MESSAGE('ID: ' & pId)
    RETURN

ThirdProc PROCEDURE(STRING pValue)
CODE
    MESSAGE('Value: ' & pValue)
    RETURN

FourthProc PROCEDURE(LONG pCount)
CODE
    MESSAGE('Count: ' & pCount)
    RETURN
