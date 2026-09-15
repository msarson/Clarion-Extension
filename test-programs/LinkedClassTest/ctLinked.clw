  INCLUDE('member.inc')
  INCLUDE('ctLinked.inc'),ONCE
  MAP
  END

ctLinked.Init PROCEDURE()
  CODE
  SELF.Count = 1

ctLinked.Kill PROCEDURE()
  CODE
  SELF.Count = 0
