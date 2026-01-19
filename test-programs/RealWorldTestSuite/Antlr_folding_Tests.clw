  MEMBER


  Map
  end

StringTheory.Base32Encode Procedure(Long pOptions=0, <String pAlphabet>)
out       &string
CRLF      string('<13,10>')
outIdx    long
wraplen   long(75)
myLong    long,auto
blockSize long,auto
x         long,auto
y         long,auto
z         long,auto
padChars  long,auto
alphabet  string('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=') ! 32 chars + padding char
in5       group,pre(),auto
i1          byte
i2          byte
i3          byte
i4          byte
i5          byte
          end

out8      string(8),auto
outByte   byte,dim(8),over(out8)
          group,pre(),over(out8)
o1          byte
o2          byte
o3          byte
o4          byte
o5          byte
o6          byte
o7          byte
o8          byte
          end
  code
  if self._DataEnd = 0 then return st:ok.
  if not omitted(pAlphabet) and pAlphabet <> ''
    case size(pAlphabet)
    of 33
      alphabet = pAlphabet
    of 32
      alphabet = pAlphabet & '='                 ! position 33 is padding character
    else
      self.free()
      self.errorTrap('Base32Encode','Provided alphabet is incorrect length',true)
      return st:notOk
    end
  end
  if band(pOptions,st:NoWrap) then wrapLen = 0.

  x = int((self._DataEnd+4)/5) * 8               ! calculate output length: each 5 bytes gets converted to 8 bytes
  if wrapLen then x += 2 * int(x / wrapLen).     ! add 2 chars for each line break
  out &= new string(x)                           ! allocate output buffer
  if out &= null or len(out) <> x
    self.free()
    self.errorTrap('Base32Encode','Failed to acquire memory for output buffer',true)
    return st:notOk
  end

  loop x = 1 to self._dataEnd by 5
    blockSize = self._dataEnd - x + 1
    if blockSize > 5
      blockSize = 5                              ! we do 5 chars at a time
    elsif blockSize < 5
      clear(out8,-1)
    end
    in5 = self.value[x : x+blockSize - 1]

    case blockSize                               ! convert 5 chars into 8 - we put 5 bits of each input byte (i1-i5) into output bytes (o1-o8)
    of   5
      o8 = band(i5, 31)
      o7 = bshift(band(i5, 224), -5)
    orof 4                                       ! nota bene: we deliberately use 'orof' not 'of' so we fall through
      o7 = bor(o7, bshift(band(i4, 3), 3))
      o6 = bshift(band(i4, 124), -2)
      o5 = bshift(band(i4, 128), -7)
    orof 3
      o5 = bor(o5, bshift(band(i3, 15), 1))
      o4 = bshift(band(i3, 240), -4)
    orof 2
      o4 = bor(o4, bshift(band(i2, 1), 4))
      o3 = bshift(band(i2,  62), -1)
      o2 = bshift(band(i2, 192), -6)
    orof 1
      o2 = bor(o2, bshift(band(i1, 7), 2))
      o1 = bshift(band(i1, 248), -3)
    end

    execute blockSize  ! set number of padding chars to use
      padchars = 6
      padchars = 4
      padchars = 3
      padchars = 1
      padchars = 0
    end

    y = 8 - padchars
    loop z = 1 to y
      myLong = outByte[z] + 1
      case myLong
      of 1 to 32
        outIdx += 1
        out[outIdx] = Alphabet[myLong]
      else
        dispose(out)
        self.free()
        self.errorTrap('Base32Encode','Logic error: value over 32',true)
        return st:notOK              ! logic error - should never happen
      end
    end
    if padChars and band(pOptions,st:NoPadding) = 0
      loop padChars times
        outIdx += 1
        out[outIdx] = alphabet[33]   ! pad char is usually '=' (it is the last char of alphabet)
      end
    end
  end ! loop

  self._StealValue(out)              ! point our object to our output
  out &= null                        ! guard against anyone wrongly thinking they should dispose out

  self.setLength(outIdx)

! note: new method insertEvery written because the following could fail when low memory (very large data):
!  if wrapLen and self._DataEnd > wrapLen
!    self.splitEvery(wrapLen)
!    self.join(CRLF)
!  end
  if wrapLen then self.insertEvery(wrapLen, CRLF).
  return st:ok