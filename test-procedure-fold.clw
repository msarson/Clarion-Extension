    PROGRAM

    MAP
    END

    code

SortCaseSensitive          Procedure(*LinesGroupType p1,*LinesGroupType p2)
  code
  if p1.line = p2.line then return 0.
  if p1.line > p2.line then return 1.
  return -1
