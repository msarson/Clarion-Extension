   PROGRAM
   
TestProc PROCEDURE
nts:case      LONG
hold:nts:case LONG
nts:notes     STRING(100)
hold:nts:notes STRING(100)
lcl:Preset_NTS BYTE
lcl:Empty_Notes BYTE
GlobalResponse LONG
RequestCancelled EQUATE(1)
   CODE
   if GlobalResponse=RequestCancelled
         nts:case      = hold:nts:case
         nts:notes       = hold:nts:notes
   else hold:nts:case = nts:case
         hold:nts:notes  = nts:notes
         lcl:Preset_NTS  = TRUE
         lcl:Empty_Notes = CHOOSE( LEN(CLIP(nts:notes)) = 0 )
   end
