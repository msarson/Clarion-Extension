  PROGRAM

  MAP
  END

Window               WINDOW('Test Window'),AT(,,400,300)
                       BUTTON('OK'),AT(100,200),USE(?OK)
                     END

  CODE
    OPEN(Window)
    ACCEPT
    CLOSE(Window)
