   PROGRAM

!═══════════════════════════════════════════════════════════════════════
! SCOPE TEST SUITE - CROSS-FILE SCOPE TESTING
!═══════════════════════════════════════════════════════════════════════
!
! PURPOSE: Test cross-file scope functionality in the Clarion extension
!
! MANUAL TEST INSTRUCTIONS:
! -------------------------
! 1. Open ScopeTestSuite.sln in VS Code
! 2. Press F5 to start extension debugging
! 3. In the debug window, open main.clw and utils.clw
!
! TEST 1: Cross-file F12 Navigation (MEMBER → PROGRAM Global)
! ------------------------------------------------------------
! - Open utils.clw
! - Line 36: Put cursor on 'GlobalCounter'
! - Press F12 (Go to Definition)
! - Expected: Should jump to main.clw line 67 (global declaration)
! - Validates: Cross-file access to global symbols works
!
! TEST 2: Cross-file F12 Navigation (PROGRAM → MEMBER Implementation)
! --------------------------------------------------------------------
! - Open main.clw
! - Line 71: Put cursor on 'IncrementCounter'
! - Press F12 (Go to Definition)
! - Expected: Should jump to utils.clw line 34 (implementation)
! - Validates: Cross-file navigation to implementations works
!
! TEST 3: Cross-file F12 with Return Types
! -----------------------------------------
! - Open main.clw
! - Line 73: Put cursor on 'GetCounter'
! - Press F12 (Go to Definition)
! - Expected: Should jump to utils.clw line 39 (implementation)
! - Validates: MAP declarations with return types work
!
! TEST 4: Module-Local Scope Boundaries (Should FAIL)
! ----------------------------------------------------
! - Uncomment line 74 below: ModuleData = 999
! - Put cursor on 'ModuleData'
! - Press F12 (Go to Definition)
! - Expected: Should NOT find definition (or find wrong one)
! - Validates: Module-local symbols NOT accessible cross-file
!
! FUTURE TESTS (Phase 4+):
! -------------------------
! - Hover over GlobalCounter → should show "Global from main.clw"
! - IntelliSense should filter suggestions by scope
! - Find All References should respect scope boundaries
!
!═══════════════════════════════════════════════════════════════════════

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

GlobalCounter LONG      ! Global variable - accessible in utils.clw (TEST 1)

   CODE
   GlobalCounter = 0
   IncrementCounter()    ! TEST 2: F12 should jump to utils.clw line 34
   IncrementCounter()
   MESSAGE('Counter: ' & GetCounter())  ! TEST 3: F12 should jump to utils.clw line 39
   !ModuleData = 999     ! TEST 4: Uncomment and F12 should fail (module-local in utils.clw)
