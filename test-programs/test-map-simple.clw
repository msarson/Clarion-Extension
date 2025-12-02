PROGRAM

Map
  SortCaseSensitive(*LinesGroupType p1,*LinesGroupType p2),Long
  SortLength(*LinesGroupType p1,*LinesGroupType p2),Long
  SortCaseInsensitive(*LinesGroupType p1,*LinesGroupType p2),Long
  stMemCpyLeft (long dest, long src,  unsigned count)
  stMemCpyRight(long dest, long src,  unsigned count)
  Module ('')
    ToUpper (byte char), byte, name('Cla$isftoupper'),dll(DLL_Mode)
    ToLower (byte char), byte, name('Cla$isftolower'),dll(DLL_Mode)
    MemCmp(long buf1, long buf2, unsigned count), long, name('_memcmp'),dll(DLL_Mode)
    MemChr(long buf, long c, unsigned count), long, name('_memchr'),dll(DLL_Mode)
    stMemSet(long dest, long char, unsigned count), long, proc, name('_memset'),dll(DLL_Mode)
    stMemiCmp(long buf1, long buf2, unsigned count), long, name('_memicmp'),dll(DLL_Mode)
  end

  MODULE('Zlib')
    stDeflateInit2_(ulong pStream, long pLevel, long pMethod, long pWindowBits, long pMemLevel, long pStrategy, long pVersion, long pStreamSize ),long,Pascal,raw,dll(_fp_)
    stDeflate(ulong pStream, long pFlush ),long,Pascal,raw,dll(_fp_)
    stDeflateEnd(ulong pStream),long,Pascal,RAW,dll(_fp_)
  End
end

CODE
  MESSAGE('Test MAP with nested MODULEs')
