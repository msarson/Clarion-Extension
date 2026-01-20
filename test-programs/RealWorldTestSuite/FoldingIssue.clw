  MEMBER

Test Procedure()
  CODE
 if band(pOptions,st:NoCaseCompare) > 0
      return choose(stMemiCmp(address(self.value),address(pOtherValue),ln)=0)
    else
      return choose(MemCmp(address(self.value),address(pOtherValue),ln)=0)
    end