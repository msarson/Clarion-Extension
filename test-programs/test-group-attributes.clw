PROGRAM

! GROUP with OVER attribute - shared memory
TotalAmount DECIMAL(12,2)
AmountParts GROUP,OVER(TotalAmount)
Dollars      LONG
Cents        SHORT
            END

! GROUP with DIM attribute - array
DateTimeGrp GROUP,DIM(10)
Date         LONG
StartTime    LONG
EndTime      LONG
            END

! GROUP with both DIM and PRE
LogEntries  GROUP,DIM(100),PRE(LOG)
LOG:Timestamp LONG
LOG:Message   STRING(200)
LOG:Level     BYTE
            END

! Nested GROUP example
CustomerRec GROUP
Name         STRING(50)
Address      GROUP,DIM(2)
  Street      STRING(50)
  City        STRING(30)
  State       STRING(2)
              END
            END

CODE
  ! TotalAmount and AmountParts.Dollars/Cents share same memory
  TotalAmount = 123.45
  MESSAGE('Dollars: ' & AmountParts.Dollars & ', Cents: ' & AmountParts.Cents)
  
  ! DateTimeGrp is an array of 10 elements
  DateTimeGrp[1].Date = TODAY()
  DateTimeGrp[1].StartTime = CLOCK()
