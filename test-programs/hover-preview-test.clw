  PROGRAM

  MAP
    ShortProc(LONG x)
    LongProc(STRING s)
  END

  CODE
  RETURN

! Short procedure - should show full implementation
ShortProc PROCEDURE(LONG x)
Result LONG
  CODE
  Result = x * 2
  RETURN Result

! Long procedure - should show first 15 lines + ellipsis
LongProc PROCEDURE(STRING s)
Line1  STRING(100)
Line2  STRING(100)
Line3  STRING(100)
Line4  STRING(100)
Line5  STRING(100)
  CODE
  Line1 = 'This is line 1'
  Line2 = 'This is line 2'
  Line3 = 'This is line 3'
  Line4 = 'This is line 4'
  Line5 = 'This is line 5'
  ! More lines here
  IF Line1
    Message('Line 1')
  END
  IF Line2
    Message('Line 2')
  END
  IF Line3
    Message('Line 3')
  END
  IF Line4
    Message('Line 4')
  END
  IF Line5
    Message('Line 5')
  END
  RETURN
