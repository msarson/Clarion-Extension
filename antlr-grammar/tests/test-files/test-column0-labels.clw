  PROGRAM

  MAP
  END

! Test column-0 labels using keyword text
! These should all be recognized as LABELs at column 0, not keywords

Window  WINDOW('Test Window'),AT(10,10,200,100)
          BUTTON('OK'),AT(10,10,40,12),USE(?OkButton)
        END

Button  BUTTON,AT(20,20,40,12)

String  STRING(20)

Group   GROUP,PRE(G)
Name      STRING(30)
Age       LONG
        END

Queue   QUEUE,PRE(Q)
ID        LONG
Name      STRING(50)
        END

File    FILE,DRIVER('TOPSPEED'),PRE(FIL)
Record    RECORD,PRE()
Name        STRING(50)
          END
Key_Name  KEY(FIL:Name),NOCASE
        END

Class   CLASS,MODULE('MyClass.CLW'),LINK('MyClass.LIB')
Init      PROCEDURE()
Kill      PROCEDURE()
        END

Interface INTERFACE,TYPE
DoSomething PROCEDURE()
          END

! Report structures
Report  REPORT,AT(0,0,8500,11000)
Detail    DETAIL,AT(,,,1000)
Line        STRING(100)
          END
        END

! Control types
Entry   ENTRY,AT(30,30,100,12)

List    LIST,AT(40,40,150,100)

Text    TEXT,AT(50,50,80,12)

Sheet   SHEET,AT(60,60,200,150)
Tab       TAB('Tab1')
Button1     BUTTON('Button'),AT(10,10,40,12)
          END
        END

Option  OPTION,AT(70,70,100,50)
Radio1    RADIO('Choice 1'),AT(5,5,80,12)
Radio2    RADIO('Choice 2'),AT(5,20,80,12)
        END

! Data types
Byte    BYTE
Short   SHORT
Long    LONG
Real    REAL
Date    DATE
Time    TIME
Memo    MEMO
Blob    BLOB

  CODE
  ! All labels above should be recognized at column 0
  RETURN
