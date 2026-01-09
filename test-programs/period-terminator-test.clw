   PROGRAM

   MAP
   END

Customer     FILE,DRIVER('TOPSPEED'),PRE(CUS),CREATE,BINDABLE,THREAD
Record         RECORD,PRE()
ID               LONG
Name             STRING(50)
               .  ! <- Period closes RECORD
             .    ! <- Period closes FILE

Company      GROUP
Name           STRING(100)
Address        STRING(200)
             END  ! <- END closes GROUP

EmployeeQ    QUEUE
EmpID          LONG
EmpName        STRING(50)
             .    ! <- Period closes QUEUE

TestWindow   WINDOW('Test Window'),AT(0,0,320,200),SYSTEM,GRAY
             BUTTON('OK'),AT(10,10,80,20)
             BUTTON('Cancel'),AT(100,10,80,20)
             .    ! <- Period closes WINDOW

ReportWin    REPORT,AT(1000,1000,6500,9000),PRE(RPT)
Detail         DETAIL
                 STRING(@s30),AT(100,100)
               END  ! <- END closes DETAIL
             .    ! <- Period closes REPORT

TestProc     PROCEDURE()
Data1  GROUP
Field1   STRING(20)
Field2   LONG
       .  ! <- Period closes GROUP in procedure data section
  CODE
  IF True
    ! Do something
  END   ! <- END closes IF
  
  LOOP 10 TIMES
    ! Do something
    .   ! <- Period closes LOOP
  
  RETURN
