  MEMBER

StringTheory.Base64Encode Procedure(Long pOptions=0)
encData         &string
dataLen         long, auto
encLen          long, auto
SaveNoWrap      long, auto
result          long(st:ok)
  code
  if self._DataEnd = 0 then return result.
  if self.base64
    self.Trace('Base64Encode: String is Already base 64 encoded : base64 property is true')
    return result
  end
  encLen = self._DataEnd
  datalen = int((encLen+2)/3) * 4                   ! Calculate the correct length, plus padding�
  SaveNoWrap = self.base64nowrap
  if band(pOptions,st:URLSafe + st:NoWrap) > 0 then self.base64nowrap = true.  ! respect original setting, might be set before this call
  if band(pOptions,st:URLSafe) > 0 then self.base64URLSafe = true else self.base64URLSafe = false.
  if self.base64nowrap = 0                          ! Option for no line wrapping
    dataLen += (int(dataLen / 76) * 2) + 2
  end

  encData &= new string(dataLen)
  if encData &= null
    self.ErrorTrap('Base64Encode','Memory allocation failed trying to get ' & dataLen & ' bytes.',true)
    self.base64nowrap = SaveNoWrap
    return result
  end

  result = self.Base64Encode(encData, encLen)
  Dispose(self.value)
  self.value &= encData
  self.valuePtr &= self.value
  self._DataEnd = size(self.value)
  self.clip()
  if band(pOptions,st:NoPadding) > 0
    if self._DataEnd > 1 and self.value[self._DataEnd -1 : self._DataEnd] = '=='
       self.SetLength(self._DataEnd-2)
    elsif self._DataEnd > 0 and self.value[self._DataEnd] = '='
       self.SetLength(self._DataEnd-1)
    end
  end
  self.base64 = true
  self.base64nowrap = SaveNoWrap
  return result