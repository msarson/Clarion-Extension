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
    stInflateInit2_(ulong pStream, Long pWindowBits,uLong pVersion, Long pSize),long,Pascal,raw,dll(_fp_)
    stInflate(ulong pStream, Long pFlush),long,Pascal,RAW,dll(_fp_)
    stInflateEnd(ulong pStream),long,Pascal,RAW,dll(_fp_)
  End
  
  Module('Normaliz.dll')
    stNormalizeString(Long NormForm, *String SrcString, Long SrcLength, *String DestString, Long DestLength),Long,Proc,Raw,Pascal,dll(_fp_)
  End

  module('CW_API')
    stSeedRandom(Long pSeed),name('_srand'),dll(DLL_Mode)
    stRand(),Long,name('_rand'),dll(DLL_Mode)
  END

  Module('WinApi')
    stGetCurrentProcessId(),ulong,Pascal,raw,name('GetCurrentProcessId') ,dll(1)
    stGetCurrentThreadId(),ulong,Pascal,raw,name('GetCurrentThreadId') ,dll(1)
    stGetLastError(), ulong, raw, pascal, name('GetLastError'),dll(1)
    stFormatMessage(ulong dwFlags, ulong lpSource, ulong dwMessageId, ulong dwLanguageId, *cstring lpBuffer, |
                    ulong nSize, ulong Arguments), ulong, raw, pascal, name('FormatMessageA'),dll(1)
  end
end

CODE
  MESSAGE('Complex MAP test')
