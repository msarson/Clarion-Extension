  MEMBER

StringTheory.AppendBinary Procedure(long pValue,Long pLength=4)
  code
  if pLength > 4 then pLength = 4.
  self.CatAddr(address(pValue), pLength)

StringTheory.Base64Encode Procedure(Long pOptions=0)
  code  