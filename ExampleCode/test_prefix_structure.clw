Some Procedure()
foundDKIM             BYTE
foundSPF              BYTE
foundCNAME            BYTE
txtLine               CSTRING(1024)
CNAMELINE             CSTRING(1024)
LOC:SMTPbccAddress   STRING(255)     

MyGroup GROUP,PRE(LOC)
MyVar String(100)
END

    Code
    CNAMELINE = ''
    LOC:SMTPbccAddress = ''
    LOC:MyVar = 'Test Value'
    MyVar = 'Another Test Value'
