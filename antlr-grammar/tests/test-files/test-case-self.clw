  PROGRAM

  MAP
  END

  CODE
  CASE SELF.Request
  OF 1
    GlobalErrors.Throw(123)
    RETURN
  END
