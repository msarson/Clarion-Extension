  MEMBER
  MAP
    
  END
  
  CODE
  IF SELF.osmode THEN SELF.debugout('DebugerOn[Always]')           ! force debug on regardless of debug in project
                        ELSE SELF.debugout('DebugerOn[Command line]')     ! force debug on a production app
         END