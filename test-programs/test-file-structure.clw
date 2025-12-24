PROGRAM

Customer FILE,DRIVER('TOPSPEED'),PRE(CUS),CREATE,RECLAIM
          KEY(CUS:ID),PRIMARY
          KEY(CUS:LastName,CUS:FirstName),DUP,NOCASE
          INDEX(CUS:Email),UNIQUE
          RECORD
CUS:ID         LONG
CUS:LastName   STRING(30)
CUS:FirstName  STRING(30)
CUS:Email      STRING(100)
CUS:Notes      MEMO(1000)
CUS:Photo      BLOB
          END
        END

CODE
  MESSAGE('Test File Structure')
