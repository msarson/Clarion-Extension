PROGRAM

TestProc PROCEDURE

! Structure with prefix
MyGroup GROUP,PRE(LOC)
Field1 String(100)
Field2 LONG
END

! Regular variables with same names
Field1 STRING(50)
Field2 LONG

! Structure without prefix (for dot notation testing)
OtherGroup GROUP
Field3 STRING(30)
END

! Nested structure
OuterGroup GROUP,PRE(OUT)
InnerGroup GROUP
    Field4 LONG
    END
END

    CODE
        ! ✅ These should work - find structure fields
        LOC:Field1 = 'Test'      ! Should find MyGroup.Field1
        LOC:Field2 = 123         ! Should find MyGroup.Field2
        MyGroup.Field1 = 'Dot'   ! Should find MyGroup.Field1
        MyGroup.Field2 = 456     ! Should find MyGroup.Field2
        
        ! ✅ These should work - find regular variables
        Field1 = 'Regular'       ! Should find regular Field1 STRING(50)
        Field2 = 789             ! Should find regular Field2 LONG
        
        ! ✅ This should work - find structure field via dot notation
        OtherGroup.Field3 = 'X'  ! Should find OtherGroup.Field3
        
        ! ❌ This should NOT work - Field3 is not accessible without qualifier
        Field3 = 'Y'             ! Should not find anything or error
        
        ! ✅ Nested structure access
        OUT:Field4 = 999         ! Should find OuterGroup.InnerGroup.Field4
