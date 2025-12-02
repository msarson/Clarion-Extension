  PROGRAM

GlobalVar  LONG

  MAP
    MyProc1()
    MyProc2()
  END

CODE
  MyProc1()
  MyProc2()
  RETURN

MyProc1 PROCEDURE
LocalVar1  LONG
CODE
  LocalVar1 = 1
  RETURN

MyProc2 PROCEDURE  
LocalVar2  LONG
MyRoutine  ROUTINE
RoutineVar LONG
  CODE
    RoutineVar = 2
  RETURN
CODE
  LocalVar2 = 3
  DO MyRoutine
  RETURN
SortLength          Procedure(*LinesGroupType p1,*LinesGroupType p2)
  code
  if len(clip(p1.line)) = len(clip(p2.line)) then return SortCaseSensitive(p1,p2).
  if len(clip(p1.line)) > len(clip(p2.line)) then return 1.
  return -1

StringTheory._GetNextBufferSize         Procedure(Long pLen)
  CODE
  if self.value &= NULL and self._first = false
    self._first = true
    return pLen             ! make first assignment the perfect length.
  end
  case pLen
  of 0 to 50
    return 50
  of 51 to 255
    return 255
  of 256 to 511
    return 511
  of 512 to 1024
    return 1024
  of 1025 to 16384
    return 16384
  of 16385 to 1048576
    return pLen * 2
  ELSE
    return pLen + 1048576
  end

!-----------------------------------------------------------------------------------
StringTheory._EqualsUnicode        Procedure(*String otherValue, Long pOptions = st:UnicodeCompare)
str StringTheory
  code
  if band(pOptions,st:Clip)
    str.SetValue(otherValue,st:clip)
    return self._EqualsUnicode(str,pOptions-st:clip-st:UnicodeCompare)
  else
    str.SetValue(otherValue)
    return self._EqualsUnicode(str,pOptions-st:UnicodeCompare)
  end

!-----------------------------------------------------------------------------------
! supported Options;
! st:clip, st:simpleCompare, st:UnicodeCompare, st:NoCaseCompare
StringTheory.Equals Procedure(String pOtherValue, Long pOptions = ST:SimpleCompare + ST:Clip)
ln  long,auto
  code
  if band(pOptions,st:UnicodeCompare)
    return self._EqualsUnicode(pOtherValue,pOptions)
  end
  if band(pOptions,st:Clip)
    ln = self.clipLength(pOtherValue)
  else
    ln = size(pOtherValue)
  end
  if self._DataEnd <> ln
    return false
  elsif self._DataEnd = 0  ! both blank
    return true
  else
    if band(pOptions,st:NoCaseCompare) > 0
      return choose(stMemiCmp(address(self.value),address(pOtherValue),ln)=0)
    else
      return choose(MemCmp(address(self.value),address(pOtherValue),ln)=0)
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Equals Procedure(StringTheory pOtherValue, Long pOptions = ST:SimpleCompare)
  code
  if band(pOptions,st:UnicodeCompare) and self.encoding <> pOtherValue.encoding  ! if same encoding so can do a simple compare
    return self._EqualsUnicode(pOtherValue,pOptions - st:UnicodeCompare)
  elsif self._DataEnd <> pOtherValue._DataEnd
    return false
  elsif self._DataEnd = 0  ! both blank
    return true
  else
    if band(pOptions,st:NoCaseCompare) > 0
      case self.encoding
      of st:EncodeAnsi
        return choose(stMemiCmp(address(self.value),address(pOtherValue.value),self._DataEnd)=0)
      of st:EncodeUtf8
      orof st:EncodeUtf16
        return self._EqualsUnicode(pOtherValue,pOptions - st:UnicodeCompare)
      end
    else
      return choose(MemCmp(address(self.value),address(pOtherValue.value),self._DataEnd)=0)
    end
  end
