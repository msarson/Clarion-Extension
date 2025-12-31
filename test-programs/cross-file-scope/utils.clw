MEMBER('main')

ModuleData LONG         ! Module-local - should NOT be accessible from other files

IncrementCounter PROCEDURE
  CODE
  GlobalCounter += 1    ! Should work - GlobalCounter is global from main.clw
  ModuleData = 99       ! Should work - same module
  
GetCounter PROCEDURE
Counter LONG
  CODE
  Counter = GlobalCounter  ! Should work - GlobalCounter is global
  RETURN Counter
