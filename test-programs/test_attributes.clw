  PROGRAM

TestVar  STRING(20)

  MAP
  END

Window WINDOW('Test Window'),AT(10,10,200,100),CENTER,MODAL
         ! Valid attributes for ENTRY
         ENTRY(@s20),USE(TestVar),AT(10,10,80,10),IMM,REQ,READONLY
         
         ! Valid attributes for BUTTON
         BUTTON('OK'),USE(?OkBtn),AT(10,30,40,12),KEY(EnterKey),TIP('Press to continue'),ICON('ok.ico')
         
         ! STRING with valid attributes
         STRING('Test'),AT(10,50,80,10),COLOR(00FF0000h),FONT('Arial',10),CENTER
         
         ! Test omitted parameters - AT(,,width,height) should show 4-parameter signature
         STRING('Omitted Params'),AT(,,100,20)
         
         ! STRING with typically invalid attributes (should show warning)
         ! Try typing: STRING('Invalid'),USE(   <-- should warn USE not typical for STRING
         ! Try typing: STRING('Invalid'),KEY(   <-- should warn KEY not valid for STRING
         ! Try typing: STRING('Invalid'),IMM(   <-- should warn IMM not valid for STRING
         STRING('Warning Test'),AT(10,70,80,10)
         
         ! LIST with valid attributes
         LIST,AT(10,100,180,60),USE(?List1),FROM(MyQueue),FORMAT('100L(2)|M~Name~@s30@')
         
         ! BOX with valid attributes
         BOX,AT(10,370,180,1),COLOR(COLOR:Black),FILL(COLOR:White)
         
         ! BOX with invalid attribute (should show warning)
         ! Try typing: BOX,USE(   <-- should warn USE not valid for BOX
         BOX,AT(10,375,180,1)
       END

  CODE
  OPEN(Window)
  ACCEPT
  END
