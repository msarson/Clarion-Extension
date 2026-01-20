  PROGRAM
      Map
        
        end
  CODE

StringTheory.Base85Encode Procedure(Long pOptions=0)
st       StringTheory
adobe    byte
wrapLen  long(75)
myLong   long,auto
myULong  ulong,over(myLong)
         group,pre(),over(myLong)
myStr1     string(1)
myStr2     string(1)
myStr3     string(1)
myStr4     string(1)
         end ! group
x        long,auto
padChars long,auto
outLen   long,auto
outstr   String(5),auto
         group,pre(),over(outStr)
out1       byte
out2       byte
out3       byte
out4       byte
out5       byte
         end ! group
  code
  if self._DataEnd = 0 then return.
  adobe = band(pOptions,st:Adobe85)
  if band(pOptions,st:NoWrap) then wraplen = 0.

  padChars = self._DataEnd % 4
  if padChars then padChars = 4 - padChars; self.append(all('<0>',padChars)).   ! pad with null chars
  outLen = (self._DataEnd * 5 / 4)
  if adobe > 0
    outlen += 4   ! adobe has 4 extra chars
  end
  if wrapLen then outlen += 2 * int(outlen / wrapLen).     ! add 2 chars for each line break
  st.SetLength(outlen)                                     ! optional: preallocate output memory
  if adobe
    st.setValue('<<~')
  else
    st.free()
  end
  loop x = 1 to self._DataEnd by 4
    ! swap endian-ness as we go...
    myStr1 = self.valueptr[x+3]
    myStr2 = self.valueptr[x+2]
    myStr3 = self.valueptr[x+1]
    myStr4 = self.valueptr[x]
    if ~myLong then st.append('z'); cycle.                        ! short form for 0 (low-values)
    if adobe = 0 and myLong=20202020h then st.append('y'); cycle. ! short form for spaces - not supported by Adobe
    out5 = myULong%85 + 33                                        ! use Ulong first time in case top bit is on
    myUlong /= 85
    ! unrolled the loop - we use long from here as faster than ulong
    out4 = myLong%85 + 33
    mylong /= 85
    out3 = myLong%85 + 33
    mylong /= 85
    out2 = myLong%85 + 33
    mylong /= 85
    out1 = myLong%85 + 33
    st.append(outStr)
  end
  if padChars then st.setLength(st._DataEnd - padChars).
  if adobe then st.append('~>').
  if wrapLen then st.insertEvery(wrapLen,'<13,10>').
  if Adobe and st.endsWith('<13,10>>')
    ! do NOT split ending ~>
    st.adjustLength(-3)
    st.append('>')
  end
  self._StealValue(st)                ! point our passed object to our output