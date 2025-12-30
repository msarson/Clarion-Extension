PROGRAM

  MAP
  END
  
  ! Test SIGNED and UNSIGNED data types
SignedInt    SIGNED        ! Hover should show: EQUATE for LONG
UnsignedInt  UNSIGNED      ! Hover should show: EQUATE for LONG
  
  ! Test BSTRING data type
MyBString    BSTRING       ! Hover should show: OLE API BSTR (Unicode)

  CODE
  
  SignedInt = -100
  UnsignedInt = 100
  MyBString = 'Test Unicode String'
