   PROGRAM

   MAP
     MODULE('utils')
       IncrementCounter PROCEDURE
       GetCounter       PROCEDURE,LONG
     END
   END

GlobalCounter LONG      ! Global variable - should be accessible in utils.clw

   CODE
   GlobalCounter = 0
   IncrementCounter()
   IncrementCounter()
   MESSAGE('Counter: ' & GetCounter())
