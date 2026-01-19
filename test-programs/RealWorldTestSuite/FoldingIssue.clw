  PROGRAM
  MAP
  END
  CODE


StringTheory.Base32Decode Procedure(Long pOptions=0, <String pAlphabet>)
! standard alphabets
eDefaultAlphabet     equate('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=') ! 32 chars + padding char
eExtendedHexAlphabet equate('0123456789ABCDEFGHIJKLMNOPQRSTUV=')
alphabet             string(33)

! detection states - used where st:detectAlphabet is set
eProvided            equate(1)
eDefault             equate(2)
eExtendedHex         equate(3)

state     long,auto

pad       string('=')
out       &string
outIdx    long(1)
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
in8       string(8),auto
          group,pre(),over(in8)
i1          byte
i2          byte
i3          byte
i4          byte
i5          byte
i6          byte
i7          byte
i8          byte
          end

out5      string(5),auto
          group,pre(),over(out5)
o1          byte
o2          byte
o3          byte
o4          byte
o5          byte
          end
x         long,auto
padChars  long,auto
  code
  if omitted(pAlphabet) or pAlphabet = ''
    alphabet = eDefaultAlphabet
    state = eDefault
  else
    ! alternative alphabet provided - this must be valid even if "st:detectAlphabet" is set on.
    state = eProvided
    case size(pAlphabet)
    of 33
      alphabet = pAlphabet
      pad = alphabet[33]
    of 32
      alphabet = pAlphabet & '='  ! position 33 is padding character
    else
      self.free()
      self.errorTrap('Base32Decode','Provided alphabet is incorrect length',true)
      return st:notOK
    end
    x = self.findChar(pad,,,alphabet)
    if x < 33
      self.free()
      self.errorTrap('Base32Decode','Pad character "'& pad & '" was included in alphabet',true)
      return st:notOK
    end
    if upper(pad) <> lower(pad)
      self.free()
      self.errorTrap('Base32Decode','Invalid Pad character "'& pad & '"',true)
      return st:notOK
    end
    if self.containsA('<13,10,32,9>',alphabet,false)
      self.free()
      self.errorTrap('Base32Decode','Alphabet contains a formatting character (CR LF space tab)',true)
      return st:notOK
    end
  end
  if band(pOptions,st:noCase) or band(pOptions,st:detectAlphabet)
    self.upper()
    alphabet = upper(alphabet)
  end
  if band(pOptions,st:detectAlphabet)
    ! try to work out alphabet based on sample of first 1000 chars (which have been UPPERed).
    ! currently try 3 alphabets: 1) passed/provided 2) default 3) extended hex
    loop
      if self.isAll(alphabet & '<13,10,09,32>',self.sub(1,1000),false) then break.  ! matches so use this alphabet
      state += 1
      case state
      of eDefault;     alphabet = eDefaultAlphabet
      of eExtendedHex; alphabet = eExtendedHexAlphabet
      !  add any other desired alphabets here....  could extend this to z-base-32, Crockford's Base32 etc. but extra work required
      else
        self.free()
        self.errorTrap('Base32Decode','Unable to detect base32 encoding',true)
        return st:notOK
      end
    end
  end
  if band(pOptions,st:tolerant)
    ! tolerant (not strict) so get rid of all non-alphabet chars without complaint/error
    self.keepChars(alphabet)                  ! get rid of any invalid chars (including formatting - usually CR, LF, spaces, tabs etc)
    if self._DataEnd % 8
      ! not a multiple of 8 so we add padding on end to correct as not strict
      self.append(all(pad,8 - self._DataEnd % 8))
    end
  else
    ! if strict (ie. NOT tolerant), we only allow formatting chars CR LF space tab. Any other char not in alphabet will trigger an error.
    self.removeChars('<13,10,32,9>')          ! CR LF space tab
    ! if strict, we insist on correct padding on the end to make up multiple of 8 characters
    if self._DataEnd % 8
      self.free()
      self.errorTrap('Base32Decode','Cleaned input is not a multiple of 8 characters',true)
      return st:notOK
    end
  end

  x = self.findChar(pad)
  if x                                        ! pad char found
    if x < self._dataEnd - 5                  ! last group of 8 chars must have at least two chars before padding starts
      self.errorTrap('Base32Decode','Invalid padding character "' & pad & '" found',true)
      self.free()
      return st:notOK
    end
    padChars = self.count(pad,,x)             ! start count at x where first pad was found
    case padChars
    of 1 orof 3 orof 4 orof 6
      ! all good
    else
      self.errorTrap('Base32Decode','Invalid number of padding characters found',true)
      self.free()
      return st:notOK
    end
  end

  x = (self._DataEnd / 8) * 5                        ! get output length
  out &= new string(x)                               ! allocate output buffer
  if out &= null or len(out) <> x
    self.errorTrap('Base32Decode','Failed to acquire memory for output buffer',true)
    self.free()
    return st:notOK
  end
  clear(charsMap,1)                                  ! set to high values so invalid chars will have 255
  loop x = 1 to 32
    charMap[val(alphabet[x])+1] = x - 1              ! map alphabet characters to 5bit digit 0-31
  end
  charMap[val(pad)+1] = 0

  x = 1
  loop                                               ! we take groups of 8 chars and convert each group to 5 chars
    stMemCpyLeft(address(in8),address(self.value)+x-1,8) ! was: in8 = self.value[x : x+7]
    ! map to 5 bit values (0 to 31)
    i1 = charMap[i1+1]
    i2 = charMap[i2+1]
    i3 = charMap[i3+1]
    i4 = charMap[i4+1]
    i5 = charMap[i5+1]
    i6 = charMap[i6+1]
    i7 = charMap[i7+1]
    i8 = charMap[i8+1]
    if not band(pOptions,st:tolerant) and            |!  Note: if not strict then any invalid chars have already been removed
       self.containsByte(255,in8)                    !         invalid chars map to 255 (high values)
      dispose(out)
      self.free()
      self.errorTrap('Base32Decode','Invalid character found',true)
      return st:notOK
    end
    ! now we merge 8 5bit values into 5 8bit chars
    o1 = bor(bshift(band(i1, 31), 3), bshift(band(i2, 28), -2))
    o2 = bor(bshift(band(i2,  3), 6), bor(bshift(band(i3,  31), 1), bshift(band(i4, 16), -4)))
    o3 = bor(bshift(band(i4, 15), 4), bshift(band(i5, 30), -1))
    o4 = bor(bshift(band(i5,  1), 7), bor(bshift(band(i6,  31), 2), bshift(band(i7, 24), -3)))
    o5 = bor(bshift(band(i7,  7), 5), band(i8, 31))
    stMemCpyLeft(address(out)+outIdx-1,address(out5),5) ! was: out[outIdx : outIdx+4] = out5
    outIdx += 5
    if outIdx > size(out) then break.               ! last block?
    x += 8
  end

  self._StealValue(out)                             ! point our object to our output
  out &= null                                       ! guard against anyone wrongly thinking they should dispose out

  case padChars                                     ! adjust length for padding chars
  of 1; self.adjustLength(-1)
  of 3; self.adjustLength(-2)
  of 4; self.adjustLength(-3)
  of 6; self.adjustLength(-4)
  end
  return st:ok
