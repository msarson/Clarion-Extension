  PROGRAM

Test PROCEDURE
CODE
  RegexUtils.INIT()
  ReturnValue = PARENT.Init()
  IF ReturnValue THEN RETURN ReturnValue.
  SELF.FirstField = 123
  SELF.AddItem(Toolbar)
  RETURN
