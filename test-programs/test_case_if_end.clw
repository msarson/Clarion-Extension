   PROGRAM

   MAP
   END

   CODE
   STOP

!--------------------------------------------------------------------
Call_ButtonProc             ROUTINE
data
rou:JustCalledD17 byte
SaveWallID        LONG
 code
 case field()
   of ?Goto_WallShape         ; IF ?w3d:IsAutoCamera{prop:Hide} THEN bits.SetBit(wal:flag,qBitWAL:HideDrawing)END
                                DO Call_WallShape
                                lcl:ForceSignalMWG = TRUE
                                rou:JustCalledD17  = TRUE

   of ?Goto_ScaffoldOut        ; if Event()=Event:AlertKey 
                                     ?Oddq_Outside:List{prop:NoBar} = FALSE 
                                     rou:JustCalledD4 = TRUE; UpdateOddCours(Wythe:ScaffoldOut) 
                                     ?Oddq_Outside:List{prop:NoBar} = TRUE
                                else Browse_ODD_in_PRJ (Wythe:ScaffoldOut) 
                                end
                                lcl:ForceSignalMWG = TRUE

   of ?Goto_Openings          ; Routines.Call_SP(SP:VIEW:OPW)
 end
