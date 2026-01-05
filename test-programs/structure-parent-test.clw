   PROGRAM

TestGroup    GROUP
Field1         STRING(10)
             END                ! Line 4 - Should close GROUP

TestView     VIEW(SomeFile)
               PROJECT(SomeField)
             END                ! Line 8 - Should close VIEW

TestQueue    QUEUE
Field1         STRING(10)
Mark           BYTE
             END                ! Line 13 - Should close QUEUE

TestQueue2   QUEUE              ! Line 15
Field1         STRING(10)
             END                ! Line 17 - Should close QUEUE

FieldColorQueue QUEUE           ! Line 19 - No label prefix
Feq             LONG
OldColor        LONG
              END               ! Line 22 - Should close QUEUE

   CODE
   RETURN
