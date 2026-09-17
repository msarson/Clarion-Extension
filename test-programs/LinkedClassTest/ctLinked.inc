! Class declaration. MODULE names the implementation file; LINK makes the compiler
! compile and link it without a Compile item in the .cwproj.
  OMIT('_EndOfInclude_',_ctLinkedPresent_)
_ctLinkedPresent_ EQUATE(1)
ctLinked CLASS,TYPE,MODULE('ctLinked.clw'),LINK('ctLinked.clw')
Count      LONG
Init       PROCEDURE()
Kill       PROCEDURE()
         END
  _EndOfInclude_
