Myproc PROCEDURE()
LocalVar LONG
  CODE
  do Call_ButtonProc
!--------------------------------------------------------------------
Call_ButtonProc             ROUTINE
    data
rou:JustCalledD17 byte
rou:JustCalledPW  byte
rou:JustCalledD4  Byte
SaveWallID        BYTE  
 CODE
  RETURN
