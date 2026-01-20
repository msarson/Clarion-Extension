  MEMBER

Test Procedure()
  CODE
  if band(pOptions,st:Clip)
    str.SetValue(otherValue,st:clip)
    return self._EqualsUnicode(str,pOptions-st:clip-st:UnicodeCompare)
  else
    str.SetValue(otherValue)
    return self._EqualsUnicode(str,pOptions-st:UnicodeCompare)
  end