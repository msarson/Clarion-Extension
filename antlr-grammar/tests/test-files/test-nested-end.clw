  PROGRAM
  
  MAP
  END
  
TestWin WINDOW('Test'),AT(10,10)
         SHEET,AT(2,2,100,100)
           TAB('Tab1')
             PROMPT('Test:'),AT(5,5),TRN
           END
         END
         BUTTON,AT(10,80),USE(?Btn1)
       END

  CODE
