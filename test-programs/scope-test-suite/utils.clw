          MEMBER('main.clw') !Can be written as MEMBER('main')

!═══════════════════════════════════════════════════════════════════════
! UTILS.CLW - MEMBER FILE FOR SCOPE TESTING
!═══════════════════════════════════════════════════════════════════════
!
! This is a MEMBER file linked to main.clw (PROGRAM)
!
! SCOPE RULES BEING TESTED:
! --------------------------
! 1. GlobalCounter (lines 36, 42) - GLOBAL from main.clw
!    → Should be accessible here (cross-file global access)
!    → TEST 1: F12 on GlobalCounter should jump to main.clw line 67
!
! 2. ModuleData (line 32) - MODULE-LOCAL to utils.clw
!    → Should NOT be accessible from main.clw (module boundary)
!    → TEST 4: F12 from main.clw should fail
!
! 3. IncrementCounter (line 34) - PROCEDURE implementation
!    → Declared in main.clw MAP, implemented here
!    → TEST 2: F12 from main.clw should jump here
!
! 4. GetCounter (line 39) - PROCEDURE with return type
!    → TEST 3: F12 from main.clw should jump here
!
!═══════════════════════════════════════════════════════════════════════

          MAP
          END


ModuleData LONG         ! Module-local - NOT accessible from main.clw (TEST 4)

IncrementCounter PROCEDURE
  CODE
  GlobalCounter += 1    ! TEST 1: F12 here should jump to main.clw line 67
  ModuleData = 99       ! Should work - same module
  
GetCounter PROCEDURE
Counter LONG
  CODE
  Counter = GlobalCounter  ! TEST 1: F12 here should also jump to main.clw line 67
  RETURN Counter
