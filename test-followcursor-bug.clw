        MEMBER

!OMIT ('=== DO LINK DOS', lib_mode)
 PRAGMA('link(C%V%DOS%X%%L%.LIB)')
! === DO LINK DOS

 INCLUDE ('ERRORS.CLW')
 INCLUDE ('SystemString.INC')
  MAP
SystemStringClass_ByteToHex PROCEDURE(BYTE inCharVal, BYTE LowerCase = FALSE),STRING
SystemStringClass_IsXDigit PROCEDURE(BYTE inCharVal),BYTE
  END


!**Base64 Data

SystemStringClass_Base64Encode  STRING('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='),PRIVATE
SystemStringClass_HexDigitsUp   STRING('0123456789ABCDEF'),PRIVATE
SystemStringClass_HexDigitsLow  STRING('0123456789abcdef'),PRIVATE


StringRefQueue   QUEUE,TYPE
Str                &STRING
                 END
StringRefFactoryClass.Construct               PROCEDURE()
 CODE
    SELF.garbageStrs &= new StringRefQueue
    
StringRefFactoryClass.Destruct                PROCEDURE()
 CODE
    SELF.DisposeIt()
    DISPOSE(SELF.garbageStrs)
