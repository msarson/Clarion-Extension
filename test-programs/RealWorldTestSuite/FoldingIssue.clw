  MEMBER

Test Procedure()
  CODE
  case pLen
  of 0 to 50
    return 50
  of 51 to 255
    return 255
  of 256 to 511
    return 511
  of 512 to 1024
    return 1024
  of 1025 to 16384
    return 16384
  of 16385 to 1048576
    return pLen * 2
  ELSE
    return pLen + 1048576
  end