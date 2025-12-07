   PROGRAM

   MAP
   END

nts GROUP
record  STRING(10)
notes   STRING(100)
case    LONG
end     BYTE
    END

hold GROUP
nts     GROUP
record      STRING(10)
notes       STRING(100)
        END
    END

lcl:Preset_NTS  BYTE
lcl:Empty_Notes BYTE

NTS:Notes       STRING(100)

  CODE
  ! Test assignment with keywords as field names
  if GlobalResponse=RequestCancelled
      nts:record      = hold:nts:record
      nts:notes       = hold:nts:notes
  else 
      hold:nts:record = nts:record
      hold:nts:notes  = nts:notes
      lcl:Preset_NTS  = TRUE
      lcl:Empty_Notes = CHOOSE( LEN(CLIP(NTS:Notes)) = 0 )
  end

  ! Test other keywords as fields
  nts:case = 123
  nts:end = 1

  RETURN
