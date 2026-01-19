  PROGRAM
  MAP
  END
  CODE


StringTheory.QuotedPrintableEncode  Procedure()
x    LONG, auto
st   StringTheory
y    long
  CODE
  if self._DataEnd < 1 then return.
  loop x = 1 to self._DataEnd
    case val(self.value[x])
    of 61 ! =
      st.Append('=3D')
      y += 3
    of 9 orof 32 orof 33 to 126 orof 13
      st.Append(self.value[x])
      y += 1
    of 10
      st.Append(self.value[x])
      y = 1
    ELSE
      st.Append('=' & self.ByteToHex(val(self.value[x])))
      y += 3
    END
    if y >= 72
      if st.right(1) <> '<13>'
        st.Append('=<13,10>')
        y=0
      end
    end
  end
  self._StealValue(st)

!-----------------------------------------------------------------------------------
!!! <summary>Decode the Printed-Quoteable string back to plain text</summary>
StringTheory.QuotedPrintableDecode  Procedure()
  code
  self.remove('=<13,10>')
  self.UrlDecode('=','')
