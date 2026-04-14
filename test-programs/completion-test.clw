  PROGRAM
  MAP
  END

! Base class with different access levels
BaseClass         CLASS
PublicMethod        PROCEDURE()
ProtectedMethod     PROCEDURE(),PROTECTED
PrivateMethod       PROCEDURE(),PRIVATE
PublicProp          LONG
                  END

! Derived class - inherits from BaseClass, adds own members
DerivedClass      CLASS(BaseClass)
OwnMethod           PROCEDURE()
OwnProp             STRING(20)
                  END

! Standalone class (no inheritance)
StandaloneClass   CLASS
Alpha               PROCEDURE(LONG pVal),LONG
Beta                LONG
                  END

! A global instance variable
myVar             DerivedClass
myStandalone      StandaloneClass

  CODE

!==============================================================================
! Method implementations
!==============================================================================
DerivedClass.OwnMethod  PROCEDURE()
  CODE
  SELF.
  ! SELF. above is for completion testing
  RETURN

StandaloneClass.Alpha   PROCEDURE(LONG pVal),LONG
  CODE
  StandaloneClass.
  ! StandaloneClass. above is for direct class completion testing
  RETURN 0
