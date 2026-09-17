  PROGRAM
! LinkedClassTest — the ONLY Compile item in the .cwproj.
! ctLinked.clw is compiled through the LINK() attribute on the CLASS in ctLinked.inc,
! the hand-coded pattern from issue #470, and is deliberately NOT listed in the .cwproj.
  INCLUDE('ctLinked.inc'),ONCE
  MAP
  END
Obj  ctLinked
  CODE
  Obj.Init()
  Obj.Kill()
