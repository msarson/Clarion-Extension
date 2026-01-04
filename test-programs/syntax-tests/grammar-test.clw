!===============================================================================
! Clarion Grammar Test - New Features
! Tests for keywords and attributes added based on official documentation
!===============================================================================

PROGRAM

MAP
END

!===============================================================================
! Test 1: String Escape Sequences ('' for single quote)
!===============================================================================
TestString1  STRING('It''s working!')          ! Should highlight correctly
TestString2  STRING('Don''t worry')             ! Should highlight correctly
TestString3  STRING('He said ''Hello''')        ! Should highlight correctly

!===============================================================================
! Test 2: LIKE Keyword (Inherited Data Type)
!===============================================================================
OriginalField  REAL
CopiedField    LIKE(OriginalField)              ! LIKE should be highlighted

OriginalGroup  GROUP
Field1           STRING(10)
Field2           LONG
               END

CopiedGroup    LIKE(OriginalGroup)              ! LIKE should be highlighted

!===============================================================================
! Test 3: THREAD Attribute (Thread-Local Storage)
!===============================================================================
GlobalVar      LONG, THREAD                     ! THREAD should be highlighted
ThreadQueue    QUEUE, THREAD                    ! THREAD should be highlighted
Field1           STRING(20)
               END

ThreadFile     FILE,DRIVER('Clarion'),THREAD   ! THREAD should be highlighted
Record           RECORD
Name               STRING(20)
                 END
               END

!===============================================================================
! Test 4: REPLACE Keyword (Constructor/Destructor Replacement)
!===============================================================================
ParentClass    CLASS,TYPE
Construct        PROCEDURE
Destruct         PROCEDURE
               END

ChildClass     CLASS(ParentClass),TYPE
Construct        PROCEDURE, REPLACE            ! REPLACE should be highlighted
Destruct         PROCEDURE, REPLACE            ! REPLACE should be highlighted
               END

!===============================================================================
! Test 5: DERIVED Keyword (Prevent Function Overloading)
!===============================================================================
BaseClass      CLASS,TYPE
Method           PROCEDURE(LONG x)
               END

DerivedClass   CLASS(BaseClass),TYPE
Method           PROCEDURE(LONG x), DERIVED   ! DERIVED should be highlighted
               END

!===============================================================================
! Test 6: PRAGMA Function
!===============================================================================
CODE
  PRAGMA('project(#compile MYUTIL.CLW)')       ! PRAGMA should be highlighted
  PRAGMA('link(C%V%DOS%X%%L%.LIB)')            ! PRAGMA should be highlighted

!===============================================================================
! Test 7: Calling Conventions (Already in grammar, verify)
!===============================================================================
ExternalFunc   PROCEDURE(LONG x), PASCAL       ! PASCAL should be highlighted
CFunc          PROCEDURE(LONG x), C            ! C should be highlighted
RawFunc        PROCEDURE(LONG x), RAW          ! RAW should be highlighted
DLLFunc        PROCEDURE(LONG x), DLL          ! DLL should be highlighted
ProcFunc       PROCEDURE(LONG x), PROC         ! PROC should be highlighted

!===============================================================================
! Test 8: Combined Test
!===============================================================================
TestProc PROCEDURE

ThreadLocal   LONG, THREAD                     ! THREAD
ThreadQueue   QUEUE, THREAD                    ! THREAD
Name            STRING(20)
              END
DisplayMsg    STRING('It''s a test!')          ! Escaped quote

  CODE
  DisplayMsg = 'He said ''Hello'''             ! Escaped quotes
  PRAGMA('compile(TEST.CLW)')                  ! PRAGMA
  MESSAGE(DisplayMsg)
  RETURN
