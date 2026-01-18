  PROGRAM

  MAP
  END

Window WINDOW('Test Specialized Controls'),AT(0,0,320,200)
         SHEET,AT(5,5,310,170)
           TAB('Tab 1')
             BUTTON('Button 1'),AT(10,10,80,14)
             ENTRY,AT(10,30,100,10),USE(StrVar)
           END
           TAB('Tab 2')
             LIST,AT(10,10,150,100)
             BUTTON('OK'),AT(10,120,40,14)
           END
         END
         OPTION,AT(5,180,100,40)
           RADIO('Option 1'),AT(5,0,90,10)
           RADIO('Option 2'),AT(5,15,90,10)
           RADIO('Option 3'),AT(5,30,90,10)
         END
         GROUP,AT(150,10,100,50)
           STRING('Nested:'),AT(5,5,40,10)
           ENTRY,AT(50,5,40,10)
         END
         BUTTON('Close'),AT(270,180,40,14),USE(?CloseButton)
       END

StrVar STRING(20)

  CODE
