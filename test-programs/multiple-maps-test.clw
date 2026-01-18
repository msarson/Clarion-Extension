  PROGRAM

! Data before first MAP
GlobalVar1 LONG

  MAP
    MODULE('test1')
      Proc1()
    END
  END

! Data between MAPs
GlobalVar2 STRING(20)

  MAP
    MODULE('test2')
      Proc2()
    END
  END

! Data after all MAPs
GlobalVar3 BYTE

  CODE
    GlobalVar1 = 1
    GlobalVar2 = 'Test'
    GlobalVar3 = 0
    Proc1()
    Proc2()
