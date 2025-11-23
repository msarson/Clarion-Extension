PROGRAM

TestProc PROCEDURE
foundDKIM             BYTE
foundSPF              BYTE
foundCNAME            BYTE
txtLine               CSTRING(1024)
CNAMELINE             CSTRING(1024)

MyGroup                GROUP,PRE(LOC)
MyVar                    STRING(100)
                       END

    CODE
    CNAMELINE = ''
    LOC:MyVar = 'Test Value'      ! Should work - finds MyGroup.MyVar
    MyVar = 'Another Test Value'  ! Should NOT work - MyVar is not defined outside the structure
