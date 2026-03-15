   PROGRAM
  INCLUDE('StringTheory.inc'),ONCE

!═══════════════════════════════════════════════════════════════════════
! ⚠️  DO NOT MODIFY THIS FILE WITHOUT UPDATING TESTS ⚠️
!═══════════════════════════════════════════════════════════════════════
!
! This file is used by automated tests in:
!   - server/src/test/SolutionBased.CrossFileScope.test.ts
!   - server/src/test/CrossFileScope.test.ts
!
! Changes to line numbers or structure will break tests!
! If you must change this file, update the corresponding test expectations.
!
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
! - Line 51: Put cursor on 'GlobalCounter'
! - Press F12 (Go to Definition)
! - Expected: Should jump to main.clw line 87 (global declaration)
! - Validates: Cross-file access to global symbols works
!
! TEST 2: F12 vs Ctrl+F12 for Procedures (Definition vs Implementation)
! ----------------------------------------------------------------------
! - Open main.clw
! - Line 94: Put cursor on 'IncrementCounter'
! - Press F12 (Go to Definition)
! - Expected: Should jump to line 76 (MAP declaration in same file)
! - Then press Ctrl+F12 (Go to Implementation)
! - Expected: Should jump to utils.clw line 47 (implementation)
! - Validates: F12 → MAP declaration, Ctrl+F12 → implementation
!
! TEST 3: Cross-file Procedure with Return Types
! -----------------------------------------------
! - Open main.clw
! - Line 95: Put cursor on 'GetCounter'
! - Press F12 (Go to Definition)
! - Expected: Should jump to line 77 (MAP declaration)
! - Press Ctrl+F12 (Go to Implementation)
! - Expected: Should jump to utils.clw line 39 (implementation)
! - Validates: MAP declarations with return types work correctly
!
! TEST 4: Module-Local Scope Boundaries (Should PASS)
! ----------------------------------------------------
! - Uncomment line 77 below: ModuleData = 999
! - Put cursor on 'ModuleData'
! - Press F12 (Go to Definition)
! - Expected: Should show "No definition found"
! - Validates: Module-local symbols NOT accessible cross-file
! - ✅ PASSING: Scope validation blocks cross-file access to module-local vars
!
! FUTURE TESTS (Phase 4+):
! -------------------------
! - Hover over GlobalCounter → should show "Global from main.clw"
! - IntelliSense should filter suggestions by scope
! - Find All References should respect scope boundaries
!
!═══════════════════════════════════════════════════════════════════════
  
! Test comment  
  
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
GlobalHelper PROCEDURE()  ! Declare the global procedure so it can be called from utils.clw
   END

GlobalCounter LONG      ! Global variable - accessible in utils.clw (TEST 1)
st StringTheory
   CODE
   st.SetValue('Clarion is cool!')
   MESSAGE(st.GetValue())
   GlobalCounter = 0
   IncrementCounter()    ! TEST 2: F12 → line 57 MAP, Ctrl+F12 → utils.clw line 34
   IncrementCounter()
   MESSAGE('Counter: ' & GetCounter())  ! TEST 3: F12 → line 58 MAP, Ctrl+F12 → utils.clw line 39
 !  ModuleData = 999     ! TEST 4: Uncomment and F12 should fail (module-local in utils.clw)

!═══════════════════════════════════════════════════════════════════════
! GlobalHelper - GLOBAL PROCEDURE
!═══════════════════════════════════════════════════════════════════════
! TEST 5: Hover on 'GlobalHelper' below should show:
!         **Scope:**  Global
!         **Visibility:** Accessible from all files in the solution
!
GlobalHelper PROCEDURE()


   CODE

   MESSAGE('This is a global procedure!')
   RETURN
