  PROGRAM
  
  MAP
  END

  CODE
    
  !This is a normal comment
  
  COMPILE('**++** _C61_Plus_')
    !This code should be foldable
    MESSAGE('C6.1 or higher')
    X# = 100
  !END-COMPILE('**++** _C61_Plus_')
  
  COMPILE('***UNICODE***')
    !This is unicode-specific code
    MyString = 'Unicode String'
    Y# = 200
  !***UNICODE***
  
  OMIT('!** EndWndPrv **')
    !This code is omitted
    MESSAGE('Should not compile')
  !** EndWndPrv **
  
  !REGION Test Region
    MESSAGE('In a region')
  !ENDREGION
  
  MESSAGE('After all blocks')
  RETURN
