  PROGRAM
  
  MAP
  END
  
TestWin WINDOW('Test'),AT(10,10),IMM, |
  MASK,MDI
         SHEET,AT(2,2,100,100),USE(?SHEET1)
           TAB('Tab1'),USE(?TAB1)
             PROMPT('Test:'),AT(5,5),USE(?P01:PR_ACCOUNT:Prompt),TRN
             STRING('*'),AT(20,5),USE(?String1),TRN
         END
       END

  CODE
