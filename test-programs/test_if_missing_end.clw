   PROGRAM

   MAP
   END

   CODE
   STOP

TestRoutine ROUTINE
 code
 ! This should error - IF with THEN but no END
 IF x > 0 THEN
   y = 1
 RETURN
