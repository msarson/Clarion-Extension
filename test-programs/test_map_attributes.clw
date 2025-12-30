PROGRAM

  MAP
    ! PROCEDURE attributes - can be used in MAP or CLASS prototypes
    WinAPIFunc   PROCEDURE(*CSTRING),LONG,PASCAL    ! PASCAL calling convention (Windows API)
    CLibFunc     PROCEDURE(*CSTRING),LONG,C         ! C calling convention (C libraries)
    RawStringProc PROCEDURE(*STRING),RAW             ! RAW - pass address only (3GL compat)
    OptionalReturn PROCEDURE(),LONG,PROC             ! PROC - can ignore return value
    
    ! Combination of PROCEDURE attributes
    ExternalDLL  PROCEDURE(*CSTRING),LONG,DLL('user32.dll'),PASCAL,RAW
    
  END
  
  ! CLASS method attributes - specific to CLASS definitions
MyClass   CLASS
Construct   PROCEDURE()                              ! Constructor
Destruct    PROCEDURE()                              ! Destructor
VirtualMethod PROCEDURE(),VIRTUAL                    ! VIRTUAL - polymorphism/late binding
PrivateMethod PROCEDURE(),PRIVATE                    ! PRIVATE - class-only access
ProtectedMethod PROCEDURE(),PROTECTED                ! PROTECTED - derived class access
          END

DerivedClass CLASS(MyClass)
Construct     PROCEDURE(),REPLACE                    ! REPLACE - replace parent constructor
VirtualMethod PROCEDURE(),DERIVED                    ! DERIVED - override parent virtual method
              END

  CODE
