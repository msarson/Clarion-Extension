  MEMBER

StringTheory.Base64Encode Procedure(Long pOptions=0)

  code
   if x = 0
    str.Setvalue(clip(pURL))
  else
    str.SetValue(self.UrlParametersOnly(pUrl))
  end
    str.split('&')
  str.SetValueFromLine(str.Inline(clip(pParameter) & '=', 1, 1, 0, false, false, st:begins))
  if str._DataEnd
    str.SetAfter('=',,,,true)
    str.UrlDecode()
  end