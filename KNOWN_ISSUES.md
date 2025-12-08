# Known Issue: Symbol Range for Method Implementations

## Issue
Method implementations (e.g., StringRefFactoryClass.Destruct) that follow other methods 
are not being included in the parent Implementation container's range. This causes 
followCursor functionality to fail for any code after the first method.

## Example
`
StringRefFactoryClass.Construct PROCEDURE()  ! Line 24
 CODE
    SELF.garbageStrs &= new StringRefQueue
    
StringRefFactoryClass.Destruct PROCEDURE()   ! Line 28
 CODE
    SELF.DisposeIt()
`

Current behavior:
- StringRefFactoryClass (Implementation) range: 24-27 (only includes Construct)
- Destruct method range: 28-31 (not within parent range!)

Expected behavior:
- StringRefFactoryClass (Implementation) range: 24-31 (includes both methods)

## Root Cause
ROUTINEs within methods are children of the procedure/method, so the procedure's
finishesAt should extend to include all its content (including code after ROUTINE).
Currently the procedure's range stops too early.

## Impact
- followCursor doesn't work for methods after the first one
- Structure view doesn't highlight correct item when cursor is in later methods
- Could also affect folding if procedure ranges are used

## Solution (DO NOT FIX NOW - TOO CLOSE TO RELEASE)
Update symbol provider to:
1. Calculate procedure/method finishesAt to include all child structures (routines, etc)
2. Ensure Implementation container spans all methods it contains
3. Test folding to ensure ranges are correct for all features

## Workaround
Users can still click on symbols in structure view to navigate - only auto-follow
on cursor movement is affected.

Date: 2025-12-08
Version: 0.7.5 (pre-release)
