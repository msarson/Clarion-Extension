    PROGRAM

    MAP
    END

    code

StringTheory.CSVEncode             Procedure ()
  Code
      if sepLen + newLen < size(self.value)
        self.flush()
        if sepLen then stMemCpyLeft(address(self.value), address(pSep), sepLen).
        if newLen then stMemCpyLeft(address(self.value)+sepLen, address(newValue), newLen).
        self._DataEnd = sepLen + newLen
      else
        if sepLen then self.flush(pSep).                 ! room to optimize this as it will be a very small write.
        if newLen then self.flush(newValue[1 : newlen]).
      end
      