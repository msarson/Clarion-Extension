PROGRAM

TestProc PROCEDURE

MyGroup GROUP,PRE(LOC)
MyVar String(100)
AnotherField LONG
END

! Regular variable with same name - should match for bare "MyVar"
MyVar STRING(50)

    CODE
        ! These should work - hover and goto should find the structure field
        LOC:MyVar = 'Test Value'      
        LOC:AnotherField = 123
        MyGroup.MyVar = 'Using dot notation'
        
        ! This should NOT match the structure field - should find the regular MyVar variable
        MyVar = 'Another Test Value'
        
        ! This should not find anything (no such variable)
        AnotherField = 456


