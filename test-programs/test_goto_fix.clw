Some Procedure()
foundDKIM             BYTE
foundSPF              BYTE
foundCNAME            BYTE
txtLine               CSTRING(1024)
CNAMELINE             CSTRING(1024)
LOC:SMTPbccAddress   STRING(255)   
MyGroup                GROUP,PRE(LOC)
MyVar STRING(100)
  END

! Regular variable - should match for bare "MyVar"
MyVar STRING(50)

    Code
    CNAMELINE = ''
    LOC:SMTPbccAddress = ''
    LOC:MyVar = 'Test Value'
    MyVar = 'Another Test Value'
