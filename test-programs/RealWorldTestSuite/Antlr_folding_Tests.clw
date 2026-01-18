    MEMBER
    include('StringTheory.inc'), once
    include('cwsynchc.inc'), once
  Compile('***',StringTheoryLinkMode=1)
  PRAGMA('compile(ojmd5.c)')
  !***
  Omit('***',_C100_)
  PRAGMA('link(winex.lib)')
  !***

ST_SYSTEMTIME          group, type
wYear                       ushort
wMonth                      ushort
wDayOfWeek                  ushort
wDay                        ushort
wHour                       ushort
wMinute                     ushort
wSecond                     ushort
wMilliseconds               ushort
                        end
MAXULONG            Equate(4294967296)
MAXLONG             Equate(2147483647)

!randcrit  CriticalSection

  OMIT('***',_C91_)
INT64    GROUP,TYPE
lo         ULONG
hi         LONG
         END

UINT64   GROUP,TYPE
lo         ULONG
hi         ULONG
         END

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
                stCreateFile(*cstring lpFileName, long dwDesiredAccess, long dwSharedMode, long lpSecurityAttributes, |
                                long dwCreationDisposition, long dwFlagsAndAttributes, long hTemplateFile), long, raw, pascal, name('CreateFileA'),dll(DLL_Mode)
                stReadFile(long hFile, *string lpBuffer, long nNumberOfBytesToRead, *long lpNumberOfBytesRead, long lpOverlapped), raw, long, pascal, name('ReadFile'),dll(DLL_Mode)
                stCloseHandle(long hObject),long, proc, pascal, name('CloseHandle'),dll(1)
                stWriteFile(long hFile, *string lpBuffer, long nNumberOfBytesToWrite, *long lpNumberOfBytesWritten, |
                               long lpOverlapped), long, proc, raw, pascal, name('WriteFile'),dll(1)
                !stGetFileSize(long hFile,*long SizeHigh), long, pascal, name('GetFileSize'),dll(1)
                !stSetFilePointer(long hFile,Long lDistanceToMove,*Long lpDistanceToMoveHigh,long dwMoveMethod), |
                !               long, raw, pascal,proc, name('SetFilePointer'),dll(DLL_Mode)
                stGetFileSizeEx(long hFile,*Int64 FileSize), long, raw, pascal, name('GetFileSizeEx')
                stFindFirstFile(*cstring pFileName,Long rFileData), long, proc, raw, pascal, name('FindFirstFileA')

                stSetFilePointerEx(long hFile,Int64 liDistanceToMove,*Int64 lpNewFilePointer,long dwMoveMethod), |
                                long, raw, pascal, proc, name('SetFilePointerEx')
                stFlushFileBuffers(long hFile), long, pascal, name('FlushFileBuffers'),dll(1)
                stDeleteFile(*cstring lpFileName), long, proc, raw, pascal, name('DeleteFileA'),dll(1)

                stSetErrorMode(ulong nMode), long, proc, raw, pascal, name('SetErrorMode'),dll(1)
                stOutputDebugString(*cstring msg), raw, pascal, name('OutputDebugStringA'),dll(1)
                stWideCharToMultiByte(ulong CodePage, long dwFlags, *string lpWideCharStr, long cchWideChar, *string lpMultiByteStr, long cbMultiByte, long lpDefaultChar=0, long lpUsedDefaultChar=0), long, raw, pascal, name('WideCharToMultiByte'),dll(1)
                stMultiByteToWideChar(ulong CodePage, unsigned dwFlags, *string lpMultiByteStr, long cbMultiByte, *string lpWideCharStr, long cchWideChar), long, raw, pascal, name('MultiByteToWideChar'),dll(1)
                stGetSysColor(long pColor),Ulong, raw, pascal, name('GetSysColor')
                stGetSystemTime(*ST_SYSTEMTIME lpSystemTime), pascal, raw, name('GetSystemTime'), dll(1)
                stIsCharAlphaNumericA(Byte pChar),Long,Raw,Pascal,name('IsCharAlphaNumericA')

                !--- Runtime Dll loading
                stLoadLibrary(*cstring lpLibFileName), long, pascal, raw, name('LoadLibraryA'), dll(1)
                stGetProcAddress(ulong hModule, *cstring lpProcName), ulong, pascal, raw, name('GetProcAddress'), dll(1)
            end
            Compile ('****',_C91_=1)
            include('i64.inc'),Once
            !****

          ! External C Functions (MD5)
          !Compile ('****',MD5=1)
            Module('MD5.c')
                stMD5Init(Long Context),LONG, RAW, NAME('_MD5Init')
                stMD5Update(LONG Context, *STRING pInput, LONG pLength),LONG, RAW, NAME('_MD5Update')
                stMD5Final(*CSTRING Digest, LONG Context),LONG, RAW, NAME('_MD5Final')
            end
          !****
        end

    