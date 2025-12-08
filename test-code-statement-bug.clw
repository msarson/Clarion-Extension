Myproc PROCEDURE()
  CODE
  do Call_ButtonProc
!--------------------------------------------------------------------
Call_ButtonProc             ROUTINE !of UpdateWall
    data
rou:JustCalledD17 byte
rou:JustCalledPW  byte
rou:JustCalledD4  Byte
!rou:Hold:Wal:Record    LIKE(gtREC_WAL)
SaveWallID        BYTE  
 CODE
  RETURN
