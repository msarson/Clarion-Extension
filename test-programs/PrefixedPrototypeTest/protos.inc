! Prototypes reached through INCLUDE(...,'PROTOTYPES') from a parent MAP.
! This file has no MAP of its own — the includer supplies it (the #593 shape).

  SECTION('PROTOTYPES')

! Shorthand prototypes (no PROCEDURE keyword), INDENTED, with prefix chains.
! One colon:
  WIN:ShowExits()
  WIN:Plain(LONG pX),LONG
! Two colons — the shape absent from our whole 6,018-file corpus:
  reg:WIN:ShowExits()
  reg:WIN:Plain(LONG pX),LONG
! Bare, no parameter list:
  WIN:BareOne
  reg:WIN:BareTwo
! Bare with an attribute tail:
  reg:WIN:WithAttr,LONG

  SECTION('OTHER')

! Deliberately in a DIFFERENT section: an includer asking for 'PROTOTYPES'
! must not pick this up.
  reg:WIN:NotInSection()
