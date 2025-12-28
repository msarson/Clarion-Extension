  PROGRAM

  MAP
    AtSortReport(STRING StartConfigGrp, STRING StartReRunGrp)
    AtSortReport(LONG orderId)
  END

  CODE
  AtSortReport('Config1', 'ReRun1')
  AtSortReport(12345)

AtSortReport PROCEDURE(STRING StartConfigGrp, STRING StartReRunGrp)
  CODE
  RETURN

AtSortReport PROCEDURE(LONG orderId)
  CODE
  RETURN
