  PROGRAM
  MAP
  END
  CODE


StringTheory.Append Procedure(*string newValue, long pOptions , string pSep) ! = st:noclip
newlen  Long,Auto
seplen  Long,Auto
  code
  if address(newValue) = address(self.value) and not self.streamFileName &= null ! appending self so pass by value
    self.append(newValue&'',pOptions,pSep)
    return
  end

  if address(newValue) = 0
    newLen = 0
  else
    newLen = Choose(band(pOptions,st:Clip)=0,size(NewValue),self.clipLen(NewValue))
  end
  if band(pOptions,st:NoBlanks) and newlen=0 then return.

  if self._DataEnd < 1
    sepLen = 0 ! no separator if currently empty string
  else
    sepLen = Choose(omitted(pSep)=1,0,size(pSep))
  end
  if newlen = 0 and sepLen = 0 then return.

  if size(self.value) < self._DataEnd + sepLen + newLen
    if self.streamFileName &= null
      self.SetLength(self._DataEnd + sepLen + newLen)
      if sepLen then stMemCpyLeft(address(self.value)+self._DataEnd-newlen-sepLen, address(pSep), sepLen).
      if newLen then stMemCpyLeft(address(self.value)+self._DataEnd-newlen, address(newValue), newLen).
    else
      if sepLen + newLen < size(self.value)
        self.flush()
        if sepLen then stMemCpyLeft(address(self.value), address(pSep), sepLen).
        if newLen then stMemCpyLeft(address(self.value)+sepLen, address(newValue), newLen).
        self._DataEnd = sepLen + newLen
      else
        if sepLen then self.flush(pSep).                 ! room to optimize this as it will be a very small write.
        if newLen then self.flush(newValue[1 : newlen]).
      end
    end
  else
    if SepLen
      stMemCpyLeft(address(self.value) + self._DataEnd, address(pSep), sepLen)
      self._DataEnd += SepLen
    end
    if newLen
      stMemCpyLeft(address(self.value) + self._DataEnd, address(newValue), newLen)
      self._DataEnd += newLen
    end
  end

