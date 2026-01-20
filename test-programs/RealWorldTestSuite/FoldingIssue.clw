  PROGRAM
      Map
            SortCaseSensitive(*LinesGroupType p1,*LinesGroupType p2),Long
            SortLength(*LinesGroupType p1,*LinesGroupType p2),Long
            SortCaseInsensitive(*LinesGroupType p1,*LinesGroupType p2),Long
            stMemCpyLeft (long dest, long src,  unsigned count)
            stMemCpyRight(long dest, long src,  unsigned count)
            Module ('')
                ToUpper (byte char), byte, name('Cla$isftoupper'),dll(DLL_Mode)                          ! ToUpper is far more efficient for single character conversion
                ToLower (byte char), byte, name('Cla$isftolower'),dll(DLL_Mode)
                MemCmp(long buf1, long buf2, unsigned count), long, name('_memcmp'),dll(DLL_Mode)        ! GCR
                MemChr(long buf, long c, unsigned count), long, name('_memchr'),dll(DLL_Mode)            ! GCR
                stMemSet(long dest, long char, unsigned count), long, proc, name('_memset'),dll(DLL_Mode)
                stMemiCmp(long buf1, long buf2, unsigned count), long, name('_memicmp'),dll(DLL_Mode)    ! case insensitive compare
            end
        end
  CODE
