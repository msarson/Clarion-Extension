  PROGRAM

! Test OMIT/COMPILE Directive Validation

! ✅ Valid: OMIT block with terminator
OMIT('**END**')
  ! This code is omitted
  Message('Should not compile')
**END**

! ❌ Invalid: OMIT block missing terminator
OMIT('***MISSING***')
  ! This block never terminates
  Message('This will cause diagnostic error')

! ✅ Valid: COMPILE block with terminator  
COMPILE('***DONE***')
  Message('This compiles')
***DONE***

! ❌ Invalid: COMPILE block missing terminator
COMPILE('>>>OOPS<<<')
  Message('This will cause diagnostic error')

! ✅ Valid: Nested OMIT/COMPILE
COMPILE('**32bit**',_width32_)
  COMPILE('*debug*',_debug_)
    ! Debug code
  !end- COMPILE
  OMIT('*debug*',_debug_)
    ! Non-debug code
  !end- OMIT
!end- COMPILE

  CODE
  Message('Test Complete')
