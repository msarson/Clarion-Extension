  PROGRAM
      Map
        
        end
  CODE

StringTheory.Base85Encode Procedure(Long pOptions=0)
  CODE
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