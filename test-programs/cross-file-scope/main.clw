   PROGRAM

   MAP
     MODULE('utils.clw')  !Can be written as MODULE('utils')
       IncrementCounter()  !can be written without parentheses
       GetCounter(),LONG
       omit('***')
       !Could be written as
IncrementCounter  PROCEDURE()
GetCounter        PROCEDURE(),LONG       
       !***
     END
   END

GlobalCounter LONG      ! Global variable - should be accessible in utils.clw

   CODE
   GlobalCounter = 0
   IncrementCounter()
   IncrementCounter()
   MESSAGE('Counter: ' & GetCounter())
