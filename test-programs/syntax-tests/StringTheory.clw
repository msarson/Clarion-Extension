!-----------------------------------------------------------------------------!
!                                                                             !
!   CapeSoft StringTheory class is copyright � 2025 by CapeSoft Software      !
!   Based on a StringClass by Rick Martin as published in www.clarionmag.com. !
!   Thanks to Geoff Robinson for many useful contributions                    !
!   Docs online at : https://capesoft.com/docs/StringTheory/StringTheory.htm  !
!                                                                             !
!-----------------------------------------------------------------------------!
    Member

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
! ***

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

seeded  long,static  ! used to auto-seed the RANDOM function

! runtime loaded DLL functions
hZlib               unsigned
fp_DeflateInit2_    unsigned,name('stDeflateInit2_')
fp_Deflate          unsigned,name('stDeflate')
fp_DeflateEnd       unsigned,name('stDeflateEnd')
fp_InflateInit2_    unsigned,name('stInflateInit2_')
fp_Inflate          unsigned,name('stInflate')
fp_InflateEnd       unsigned,name('stInflateEnd')
hNormaliz           unsigned
fp_NormalizeString  unsigned,name('stNormalizeString')

!-----------------------------------------------------------------------------------
SortCaseSensitive          Procedure(*LinesGroupType p1,*LinesGroupType p2)
  code
  if p1.line = p2.line then return 0.
  if p1.line > p2.line then return 1.
  return -1

!-----------------------------------------------------------------------------------
SortLength          Procedure(*LinesGroupType p1,*LinesGroupType p2)
  code
  if len(clip(p1.line)) = len(clip(p2.line)) then return SortCaseSensitive(p1,p2).
  if len(clip(p1.line)) > len(clip(p2.line)) then return 1.
  return -1

!-----------------------------------------------------------------------------------
SortCaseInsensitive        Procedure(*LinesGroupType p1,*LinesGroupType p2)
  code
  if Upper(p1.line) = Upper(p2.line) then return 0.
  if Upper(p1.line) > Upper(p2.line) then return 1.
  return -1

!-----------------------------------------------------------------------------------
StringTheory._GetNextBufferSize         Procedure(Long pLen)
  CODE
  if self.value &= NULL and self._first = false
    self._first = true
    return pLen             ! make first assignment the perfect length.
  end
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

!-----------------------------------------------------------------------------------
StringTheory._EqualsUnicode        Procedure(*String otherValue, Long pOptions = st:UnicodeCompare)
str StringTheory
  code
  if band(pOptions,st:Clip)
    str.SetValue(otherValue,st:clip)
    return self._EqualsUnicode(str,pOptions-st:clip-st:UnicodeCompare)
  else
    str.SetValue(otherValue)
    return self._EqualsUnicode(str,pOptions-st:UnicodeCompare)
  end

!-----------------------------------------------------------------------------------
! supported Options;
! st:clip, st:simpleCompare, st:UnicodeCompare, st:NoCaseCompare
StringTheory.Equals Procedure(String pOtherValue, Long pOptions = ST:SimpleCompare + ST:Clip)
ln  long,auto
  code
  if band(pOptions,st:UnicodeCompare)
    return self._EqualsUnicode(pOtherValue,pOptions)
  end
  if band(pOptions,st:Clip)
    ln = self.clipLength(pOtherValue)
  else
    ln = size(pOtherValue)
  end
  if self._DataEnd <> ln
    return false
  elsif self._DataEnd = 0  ! both blank
    return true
  else
    if band(pOptions,st:NoCaseCompare) > 0
      return choose(stMemiCmp(address(self.value),address(pOtherValue),ln)=0)
    else
      return choose(MemCmp(address(self.value),address(pOtherValue),ln)=0)
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Equals Procedure(StringTheory pOtherValue, Long pOptions = ST:SimpleCompare)
  code
  if band(pOptions,st:UnicodeCompare) and self.encoding <> pOtherValue.encoding  ! if same encoding so can do a simple compare
    return self._EqualsUnicode(pOtherValue,pOptions - st:UnicodeCompare)
  elsif self._DataEnd <> pOtherValue._DataEnd
    return false
  elsif self._DataEnd = 0  ! both blank
    return true
  else
    if band(pOptions,st:NoCaseCompare) > 0
      case self.encoding
      of st:EncodeAnsi
        return choose(stMemiCmp(address(self.value),address(pOtherValue.value),self._DataEnd)=0)
      of st:EncodeUtf8
      orof st:EncodeUtf16
        return self._EqualsUnicode(pOtherValue,pOptions - st:UnicodeCompare)
      end
    else
      return choose(MemCmp(address(self.value),address(pOtherValue.value),self._DataEnd)=0)
    end
  end

!-----------------------------------------------------------------------------------
! TODO - extend this function to use https://docs.microsoft.com/en-us/windows/win32/api/stringapiset/nf-stringapiset-comparestringex
StringTheory._EqualsUnicode Procedure(StringTheory pOtherValue, Long pOptions = ST:SimpleCompare)
str  StringTheory
  code
  if self.encoding = st:EncodeAnsi                             ! self is ansi, other is unicode
    str.SetValue(self)                                         ! make copy of self
    str.ToUnicode(pOtherValue.encoding)                        ! change copy to same unicode encoding as OtherValue
    return str.Equals(pOtherValue,ST:SimpleCompare)            ! do a simple comparison now.
  elsif pOtherValue.encoding = st:EncodeAnsi                   ! self. is unicode, other is ansi, so reverse as above.
    str.SetValue(pOtherValue)
    str.ToUnicode(self.encoding)
    return str.Equals(self,ST:SimpleCompare)
  elsif self.encoding = st:EncodeUtf8
    str.SetValue(self)                                         ! make copy of self
    str.ToUnicode(pOtherValue.encoding)
    return str.Equals(pOtherValue,ST:SimpleCompare)            ! do a simple comparison now.
  elsif pOtherValue.encoding = st:EncodeUtf8
    str.SetValue(pOtherValue)
    str.ToUnicode(self.encoding)
    return str.Equals(self,ST:SimpleCompare)
  end
  return false ! should never get here.

!-----------------------------------------------------------------------------------
StringTheory.SetValue              Procedure (StringTheory newValue,long pOptions)
x  long,auto
  code
  self.SetValue(newValue)
  If band(pOptions,st:lines) and not newValue.Lines &= null
    self.freelines()
    Loop x = 1 to records(newvalue.lines)
      Self.addLine(newValue.getLine(x))
    End
  End

!-----------------------------------------------------------------------------------
StringTheory.SetValue Procedure(StringTheory newValue)
  code
  if newValue._DataEnd > 0
    if not self.streamFileName &= null
      if address(newValue.value) = address(self.value)  ! appending self
        self.FlushAndKeep()
      else
        self.Flush()                                    ! setValue clears the existing contents from the buffer, so Flush first.
        self.Append(newValue)                           ! Flush will clear the buffer, so can just Append here.
      end
    elsif self.UseBuffer and size(self.value) >= newValue._DataEnd
      stMemCpyLeft(address(self.value),address(newValue.value),newValue._DataEnd)
      if self.CleanBuffer and newValue._DataEnd < self._DataEnd
        stMemSet(address(self.value)+newValue._DataEnd,32,self._DataEnd-newValue._DataEnd)
      end
      self._DataEnd = newValue._DataEnd
    else
      self.setValue(newValue.Value[1 : newValue._DataEnd])
    end
  else
    self.free()
  end
  self.gzipped   =  newValue.gzipped
  self.base64    =  newValue.base64
  self.encoding  =  newValue.encoding
  self.Endian    =  newValue.Endian
  self.CodePage  =  newValue.CodePage

!-----------------------------------------------------------------------------------
StringTheory.SetValueByAddress Procedure(long newValueAddress,long pLength)
  code
  if pLength <= 0
    self.Free()
  elsif not self.streamFileName &= null
    if newValueAddress = address(self.value)
      self.FlushAndKeep()
      if pLength <= size(self.value)
        if self.CleanBuffer and self._DataEnd > pLength
          stMemSet(address(self.value)+pLength,32,self._DataEnd-pLength)
        end
        self._DataEnd = pLength
      else
        self.SetLength(pLength)                 ! note some data may be lost if expanding buffer but that would be dodgy use anyway
      end
    else
      self.Flush()                              ! flushes the existing cache to disk and clears the buffer
      self.CatAddr(newValueAddress, pLength)
    end
  else
    if self.UseBuffer
      if pLength > size(self.value)             ! note size(self.value) will be set to 0 when self.value set to null
        Dispose(self.value)
        self.value &= Null                      ! do NOT remove this line - necessary to correctly set size() to 0
        self.valuePtr &= Null
        self._Malloc(pLength)
      else
        if self.CleanBuffer and self._DataEnd > pLength
          stMemSet(address(self.value)+pLength,32,self._DataEnd-pLength)
        end
        self._DataEnd = pLength
      end
?     assert(size(self.value) >= pLength and pLength >= 1,'Memory for string assignment too small. pLength=' & pLength & ' BufferSize=' & size(self.value))
    elsif pLength <> self._DataEnd
      self.Free()
      self._Malloc(pLength)
    end
    stMemCpyLeft(address(self.value), newValueAddress, pLength)
  end
  self.base64 = 0
  return

!-----------------------------------------------------------------------------------
!!! <summary>Assign a new value to the string</summary>
!!! <param name="newValue">The new string to assign to the class</param>
!!! <remarks>A new value can be assigned to the class regardless
!!! if it already has a value. The old value is automatically disposed.</remarks>
StringTheory.SetValue Procedure(*string newValue, long pClip=st:NoClip)
strLen  long,auto
  code
  if address(newValue) = 0
    strLen = 0
  elsif pClip
    strLen = self.clipLength(newValue)
  else
    strLen = size(newValue)
  end
  if strLen = 0
    self.Free()
  elsif not self.streamFileName &= null
    if address(newValue) = address(self.value)
      self.FlushAndKeep()
      self.SetLength(strLen)
    else
      self.Flush()
      self.Append(newValue[1 : strLen])
    end
  elsif self.UseBuffer
    if strlen > size(self.value)  ! note size(self.value) will be set to 0 when self.value set to null
      dispose(self.value)
      self.value &= Null          ! do NOT remove this line - necessary to correctly set size() to 0
      self.valuePtr &= Null
      self._Malloc(strLen)
?     assert(size(self.value) >= strlen and strlen >= 1,'Memory for string assignment too small. StrLen=' & StrLen & ' BufferSize=' & size(self.value))
      stMemCpyLeft(address(self.value), address(newValue), strLen)
    else
      stMemCpyLeft(address(self.value), address(newValue), strLen)
      if self.CleanBuffer and self._DataEnd > strlen
        stMemSet(address(self.value)+strlen,32,self._DataEnd-strlen)
      end
      self._DataEnd = strLen
    end
  else
    if strLen <> self._DataEnd
      self.Free()
      self._Malloc(strLen)
    end
    self.value = newValue
  end
  self.base64 = 0
  return

!-----------------------------------------------------------------------------------
StringTheory.SetValueFromLine Procedure(long pLineNumber)
  code
  if self.Lines &= null or pLineNumber < 1 or pLineNumber > Records(self.Lines)
    self.free()
  else
    Get(self.Lines,pLineNumber)
    if ErrorCode() or self.Lines.Line &= NULL or (self.Lines.Empty and size(self.Lines.Line) = 1 and self.Lines.Line = ' ')
      self.free()
    else
      self.setValue(self.Lines.line)
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Assign simply provides a different name for SetValue</summary>
StringTheory.Assign Procedure(*string newValue)
  code
  self.SetValue(newValue)

!-----------------------------------------------------------------------------------
StringTheory.Assign Procedure(string newValue)
  code
  self.SetValue(newValue)

!-----------------------------------------------------------------------------------
!!! <summary>Assign a new value to the string</summary>
!!! <param name="newValue">The new string to assign to the class</param>
!!! <remarks>A new value can be assigned to the class regardless
!!! if it already has a value. The old value is automatically disposed.</remarks>
StringTheory.SetValue Procedure(string newValue, long pClip=st:NoClip)
  code
  self.SetValue(newValue,pClip)

!-----------------------------------------------------------------------------------
!!! <summary>Load the value from a BLOB into the StringTheory object</summary>
!!! <param name="blobField">The BLOB to get the data from</param>
StringTheory.FromBlob Procedure(*blob blobField)
  code
  if blobField &= null or blobField{prop:size} = 0
    self.free(false)
    self.ErrorTrap('FromBlob','The passed BLOB pointer was null or the BLOB did not contain any data.')
    return False
  end
  self.SetValue(blobField[0 : blobField{prop:size} - 1])
  return True

!Aside: MsSql driver likes a read on prop:size before adding records with blobs.

!-----------------------------------------------------------------------------------
!!! <summary>Store the current string value in the passed BLOB</summary>
!!! <param name="blobField">The BLOB to store the data in</param>
StringTheory.ToBlob Procedure(*blob blobField)
n long                      ! see note [1]
  code
  if blobField &= null
    self.ErrorTrap( 'ToBlob','The passed BLOB pointer was null')
    return 0
  end
  n = blobField{prop:size}  ! see note [1]. Do not remove
  blobField{prop:size} = 0  ! see note [2]. Do not remove
  blobField{prop:size} = self._DataEnd
  if self._DataEnd = 1
    blobField[0] = self.value[1]
  elsif self._DataEnd > 1
    blobField[0 : self._DataEnd -1] = self.value[1 : self._DataEnd]
  end
  return 1

! note[1]
! this code is here to work-around some sort of bug in the ODBC layer. Testing with MyTable using ODBC driver (Firebird backend)
! noted that ToBlob could "fail" if a prior read of {prop:size} had not been made. Results were consistent, although not universal.
! Clarion build tested 11.0.13372
!
! note[2]
! setting the size to 0 explicitly clears the blob before then assigning something into the blob.
!
! note[3]
! SQLite Blobs cannot seem to get smaller. prop:size can only get bigger.
!

!-----------------------------------------------------------------------------------
! Stream associates a string with a disk file.  Contents is flushed to disk either explicitly with flush() or when required either
! when size would exceed specified buffer size, or if no size specified then when cannot expand buffer due to lack of available memory.
StringTheory.Stream Procedure(string pFilename, long pSize=10, bool pAppendFlag=false)
  Code
  If self.UseBuffer = 0
    self.ErrorTrap('Stream','Cannot Stream if UseBuffer not true',true)
    return st:notok
  Elsif pFilename = ''
    self.ErrorTrap('Stream','No filename specified',true)
    return st:notok
  End

  If not self.streamFileName &= null
    self.Flush()
    If upper(pFilename) <> upper(self.streamFileName)   ! if names are the same, do nothing....
      Dispose(self.streamFileName)
      self.streamFileName &= new string(self.clipLength(pFilename))
      self.streamFileName = pFilename
    End
  Else
    self.streamFileName &= new string(self.clipLength(pFilename))
    self.streamFileName = pFilename
    self.Flush()                                        ! technically, could call stream if the object already contains data.
  End
  If pSize < 1 Then pSize = 10.                         ! default to 10MB
  If pSize > 500 Then pSize = 10.                       ! default to 10MB
  self.SetLength(pSize * 1048576,true)                  ! convert size in MB to bytes
  self._DataEnd = 0

  If pAppendFlag = false
    Remove(self.streamFileName)
    Case errorcode()
    Of 0 orof 2 orof 3
    Else
      self.ErrorTrap('Stream','Warning: unable to remove existing stream file ' & self.streamFileName & |
                     ' Errorcode='& errorcode() & ' Error='& error(),true)
    End
  End
  return st:ok

!-----------------------------------------------------------------------------------
! NoStream  terminates the streaming, but does NOT do an implicit FLUSH.
StringTheory.NoStream Procedure()
  code
  Dispose(self.streamFileName)

!-----------------------------------------------------------------------------------
StringTheory.FlushAndKeep Procedure() !, long
! special case where we do NOT clear buffer after flushing
retCode  long
  code
  if self.streamFileName &= null
    self.ErrorTrap('FlushAndKeep','flush ignored as not currently streaming',true)
    retcode = st:notok
  elsif self._DataEnd < 1
    retCode = st:ok ! "success" as nothing to write
  else
    if self.SaveFile(self.value[1 : self._DataEnd],self.streamFileName,st:Append)
      retCode = st:ok
    else
      retcode = st:notok
    end
  end
  return retCode

!-----------------------------------------------------------------------------------
StringTheory.Flush Procedure() !, long
retCode  long
  code
  if self.streamFileName &= null
    self.ErrorTrap('Flush','flush ignored as not currently streaming',true)
    retcode = st:notok
  elsif self._DataEnd < 1
    retCode = st:ok            ! "success" as nothing to write
  else
    if self.SaveFile(self.value[1 : self._DataEnd],self.streamFileName,st:Append)
      retCode = st:ok
    else
      retcode = st:notok
    end
    ! note do NOT call free() here as it now checks for stream and will call flush...
    if self.CleanBuffer
      stMemSet(address(self.value),32,self._DataEnd)
    end
  end
  self._DataEnd = 0
  return retCode

!-----------------------------------------------------------------------------------
StringTheory.Flush Procedure(string pStr) !, long
  code
  return self.flush(pStr)

!-----------------------------------------------------------------------------------
StringTheory.Flush Procedure(*string pStr) !, long
retCode  long
  code
  if address(pStr) = address(self.value)
    return self.flush(pStr & '')           ! pass by value
  end
  retCode = self.Flush()                   ! first flush any existing data in buffer
  if retcode = st:ok
    if address(pStr) = 0
      ! success - null string passed
    elsif size(pStr) < 1
      ! success - nothing to write
    else
      if self.SaveFile(pStr,self.streamFileName,st:Append)
        retCode = st:ok
      else
        retcode = st:notok
      end
    end
  end
  return retCode

!-----------------------------------------------------------------------------------
StringTheory.Flush Procedure(StringTheory pStr) !, long
  code
  return self.flush(pStr.GetValuePtr())


!-----------------------------------------------------------------------------------
!!! <summary>Append the new value to the current string</summary>
!!! <remarks>If no value already exists then the new value is assigned
!!! as if Assign had been called instead of Append.</remarks>
StringTheory.AppendA Procedure(string newValue, long pOptions = st:NoClip, <string pSep>)
  code
  if (omitted(pSep) or size(pSep) = 0) and band(pOptions,st:NoBlanks) = 0
    self.CatAddr(address(newValue), Choose(band(pOptions,st:Clip)=0,size(NewValue),self.clipLen(NewValue)))
  else
    self.Append(newValue,pOptions,pSep)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Append the new value to the current string</summary>
!!! <remarks>If no value already exists then the new value is assigned
!!! as if Assign had been called instead of Append.</remarks>
StringTheory.Append Procedure(stringTheory pStr)
pLen Long,auto                                         ! do not remove this!
  code
  pLen = pStr._DataEnd
  if pLen > 0 and address(pStr.value)
    if size(self.value) < self._DataEnd + pLen
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + pLen)
        self._DataEnd -= pLen
        stMemCpyLeft(address(self.value) + self._DataEnd, address(pStr.value), pLen)
        self._DataEnd += pLen
      elsif address(self.value) = address(pStr.value)  ! appending onto self
        self.FlushAndKeep()                            ! do not clear buffer after flushing to disk
      elsif pLen < size(self.value)
        self.Flush()
        stMemCpyLeft(address(self.value), address(pStr.value), pStr._DataEnd)
        self._DataEnd = pStr._DataEnd
      else
        self.Flush(pStr.value[1 : pStr._DataEnd])      ! will flush existing contents first
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(pStr.value), pLen)
      self._DataEnd += pStr._DataEnd
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Append                Procedure (Blob pBlob)
  code
  if pBlob &= null or pBlob{prop:size} = 0
    self.ErrorTrap('Append','The passed BLOB pointer was null or the BLOB did not contain any data.')
    return
  end
  self.Append(pBlob[0 : pBlob{prop:size} - 1])
  return

!-----------------------------------------------------------------------------------
!!! <summary>Append the new value to the current string</summary>
!!! <remarks>If no value already exists then the new value is assigned
!!! as if Assign had been called instead of Append.</remarks>
StringTheory.Append Procedure(stringTheory pStr, string pSep)
  code
  self.append(pStr,st:NoClip,pSep)

!-----------------------------------------------------------------------------------
!!! <summary>Append the new value to the current string</summary>
!!! <remarks>If no value already exists then the new value is assigned
!!! as if Assign had been called instead of Append.</remarks>
! pOptions: st:noClip , st:clip, st:NoBlanks, st:Lines
StringTheory.Append Procedure(stringTheory pStr, long pOptions = st:NoClip, string pSep)
sepLen  Long,auto
x       Long,auto
  CODE
  if self._DataEnd < 1
    sepLen = 0          ! no separator if currently empty string
  else
    sepLen = size(pSep)
  end

  if pStr._DataEnd > 0  ! new value not blank
    if address(pStr) = address(self.value)
      ! appending self so pass by value
      if sepLen or band(pOptions,st:Clip)
        self.Append(pStr.getValue(),band(pOptions,st:Clip),pSep)
      else
        self.Append(pStr)
      end
    else
      if sepLen or band(pOptions,st:Clip)
        self.Append(pStr.value[1 : pStr._DataEnd],band(pOptions,st:Clip),pSep)
      else
        self.CatAddr(address(pStr.value), pStr._DataEnd)
      end
    end
  elsif sepLen! and also pStr._DataEnd = 0 to get here
    if band(pOptions,st:NoBlanks) = 0
      self.CatAddr(address(pSep), sepLen)
    end
  end
  If Band(pOptions,st:Lines)
    Loop x = 1 to records(pStr.lines)
      Self.addLine(pStr.getLine(x))
    End
  End

!-----------------------------------------------------------------------------------
StringTheory.Append Procedure(string newValue)
  code
  if size(newValue)
    if size(self.value) < self._DataEnd + size(newValue)
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + size(newValue))
        stMemCpyLeft(address(self.value) + self._DataEnd-size(newValue), address(newValue), size(newValue))
      elsif size(newValue) < size(self.value)
        self.Flush()
        stMemCpyLeft(address(self.value), address(newValue), size(newValue))
        self._DataEnd = size(newValue)
      else
        self.Flush(newValue)  ! will flush existing contents first
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(newValue), size(newValue))
      self._DataEnd += size(newValue)
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Append Procedure(*string newValue)
  code
  if size(newValue) and address(newValue)
    if size(self.value) < self._DataEnd + size(newValue)
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + size(newValue))
        stMemCpyLeft(address(self.value) + self._DataEnd-size(newValue), address(newValue), size(newValue))
      elsif address(newValue) = address(self.value) ! appending self
        if size(newValue) = self._DataEnd
          self.FlushAndKeep()                       ! do not clear buffer after flushing to disk
        else
          self.append(newValue & '')                ! do NOT remove & '' so we pass by value
        end
      elsif size(newValue) < size(self.value)
        self.flush()
        stMemCpyLeft(address(self.value), address(newValue), size(newValue))
        self._DataEnd = size(newValue)
      else
        self.flush(newValue)                        ! will flush existing contents first
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(newValue), size(newValue))
      self._DataEnd += size(newValue)
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Append the new value to the current string</summary>
!!! <remarks>If no value already exists then the new value is assigned
!!! as if Assign had been called instead of Append.</remarks>
StringTheory.Append Procedure(string newValue, long pOptions)
  CODE
  self.CatAddr(address(newValue), Choose(band(pOptions,st:Clip)=0,size(NewValue),self.clipLen(NewValue)))

!-----------------------------------------------------------------------------------
!!! <summary>Append the new value to the current string</summary>
!!! <remarks>If no value already exists then the new value is assigned
!!! as if Assign had been called instead of Append.</remarks>
StringTheory.Append Procedure(*string newValue, long pOptions)
  CODE
  if address(newValue)
    if address(newValue) = address(self.value) and not self.streamFileName &= null
      self.append(newValue&'',pOptions) ! appending self so pass by value
    else
      self.CatAddr(address(newValue), Choose(band(pOptions,st:Clip)=0,size(NewValue),self.clipLen(NewValue)))
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Append the new value to the current string</summary>
!!! <remarks>If no value already exists then the new value is assigned
!!! as if Assign had been called instead of Append.</remarks>
StringTheory.Append Procedure(string newValue, long pOptions = st:NoClip, string pSep)
  CODE
  if size(pSep) = 0
    self.CatAddr(address(newValue), Choose(band(pOptions,st:Clip)=0,size(NewValue),self.clipLen(NewValue)))
  else
    self.Append(newValue,pOptions,pSep)
  end

!-----------------------------------------------------------------------------------
StringTheory.Append Procedure(*string newValue, long pOptions , string pSep) ! = st:noclip
newlen  Long,Auto
seplen  Long,Auto
  code
  if address(newValue) = address(self.value) and not self.streamFileName &= null ! appending self so pass by value
    self.append(newValue&'',pOptions,pSep)
    return
  end

  if address(newValue) = 0
    newLen = 0
  else
    newLen = Choose(band(pOptions,st:Clip)=0,size(NewValue),self.clipLen(NewValue))
  end
  if band(pOptions,st:NoBlanks) and newlen=0 then return.

  if self._DataEnd < 1
    sepLen = 0 ! no separator if currently empty string
  else
    sepLen = Choose(omitted(pSep)=1,0,size(pSep))
  end
  if newlen = 0 and sepLen = 0 then return.

  if size(self.value) < self._DataEnd + sepLen + newLen
    if self.streamFileName &= null
      self.SetLength(self._DataEnd + sepLen + newLen)
      if sepLen then stMemCpyLeft(address(self.value)+self._DataEnd-newlen-sepLen, address(pSep), sepLen).
      if newLen then stMemCpyLeft(address(self.value)+self._DataEnd-newlen, address(newValue), newLen).
    else
      if sepLen + newLen < size(self.value)
        self.flush()
        if sepLen then stMemCpyLeft(address(self.value), address(pSep), sepLen).
        if newLen then stMemCpyLeft(address(self.value)+sepLen, address(newValue), newLen).
        self._DataEnd = sepLen + newLen
      else
        if sepLen then self.flush(pSep).                 ! room to optimize this as it will be a very small write.
        if newLen then self.flush(newValue[1 : newlen]).
      end
    end
  else
    if SepLen
      stMemCpyLeft(address(self.value) + self._DataEnd, address(pSep), sepLen)
      self._DataEnd += SepLen
    end
    if newLen
      stMemCpyLeft(address(self.value) + self._DataEnd, address(newValue), newLen)
      self._DataEnd += newLen
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Concatenate (append) the new value to the current string</summary>
!!! <remarks>This is essentially a stripped down version of Append that has less
!!! functionality and so is faster.</remarks>
!!! <param name="NewValue">The new value to be added to the end of the current string</param>
!!! <param name="Length">The number of characters of the new value to append.
!!! Default is the full length of new value</param>
StringTheory.Cat Procedure(string newValue)
  code
  if size(newValue)
    if size(self.value) < self._DataEnd + size(newValue)
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + size(newValue))
        stMemCpyLeft(address(self.value) + self._DataEnd-size(newValue), address(newValue), size(newValue))
      elsif size(newValue) < size(self.value)
        self.flush()
        stMemCpyLeft(address(self.value), address(newValue), size(newValue))
        self._DataEnd = size(newValue)
      else
        self.flush(newValue)
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(newValue), size(newValue))
      self._DataEnd += size(newValue)
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Cat Procedure(*Byte newValue)
  code
  if size(self.value) <= self._DataEnd
    if self.streamFileName &= null
      self.SetLength(self._DataEnd+1)
      self.value[self._DataEnd] = chr(newValue)
    elsif size(newValue) < size(self.value)
      self.flush()
      self._DataEnd = 1
      self.value[self._DataEnd] = chr(newValue)
    else
      self.flush(chr(newValue))
    end
  else
    self._DataEnd += 1
    self.value[self._DataEnd] = chr(newValue)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Concatenate (append) the new value to the current string</summary>
!!! <remarks>This is essentially a stripped down version of Append that has less
!!! functionality and so is faster.</remarks>
!!! <param name="NewValue">The new value to be added to the end of the current string</param>
!!! <param name="Length">The number of characters of the new value to append.
!!! Default is the full length of new value</param>
StringTheory.Cat Procedure(*string newValue)
  code
  if size(newValue) and address(newValue)
    if size(self.value) < self._DataEnd + size(newValue)
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + size(newValue))
        stMemCpyLeft(address(self.value) + self._DataEnd-size(newValue), address(newValue), size(newValue))
      elsif address(newValue) = address(self.value) ! appending self
        if size(newValue) = self._DataEnd
          self.FlushAndKeep()                       ! do not clear buffer after flushing to disk
        else
          self.append(newValue & '')                ! do NOT remove & '' so we pass by value
        end
      elsif size(newValue) < size(self.value)
        self.flush()
        stMemCpyLeft(address(self.value), address(newValue), size(newValue))
        self._DataEnd = size(newValue)
      else
        self.flush(newValue)                        ! will flush existing contents first
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(newValue), size(newValue))
      self._DataEnd += size(newValue)
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Concatenate (append) the new value to the current string</summary>
!!! <remarks>This is essentially a stripped down version of Append that has less
!!! functionality and so is faster.</remarks>
!!! <param name="NewValue">The new value to be added to the end of the current string</param>
!!! <param name="Length">The number of characters of the new value to append.
!!! Default is the full length of new value</param>
StringTheory.Cat Procedure(string newValue, long pLen)
  code
  if pLen < 0 or pLen > size(newValue)
    pLen = size(newValue)
  end

  if pLen
    if size(self.value) < self._DataEnd + pLen
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + pLen)
        stMemCpyLeft(address(self.value) + self._DataEnd-pLen, address(newValue), pLen)
      elsif pLen < size(self.value)
        self.flush()
        stMemCpyLeft(address(self.value), address(newValue), pLen)
        self._DataEnd = pLen
      else
        self.flush(newValue[1 : pLen])
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(newValue), pLen)
      self._DataEnd += pLen
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Concatenate (append) the new value to the current string</summary>
!!! <remarks>This is essentially a stripped down version of Append that has less
!!! functionality and so is faster.</remarks>
!!! <param name="NewValue">The new value to be added to the end of the current string</param>
!!! <param name="Length">The number of characters of the new value to append.
!!! Default is the full length of new value</param>
StringTheory.Cat Procedure(*string newValue, long pLen)
  code
  if pLen < 0 or pLen > size(newValue)
    pLen = size(newValue)
  end

  if pLen and address(newValue)
    if address(newValue) = address(self.value) and not self.streamFileName &= null ! appending self so pass by value
      self.cat(newValue&'', pLen) ! pass by value
    elsif size(self.value) < self._DataEnd + pLen
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + pLen)
        stMemCpyLeft(address(self.value) + self._DataEnd-pLen, address(newValue), pLen)
      elsif pLen < size(self.value)
        self.flush()
        stMemCpyLeft(address(self.value), address(newValue), pLen)
        self._DataEnd = pLen
      else
        self.flush(newValue[1 : pLen])
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(newValue), pLen)
      self._DataEnd += pLen
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Cat Procedure(stringTheory pStr)
pLen Long,auto                                         ! do not remove this!
  code
  pLen = pStr._DataEnd
  if pLen > 0 and address(pStr.value)
    if size(self.value) < self._DataEnd + pLen
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + pLen)
        self._DataEnd -= pLen
        stMemCpyLeft(address(self.value) + self._DataEnd, address(pStr.value), pLen)
        self._DataEnd += pLen
      elsif address(self.value) = address(pStr.value)  ! appending onto self
        self.FlushAndKeep()                            ! do not clear buffer after flushing to disk
      elsif pLen < size(self.value)
        self.flush()
        stMemCpyLeft(address(self.value), address(pStr.value), pStr._DataEnd)
        self._DataEnd = pStr._DataEnd
      else
        self.Flush(pStr.value[1 : pStr._DataEnd])      ! will flush existing contents first
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(pStr.value), pLen)
      self._DataEnd += pStr._DataEnd
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Cat Procedure(stringTheory pStr, long pLen)
  code
  if pLen < 0 or pLen > pStr._DataEnd
    pLen = pStr._DataEnd
  end
  if pLen
    if address(pStr.value) = address(self.value) and not self.streamFileName &= null ! appending self so pass by value
      self.cat(pStr.slice(1, pLen)) ! pass by value
    elsif size(self.value) < self._DataEnd + pLen
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + pLen)
        stMemCpyLeft(address(self.value) + self._DataEnd-pLen, address(pStr.value), pLen)
      elsif pLen < size(self.value)
        self.flush()
        stMemCpyLeft(address(self.value), address(pStr.value), pLen)
        self._DataEnd = pLen
      else
        self.flush(pStr.value[1 : pLen])
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, address(pStr.value), pLen)
      self._DataEnd += pLen
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.CatAddr Procedure(long pAddr, long pLen)
s &string
  code
  if pLen > 0 and pAddr
    if size(self.value) < self._DataEnd + pLen
      if self.streamFileName &= null
        self.SetLength(self._DataEnd + pLen)
        stMemCpyLeft(address(self.value) + self._DataEnd-pLen, pAddr, pLen)
      elsif pAddr = address(self.value)  ! appending self
        s &= pAddr & ':' & pLen
        self.append(s&'')                ! pass by value
      elsif pLen < size(self.value)
        self.flush()
        stMemCpyLeft(address(self.value), pAddr, pLen)
        self._DataEnd = pLen
      else
        s &= pAddr & ':' & pLen
        self.flush(s)
      end
    else
      stMemCpyLeft(address(self.value) + self._DataEnd, pAddr, pLen)
      self._DataEnd += pLen
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.AppendBinary Procedure(long pValue,Long pLength=4)
  code
  if pLength > 4 then pLength = 4.
  self.CatAddr(address(pValue), pLength)

!-----------------------------------------------------------------------------------
!!! <summary>Encodes the string using base64, if the string contains a non base64 value</summary>
!!! <remarks>Length of the string is automatically adjusted to the new length</remarks>
StringTheory.Base64Encode Procedure(Long pOptions=0)
encData         &string
dataLen         long, auto
encLen          long, auto
SaveNoWrap      long, auto
result          long(st:ok)
  code
  if self._DataEnd = 0 then return result.
  if self.base64
    self.Trace('Base64Encode: String is Already base 64 encoded : base64 property is true')
    return result
  end
  encLen = self._DataEnd
  datalen = int((encLen+2)/3) * 4                   ! Calculate the correct length, plus padding�
  SaveNoWrap = self.base64nowrap
  if band(pOptions,st:URLSafe + st:NoWrap) > 0 then self.base64nowrap = true.  ! respect original setting, might be set before this call
  if band(pOptions,st:URLSafe) > 0 then self.base64URLSafe = true else self.base64URLSafe = false.
  if self.base64nowrap = 0                          ! Option for no line wrapping
    dataLen += (int(dataLen / 76) * 2) + 2
  end

  encData &= new string(dataLen)
  if encData &= null
    self.ErrorTrap('Base64Encode','Memory allocation failed trying to get ' & dataLen & ' bytes.',true)
    self.base64nowrap = SaveNoWrap
    return result
  end

  result = self.Base64Encode(encData, encLen)
  Dispose(self.value)
  self.value &= encData
  self.valuePtr &= self.value
  self._DataEnd = size(self.value)
  self.clip()
  if band(pOptions,st:NoPadding) > 0
    if self._DataEnd > 1 and self.value[self._DataEnd -1 : self._DataEnd] = '=='
       self.SetLength(self._DataEnd-2)
    elsif self._DataEnd > 0 and self.value[self._DataEnd] = '='
       self.SetLength(self._DataEnd-1)
    end
  end
  self.base64 = true
  self.base64nowrap = SaveNoWrap
  return result

!-----------------------------------------------------------------------------------
!!! <summary>Decodes the string using base64, if the string contains a base64 value</summary>
!!! <remarks>Length of the string is automatically adjusted to the new length</remarks>
StringTheory.Base64Decode Procedure()
decLen          long, auto
result          long(st:ok)
  code
  if self._DataEnd
    decLen = self._DataEnd
    result = self.Base64Decode(self.value[1 : decLen], decLen)
    self.SetLength(decLen)  ! this is always smaller than the encoded string.
  end
  self.base64 = false
  return result

!-----------------------------------------------------------------------------------
!!! <summary>Return the Base64 encoded version of the current string</summary>
!!! <remarks>The caller must pass in a string of adequate length.
!!!  Convert regular binary data (including text) to the base64 scheme.
!!!  The length of the converted data will be returned in pLen, and the Base64
!!!  data will be returned in pText
!!!</remarks>
StringTheory.Base64Encode Procedure(*string pText, *long pLen)
x         long, auto
y         long, auto
z         long(1)
a         long, auto
b         long
sz        long, auto
triplet   string(4)
bits      long, over(triplet)
table     string('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/')
expectLen long,auto
  code
  if self._DataEnd = 0 then return st:ok.
  if address(pText) = 0 then return st:notOk.
  sz = size(pText)
  if sz = 0 then return st:notOk.

  if self.Base64URLSafe
    table[63] = '-'
    table[64] = '_'
  end

  if pLen > self._DataEnd or pLen < 1
    pLen = self._DataEnd
  end

  y = int((pLen+2)/3) * 3    ! basically y is just pushed out to the next triplet boundry.

  expectLen = int(y*4/3)
  if self.base64NoWrap = false
    expectLen += (int(expectLen / 76) * 2) - choose(expectLen%76=0,2,0) ! allow for line breaks
  end

  loop x = 1 to y by 3
    if x+2 <= pLen
      triplet = self.value[x+2] & self.value[x+1] & self.value[x] & '<0>'
    elsif x+1 <= pLen
      triplet = '<0>' & self.value[x+1] & self.value[x] & '<0>'
    elsif x <= pLen
      triplet = '<0,0>' & self.value[x] & '<0>'
    end

    a = bshift(bits,-18) + 1
    pText[z] = table[a]
    z += 1; if z > sz then break.

    a = band(bshift(bits,-12),111111b) + 1
    pText[z] = table[a]
    z += 1; if z > sz then break.

    if x+1 <= pLen
      a = band(bshift(bits,-6),111111b) + 1
      pText[z] = table[a]
    else
      pText[z] = '='                       ! the end is padded out with '=' signs
    end
    z += 1; if z > sz then break.

    if x+2 <= pLen
      a = band(bits,111111b) + 1
      pText[z] = table[a]
    else
      pText[z] = '='                       ! the end is padded out with '=' signs
    end

    z += 1; if z > sz then break.
    if not self.base64NoWrap
      b += 4
      if b%76 = 0 and x < y-2
        if z+1 > sz then break.
        pText[z : z+1] = '<13,10>'
        z += 2 ; if z > sz then break.
        b = 0
      end
    end
  end !loop

  pLen = z-1
  if expectLen > sz
    self.ErrorTrap('Base64Encode','The passed string of length ' & sz & ' was not large enough to hold Base64 encoded data of length ' & expectLen & '. The data has been truncated to ' & pLen & '.',true)
    return st:notOk
  end
  return st:Ok

!-----------------------------------------------------------------------------------
!!! <summary>Returns the current string after Base64 decoding it</summary>
!!! <remarks>The decoded text is return in the pText parameter, and the
!!!  pLen parameter is set to the length of the data returned. pText must be
!!!  large enough to hold the Base64 decoded data
!!!</remarks>
StringTheory.Base64Decode Procedure(*string pText, *long pLen) !, bool
bits        long
            group,over(bits),pre()
triplet1      string(1)
triplet2      string(1)
triplet3      string(1)
            end
x           long, auto
a           long
b           long
z           long(1)
y           long
sz          long, auto
  code
  if address(pText) = 0
    sz = 0
  else
    sz = size(pText)
  end
  if pLen > self._DataEnd or pLen < 1
    pLen = self._DataEnd
  end

  loop x = 1 to pLen + 3
    if x > pLen
      if y = 0 then break.
      if b < 2 then b += 1.
      a = 0
    else
      a = val(self.value[x])
      case a
      of 65 to 90     ! 'A' to 'Z'
        a -= 65
      of 97 to 122    ! 'a' to 'z'
        a -= 71
      of 48 to 57     ! '0' to '9'
        a += 4
      of 43 orof 45   ! '+' orof '-'
        a = 62
      of 47 orof 95   ! '/' orof '_'
        a = 63
      of 61           ! '='
        if b < 2 then b += 1.
        a = 0
      else
        cycle
      end
    end
    bits = Bshift(bits,6) + a
    y += 1
    if y = 4
      if z < sz - 1   ! most common case first
        pText[z]   = triplet3
        pText[z+1] = triplet2
        pText[z+2] = triplet1
      elsif z < sz
        pText[z]   = triplet3
        pText[z+1] = triplet2
      elsif z = sz
        pText[z] = triplet3
      end
      z += 3
      y = 0
      bits = 0
    end
  end !loop
  pLen = z-1-b
  if pLen > sz
    self.ErrorTrap('Base64Decode','The passed string of length ' & sz & ' was not large enough to hold the Base64 decoded data of length ' & pLen & '. The data has been truncated.',true)
    pLen = sz ! reduce returned size due to truncation
    return st:notOK
  end
  return st:ok

!-----------------------------------------------------------------------------------
!!! <summary>Encode the current object as Base32</summary>
!  the current object value is changed
!  if an error is found the object value is cleared and st:notOK is returned
!  pOptions:  st:noWrap    (default is to wrap)
!             st:noPadding (default is to add standard padding to take out to multiple of 8 chars)
!
StringTheory.Base32Encode Procedure(Long pOptions=0, <String pAlphabet>)
out       &string
CRLF      string('<13,10>')
outIdx    long
wraplen   long(75)
myLong    long,auto
blockSize long,auto
x         long,auto
y         long,auto
z         long,auto
padChars  long,auto
alphabet  string('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=') ! 32 chars + padding char
in5       group,pre(),auto
i1          byte
i2          byte
i3          byte
i4          byte
i5          byte
          end

out8      string(8),auto
outByte   byte,dim(8),over(out8)
          group,pre(),over(out8)
o1          byte
o2          byte
o3          byte
o4          byte
o5          byte
o6          byte
o7          byte
o8          byte
          end
  code
  if self._DataEnd = 0 then return st:ok.
  if not omitted(pAlphabet) and pAlphabet <> ''
    case size(pAlphabet)
    of 33
      alphabet = pAlphabet
    of 32
      alphabet = pAlphabet & '='                 ! position 33 is padding character
    else
      self.free()
      self.errorTrap('Base32Encode','Provided alphabet is incorrect length',true)
      return st:notOk
    end
  end
  if band(pOptions,st:NoWrap) then wrapLen = 0.

  x = int((self._DataEnd+4)/5) * 8               ! calculate output length: each 5 bytes gets converted to 8 bytes
  if wrapLen then x += 2 * int(x / wrapLen).     ! add 2 chars for each line break
  out &= new string(x)                           ! allocate output buffer
  if out &= null or len(out) <> x
    self.free()
    self.errorTrap('Base32Encode','Failed to acquire memory for output buffer',true)
    return st:notOk
  end

  loop x = 1 to self._dataEnd by 5
    blockSize = self._dataEnd - x + 1
    if blockSize > 5
      blockSize = 5                              ! we do 5 chars at a time
    elsif blockSize < 5
      clear(out8,-1)
    end
    in5 = self.value[x : x+blockSize - 1]

    case blockSize                               ! convert 5 chars into 8 - we put 5 bits of each input byte (i1-i5) into output bytes (o1-o8)
    of   5
      o8 = band(i5, 31)
      o7 = bshift(band(i5, 224), -5)
    orof 4                                       ! nota bene: we deliberately use 'orof' not 'of' so we fall through
      o7 = bor(o7, bshift(band(i4, 3), 3))
      o6 = bshift(band(i4, 124), -2)
      o5 = bshift(band(i4, 128), -7)
    orof 3
      o5 = bor(o5, bshift(band(i3, 15), 1))
      o4 = bshift(band(i3, 240), -4)
    orof 2
      o4 = bor(o4, bshift(band(i2, 1), 4))
      o3 = bshift(band(i2,  62), -1)
      o2 = bshift(band(i2, 192), -6)
    orof 1
      o2 = bor(o2, bshift(band(i1, 7), 2))
      o1 = bshift(band(i1, 248), -3)
    end

    execute blockSize  ! set number of padding chars to use
      padchars = 6
      padchars = 4
      padchars = 3
      padchars = 1
      padchars = 0
    end

    y = 8 - padchars
    loop z = 1 to y
      myLong = outByte[z] + 1
      case myLong
      of 1 to 32
        outIdx += 1
        out[outIdx] = Alphabet[myLong]
      else
        dispose(out)
        self.free()
        self.errorTrap('Base32Encode','Logic error: value over 32',true)
        return st:notOK              ! logic error - should never happen
      end
    end
    if padChars and band(pOptions,st:NoPadding) = 0
      loop padChars times
        outIdx += 1
        out[outIdx] = alphabet[33]   ! pad char is usually '=' (it is the last char of alphabet)
      end
    end
  end ! loop

  self._StealValue(out)              ! point our object to our output
  out &= null                        ! guard against anyone wrongly thinking they should dispose out

  self.setLength(outIdx)

! note: new method insertEvery written because the following could fail when low memory (very large data):
!  if wrapLen and self._DataEnd > wrapLen
!    self.splitEvery(wrapLen)
!    self.join(CRLF)
!  end
  if wrapLen then self.insertEvery(wrapLen, CRLF).
  return st:ok

!-----------------------------------------------------------------------------------
!!! <summary>Decode the current object from Base32</summary>
!  Decode base32 encoded data.  The current object value is changed.  returns st:ok or st:notOk
!  If an error is found the object value is cleared, an error is posted to errorTrap
!  (use st:lastError to see error) and st:notOk is returned.
!  By default it is 'strict' and less tolerant of errors like invalid chars,
!  and incorrect number of padding characters on the end.
!  The default alphabet is 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=' where last char is pad char.
!  An alternative alphabet can be passed, for example "extended hex base32" which uses
!  '0123456789ABCDEFGHIJKLMNOPQRSTUV=' and has the advantage that the encoded and unencoded
!  values have the same sort order.
!
!  pOptions:
!
!   st:noCase         lower/upper case chars treated the same
!   st:detectAlphabet use this if you do not know the alphabet - it will try to work it out based on first 1000 chars (or less if not that much data)
!                     note: using "detectAlphabet" will be slightly slower and also effectively includes st:noCase (whether it is set or not).
!   st:tolerant       ignores invalid characters and incorrect or missing padding
!
StringTheory.Base32Decode Procedure(Long pOptions=0, <String pAlphabet>)
! standard alphabets
eDefaultAlphabet     equate('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567=') ! 32 chars + padding char
eExtendedHexAlphabet equate('0123456789ABCDEFGHIJKLMNOPQRSTUV=')
alphabet             string(33)

! detection states - used where st:detectAlphabet is set
eProvided            equate(1)
eDefault             equate(2)
eExtendedHex         equate(3)

state     long,auto

pad       string('=')
out       &string
outIdx    long(1)
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
in8       string(8),auto
          group,pre(),over(in8)
i1          byte
i2          byte
i3          byte
i4          byte
i5          byte
i6          byte
i7          byte
i8          byte
          end

out5      string(5),auto
          group,pre(),over(out5)
o1          byte
o2          byte
o3          byte
o4          byte
o5          byte
          end
x         long,auto
padChars  long,auto
  code
  if omitted(pAlphabet) or pAlphabet = ''
    alphabet = eDefaultAlphabet
    state = eDefault
  else
    ! alternative alphabet provided - this must be valid even if "st:detectAlphabet" is set on.
    state = eProvided
    case size(pAlphabet)
    of 33
      alphabet = pAlphabet
      pad = alphabet[33]
    of 32
      alphabet = pAlphabet & '='  ! position 33 is padding character
    else
      self.free()
      self.errorTrap('Base32Decode','Provided alphabet is incorrect length',true)
      return st:notOK
    end
    x = self.findChar(pad,,,alphabet)
    if x < 33
      self.free()
      self.errorTrap('Base32Decode','Pad character "'& pad & '" was included in alphabet',true)
      return st:notOK
    end
    if upper(pad) <> lower(pad)
      self.free()
      self.errorTrap('Base32Decode','Invalid Pad character "'& pad & '"',true)
      return st:notOK
    end
    if self.containsA('<13,10,32,9>',alphabet,false)
      self.free()
      self.errorTrap('Base32Decode','Alphabet contains a formatting character (CR LF space tab)',true)
      return st:notOK
    end
  end
  if band(pOptions,st:noCase) or band(pOptions,st:detectAlphabet)
    self.upper()
    alphabet = upper(alphabet)
  end
  if band(pOptions,st:detectAlphabet)
    ! try to work out alphabet based on sample of first 1000 chars (which have been UPPERed).
    ! currently try 3 alphabets: 1) passed/provided 2) default 3) extended hex
    loop
      if self.isAll(alphabet & '<13,10,09,32>',self.sub(1,1000),false) then break.  ! matches so use this alphabet
      state += 1
      case state
      of eDefault;     alphabet = eDefaultAlphabet
      of eExtendedHex; alphabet = eExtendedHexAlphabet
      !  add any other desired alphabets here....  could extend this to z-base-32, Crockford's Base32 etc. but extra work required
      else
        self.free()
        self.errorTrap('Base32Decode','Unable to detect base32 encoding',true)
        return st:notOK
      end
    end
  end
  if band(pOptions,st:tolerant)
    ! tolerant (not strict) so get rid of all non-alphabet chars without complaint/error
    self.keepChars(alphabet)                  ! get rid of any invalid chars (including formatting - usually CR, LF, spaces, tabs etc)
    if self._DataEnd % 8
      ! not a multiple of 8 so we add padding on end to correct as not strict
      self.append(all(pad,8 - self._DataEnd % 8))
    end
  else
    ! if strict (ie. NOT tolerant), we only allow formatting chars CR LF space tab. Any other char not in alphabet will trigger an error.
    self.removeChars('<13,10,32,9>')          ! CR LF space tab
    ! if strict, we insist on correct padding on the end to make up multiple of 8 characters
    if self._DataEnd % 8
      self.free()
      self.errorTrap('Base32Decode','Cleaned input is not a multiple of 8 characters',true)
      return st:notOK
    end
  end

  x = self.findChar(pad)
  if x                                        ! pad char found
    if x < self._dataEnd - 5                  ! last group of 8 chars must have at least two chars before padding starts
      self.errorTrap('Base32Decode','Invalid padding character "' & pad & '" found',true)
      self.free()
      return st:notOK
    end
    padChars = self.count(pad,,x)             ! start count at x where first pad was found
    case padChars
    of 1 orof 3 orof 4 orof 6
      ! all good
    else
      self.errorTrap('Base32Decode','Invalid number of padding characters found',true)
      self.free()
      return st:notOK
    end
  end

  x = (self._DataEnd / 8) * 5                        ! get output length
  out &= new string(x)                               ! allocate output buffer
  if out &= null or len(out) <> x
    self.errorTrap('Base32Decode','Failed to acquire memory for output buffer',true)
    self.free()
    return st:notOK
  end
  clear(charsMap,1)                                  ! set to high values so invalid chars will have 255
  loop x = 1 to 32
    charMap[val(alphabet[x])+1] = x - 1              ! map alphabet characters to 5bit digit 0-31
  end
  charMap[val(pad)+1] = 0

  x = 1
  loop                                               ! we take groups of 8 chars and convert each group to 5 chars
    stMemCpyLeft(address(in8),address(self.value)+x-1,8) ! was: in8 = self.value[x : x+7]
    ! map to 5 bit values (0 to 31)
    i1 = charMap[i1+1]
    i2 = charMap[i2+1]
    i3 = charMap[i3+1]
    i4 = charMap[i4+1]
    i5 = charMap[i5+1]
    i6 = charMap[i6+1]
    i7 = charMap[i7+1]
    i8 = charMap[i8+1]
    if not band(pOptions,st:tolerant) and            |!  Note: if not strict then any invalid chars have already been removed
       self.containsByte(255,in8)                    !         invalid chars map to 255 (high values)
      dispose(out)
      self.free()
      self.errorTrap('Base32Decode','Invalid character found',true)
      return st:notOK
    end
    ! now we merge 8 5bit values into 5 8bit chars
    o1 = bor(bshift(band(i1, 31), 3), bshift(band(i2, 28), -2))
    o2 = bor(bshift(band(i2,  3), 6), bor(bshift(band(i3,  31), 1), bshift(band(i4, 16), -4)))
    o3 = bor(bshift(band(i4, 15), 4), bshift(band(i5, 30), -1))
    o4 = bor(bshift(band(i5,  1), 7), bor(bshift(band(i6,  31), 2), bshift(band(i7, 24), -3)))
    o5 = bor(bshift(band(i7,  7), 5), band(i8, 31))
    stMemCpyLeft(address(out)+outIdx-1,address(out5),5) ! was: out[outIdx : outIdx+4] = out5
    outIdx += 5
    if outIdx > size(out) then break.               ! last block?
    x += 8
  end

  self._StealValue(out)                             ! point our object to our output
  out &= null                                       ! guard against anyone wrongly thinking they should dispose out

  case padChars                                     ! adjust length for padding chars
  of 1; self.adjustLength(-1)
  of 3; self.adjustLength(-2)
  of 4; self.adjustLength(-3)
  of 6; self.adjustLength(-4)
  end
  return st:ok

!-----------------------------------------------------------------------------------
!!! <summary>Encode the current object as Base85/Ascii85</summary>
!
StringTheory.Base85Encode Procedure(Long pOptions=0)
st       StringTheory
adobe    byte
wrapLen  long(75)
myLong   long,auto
myULong  ulong,over(myLong)
         group,pre(),over(myLong)
myStr1     string(1)
myStr2     string(1)
myStr3     string(1)
myStr4     string(1)
         end ! group
x        long,auto
padChars long,auto
outLen   long,auto
outstr   String(5),auto
         group,pre(),over(outStr)
out1       byte
out2       byte
out3       byte
out4       byte
out5       byte
         end ! group
  code
  if self._DataEnd = 0 then return.
  adobe = band(pOptions,st:Adobe85)
  if band(pOptions,st:NoWrap) then wraplen = 0.

  padChars = self._DataEnd % 4
  if padChars then padChars = 4 - padChars; self.append(all('<0>',padChars)).   ! pad with null chars
  outLen = (self._DataEnd * 5 / 4)
  if adobe > 0
    outlen += 4   ! adobe has 4 extra chars
  end
  if wrapLen then outlen += 2 * int(outlen / wrapLen).     ! add 2 chars for each line break
  st.SetLength(outlen)                                     ! optional: preallocate output memory
  if adobe
    st.setValue('<<~')
  else
    st.free()
  end
  loop x = 1 to self._DataEnd by 4
    ! swap endian-ness as we go...
    myStr1 = self.valueptr[x+3]
    myStr2 = self.valueptr[x+2]
    myStr3 = self.valueptr[x+1]
    myStr4 = self.valueptr[x]
    if ~myLong then st.append('z'); cycle.                        ! short form for 0 (low-values)
    if adobe = 0 and myLong=20202020h then st.append('y'); cycle. ! short form for spaces - not supported by Adobe
    out5 = myULong%85 + 33                                        ! use Ulong first time in case top bit is on
    myUlong /= 85
    ! unrolled the loop - we use long from here as faster than ulong
    out4 = myLong%85 + 33
    mylong /= 85
    out3 = myLong%85 + 33
    mylong /= 85
    out2 = myLong%85 + 33
    mylong /= 85
    out1 = myLong%85 + 33
    st.append(outStr)
  end
  if padChars then st.setLength(st._DataEnd - padChars).
  if adobe then st.append('~>').
  if wrapLen then st.insertEvery(wrapLen,'<13,10>').
  if Adobe and st.endsWith('<13,10>>')
    ! do NOT split ending ~>
    st.adjustLength(-3)
    st.append('>')
  end
  self._StealValue(st)                ! point our passed object to our output

!-----------------------------------------------------------------------------------
!!! <summary>Decode the current object from Base85/Ascii85</summary>
!!! returns 0 for success otherwise the position of the first invalid character
!
StringTheory.Base85Decode Procedure() !,long
st        StringTheory
myGroup   group,pre(),auto
myStr1      string(1)
myStr2      string(1)
myStr3      string(1)
myStr4      string(1)
myStr5      string(1)
myStr6      string(1)
myStr7      string(1)
          end ! group
myLong    long, over(myGroup)
myUlong   ulong,over(myGroup)
CurValue  long,auto   ! value of current character
x         long,auto
y         long
AdobePrfx long
  code
  if self._DataEnd > 3 and self.startsWith('<<~') and self.endsWith('~>')
    AdobePrfx = 2
    self.setLength(self._dataEnd - 2)
    x = 3
  else
    x = 1
  end
  st.setLength(self._DataEnd); free(st)  ! preallocate some space (optional)
  myLong = 0
  loop x = x to self._DataEnd
    curValue = val(self.valueptr[x])
    case curValue
    of 33 to 117
      y += 1
      if y < 5
        myLong = myLong*85 + curValue - 33
      else
        myUlong = myUlong*85 + curValue - 33
        myStr5 = myStr3;  myStr6 = myStr2; myStr7 = myStr1 ! swap endian-ness (reverse byte order)
        st.CatAddr(address(myStr4),4)
        y = 0
        myLong = 0
      end
    of 122
      if y then return x+AdobePrfx.                        ! error - 'z' within group of 5 chars
      st.append('<0,0,0,0>')                               ! z used for zeroes (low-values)
    of 121
      if y then return x+AdobePrfx.                        ! error - 'y' within group of 5 chars
      st.append('<32,32,32,32>')                           ! y used for spaces
    of 8 to 13
    orof 32
      ! valid formating character so just ignore it
    else
      ! error - dud/unexpected character so return position
      return x + AdobePrfx
    end !case
  end
  if y > 1                                                 ! padding required?
    loop 4-y times
      myLong = myLong*85 + 84                              ! 84 = val('u') - 33 = 117 - 33
    end
    myUlong = myUlong*85 + 84
    case y
    of 2
      st.append(myStr4)
    of 3                                                   ! myStr4 & myStr3
      myStr5 = myStr3
      st.CatAddr(address(myStr4),2)
    of 4                                                   ! myStr4 & myStr3 & myStr2
      myStr5 = myStr3;  myStr6 = myStr2
      st.CatAddr(address(myStr4),3)
    end
  end
  self._StealValue(st)                                     ! point our passed object to our output
  return 0                                                 ! all is well in the world (valid input decoded without error)

!-----------------------------------------------------------------------------------
! this is a fast one. comma for the separator, crlf for the line ending, working on current string
StringTheory.CSVEncode             Procedure ()
  Code
  if self._dataEnd < 1 then return ''.
  if self.containsA(',"<13,10>')
    self.replace('"','""')
    self.setvalue('"' & self.value[1: self._DataEnd] & '"')
  end
  return self.value[1 : self._DataEnd]

!-----------------------------------------------------------------------------------
StringTheory.CSVEncode             Procedure (String pStr)
str  StringTheory
  code
  str.SetValue(pStr)
  return str.CSVEncode()

!-----------------------------------------------------------------------------------
! this one offers more control, but requires all the parameters. If AlwaysQuote is true, then the other 2 don't matter
StringTheory.CSVEncode             Procedure (Long pAlwaysQuote,string pSeparator, string pLineEnding)
x  Long,Auto
  code
  If pAlwaysQuote
    x = 1
  Else
    If pSeparator = ''
      x = self.FindChar(',')
    Else
      x = self.FindChar(clip(pSeparator))
    End
    if x = 0 then x = self.FindChar('"').
    if pLineEnding = ''
      if x = 0 then x = self.Instring('<13,10>').
    else
      if x = 0 then x = self.Instring(pLineEnding).
    end
  End
  if x = 0 then return self.GetValue().
  self.replace('"','""')
  self.setvalue('"' & self.value[1: self._DataEnd] & '"')
  return self.GetValue()

!-----------------------------------------------------------------------------------
StringTheory.CSVEncode             Procedure (String pStr,Long pAlwaysQuote,string pSeparator,string pLineEnding)
str  StringTheory
  code
  str.SetValue(pStr)
  return str.CSVEncode(pAlwaysQuote,pSeparator,pLineEnding)

!-----------------------------------------------------------------------------------
StringTheory.CSVDecode             Procedure ()
  code
  if self._DataEnd < 2
    if self._DataEnd < 1
      return ''
    else
      return self.value[1]
    end
  end
  if self.value[1] <> '"' or self.value[self._DataEnd] <> '"'
    return self.value[1 : self._DataEnd]
  end
  self.crop(2,self._DataEnd-1)
  self.replace('""','"')
  return self.value[1 : self._DataEnd]

!-----------------------------------------------------------------------------------
StringTheory.CSVDecode             Procedure (String pStr)
str  StringTheory
  code
  str.SetValue(pStr)
  return str.CSVDecode()

!-----------------------------------------------------------------------------------
!!! <summary>Encode the current object as Quoted-Printable</summary>
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

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(string pSearchValue)
  code
  if size(pSearchValue) = 1
    return self.findChar(pSearchValue)  ! use single char version
  else
    return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(*string pSearchValue)
  code
  if size(pSearchValue) = 1
    return self.findChar(pSearchValue)  ! use single char version
  else
    return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(string pSearchValue, long pStep)
  code
  if pStep <> 1
    return self.instring(pSearchValue,pStep,1,self._DataEnd,0,0)
  elsif size(pSearchValue) = 1
    return self.findChar(pSearchValue)  ! use single char version
  else
    return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(*string pSearchValue, long pStep)
  code
  if pStep <> 1
    return self.instring(pSearchValue,pStep,1,self._DataEnd,0,0)
  elsif size(pSearchValue) = 1
    return self.findChar(pSearchValue)  ! use single char version
  else
    return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(string pSearchValue, long pStep=1, long pStart)
  code
  if pStep <> 1
    return self.instring(pSearchValue,pStep,pStart,self._DataEnd,0,0)
  end
  if pStart < 1 then pStart = 1.
  if pStart = 1
    if size(pSearchValue) = 1
      return self.findChar(pSearchValue)          ! use single char version
    else
      return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)
    end
  else
    if size(pSearchValue) = 1
      return self.findChar(pSearchValue, pStart)  ! use single char version
    else
      return self.findChars(pSearchValue, pStart)
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(*string pSearchValue, long pStep=1, long pStart)
  code
  if pStep <> 1
    return self.instring(pSearchValue,pStep,pStart,self._DataEnd,0,0)
  end
  if pStart < 1 then pStart = 1.
  if pStart = 1
    if size(pSearchValue) = 1
      return self.findChar(pSearchValue)          ! use single char version
    else
      return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)
    end
  else
    if size(pSearchValue) = 1
      return self.findChar(pSearchValue, pStart)  ! use single char version
    else
      return self.findChars(pSearchValue, pStart)
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(string pSearchValue, long pStep=1, long pStart=1, long pEnd)
  code
  if pStep <> 1
    return self.instring(pSearchValue,pStep,pStart,pEnd,0,0)
  elsif size(pSearchValue) = 1
    return self.findChar(pSearchValue, pStart, pEnd)  ! use single char version
  else
    return self.findChars(pSearchValue, pStart, pEnd)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(*string pSearchValue, long pStep=1, long pStart=1, long pEnd)
  code
  if pStep <> 1
    return self.instring(pSearchValue,pStep,pStart,pEnd,0,0)
  elsif size(pSearchValue) = 1
    return self.findChar(pSearchValue, pStart, pEnd)  ! use single char version
  else
    return self.findChars(pSearchValue, pStart, pEnd)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(string pSearchValue, long pStep=1, long pStart=1, long pEnd=0, long pNoCase)!,long
  code
  if pNocase or pStep <> 1
    return self.Instring(pSearchValue,pStep,pStart,pEnd,pNoCase,false)
  elsif size(pSearchValue) = 1
    return self.findChar(pSearchValue, pStart, pEnd)  ! use single char version
  else
    return self.findChars(pSearchValue, pStart, pEnd)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the postition of the sub string in the current string.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then zero is returned.</remarks>
StringTheory.Instring Procedure(string pSearchValue, long pStep=1, long pStart=1, long pEnd=0, long pNoCase=0, long pWholeWord)!,long
x           long,auto
lsv         long,auto
t           long,auto
firstChar   string(1),auto
firstByte   byte,over(firstChar)
  code
  if pEnd = 0 or pEnd > self._DataEnd
    pEnd = self._DataEnd
  end
  if pStart < 1 then pStart = 1.
  lsv = size(pSearchValue)
  if self._DataEnd = 0 or lsv = 0 or lsv > pEnd - pStart + 1
    return 0
  end
  if pNoCase
    pSearchValue = Upper(pSearchValue)
    if pSearchValue = Lower(pSearchValue)
      pNocase = false
    end
  end
  if pStep = 1 and pNocase = 0 and pWholeWord = 0
    if lsv = 1
      if pStart = 1 and pEnd = self._DataEnd
        return self.findChar(pSearchValue)
      else
        return self.findChar(pSearchValue,pStart,pEnd)
      end
    elsif pStart = 1
      return self.FindCharsAddr(pSearchValue,address(self.value),pEnd)
    else
      return self.findChars(pSearchValue,pStart,pEnd)
    end
  end

  ! either pStep <> 1 or we have pNoCase or pWholeWord
  firstChar = pSearchValue[1]
  if pStep < 0 then pEnd += 1 - lsv.                     ! this is the maximum position to start a backwards search
  loop
    x = 0
    if pStep > 0
      if lsv > pEnd - pStart + 1 then break.
      if pStep = 1 and pNoCase = 0                       ! simple case, can be optimised
        ! note: pWholeWord is true
        if lsv = 1
          x = self.findChar(pSearchValue, pStart, pEnd)  ! use single char version
        else
          x = self.findChars(pSearchValue, pStart, pEnd)
        end
      else                                               ! just a simple, forward search
        if pNocase
          x = InString(pSearchValue, Upper(self.value[pStart : pEnd]), pStep, 1)
        else
          x = InString(pSearchValue, self.value[pStart : pEnd], pStep, 1)
        end
        if pStep > 1 and x > 1
          x = ((x-1) * pStep) + pstart                   ! instring returns "step value" not position. StringTheory always returns postion.
        elsif pStart > 1 and x > 0
          x += pStart - 1
        end
      end
    elsif pStep < 0                                      ! searching backwards
      if pNoCase
        loop t = pEnd to pStart by pStep
          if firstByte <> ToUpper(Val(self.value[t])) then cycle.
          if lsv = 1 or pSearchValue = upper(self.value[t : t+lsv-1])
            x = t
            break
          end
        end
      else
        loop t = pEnd to pStart by pStep
          if firstChar <> self.value[t] then cycle.
          if lsv = 1 or pSearchValue = self.value[t : t+lsv-1]
            x = t
            break
          end
        end
      end
    else
      ! pstep = 0 so we only get one chance to match
      if pNocase
        if pSearchValue = upper(self.value[pStart : pStart+lsv-1])
          x = pStart
        end
      else
        if pSearchValue = self.value[pStart : pStart+lsv-1]
          x = pStart
        end
      end
    end
    if x = 0 then break.          ! no match
    if pWholeWord = 0 then break. ! match found, no need to check whole word
    if x > 1
      case val(self.value[x-1])   ! check if previous char is a letter or digit
      of   65 to 90               ! 'A' to 'Z'
      orof 97 to 122              ! 'a' to 'z'
      orof 48 to 57               ! '0' to '9'
        if pStep > 0
          pStart = x + pStep
        elsif pStep < 0
          pEnd = x + pStep
        else                      ! step = 0 so we only get one chance to match
          x = 0
          break
        end
        cycle
      end
    end
    if x + lsv <= self._DataEnd
      case val(self.value[x+lsv]) ! check if next char is a letter or digit
      of   65 to 90               ! 'A' to 'Z'
      orof 97 to 122              ! 'a' to 'z'
      orof 48 to 57               ! '0' to '9'
        if pStep > 0
          pStart = x + pStep
        elsif pStep < 0
          pEnd = x + pStep
        else                      ! step = 0 so we only get one chance to match
          x = 0
          break
        end
        cycle
      end
    end
    break
  end
  return x

!-----------------------------------------------------------------------------------
!!! <summary>Return the part of the string between two search strings</summary>
!!! <param name="Left">The "left hand" sub-string to search for</param>
!!! <param name="Right">The "right hand" sub-string to search for</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <param name="Exclusive">Optional parameter: Indicates whether to exclude the left and right sub-strings. Default is true.</param>
!!! <remarks>If either sub-string does not exist then a blank string is returned.</remarks>
StringTheory.Between Procedure(string pLeft, string pRight, long pStart=1, long pEnd=0, long pNoCase=0, long pExclusive=true)
  code
  return self.FindBetween(pLeft, pRight, pStart, pEnd, pNoCase, pExclusive)

!-----------------------------------------------------------------------------------
! Finds the string between the passed left and right delimiter, and returns it. The passed pStart and pEnd
! are set to the start and end position of the returned value in the string. If pStart or pEnd is passed as less
! than or equal to zero then they are set to the start and end of the stored string repectively. Otherwise
! they are used as the bounds for the search. This allows FindBetween to be called multiple times to search
! for multiple occurances using the same delimiter:
!
! limit  = 0 ! set to zero for end of string
! pStart = 0 ! set to zero or one for start of string
! loop
!     pEnd = limit
!     betweenVal = st.FindBetween('[[', ']]', pStart, pEnd)
!     if pStart = 0
!         break
!     else
!         ! do something with the returned betweenVal
!     end
!     pStart =  pEnd + size(pRight) + 1 ! Reset pStart for next iteration. If not doing pExclusive then pStart = pEnd + 1
! end
StringTheory.FindBetween Procedure(string pLeft, string pRight, *long pStart, *long pEnd, bool pNoCase=false, long pExclusive=true)
  code
    self.findBetweenPosition(pLeft,pRight,pStart,pEnd,pNoCase,pExclusive)
    if pStart <= 0 or pStart > pEnd
      return ''
    else
      return self.value[pStart : pEnd]
    end

!-----------------------------------------------------------------------------------
!!! <summary>Set current string to the part of the string between two search strings.</summary>
!!! <param name="Left">The "left hand" sub-string to search for</param>
!!! <param name="Right">The "right hand" sub-string to search for</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <param name="Exclusive">Optional parameter: Indicates whether to exclude the left and right sub-strings. Default is true.</param>
!!! <param name="ClearIfNotFound">Optional parameter: Clear the string if the left and right SearchStrings are not found. Default is false.</param>
!!! <remarks>If the left and right sub-strings do not exist then st:notFound is returned.</remarks>
StringTheory.SetBetween Procedure(string pLeft, string pRight, long pStart=1, long pEnd=0, long pNoCase=0, long pExclusive=true, long pClearIfNotFound=false)
  code
    self.findBetweenPosition(pLeft,pRight,pStart,pEnd,pNoCase,pExclusive)
    if pStart = 0        ! left and right strings not found
      if pClearIfNotFound
        self.free()
      end
      return st:notFound
    elsif pStart > pEnd  ! nothing between left and right strings
      self.free()
    else
      self.crop(pStart, pEnd)
    end
    return st:ok

! provides the start and end positions - no returned string for performance reasons
StringTheory.FindBetweenPosition Procedure(string pLeft, string pRight, *long pStart, *long pEnd, bool pNoCase=false, long pExclusive=true)
LeftLen   long,auto
RightLen  long,auto
  code
    if self._DataEnd < 1
      pStart = 0
      return
    end

    if pStart <= 0
      pStart = 1
    end
    if pEnd <= 0 or pEnd > self._DataEnd
      pEnd = self._DataEnd
    end
    if pNoCase
      pLeft = upper(pLeft)
      pRight = upper(pRight)
      if pLeft = lower(pLeft) and pRight = lower(pRight)
        pNocase = false
      end
    end
    leftLen = size(pLeft)
    if leftlen
      if pNocase = false
        if leftlen = 1
          pStart = self.findChar(pLeft, pStart, pEnd)
        else
          pStart = self.findChars(pLeft, pStart, pEnd)
        end
      else
        pStart = self.Instring(pLeft, 1, pStart, pEnd, pNoCase, false)
      end
      if pStart = 0
        return
      end
    end
    rightlen = size(pRight)
    if rightlen
      if pNoCase = false
        if rightLen = 1
          pEnd = self.findChar(pRight, pStart + leftLen, pEnd)
        else
          pEnd = self.findChars(pRight, pStart + leftLen, pEnd)
        end
      else
        pEnd = self.Instring(pRight, 1, pStart + leftLen, pEnd, pNoCase, false)
      end
      if pEnd = 0
        pStart = 0
        return
      end
    end
    if pExclusive = true
      pStart += leftLen          ! Shift the starting position to after the left hand delimeter
    end
    if rightLen = 0
    elsif pExclusive = true
      pEnd -= 1                  ! Shift to before the delimeter
    else
      pEnd += rightLen - 1       ! Shift to last char of the delimiter
    end

!-----------------------------------------------------------------------------------
!!! <summary>Return the part of the string after the searchstring</summary>
!!! <param name="SearchValue">The sub-string to search for</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then a blank string is returned.</remarks>
StringTheory.After Procedure(string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0)
x long,auto
  code
  if size(pSearchValue) = 0 then return ''.
  if pNoCase
    pSearchValue = Upper(pSearchValue)
    if pSearchValue = Lower(pSearchValue)
      pNocase = false
    end
  end
  if pNoCase
    x = self.Instring(pSearchValue, 1, pStart, pEnd, pNoCase, false)
  elsif size(pSearchValue) = 1
    x = self.findChar(pSearchValue, pStart, pEnd)
  else
    x = self.findChars(pSearchValue, pStart, pEnd)
  end
  if x and x + size(pSearchValue) <= self._DataEnd
    return self.value[x + size(pSearchValue) : self._DataEnd]
  else
    return ''
  end

!-----------------------------------------------------------------------------------
StringTheory.AfterNth Procedure(string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNoCase=0)
x long,auto
  code
  x = self.FindNth(pSearchValue,pOccurrence,pStart,pEnd,pNoCase)
  if x and x + size(pSearchValue) <= self._DataEnd
    return self.value[x + size(pSearchValue) : self._DataEnd]
  else
    return ''
  end

!-----------------------------------------------------------------------------------
StringTheory.AfterLast Procedure(string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0)
x long,auto
  code
  if size(pSearchValue) = 0 then return ''.
  x = self.instring(pSearchValue,-1,pStart,pEnd,pNoCase,false)
  if x and x + size(pSearchValue) <= self._DataEnd
    return self.value[x + size(pSearchValue) : self._DataEnd]
  else
    return ''
  end

!-----------------------------------------------------------------------------------
!!! <summary>Set current string to that after search value.</summary>
!!! <param name="SearchValue">The sub-string to search for</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <param name="ClearIfNotFound">Optional parameter: Clear the string if the SearchString is not found. Default is false.</param>
!!! <remarks>If the sub-string does not exist then st:notFound is returned.</remarks>
StringTheory.SetAfter Procedure(string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false)
x       long
  code
  if size(pSearchValue) > 0
    if pNoCase
      pSearchValue = Upper(pSearchValue)
      if pSearchValue = Lower(pSearchValue)
        pNocase = false
      end
    end
    if pNoCase
      x = self.Instring(pSearchValue, 1, pStart, pEnd, pNoCase, false)
    elsif size(pSearchValue) = 1
      x = self.findChar(pSearchValue, pStart, pEnd)
    else
      x = self.findChars(pSearchValue, pStart, pEnd)
    end
  End
  if x = 0
    if pClearIfNotFound
      self.free()
    end
    return st:notFound
  elsif x + size(pSearchValue) <= self._DataEnd
    self.RemoveFromPosition(1,x + size(pSearchValue) - 1)
  else
    self.free()
  end
  return st:ok

!-----------------------------------------------------------------------------------
StringTheory.SetAfterNth Procedure(string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false)
x       long
  code
  x = self.FindNth(pSearchValue,pOccurrence,pStart,pEnd,pNoCase)
  if x = 0
    if pClearIfNotFound
      self.free()
    end
    return st:notFound
  elsif x + size(pSearchValue) <= self._DataEnd
    self.Top(x + size(pSearchValue) - 1)
  else
    self.free()
  end
  return st:ok

!-----------------------------------------------------------------------------------
StringTheory.SetAfterLast Procedure(string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false)
x       long
  code
  if size(pSearchValue)
    x = self.instring(pSearchValue,-1,pStart,pEnd,pNoCase,false)
  End
  if x = 0
    if pClearIfNotFound
      self.free()
    end
    return st:notFound
  elsif x + size(pSearchValue) <= self._DataEnd
    self.RemoveFromPosition(1,x + size(pSearchValue) - 1)
  else
    self.free()
  end
  return st:ok

!-----------------------------------------------------------------------------------
! remove characters from the front of the string
StringTheory.Top  Procedure(Long pLength)
  code
  if pLength <= 0 then return 0.
  return self.RemoveFromPosition(1,pLength)

!-----------------------------------------------------------------------------------
! remove characters from the end of the string
StringTheory.Tail Procedure(Long pLength)
  code
  if pLength <= 0 then return 0.
  if pLength < self._dataEnd
    self.setLength(self._dataEnd - pLength)
  else
    pLength = self._dataEnd
    self.free()
  End
  return pLength  ! return actual number of chars removed

!-----------------------------------------------------------------------------------
!!! <summary>Return the part of the string before the searchstring</summary>
!!! <param name="SearchValue">The sub-string to search for</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then a blank string is returned.</remarks>
StringTheory.Before Procedure(string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0)
x long,auto
  code
  if size(pSearchValue)  = 0 then return ''.
  if pNoCase
    pSearchValue = Upper(pSearchValue)
    if pSearchValue = Lower(pSearchValue)
      pNocase = false
    end
  end
  if pNoCase
    x = self.Instring(pSearchValue, 1, pStart, pEnd, pNoCase, false)
  elsif size(pSearchValue) = 1
    x = self.findChar(pSearchValue, pStart, pEnd)
  else
    x = self.findChars(pSearchValue, pStart, pEnd)
  end
  if x > 1
    return self.value[1 : x-1]
  else
    return ''
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the part of the string before the searchstring</summary>
!!! <param name="SearchValue">The sub-string to search for</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <remarks>If the sub-string does not exist then a blank string is returned.</remarks>
StringTheory.BeforeNth Procedure(string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNoCase=0)
x long,auto
  code
  x = self.FindNth(pSearchValue, pOccurrence, pStart, pEnd, pNoCase)
  if x > 1
    return self.value[1 : x-1]
  else
    return ''
  end

!-----------------------------------------------------------------------------------
StringTheory.BeforeLast Procedure(string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0)
x  long,auto
  code
  if size(pSearchValue) = 0 then return ''.
  x = self.Instring(pSearchValue, -1, pStart, pEnd, pNoCase, false)
  if x > 1
    return self.value[1 : x-1]
  else
    return ''
  end

!-----------------------------------------------------------------------------------
!!! <summary>Set current string to that before search value.</summary>
!!! <param name="SearchValue">The sub-string to search for</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
!!! <param name="ClearIfNotFound">Optional parameter: Clear the string if the SearchString is not found. Default is false.</param>
!!! <remarks>If the sub-string does not exist then st:notFound is returned.</remarks>
StringTheory.SetBefore Procedure(string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false)
x       long
  code
  if size(pSearchValue) > 0
    if pNoCase
      pSearchValue = Upper(pSearchValue)
      if pSearchValue = Lower(pSearchValue)
        pNocase = false
      end
    end
    if pNoCase
      x = self.Instring(pSearchValue, 1, pStart, pEnd, pNoCase, false)
    elsif size(pSearchValue) = 1
      x = self.findChar(pSearchValue, pStart, pEnd)
    else
      x = self.findChars(pSearchValue, pStart, pEnd)
    end
  end
  if x = 0
    if pClearIfNotFound
      self.free()
    end
    return st:notFound
  elsif x > 1
    self.SetLength(x-1)
  else ! x = 1
    self.free()
  end
  return st:ok

!-----------------------------------------------------------------------------------
StringTheory.SetBeforeNth Procedure(string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false)
x       long
  code
  x = self.FindNth(pSearchValue, pOccurrence, pStart, pEnd, pNoCase)
  if x = 0
    if pClearIfNotFound
      self.free()
    end
    return st:notFound
  elsif x > 1
    self.SetLength(x-1)
  else ! x = 1
    self.free()
  end
  return st:ok

!-----------------------------------------------------------------------------------
StringTheory.SetBeforeLast Procedure(string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false)
x       long
  code
  if size(pSearchValue) > 0
    x = self.Instring(pSearchValue, -1, pStart, pEnd, pNoCase, false)
  end
  if x = 0
    if pClearIfNotFound
      self.free()
    end
    return st:notFound
  elsif x > 1
    self.SetLength(x-1)
  else ! x = 1
    self.free()
  end
  return st:ok

!-----------------------------------------------------------------------------------
!!! <summary>Return the file name when the full path is passed.</summary>
!!! <param name="fPath">String that contains the full path and file name</param>
!!! <remarks>Handles forward and back-slashes, as well as just a
!!! path without a file name being passed</remarks>
StringTheory.FileNameOnly Procedure(<string fPath>,Long pIncludeExtension=true)
i               long, auto
j               long, auto
pLen            long, auto
  code
    if Omitted(fPath) or size(fPath) = 0
        if self._DataEnd = 0
            return ''
        end
        return self.FileNameOnly(self.value[1 : self._DataEnd],pIncludeExtension)
    end

    if size(fPath) < 1 or self.clipLen(fPath) < 1               ! Does not contain a file name
        return ''
    end

    ! Check for Windows style backslash "\"
    pLen = self.clipLen(fPath)
    if fPath[pLen] = '/' or fPath[pLen] = '\'                ! The passed string is just a path (directory) without a filename'
        return ''
    end

    loop i = pLen to 1 by -1
        if fpath[i] = '\'                                    ! found the last '\'
          if pIncludeExtension
            return(fpath[i+1 : pLen])
          else
            loop j = pLen to i+2 by -1
              if fpath[j] = '.'
                return(fpath[i+1 : j - 1])
              end
            end
            return(fpath[i+1 : pLen])                        ! no extension found
          end
        end
    end

    ! Check for forward slashes
    loop i = pLen to 1 by -1
        if fpath[i] = '/'                                    ! found the last /
          if pIncludeExtension
            return(fpath[i+1 : pLen])
          else
            loop j = pLen to i+2 by -1
              if fpath[j] = '.'
                return(fpath[i+1 : j - 1])
              end
            end
            return(fpath[i+1 : pLen])                        ! no extension found
          end
        end
    end

    if pIncludeExtension = false
      loop i =  pLen to 1 by -1
        if fpath[i] = '.'
          if i = 1
            return ''
          else
            return(fpath[1:i-1])
          end
        end
      end
    end

    return Clip(fPath)


!-----------------------------------------------------------------------------------
!!! <summary>Return just the file extension when passed the full file name and path.</summary>
!!! <param name="fPath">String that contains the full path and file name</param>
StringTheory.ExtensionOnly Procedure(<string fPath>)
i               long, auto
pLen            long, auto
  code
  if Omitted(fPath) or size(fPath) = 0
    if self._DataEnd = 0
      return ''
    end
    return self.ExtensionOnly(self.value[1 : self._DataEnd])
  end
  pLen = self.clipLen(fPath)
  if pLen = 0 or fpath[pLen] = '/' or fpath[pLen] = '\' or fpath[pLen] = '.'
   return ''
  end
  loop i = pLen-1 to 1 by -1
    if fpath[i] = '.'
      return fpath[i+1 : pLen]
    end
    if fpath[i] = '/' or fpath[i] = '\'
      break
    end
  end
  return ''

!-----------------------------------------------------------------------------------
!!! <summary>Return just the path when passed the full file name and path.</summary>
!!! <param name="fPath">String that contains the full path and file name</param>
!!! <remarks>Handles forward as well as back-slashes. If there
!!! is no path a blank string is returned</remarks>
StringTheory.PathOnly Procedure(<string fPath>)
i               long, auto
pLen            long, auto
  code
    if Omitted(fPath) or size(fPath) = 0
      if self._DataEnd = 0 then return ''.
      return self.PathOnly(self.value[1 : self._DataEnd])
    end

    ! Check for Windows style backslash "\"
    pLen = self.clipLen(fPath)
    loop i = pLen to 1 by -1
        if fpath[i] = '\'                                   ! found the last '\'
            return(Sub(fPath, 1, i-1))
        end
    end

    ! Check for forward slashes
    loop i = pLen to 1 by -1
        if fpath[i] = '/'                                   ! found the last /
            return(Sub(fPath, 1, i-1))
        end
    end

    return ''                                               ! No path

!-----------------------------------------------------------------------------------
!!! <summary>Return just the protocol when passed the full URL.</summary>
!!! <param name="pURL">String that contains the full URL.</param>
!!! <remarks>If there is no protocol a blank string is returned</remarks>
! protocol://host:port/url?parameters
StringTheory.UrlProtocolOnly          Procedure (<string pURL>)
c  long,auto
q  long,auto
  code
  if Omitted(pURL) or size(pURL) = 0
    if self._DataEnd = 0 then return ''.
    return self.URLProtocolOnly(self.value[1 : self._DataEnd])
  end
  c = self.findChars('://',,,pURL)
  if c < 2 then return ''.
  q = self.findChar('?',,,pURL)
  if q = 0 or c < q
    return pURL[1 : c-1]
  else
    return ''
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the host name when the full URL is passed.</summary>
!!! <param name="pURL">String that contains the full URL</param>
!!! <remarks></remarks>
! protocol://host:port/url?parameters#anchor
StringTheory.UrlHostOnly              Procedure (<string pURL>,Long pIncludePort=true)
p  long,auto  ! first char after protocol
e  long,auto  ! start of port
s  long,auto  ! start of url
q  long,auto  ! last char in host
  code
  if Omitted(pURL) or size(pURL) = 0
    if self._DataEnd = 0 then return ''.
    return self.URLHostOnly(self.value[1 : self._DataEnd],pIncludePort)
  end
  p = self.findChars('://',,,pURL)
  q = self.findChar('?',,,pURL)
  if q = 0 then q = self.findChar('#',,,pURL).
  if q = 0 then q = self.clipLen(pURL)+1.
  if p > q then p = 0.
  if p = 0 then p = 1 else p += 3.
  s = self.FindChar('/',p,,pURL)
  if s > 0 then q = s.
  if pIncludePort = false
    e = self.findChar(':',p,,pURL)
    if e > 0 and e < q then q = e.
  end
  if q-1 < p then return ''.
  return pURL[p : q-1]

!-----------------------------------------------------------------------------------
!!! <summary>Return the port when the full URL is passed.</summary>
!!! <param name="pURL">String that contains the full URL</param>
!!! <remarks>If the URL does not contain a specific port then 0 is returned</remarks>
! protocol://host:port/url?parameters
StringTheory.UrlPortOnly              Procedure (<string pURL>)
p  long,auto
e  long,auto
q  long,auto
s  long,auto
  code
  if Omitted(pURL) or size(pURL) = 0
    if self._DataEnd = 0 then return ''.
    return self.URLPortOnly(self.value[1 : self._DataEnd])
  end
  p = self.findChars('://',,,pURL)
  q = self.findChar('?',,,pURL)
  if q = 0 then q = self.clipLen(pURL)+1.
  if p > q then p = 0.
  if p = 0 then p = 1 else p += 3.
  s = self.findChar('/',p+4,,pURL)
  if s = 0 then s = q.
  e = self.findChar(':',p,,pURL)
  if e > s then e = 0.
  if e > 0 and e+1 < s
    return pURL[e+1 : s-1]
  else
    return 0
  end
!-----------------------------------------------------------------------------------
!!! <summary>Return the urlpath part of the full URL.</summary>
!!! <param name="pURL">String that contains the full URL</param>
!!! <remarks></remarks>
! protocol://host:port/url?parameters
StringTheory.UrlPathOnly        Procedure (<string pURL>, Long pIncludeFile=true)
q  long,auto
p  long,auto
s  long,auto
  code
  if Omitted(pURL) or size(pURL) = 0
    if self._DataEnd = 0 then return ''.
    return self.URLPathOnly(self.value[1 : self._DataEnd],pIncludeFile)
  end
  p = self.findChars('://',,,pURL)
  if p = 0 then p = 1 else p += 3.
  s = self.findChar('/',p,,pURL)
  if s = 0 or s = self.clipLen(pUrl)
    return ''
  end
  q = self.findChar('?',s,,pUrl)
  if q = 0 then q = self.clipLen(pURL)+1.
  if pIncludeFile = false
    q = instring('/',pUrl,-1,q-1)  ! last / before the file name
    if q - s < 2
      return ''
    end
  end
  return pURL [s+1 : q-1]

!-----------------------------------------------------------------------------------
!!! <summary>Return the filename part of the full URL.</summary>
!!! <param name="pURL">String that contains the full URL</param>
!!! <remarks></remarks>
! protocol://host:port/url?parameters#anchor
StringTheory.UrlFileOnly        Procedure (<string pURL>)
q  long,auto
p  long,auto
s  long,auto
  code
  if Omitted(pURL) or size(pURL) = 0
    if self._DataEnd = 0 then return ''.
    return self.URLFileOnly(self.value[1 : self._DataEnd])
  end
  p = self.findChars('://',,,pURL)
  if p = 0 then p = 1 else p += 3.
  s = self.findChar('/',p,,pURL)
  if s = 0 or s = self.clipLen(pUrl)
    return ''
  end
  q = self.findChar('?',s,,pUrl)
  if q = 0 then q = self.findChar('#',s,,pUrl).
  if q = 0 then q = self.clipLen(pURL)+1.
  s = instring('/',pUrl,-1,q-1)  ! last / before the file name
  if q-1 < s+1 then return ''.
  return pURL [s+1 : q-1]

!-----------------------------------------------------------------------------------
!!! <summary>Return the parameters the full URL is passed.</summary>
!!! <param name="pURL">String that contains the full URL</param>
!!! <remarks></remarks>
! protocol://host:port/url?parameters
StringTheory.UrlParametersOnly        Procedure (<string pURL>)
q  long,auto
a  long,auto
  code
  if Omitted(pURL) or size(pURL) = 0
    if self._DataEnd = 0 then return ''.
    return self.URLParametersOnly(self.value[1 : self._DataEnd])
  end
  q = self.findChar('?',,,pUrl)
  if q = 0 then return ''.
  a = self.findChar('#',,,pUrl)
  if a
    return sub(pURL,q+1,a-q-1)
  else
    return sub(pURL,q+1,self.clipLen(pURL)-q)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return the value of a specific parameter</summary>
!!! <param name="pURL">String that contains the full URL</param>
!!! <remarks></remarks>
! protocol://host:port/url?parameters
StringTheory.UrlParameter      Procedure (String pParameter,<string pURL>)
str  StringTheory
x    long, auto
  code
  if Omitted(pURL) or size(pURL) = 0
    if self._DataEnd = 0 then return ''.
    return self.URLParameter(pParameter,self.value[1 : self._DataEnd])
  end
  x = self.FindChar('?',,,pUrl)
  if x = 0
    str.Setvalue(clip(pURL))
  else
    str.SetValue(self.UrlParametersOnly(pUrl))
  end
  str.split('&')
  str.SetValueFromLine(str.Inline(clip(pParameter) & '=', 1, 1, 0, false, false, st:begins))
  if str._DataEnd
    str.SetAfter('=',,,,true)
    str.UrlDecode()
  end
  if str._DataEnd < 1
    return ''
  else
    return str.value[1 : str._DataEnd]
  end

!-----------------------------------------------------------------------------------
StringTheory.Prepend Procedure (StringTheory newValue, long pOptions = st:NoClip, string pSep)
x  long,auto
  code
  if newValue._DataEnd > 0
    self.Prepend(newValue.Value[1 : newValue._DataEnd],band(pOptions,st:clip),pSep)
  end
  If Band(pOptions,st:Lines)
    Loop x = records(newValue.lines) to 1 by -1
      Self.addLine(1,newValue.getLine(x))
    End
  End
!-----------------------------------------------------------------------------------
StringTheory.Prepend Procedure(stringtheory newValue, String pSep)
  code
  if newValue._DataEnd > 0
    self.Prepend(newValue.Value[1 : newValue._DataEnd],st:noclip,pSep)
  end
!-----------------------------------------------------------------------------------
StringTheory.Prepend Procedure(stringtheory newValue)
  code
  if newValue._DataEnd > 0
    self.Prepend(newValue.Value[1 : newValue._DataEnd])
  end

!-----------------------------------------------------------------------------------
!!! <summary>Prepend the passed string to the current stored string.</summary>
!!! <param name="newValue">The new value for the string</param>
!!! <remarks>If no value already exists then the new value is assigned
!!! as if SetValue had been called instead of Prepend.</remarks>
StringTheory.Prepend Procedure(string newValue, long pClip)
  code
  if size(newValue) = 0 or (band(pClip,st:NoBlanks) > 0 and newValue = '') then return.
  if pClip
    self.Prepend(newValue[1 : self.clipLen(newValue)])
  else
    self.Prepend(newValue)
  end

!-----------------------------------------------------------------------------------
StringTheory.Prepend Procedure(string newValue, long pClip=st:NoClip, String pSep)
insLen  Long,Auto
sepLen  Long,Auto
strLen  Long,Auto
oldLen  Long,Auto
  code
  if size(newValue) = 0 or (band(pClip,st:NoBlanks) > 0 and newValue = '') then return.
  insLen = Choose(pClip=false,size(NewValue),self.clipLen(NewValue))
  oldLen = self._DataEnd
  if oldLen < 1
    sepLen = 0 ! no separator if currently empty string
  else
    sepLen = Choose(omitted(pSep)=0,size(pSep),0)
  end
  if insLen = 0 and sepLen = 0 then return.

  strLen = oldLen + insLen + sepLen

  if not self.streamFileName &= null
    ! when streaming, prepending doesn't really make sense - existing buffer will be flushed then set to this.
    self.setvalue(choose(insLen = 0,'',newValue[1:insLen]) & choose(sepLen = 0,'',pSep[1:SepLen]) & self.value[1:oldLen])
    self.ErrorTrap('Prepend','Warning: Dubious use of prepend when streaming to ' & self.streamFileName,true)
  elsif self.UseBuffer = 0 or size(self.value) < strLen
    ! need to change physical buffer size
    if oldLen
      self.setvalue(choose(insLen = 0,'',newValue[1:insLen]) & choose(sepLen = 0,'',pSep[1:SepLen]) & self.value[1:oldLen])
    else
      self.setvalue(newValue[1:insLen])
    end
  else
    self._DataEnd = strLen
    if oldLen < 1
      stMemCpyLeft(address(self.value),address(newValue),strLen)
    else
      stMemCpyRight(address(self.value)+insLen+sepLen,address(self.value),oldLen)
      if insLen > 0 then stMemCpyLeft(address(self.value),address(newValue),insLen).
      if SepLen > 0 then stMemCpyLeft(address(self.value)+insLen,address(pSep),sepLen).
    end
  end

StringTheory.Prepend Procedure(string newValue)
  code
  self.prepend(newValue)

StringTheory.Prepend Procedure(*string newValue)
  code
  if address(newValue) = 0 or size(newValue) = 0 then return.

  if not self.streamFileName &= null
    ! when streaming, prepending doesn't really make sense - existing buffer will be flushed then set to this.
    self.setvalue(newValue)
    self.ErrorTrap('Prepend','Warning: Dubious use of prepend when streaming to ' & self.streamFileName,true)
  elsif self.UseBuffer = 0 or size(self.value) < self._DataEnd + size(newValue)
    ! need to change physical buffer size
    if self._DataEnd
      self.setvalue(newValue & self.value[1 : self._DataEnd])
    else
      self.setvalue(newValue)
    end
  else
    ! fits in current buffer
    if self._DataEnd
      stMemCpyRight(address(self.value)+size(newValue),address(self.value),self._DataEnd)
    end
    stMemCpyLeft(address(self.value),address(newValue),size(newValue))
    self._DataEnd += size(newValue)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Allocate dynamic memory when class goes into of scope.</summary>
StringTheory.Construct Procedure()
  code
  self.UseBuffer = true            ! remove this line to go back to StringTheory 1 behaviour.
  self._DataEnd = 0
  self.LastError &= new string(1)
  self.streamFileName &= null

!-----------------------------------------------------------------------------------
!!! <summary>Create a constant starting point for the object, so it can be re-used.</summary>
StringTheory.Start Procedure(long pForce=true)
  code
  if not self.streamFileName &= null
    self.Flush()
    dispose(self.streamFileName)
  end

  self.free(true,pForce)
  self.base64 = false
  self.base64NoWrap = false
  self.bytes = 0
  self.CleanBuffer = false
  self.gzipped = false
  if size(self.LastError) <> 1
    dispose(self.LastError)
    self.LastError &= new string(1)
  else
    self.LastError = ''
  end
  self.winErrorCode = 0
  self.encoding = st:EncodeAnsi
  self.codepage = st:CP_ACP
  self.Endian = st:littleEndian
  self._first = false
  self.UseBuffer = true            ! remove this line to go back to StringTheory 1 behaviour.
  self.logErrors  = false
  self.base64URLSafe = false

!-----------------------------------------------------------------------------------
!!! <summary>Deallocate dynamic memory when class goes out of scope.</summary>
StringTheory.Destruct Procedure()
  code
  self.Free(false,true)            ! note this will also complete streaming
  if not self.lines &= null
    self.FreeLines()
    Dispose(self.Lines)
  end
  dispose(self.LastError)

!-----------------------------------------------------------------------------------
StringTheory.GetAddress   procedure
  code
  return address(self.value)

!-----------------------------------------------------------------------------------
StringTheory.GetValuePtr           Procedure()
nullstr  &string
  CODE
  if self._DataEnd = 0 then return nullstr.
  return self.value[1 : self._DataEnd]

!-----------------------------------------------------------------------------------
StringTheory.GetValuePtr           Procedure(Long pStart)
nullstr  &string
  CODE
  if self._DataEnd = 0 then return nullstr.
  if pStart < 1 then pStart = 1.
  if pStart > self._DataEnd then return nullstr.
  return self.value[pStart : self._DataEnd]

!-----------------------------------------------------------------------------------
StringTheory.GetValuePtr           Procedure(Long pStart,Long pEnd)
nullstr  &string
  CODE
  if pStart > self._DataEnd then return nullstr.
  if self._DataEnd = 0 then return nullstr.
  if pStart < 1 then pStart = 1.
  if pEnd = 0 then pEnd = self._DataEnd.
  if pEnd < pStart then return nullstr.
  return self.value[pStart : pEnd]

!-----------------------------------------------------------------------------------
!!! <summary>Disposes the current value, and assigns a pre-declared buffer for the object.</summary>
!!! <remarks>Dangerous - use with care</remarks>
StringTheory._SetValuePointer      Procedure (Long pPtr,Long pSize, Long pDataEnd, Long pDispose=1)!,Virtual
  CODE
  if pDataEnd > pSize
    pDataEnd = pSize
  elsif not self.UseBuffer
    pSize = pDataEnd
  end

  if self.streamFileName &= null
    if pDispose
      self.free(true,true)
    end
    self.value &= (pPtr & ':' & pSize)
    self.valueptr &= self.value
    self._DataEnd = pDataEnd
  else
    ! when streaming, this doesn't make any sense - existing fixed buffer will be flushed then its value set to this.
    if pPtr = address(self.value)
      self.FlushAndKeep()
      if pSize <= size(self.value)
        if self.CleanBuffer and self._DataEnd > pSize
          stMemSet(address(self.value)+pSize,32,self._DataEnd-pSize)
        end
        self._DataEnd = pSize
      else
        self.SetLength(pSize)  ! note some data may be lost if expanding buffer but that would be dodgy use anyway
      end
    else
      self.Flush()
      self.catAddr(pPtr,pSize)
    end
    self.ErrorTrap('_SetValuePointer','Error: Incorrect use when streaming to ' & self.streamFileName,true)
    !peek(0,c#)  ! force GPF??
  end

!-----------------------------------------------------------------------------------
!!! <summary>Disposes the current value, and takes over the value memory of another ST object.</summary>
!!! <remarks>Dangerous - use with care</remarks>
StringTheory._StealValue Procedure (StringTheory otherValue)!,Virtual
  code
  Dispose(self.value)
  self.value &= otherValue.value
  self.valuePtr &= self.value
  self._DataEnd = otherValue._DataEnd
  otherValue.value &= Null
  otherValue.valueptr &= Null
  otherValue._DataEnd = 0
  if self.UseBuffer = 0 and size(self.value) > self._DataEnd
    self.setlength(self._DataEnd)                           ! force exact length if not using buffer
  end
  self.gzipped   =  otherValue.gzipped
  self.base64    =  otherValue.base64
  self.encoding  =  otherValue.encoding
  self.Endian    =  otherValue.Endian
  self.CodePage  =  otherValue.CodePage

!-----------------------------------------------------------------------------------
! takes a string pointer. Takes over the memory pointed to by that pointer.
! Original variable should be set to NULL. but not disposed.
StringTheory._StealValue Procedure (*String pOtherValue, long pReset=false)!,Virtual
  code
  if pReset          ! reset all attributes
    self.start()
  else
    dispose(self.value)
  end
  self.value &= pOtherValue
  self.valuePtr &= self.value
  self._DataEnd = size(pOtherValue)

!-----------------------------------------------------------------------------------
! swap two ST objects
StringTheory.swap Procedure (StringTheory pOther) !,Virtual
ptr  &StringTheory
  code
  ptr &= self
  self &= pOther
  pOther &= ptr

!-----------------------------------------------------------------------------------
StringTheory.GetVal Procedure() !,STRING
  code
  return self.GetValue()

!-----------------------------------------------------------------------------------
!!! <summary>Return current string</summary>
!!! <remarks>If no string has been assigned an empty string is returned.</remarks>
StringTheory.GetValue Procedure() !,STRING
  code
  compile('***',UnitTests)
  assert(self.UseBuffer or size(self.value) = self._DataEnd,' ST:GetValue() self._lenValue (' & size(self.value) & |
        ') <> self._DataEnd (' & self._DataEnd & ')  First chars = ' & self.sub(1,50))
  !***
  if self._DataEnd < 1
    return ''
  else
    return self.value[1:self._DataEnd]
  end

!-----------------------------------------------------------------------------------
StringTheory.GetValue Procedure(long maxLen) !,STRING
  code
!? assert(self.UseBuffer or size(self.value) = self._DataEnd,' ST:GetValue(maxLen=' & maxLen & ') self._lenValue (' & |
!?         size(self.value) & ') <> self._DataEnd (' & self._DataEnd & ')  First chars = ' & self.sub(1,50))
  if maxLen < 1 or self._DataEnd < 1
    return ''
  elsif self._DataEnd > maxlen
    return self.value[1 : maxlen]
  else
    return self.value[1 : self._DataEnd]
  end

!-----------------------------------------------------------------------------------
StringTheory.GetBufferLength Procedure() !,long
  CODE
  return size(self.value)

!-----------------------------------------------------------------------------------
StringTheory.Length Procedure() !,long
  code
? assert(self.UseBuffer or size(self.value) = self._DataEnd,'ST: Length of self.Value (' & size(self.value) & |
?        ') [Len = ' & len(self.value) & '] <> self._DataEnd (' & self._DataEnd & ')  First chars = ' & self.sub(1,50) & |
?        'address = ' & address(self.value))
  return self._DataEnd

!-----------------------------------------------------------------------------------
!!! <summary>Return the length of the existing string value.</summary>
!!! <remarks>Deprecated. Use Length() instead</remarks>
StringTheory.LengthA Procedure() !,long
  code
  return self._DataEnd

!-----------------------------------------------------------------------------------
StringTheory.Len Procedure() !,long
  code
  return self._DataEnd

!-----------------------------------------------------------------------------------
!!! <summary>Return the total length the string can grow to before reallocation of memory.</summary>
StringTheory.Capacity Procedure() !,long
  code
  return size(self.value)

!-----------------------------------------------------------------------------------
!!! <summary>Return the extra length the string can grow by before reallocation of memory.</summary>
StringTheory.spareCapacity Procedure() !,long
  code
  return size(self.value) - self._DataEnd

!-----------------------------------------------------------------------------------
!!! <summary>Set self.value to exactly the current data length.  Removes any spare room for growth.
!!!  Ideal when value is in final state and will not change from here on.</summary>
StringTheory.ReleaseSpareCapacity Procedure()
  code
  if size(self.value) > self._DataEnd
    self.setLength(self._DataEnd,true)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Reserve at least this much memory.  Useful where you know in advance how large the string will become.</summary>
StringTheory.ReserveCapacity Procedure(long pSize)
currSize long,auto
  code
  if size(self.value) < pSize
    currSize = self._DataEnd
    self.setLength(pSize, true) ! reserve extra capacity
    self.setLength(currSize)    ! reset length to current size
  end

!-----------------------------------------------------------------------------------
!!! <summary>Adjusts the space for the string to the specified length</summary>
!!! <remarks>Used internally when more, or less, space is required.
!!! If the length is shorter than the existing length then the string is truncated.
!!! If Force is set then the buffer size can be reduced to match the length.</remarks>
StringTheory.SetLength  Procedure(Long NewLength, Long pForce=false)
  code
  if NewLength < 1
    self.Free(false,pForce)
  elsif self.UseBuffer
    if pForce ! force the buffer to this length, shorten if necessary
      if NewLength = size(self.value)
        if NewLength > self._DataEnd and self.CleanBuffer = false
          stMemSet(address(self.value)+self._DataEnd,32,newLength-self._DataEnd)
        end
        self._DataEnd = NewLength
      else
        do NewAndCopy
      end
    elsif NewLength <> self._DataEnd
      if NewLength < self._DataEnd
        if self.CleanBuffer
          stMemSet(address(self.value)+newLength,32,self._DataEnd-newLength)
        end
        self._DataEnd = NewLength
      elsif NewLength <= size(self.value)
        if self.CleanBuffer = false
          stMemSet(address(self.value)+self._DataEnd,32,newLength-self._DataEnd)
        end
        self._DataEnd = NewLength
      else
        do NewAndCopy
      end
    end
  elsif newlength <> size(self.value)   ! changed June2017 to force correct length
    do NewAndCopy
  end
  return

NewAndCopy  routine                     ! adjust physical length
 data
oldString   &string
oldLength   long
 code
  if not self.value &= NULL
    oldLength = self._DataEnd
    oldString &= self.value
    self.value &= Null
    self.valuePtr &= Null
  end

  self._Malloc(NewLength, pForce)   ! gets a new self.value
  if not self.value &= NULL
    if oldLength
      stMemCpyLeft(address(self.value),address(oldString),choose(oldLength<self._DataEnd,oldLength,self._DataEnd))
    end
  End
  Dispose(oldString)

!-----------------------------------------------------------------------------------
StringTheory.AdjustLength Procedure(long pLen)
  code
  self.setLength(self._DataEnd + pLen)
  return self._DataEnd

!-----------------------------------------------------------------------------------
!!! <summary>Internal method to allocate memory for value</summary>
!!! <remarks>Used internally when more, or less, space is required.
!!! If Force is set then the exact buffer size is used.</remarks>
StringTheory._Malloc  Procedure(Long NewLength, Long pForce=false, Long pSilent=true)
AllocLen  long,auto
  code
  if NewLength < 1
    self.Free(false,pForce)
    return
  end
  if self.UseBuffer and not pForce
    AllocLen = self._GetNextBufferSize(NewLength)
  else
    AllocLen = NewLength
  end

  self.value &= new string(AllocLen)
  if self.value &= NULL and AllocLen > NewLength
    ! out of memory? - try again with exact length
    AllocLen = NewLength
    self.value &= new string(AllocLen)
  end
  self.valueptr &= self.value

  if self.value &= NULL
    self.value &= NULL ! do NOT remove this. needed to correctly set size() to 0
    self._DataEnd = 0
    self.ErrorTrap('_Malloc','Memory allocation failed trying to get ' & AllocLen & ' bytes.',true)
    if not pSilent
      message('Memory allocation failed trying to get ' & AllocLen & ' bytes.','Out of Memory?',ICON:Exclamation)
    end
  else
    self._DataEnd = newlength
  end

!-----------------------------------------------------------------------------------
!!! <summary>Replace occurences of one string with another in class value.</summary>
!!! <param name="OldValue">Sub-string to search for</param>
!!! <param name="NewValue">New value to replace with</param>
!!! <param name="Count">Optional parameter: How many occurences to replace. Default is all.</param>
!!! <remarks>This operation is non-overlapping. If the OldValue occurs in the NewValue the
!!! occurences from inserting NewValue will not be replaced.</remarks>
StringTheory.Replace Procedure(string pOldValue, string pNewValue, long pCount=0, long pStart=1, long pEnd=0, long pNoCase=0, bool pRecursive)
lCount              long
nCount              long,auto
remCount            long,auto                   ! remaining count
endOffset           long,auto
  code
  if not pRecursive then return self.replace(pOldValue, pNewValue, pCount, pStart, pEnd, pNoCase).

  if not pCount
    if Instring(pOldValue, pNewValue, 1, 1)  or | ! The old value is a substring of the new value, which will cause an infinite loop when pRecursive is set
       (pNoCase and Instring(upper(pOldValue), upper(pNewValue), 1, 1) )
      self.ErrorTrap('Replace', 'Invalid recursive replacement - the value being replaced is a substring of the new value. This will result in an infinite loop',true)
      return 0
    end
  end

  remCount = pCount
  endOffset = self._DataEnd - pEnd
  loop
    ncount = lcount
    lcount += self.replace(pOldValue, pNewValue, remCount, pStart, pEnd, pNoCase)
    if lCount = nCount or (pCount and lCount >= pCount) then break.
    if pCount then remCount = pCount - lCount.
    pEnd = self._DataEnd - endOffset  ! adjust end position
  end
  return lCount

StringTheory.Replace Procedure(string pOldValue, string pNewValue, long pCount=0, long pStart=1, long pEnd=0, long pNoCase=0)
lCount              long
lStrPos             long,auto
svUseBuffer         long,auto
oldChar             STRING(1), auto
oldByte             byte,over(oldChar)
diff                long,auto
haystack            &string
offset              long
maxStartPos         long,auto
  code
  if pStart < 1 then pStart = 1.
  if pEnd <= 0 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart+size(pOldValue)-1 > pEnd or pCount < 0 or size(pOldValue) < 1 then return 0.

  if pNoCase
    pOldValue = Upper(pOldValue)
    if pOldValue = Lower(pOldValue)
      pNocase = false
    end
  end

  if pNoCase = false
    diff = self.FindCharsAddr(pOldValue,address(self.value)+pStart-1,pEnd-pStart+1)
    if diff = 0 then return 0. ! old value not found
    pStart += diff - 1         ! update start position to first hit
  end

  oldChar = pOldValue[1]
  svUseBuffer = self.UseBuffer
  self.UseBuffer = TRUE

  diff = size(pNewValue) - size(pOldValue)
  if diff > 0
    do replaceWithLarger
  else
    if diff = 0
      if pNoCase
        if size(pOldValue) = 1 and upper(pNewValue) = pOldValue
          pNoCase = false
          oldChar = pNewValue
          case oldByte      ! swap case
          of 65 to 90       ! A to Z
            oldByte += 32
          else              ! a to z
            oldByte -= 32
          end
          pOldValue = oldChar
        end
      elsif pOldValue = pNewValue
        return 0            ! no change in value
      end
    end
    if pNoCase and (diff or size(pOldValue) > 1 or pCount)
      haystack &= new String(self._DataEnd)
      haystack = upper(self.value)
      offset = address(self.value) - address(haystack)
    else
      haystack &= self.value
    end
    maxStartPos = address(haystack)+pEnd-size(pOldValue)
    if diff = 0
      do replaceSameSize               ! replace with string of same size
    else
      do replaceWithSmaller            ! replace with smaller string - done in situ
    end
    if pNoCase and (diff or size(pOldValue) > 1 or pCount) then dispose(haystack).
  end

  if svUseBuffer = 0
    self.UseBuffer = 0
    self.SetLength(self._DataEnd)      ! make physical size match exactly
  elsif self.CleanBuffer and diff < 0 and lCount
    diff *= -lCount
    stMemSet(address(self.value)+self._DataEnd,32,choose(diff <= size(self.value)-self._DataEnd,diff,size(self.value)-self._DataEnd))
  end
  return lCount

replaceSameSize routine
  lStrPos = address(haystack) + pStart - 1
  if size(pOldValue) = 1               ! single char replacement
    if pCount
      loop
        lStrPos = MemChr(lStrPos,oldByte,address(haystack) + pEnd - lStrPos)
        if lStrPos = 0 then break.
        stMemCpyLeft(lStrPos+offset,address(pNewValue),1)
        lCount += 1
        if lCount >= pCount then break.
        lStrPos += 1
      end
    else
      loop 2 times                                 ! we search upper case then lower case char on actual buffer - so no offset required
        loop
          lStrPos = MemChr(lStrPos,oldByte,address(haystack) + pEnd - lStrPos)
          if lStrPos = 0 then break.
          stMemCpyLeft(lStrPos,address(pNewValue),1)
          lCount += 1
          lStrPos += 1
        end
        if pNoCase
          oldByte += 32                            ! make lower case
          lStrPos = address(haystack) + pStart - 1 ! start over looking for lower case char
        else
          break
        end
      end
    end
  else ! multi character replace of same size
    if pCount
      loop
        lStrPos = self._memChrs(pOldValue,lStrPos,maxStartPos)
        if lStrPos = 0 then break.
        stMemCpyLeft(lStrPos+offset,address(pNewValue),size(pNewValue))
        lCount += 1
        if lCount >= pCount then break.
        lStrPos += size(pNewValue)
      end
    else
      loop
        lStrPos = self._memChrs(pOldValue,lStrPos,maxStartPos)
        if lStrPos = 0 then break.
        stMemCpyLeft(lStrPos+offset,address(pNewValue),size(pNewValue))
        lCount += 1
        lStrPos += size(pNewValue)
      end
    end
  end

replaceWithSmaller routine
  data
z                   long,auto                                             ! last char pointer for shuffled string
newSize             long,auto
charsRemoved        long
  code
  lStrPos = address(haystack) + pStart - 1
  if size(pOldValue) = 1                                                  ! single char removal
    if pCount
      loop
        lStrPos = MemChr(lStrPos,oldByte,address(haystack) + pEnd - lStrPos)
        if lStrPos = 0 then break.
        if charsRemoved
          stMemCpyLeft(z+offset,z+charsRemoved+offset,lStrPos-z-charsRemoved) ! shuffle down chars
        end
        z = lStrPos-charsRemoved
        charsRemoved += 1
        lCount += 1
        if lCount >= pCount then break.
        lStrPos += 1
      end
    else
      loop
        lStrPos = MemChr(lStrPos,oldByte,address(haystack) + pEnd - lStrPos)
        if lStrPos = 0 then break.
        if charsRemoved
          stMemCpyLeft(z+offset,z+charsRemoved+offset,lStrPos-z-charsRemoved) ! shuffle down chars
        end
        z = lStrPos-charsRemoved
        charsRemoved += 1
        lCount += 1
        lStrPos += 1
      end
    end
  else ! multi character replace to smaller size
    newSize = size(pNewValue)
    if pCount
      if newSize
        loop
          lStrPos = self._memChrs(pOldValue,lStrPos,maxStartPos)
          if lStrPos = 0 then break.
          if charsRemoved
            stMemCpyLeft(z+offset,z+charsRemoved+offset,lStrPos-z-charsRemoved) ! shuffle down chars
          end
          z = lStrPos-charsRemoved
          stMemCpyLeft(z+offset,address(pNewValue),newSize)                     ! replacement with new value
          z += newSize
          charsRemoved -= diff
          lCount += 1
          if lCount >= pCount then break.
          lStrPos += size(pOldValue)
        end
      else
        loop
          lStrPos = self._memChrs(pOldValue,lStrPos,maxStartPos)
          if lStrPos = 0 then break.
          if charsRemoved
            stMemCpyLeft(z+offset,z+charsRemoved+offset,lStrPos-z-charsRemoved) ! shuffle down chars
          end
          z = lStrPos-charsRemoved
          charsRemoved -= diff
          lCount += 1
          if lCount >= pCount then break.
          lStrPos += size(pOldValue)
        end
      end
    else
      if newSize
        loop
          lStrPos = self._memChrs(pOldValue,lStrPos,maxStartPos)
          if lStrPos = 0 then break.
          if charsRemoved
            stMemCpyLeft(z+offset,z+charsRemoved+offset,lStrPos-z-charsRemoved) ! shuffle down chars
          end
          z = lStrPos-charsRemoved
          stMemCpyLeft(z+offset,address(pNewValue),newSize)                     ! replacement with new value
          z += newSize
          charsRemoved -= diff
          lCount += 1
          lStrPos += size(pOldValue)
        end
      else
        loop
          lStrPos = self._memChrs(pOldValue,lStrPos,maxStartPos)
          if lStrPos = 0 then break.
          if charsRemoved
            stMemCpyLeft(z+offset,z+charsRemoved+offset,lStrPos-z-charsRemoved) ! shuffle down chars
          end
          z = lStrPos-charsRemoved
          charsRemoved -= diff
          lCount += 1
          lStrPos += size(pOldValue)
        end
      end
    end
  end

  if charsRemoved
    if address(haystack)+self._DataEnd > z+charsRemoved
      stMemCpyLeft(z+offset,z+charsRemoved+offset,address(haystack)+self._DataEnd-z-charsRemoved) ! shuffle down remaining chars
    end
    self._DataEnd -= charsRemoved
  end

replaceWithLarger routine
  data
RemainStart         long,auto
remainString        &String
lEndPos             long,auto
foundPos            long,auto
  code
  ! replacement by string of a larger size - taking advantage of buffer introduced in ST2

  loop 1 times  ! dummy loop   NB. do NOT use exit - use break to *guarantee* remainString is disposed at end
    ! first check there is at least one match...
    if pNoCase
      pStart = self.Instring(pOldValue, 1, pStart, pEnd, pNoCase, false)
    elsif size(pOldValue) = 1
      pStart = self.findChar(pOldValue, pStart, pEnd)
    else
      pStart = self.findChars(pOldValue, pStart, pEnd)
    end
    if pStart = 0 then break.

    RemainStart = pStart + size(pOldValue) - 1  ! start pos of remaining string to search less 1
    if self._DataEnd > RemainStart
      ! we make a copy of the remaining old string then append into self.value, replacing as we go
      remainString &= new string(self._DataEnd - RemainStart)
      if remainString &= null
        self.ErrorTrap('Replace','Memory allocation failed trying to get ' & self._DataEnd - RemainStart & ' bytes.',true)
      end
      stMemCpyLeft(address(remainString),address(self.value)+RemainStart,self._DataEnd-RemainStart)
    end

    self._DataEnd = pStart - 1
    self.catAddr(Address(pNewValue),size(pNewValue))         ! first replacement
    lCount += 1
    if size(remainString) = 0 then break.                    ! no remaining string to replace
    if pCount and lCount >= pCount
      self.catAddr(address(remainString),size(remainString)) ! copy remainder of string (if any)
      break
    end

    pStart = 1 ! start at beginning of remainString
    pEnd -= RemainStart
    if pEnd < pStart
      self.catAddr(address(remainString),size(remainString)) ! copy remainder of string (if any)
      break
    end
    if size(pOldValue) = 1
      if pNoCase
        loop lStrPos = pStart to pEnd
          if ToUpper(Val(remainString[lStrPos])) = oldByte
            self.catAddr(address(pNewValue),size(pNewValue))
            lCount += 1
            if pCount <> 0 and lCount >= pCount
              lStrPos += 1
              break
            end
          elsif self._DataEnd < size(self.value)
            self._DataEnd += 1
            self.value[self._DataEnd] = remainString[lStrPos]
          else
            self.append(remainString[lStrPos])
          end
        end
        self.catAddr(address(remainString) + pEnd,size(remainString) - pEnd)       ! copy remainder of string (if any)
      else
        ! old length = 1 case sensitive search
        lStrPos = address(remainString) + pStart - 1
        lEndPos = address(remainString) + pEnd                                     ! one beyond end of string
        if pCount
          loop
            foundPos = MemChr(lStrPos,oldByte,lEndPos - lStrPos)
            if foundPos = 0 then break.                                            ! not found
            self.catAddr(lStrPos,foundPos - lStrPos)                               ! append text up to match (if any)
            self.catAddr(address(pNewValue),size(pNewValue))                       ! append replacement text
            lCount += 1
            lStrPos = foundPos + 1
            if lCount >= pCount
              break
            end
          end
        else
          loop
            foundPos = MemChr(lStrPos,oldByte,lEndPos - lStrPos)
            if foundPos = 0 then break.                                            ! not found
            self.catAddr(lStrPos,foundPos - lStrPos)                               ! append text up to match (if any)
            self.catAddr(address(pNewValue),size(pNewValue))                       ! append replacement text
            lCount += 1
            lStrPos = foundPos + 1
          end
        end
        self.catAddr(lStrPos,address(remainString) + size(remainString) - lStrPos) ! append rest of string
      end
    else
      ! replacement by string of a different size where pOldValue length is more than 1 char (size(pOldValue) > 1)
      if pNoCase
        loop lStrPos = pStart to pEnd - size(pOldValue) + 1
          if ToUpper(Val(remainString[lStrPos])) = oldByte and Upper(remainString[lStrPos : lStrPos + size(pOldValue) - 1]) = pOldValue
            self.catAddr(address(pNewValue),size(pNewValue))
            lCount += 1
            if pCount <> 0 and lCount >= pCount
              lStrPos += size(pOldValue)
              break
            end
            lStrPos += size(pOldValue) - 1
          else
            self.cat(remainString[lStrPos],1)
          end
        end
        self.catAddr(address(remainString) + lStrPos - 1,size(remainString) - lStrPos + 1) ! copy remainder of string (if any)
      else
        lStrPos = address(remainString) + pStart - 1
        lEndPos = address(remainString) + pEnd - size(pOldValue) + 1                       ! one beyond max search start pos
        if pCount
          loop
            if lStrPos >= LEndPos then break.
            foundPos = MemChr(lStrPos,oldByte,lEndPos - lStrPos)                           ! look for first character
            if foundPos = 0 then break.
            self.catAddr(lStrPos,foundPos - lStrPos)                                       ! append text up to match of 1st char (if any)
            lstrPos = foundPos
            if memcmp(lStrPos, address(pOldValue), size(pOldValue)) = 0                    ! do we have match? (with memcmp 0 = match)
              self.catAddr(address(pNewValue),size(pNewValue))                             ! append replacement text
              lCount += 1
              lStrPos += size(pOldValue)
              if lCount >= pCount
                break
              end
            else
              self.catAddr(lStrPos,1) ! append one char as string did not match
              lStrPos += 1
            end
          end
        else
          loop
            if lStrPos >= LEndPos then break.
            foundPos = MemChr(lStrPos,oldByte,lEndPos - lStrPos)                   ! look for first character
            if foundPos = 0 then break.
            self.catAddr(lStrPos,foundPos - lStrPos)                               ! append text up to match of 1st char (if any)
            lstrPos = foundPos
            if memcmp(lStrPos, address(pOldValue), size(pOldValue)) = 0            ! do we have match? (with memcmp 0 = match)
              self.catAddr(address(pNewValue),size(pNewValue))                     ! append replacement text
              lCount += 1
              lStrPos += size(pOldValue)
            else
              self.catAddr(lStrPos,1)                                              ! append one char as string did not match
              lStrPos += 1
            end
          end
        end
        self.catAddr(lStrPos,address(remainString) + size(remainString) - lStrPos) ! append rest of string
      end
    end
  end ! dummy loop
  dispose(remainString)

!-----------------------------------------------------------------------------------
StringTheory.ReplaceBetween     Procedure (string pLeft, <string pRight>, string pOldValue, string pNewValue, long pCount=0, long pStart=1, long pEnd=0, long pNoCase=0, long pReplaceAll=false)
left        Long,auto
right       Long,auto
endOffset   Long,auto
rightOffset Long,auto
result      Long
rightPtr    &String    ! if pRight is not specified, assume same as pLeft
  code
  if pEnd = 0 then pEnd = self._DataEnd.
  if pStart < 1 then pStart = 1.
  if pEnd < pStart then return 0.
  if size(pOldValue) = 0 and size(pNewValue) = 0 then return 0.
  if size(pOldValue) = size(pNewValue) and pOldValue = pNewValue then return 0.
  if size(pLeft) = 0 then return 0.
  if omitted(pRight) or size(pRight) = 0
    rightPtr &= pLeft  ! make right edge delimiter the same as left if it was not specified
  else
    rightPtr &= pRight
  end
  if pNoCase
    pLeft = upper(pLeft)
    rightPtr = upper(rightPtr)
    pOldValue = upper(pOldValue)
    if pLeft = lower(pLeft) and rightPtr = lower(rightPtr) and pOldValue = lower(pOldValue)
      pNocase = false
    end
  end
  endOffset = self._DataEnd - pEnd
  loop
    if pStart >= pEnd then break.
    left = self.instring(pLeft,1,pStart,pEnd,pNoCase)
    if left = 0 then break.
    left += size(pLeft)
    right = self.instring(rightPtr,1,left,pEnd,pNoCase)
    if right = 0 then break.
    rightOffset = self._DataEnd - right

    if left = right
      ! nothing between left and right boundaries
      if pReplaceAll or size(pOldValue) = 0
        self.insert(left,pNewValue)
        result += 1
      end
    elsif pReplaceAll
      self.replaceSlice(left,right-1,pNewValue)
      result += 1
    elsif size(pOldValue) = 0
      self.insert(left,pNewValue)
      result += 1
    else
      result += self.replace(pOldValue,pNewValue,choose(pCount=0,0,pCount-result),left,right-1,pNoCase)
    end
    if pCount > 0 and result >= pCount then break.
    pStart = self._DataEnd - rightOffset + size(rightPtr)
    pEnd = self._DataEnd - endOffset  ! adjust end position
  end
  return result

!-----------------------------------------------------------------------------------
! replace only outside left/right boundaries.  eg. if not wanting to replace inside a literal 'abcdefg' would set pLeft to ''''
! NB. unlike ReplaceBetween pOldValue cannot be empty
StringTheory.ReplaceExceptBetween     Procedure (string pLeft, <string pRight>, string pOldValue, string pNewValue, long pCount=0, long pStart=1, long pEnd=0, long pNoCase=0)
left        Long,auto
right       Long,auto
endOffset   Long,auto
rightOffset Long,auto
result      Long
rightPtr    &String    ! if pRight is not specified, assume same as pLeft
  code
  if pEnd = 0 then pEnd = self._DataEnd.
  if pStart < 1 then pStart = 1.
  if pEnd < pStart then return 0.
  if size(pOldValue) = 0 then return 0.
  if size(pOldValue) = size(pNewValue) and pOldValue = pNewValue then return 0.
  if size(pLeft) = 0 then return 0.
  if omitted(pRight) or size(pRight) = 0
    rightPtr &= pLeft  ! make right edge delimiter the same as left if it was not specified
  else
    rightPtr &= pRight
  end
  if pNoCase
    pLeft = upper(pLeft)
    rightPtr = upper(rightPtr)
    pOldValue = upper(pOldValue)
    if pLeft = lower(pLeft) and rightPtr = lower(rightPtr) and pOldValue = lower(pOldValue)
      pNocase = false
    end
  end
  endOffset = self._DataEnd - pEnd
  loop
    if pStart > pEnd then break.
    left = self.instring(pLeft,1,pStart,pEnd,pNoCase)
    if pLeft
      right = self.instring(rightPtr,1,left+size(pLeft),pEnd,pNoCase) ! now find the right string
    end
    if left = 0 or right = 0
      ! replace in remainder of string
      result += self.replace(pOldValue,pNewValue,choose(pCount=0,0,pCount-result),pStart,pEnd,pNoCase)
      break
    end
    rightOffset = self._DataEnd - right
    ! replace up to left string
    if pStart < left
      result += self.replace(pOldValue,pNewValue,choose(pCount=0,0,pCount-result),pStart,left-1,pNoCase)
      if pCount and result >= pCount then break.
    end
    pStart = self._DataEnd - rightOffset + size(rightPtr)
    pEnd = self._DataEnd - endOffset  ! adjust end position
  end
  return result

!-----------------------------------------------------------------------------------
!!! <summary>Replace multiple single characters.</summary>
!!! <remarks>single characters in pOldChars are replaced with that in the same position in pNewChars</remarks>
!
! st.setValue('Hello')
! st.ReplaceSingleChars('loe','pya')  !st now contains 'Happy'
!
StringTheory.ReplaceSingleChars Procedure(string pOldChars, string pNewChars)
x       Long, auto
ans     Long
  code
  if size(pOldChars) <> size(pNewChars)
    self.ErrorTrap('ReplaceSingleChars','Called with Mismatching String Lengths')
    return st:Error
  end
  if self._DataEnd < 1 or pOldChars = pNewChars then return 0.
  loop x = 1 to size(pOldChars)
    ans += self.replaceByte(val(pOldChars[x]),val(pNewChars[x]))
  end
  return ans

!-----------------------------------------------------------------------------------
!!! <summary>Replace multiple single characters.</summary>
!!! <remarks>single characters in pOldChars are replaced with that in the same position in pNewChars</remarks>
StringTheory.ReplaceSingleChars Procedure(string pOldChars, string pNewChars, bool pOnceOnly)
x         LONG, auto
pos       LONG, auto
ans       Long
  code
  if pOnceOnly = false or size(pOldChars) <= 1 or size(pOldChars) <> size(pNewChars)
    Return self.ReplaceSingleChars(pOldChars, pNewChars)
  end
  if self._DataEnd < 1 or pOldChars = pNewChars then return 0.
  loop x = 1 TO self._DataEnd
    pos = memchr(address(pOldChars) , val(self.value[x]), size(pOldChars))
    if pos > 0
      self.value[x] = pNewChars[pos - address(pOldChars) + 1] ! replace single char
      ans += 1
    end
  end
  return ans

!-----------------------------------------------------------------------------------
!!! <summary>Replace TAB characters with spaces.</summary>
!!! <remarks>The number of spaces inserted is determined by tab size and the position in current line
!!!          If no line endings are specified then assumes CRLF line endings </remarks>
StringTheory.ConvertTabs Procedure(long pTabSize=8, <string pLineEnding>)
x              long,auto
y              long,auto
insertedSpaces long,auto                            ! number of spaces to insert
st             stringtheory                         ! local copy so we do not disturb existing lines queue
  code
  if not self.containsByte(9) then return.          ! no tabs to expand
  if pTabSize < 2
    self.replaceSingleChars('<9>','<32>')           ! simply replace tabs with a single space
    return
  end
  st._stealValue(self)                              ! assign self value to st to preserve our lines queue
  if omitted(pLineEnding) or size(pLineEnding) = 0
    st.split('<13,10>')                             ! default is CRLF
  else
    st.split(pLineEnding)
  end
  loop x = 1 to st.records()
    st.setValue(st.getLine(x))                      ! get row
    y = st.findChar('<9>')
    if y
      loop                                          ! expand tabs in row
        st.valuePtr[y] = '<32>'
        insertedSpaces = y%pTabSize
        if insertedSpaces
          insertedSpaces = pTabSize - insertedSpaces
          st.insert(y+1,all('<32>',insertedSpaces)) ! insert spaces to take to the next tab position
        end
        y = st.findChar('<9>',y+insertedSpaces+1)   ! find next TAB
        if y = 0 then break.
      end
      st.setLine(x,st.getValuePtr())                ! replace value in lines queue
    end
  end
  if omitted(pLineEnding) or size(pLineEnding) = 0
    st.join('<13,10>')                              ! default is CRLF
  else
    st.join(pLineEnding)
  end
  self._stealValue(st)                              ! reassign updated value

!-----------------------------------------------------------------------------------
!!! <summary>Count the occurences of a sub-string in class value.</summary>
!!! <param name="SearchValue">Sub-string to search for</param>
!!! <param name="Step">The number of characters to jump. Default is 1</param>
!!! <param name="Start">Optional parameter to indicate what position to start search. Default is beginning.</param>
!!! <param name="End">Optional parameter to indicate what position to end search. Default is end of string.</param>
!!! <param name="NoCase">Optional parameter: Ignore case in comparision. Default is case-sensitive.</param>
StringTheory.Count Procedure(string pSearchValue, long pStep=1, long pStart=1, long pEnd=0, long pNoCase=0, bool pSoftclip=true, long pOverlap=true) !,long
x           long, auto
ans         long
i           long, auto
len         long, auto
skip        long, auto
haystack    &string
  code
  if self._DataEnd = 0 or size(pSearchValue) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pStep < 1 then pStep = 1.
  if pEnd < 1 or pEnd > self._DataEnd
    pEnd = self._DataEnd
  elsif pSoftclip and size(pSearchValue) > 1    ! "soft" clipping allows the string to "overlap" the end position
    pEnd += size(pSearchValue) - 1
    if pEnd > self._DataEnd then pEnd = self._DataEnd.
  end
  len = pEnd - pStart + 1
  if size(pSearchValue) > len then return 0.    ! search value too long to match
  if pNoCase
    pSearchValue = Upper(pSearchValue)
    if pSearchValue = Lower(pSearchValue)
      pNocase = false
      haystack &= (address(self.value) + pStart - 1) & ':' & len
    else
      haystack &= new String(len)
      haystack = upper(self.value[pStart : pEnd])
    end
  else
    haystack &= (address(self.value) + pStart - 1) & ':' & len
  end

  if size(pSearchValue) = 1 and pStep = 1 ! optimized version when counting a single character (pSoftclip and overlap parms don't apply)
    x = address(haystack)
    i = address(haystack) + len
    loop
      x = memchr(x, val(pSearchValue), i - x)
      if x
        ans += 1
        x += 1
      else
        break
      end
    end
  else
    if size(pSearchValue) = 1
      skip = 1
    elsif pOverlap
      skip = memchr(address(pSearchValue)+1 , val(pSearchValue[1]), size(pSearchValue)-1) ! is the first char elsewhere in the search string?
      if skip
        skip -= address(pSearchValue)   ! set skip to match first char
      else
        skip = size(pSearchValue)
      end
    else
      skip = size(pSearchValue)
    end
    if pStep > skip
      skip = pStep
    elsif pStep > 1 and pStep < skip
      skip += pStep - skip%pStep        ! bump skip up to next step boundary
    end

    pStart = 1                          ! note: haystack is already offset if the passed-in value of pStart was > 1, hence we start at 1
    if pStep = 1
      loop
        x = self.FindCharsAddr(pSearchValue,address(haystack)+pStart-1,len-pStart+1)
        if x = 0 then break.
        pStart += x - 1 + skip
        ans += 1
      end
    else
      loop
        x = InString(pSearchValue, haystack, pStep, pStart)
        if x = 0 then break.
        pStart = ((x-1) * pStep) + 1 + skip  ! instring returns "step value" not position.
        ans += 1
      end
    end
  end
  if pNoCase then dispose(haystack).
  return ans

!-----------------------------------------------------------------------------------
!!! <summary>Searches the lines for a specific substring.</summary>
!!! <remarks>returns the line number containing the Search Value.</remarks>
StringTheory.InLine   Procedure (string pSearchValue, long pStep=1, long pStart=1, long pEnd=0, long pNocase=0, long pWholeLine=0, long pWhere=st:anywhere, long pClip=st:clip)
x             long,auto
ans           long
SearchLen     long,auto
LineLen       long,auto
  code
  if self.Lines &= null or self.records() = 0 then return 0.
  if pEnd < 1 or pEnd > self.records() then pEnd = self.records().
  if pStart < 1 then pStart = 1.
  if pStep = 0 then pStep = 1.
  if pStart > pEnd
    if pStep > 0 then return 0.
    ! pStep is negative (checked for zero above) so swap start and end so we can go backwards ok
    x = pStart
    pStart = pEnd
    pEnd = x
  end
  if pClip
    SearchLen = self.clipLen(pSearchValue)
  else
    SearchLen = size(pSearchValue)
  end
  if SearchLen = 0                   ! (Note a search length of zero is used to search for blank lines)
    if pClip
      loop x = pStart to pEnd by pStep
        if self.GetLine(x) = ''      ! is it an empty line (empty or just spaces)?
          return x
        end
      end
    else
      loop x = pStart to pEnd by pStep
        if len(self.GetLine(x)) = 0  ! is it a completely empty line (zero length)?
          return x
        end
      end
    end
    return 0                         ! blank line not found
  end

  if pNoCase
    pSearchValue = Upper(pSearchValue)
    if pSearchValue = Lower(pSearchValue)
      pNocase = false
    end
  end
  loop x = pStart to pEnd by pStep
    if pClip
      lineLen = len(clip(self.GetLine(x)))
    else
      lineLen = len(self.GetLine(x))
    end
    if lineLen < SearchLen then cycle. ! line too short
    if SearchLen = lineLen
      if pNocase
        if pSearchValue = upper(self.lines.line)
          ans = x                      ! matches the whole line
          break
        end
      else
        if pSearchValue = self.lines.line
          ans = x                      ! matches the whole line
          break
        end
      end
      cycle
    end
    if pWholeLine then cycle.          ! if wholeline, and lengths are not the same, then try next line.
    case pWhere
    of st:begins
      if pNocase
        if pSearchValue = upper(self.lines.line[1 : SearchLen])
          ans = x
          break
        end
      else
        if pSearchValue = self.lines.line[1 : SearchLen]
          ans = x
          break
        end
      end
    of st:ends
      if pNocase
        if pSearchValue = upper(self.lines.line[lineLen - SearchLen + 1 : lineLen])
          ans = x
          break
        end
      else
        if pSearchValue = self.lines.line[lineLen - SearchLen + 1 : lineLen]
          ans = x
          break
        end
      end
    else
      ! can match anywhere in the line
      if pNocase
        if instring(pSearchValue[1 : SearchLen],upper(self.lines.line),1,1)
          ans = x
          break
        end
      else
        if self.findCharsAddr(pSearchValue[1 : SearchLen],address(self.lines.line),lineLen)
          ans = x
          break
        end
      end
    end
  end
  return ans

!-----------------------------------------------------------------------------------
!!! <summary>Return specific line after calling Split method.</summary>
!!! <param name="LineNumber">Line to return. If LineNumber is greater than the number of lines in queue
!!! then an empty string is returned.</param>
!!! <remarks>If split has not been called an empty string is returned.</remarks>
StringTheory.GetLine Procedure(long pLineNumber) !,STRING
  code
  if self.Lines &= null
    return ''
  end

  Get(self.Lines,pLineNumber)
  if ErrorCode() or self.Lines.Line &= NULL or (self.Lines.Empty and size(self.Lines.Line) = 1 and self.Lines.Line = ' ')
    return ''
  else
    return self.Lines.line
  end

!-----------------------------------------------------------------------------------
!!! <summary>Return specific lines after calling Split method.</summary>
!!! <param name="FromLineNumber">First Line to return.</param>
!!! <param name="ToLineNumber">Last Line to return.</param>
!!! <remarks>If split has not been called an empty string is returned.</remarks>
StringTheory.GetLines Procedure(long pFromLineNumber, long pToLineNumber, string pSeparator) !,STRING
str  stringtheory
x  long
  code
  if self.Lines &= null then return ''.
  if pToLineNumber = 0 or pToLineNumber > records(self.lines) then pToLineNumber = records(self.lines).
  if pFromLineNumber < 1 then pFromLineNumber = 1.
  if size(pSeparator)
    loop x =  pFromLineNumber to pToLineNumber
      Get(self.Lines,x)
      if ErrorCode() or self.Lines.Line &= NULL or (self.Lines.Empty and size(self.Lines.Line) = 1 and self.Lines.Line = ' ')
        str.append(pSeparator)                   ! still append separator if empty line
      else
        str.append(self.Lines.line & pSeparator) ! always append separator
      end
    end
    str.adjustLength(-size(pSeparator))          ! remove final separator
  else
    loop x =  pFromLineNumber to pToLineNumber
      Get(self.Lines,x)
      if ErrorCode() or self.Lines.Line &= NULL or (self.Lines.Empty and size(self.Lines.Line) = 1 and self.Lines.Line = ' ')
        ! empty line so append nothing
      else
        str.append(self.Lines.line)
      end
    end
  end
  if str._dataEnd < 1
    return ''
  else
    return str.value[1:str._dataEnd]
  end
!-----------------------------------------------------------------------------------
!!! <summary>Sets a specific line to a specific value</summary>
!!! <param name="LineNumber">Line to set. If LineNumber is greater than the number of lines in queue
!!! then the string is added to the queue at the next available line.</param>
!!! <remarks></remarks>
StringTheory.SetLine Procedure(long pLineNumber,String pValue)
  code
  self.setLine(pLineNumber, pValue)

StringTheory.SetLine Procedure(long pLineNumber,StringTheory pValue)
  code
  self.setLine(pLineNumber, pValue.GetValuePtr())

StringTheory.SetLineFromValue Procedure(long pLineNumber)
  code
  if self._DataEnd < 1
    self.setLine(pLineNumber, '')
  else
    self.setLine(pLineNumber, self.value[1 : self._DataEnd])
  end

StringTheory.SetLine Procedure(long pLineNumber,*String pValue)
len  LONG,auto
  code
  if self.Lines &= null
    self.Lines &= new LinesQType
  end

  Get(self.Lines,pLineNumber)
  if ErrorCode()
    self.AddLine(pLineNumber, pValue)
  else
    len = len(pValue)
    if len
      if len <> size(self.Lines.Line)
        Dispose(self.Lines.Line)
        self.Lines.line &= new string(len)
      end
      self.Lines.line = pValue
      self.Lines.Empty = FALSE
    else
      if size(self.Lines.Line) <> 1
        Dispose(self.Lines.Line)
        self.Lines.line &= new string(1)
      else
        self.Lines.line = ' '
      end
      self.Lines.Empty = TRUE
    end
    put(self.lines)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Adds a specific line to the end of the queue </summary>
!!! <remarks></remarks>
StringTheory.AddLine Procedure(*String pValue)
  code
  self.AddLine(st:end, pValue)

!-----------------------------------------------------------------------------------
!!! <summary>Adds a specific line to the end of the queue </summary>
!!! <remarks></remarks>
StringTheory.AddLine Procedure(String pValue)
  code
  self.AddLine(st:end, pValue)

!-----------------------------------------------------------------------------------
!!! <summary>Adds a specific line to the queue at a specific position</summary>
!!! <param name="LineNumber">Line to add. If LineNumber is greater than the number of lines in queue
!!! then the string is added to the queue at the next available line.</param>
!!! <remarks></remarks>
StringTheory.AddLine Procedure(long pLineNumber,String pValue)
  code
  self.AddLine(pLineNumber, pValue)

!-----------------------------------------------------------------------------------
!!! <summary>Adds a specific line to the queue at a specific position</summary>
!!! <param name="LineNumber">Line to add. If LineNumber is greater than the number of lines in queue
!!! then the string is added to the queue at the next available line.</param>
!!! <remarks></remarks>
StringTheory.AddLine Procedure(long pLineNumber,*String pValue)
  code
  if self.Lines &= null
    self.Lines &= new LinesQType
  end

  if len(pvalue)
    self.Lines.line &= new string(len(pValue))
    self.Lines.line = pValue
    self.Lines.Empty = FALSE
  else
    ! Empty string, so add a single character entry that contains a space
    self.Lines.line &= new string(1)
    Clear(self.Lines.line)
    self.Lines.Empty = TRUE
  end
  add(self.Lines,pLineNumber)


!-----------------------------------------------------------------------------------
!!! <summary>Delete a specific line after calling Split method.</summary>
!!! <param name="LineNumber">Line to delete. If LineNumber is greater than the number of lines in queue
!!! then nothing is deleted.</param>
!!! <remarks>Returns 1 if nothing is deleted, 0 if the line is deleted</remarks>
StringTheory.DeleteLine Procedure(long pLineNumber) !,LONG
  code
  if not self.Lines &= null
    Get(self.Lines,pLineNumber)
    if ErrorCode() = 0
      Dispose(self.Lines.Line)
      Delete(self.Lines)
      Return 0
    end
  end
  return 1

!-----------------------------------------------------------------------------------
!!! <summary>Remove "empty" lines from the Lines Queue.</summary>
!!! <remarks>Allows you to define the characters that constitue "emptyness". Spaces are always defined as empty.
!!!          Returns the number of lines deleted.</remarks>
StringTheory.RemoveLines  Procedure()
ans           long
x             long,auto
  code
  if self.Lines &= null then return ans.

  loop x = self.records() to 1 by -1
    if self.getline(x) = ''
      self.deleteline(x)
      ans += 1
    end
  end
  return ans

StringTheory.RemoveLines  Procedure(String pAlphabet)
ans           long
x             long,auto
  code
  if self.Lines &= null then return ans.
  if pAlphabet = '' then return self.RemoveLines().

  loop x = self.records() to 1 by -1
    if self.getline(x) = '' or self.IsAll(' ' & pAlphabet,self.lines.line)
      self.deleteline(x)
      ans += 1
    end
  end
  return ans

!-----------------------------------------------------------------------------------
!!! <summary>Return the number of lines a string value was broken into after calling Split.</summary>
!!! <remarks>If split has not been called zero is returned.</remarks>
StringTheory.Records Procedure() !,long
  code
  if self.Lines &= null
    return 0
  else
    return Records(self.Lines)
  end

!-----------------------------------------------------------------------------------
!!! <summary>Breakdown the current string value into a series of string. Use the passed string value
!!! as a delimiter.</summary>
!!! <param name="SplitStr">Sub-String used to break up string. </param>
!!! <remarks>The sub-string is consumed by the command and does not appear in the lines.
!!! Use Records and GetLine methods to return information about the split queue.</remarks>
StringTheory.Split Procedure(string pSplitStr, <string pQuotestart>, <string pQuoteEnd>, bool removeQuotes = false, bool pClip = false, bool pLeft=false, <string pSeparator>,Long pNested=false)
LOOKINGFORBOUNDARY  equate(1)
LOOKINGFORENDQUOTE  equate(2)
splitStrPos         long, auto
slen                long, auto
startPos            long(1)
sPos                long, auto
ePos                long, auto
QuotesExist         long
QuoteStart          &String
QuoteEnd            &String
  code
  self.freeLines()
  if self._DataEnd = 0 then return.
  if size(pSplitStr) < 1 then return.
  slen = size(pSplitStr) - 1
  if omitted(pQuoteStart) or pQuoteStart = ''
    do splitNoQuotes
  elsif size(pSplitStr) = 1 and size(pQuoteStart) = 1
    if self.containsChar(pQuoteStart)
      if omitted(pQuoteEnd) or pQuoteEnd = '' or size(pQuoteEnd) = 1
        do splitQuotesSingleChar ! optimized version for common case
      else
        do splitQuotes
      end
    else
      do splitNoQuotes
    end
  else
    do splitQuotes
  end

splitQuotesSingleChar routine   ! optimized version where the splitStr and quote start and end are all one character
  data
Nest                Long
state               long, auto
curByte             byte, auto  ! current byte char
quoteSbyte          byte, over(pQuoteStart)
quoteEbyte          byte, auto
splitByte           byte, over(pSplitStr)
  code
  QuoteStart &= pQuoteStart
  if omitted(pQuoteEnd) or pQuoteEnd = ''
    QuoteEnd &= pQuoteStart
  else
    QuoteEnd &= pQuoteEnd
  end
  quoteEbyte = val(QuoteEnd[1])
  if pNested and QuoteStart = QuoteEnd then pNested = false.

  state = LOOKINGFORBOUNDARY
  loop splitStrPos = 1 to self._DataEnd
    curByte = val(self.value[splitStrPos])  ! set current char
    case state
    of LOOKINGFORBOUNDARY
      case curByte
      of splitByte
        do AddLine
        startPos = splitStrPos + 1
        self.EndOfLastLine = startPos     ! position after the last termination boundary. Used when paging, and last line is an incomplete record.
      of quoteSByte
        state = LOOKINGFORENDQUOTE
        QuotesExist = true
      end
    of LOOKINGFORENDQUOTE
      if pNested and curByte = quoteSbyte
        nest += 1
      elsif curByte = quoteEbyte
        if nest > 0
          nest -= 1
        else
          state = LOOKINGFORBOUNDARY
        end
      end
    end
  end
  if splitStrPos > self._DataEnd
    do AddLine
  end

splitQuotes  routine
  data
qStart              StringTheory     ! these are recursive
qEnd                StringTheory     ! these are recursive
qFirstChars         StringTheory
Nest                Long
state               long, auto
ix                  long, auto
MultiQuotes         long, auto
splitChar1          string(1), auto
c                   string(1), auto  ! current char
  code
  splitChar1 = pSplitStr[1]
  qStart.SetValue(pQuoteStart,st:clip)
  if omitted(pQuoteEnd) or pQuoteEnd = ''
    qEnd.SetValue(qStart)
    pNested = false
  else
    qEnd.SetValue(pQuoteEnd,st:clip)
  end
  If qStart._DataEnd and qEnd._DataEnd
    If not omitted(pSeparator) and size(pSeparator) <> 0 and qStart.ContainsChar(pSeparator)
      qStart.Split(pSeparator)
      qEnd.Split(pSeparator)
    End
    If qStart.Records() > 1
      MultiQuotes = true
      qFirstChars.setLength(qStart.Records()); qFirstChars.free() ! set correct length from the start
      loop ix = 1 to qStart.records()
        qStart.setValue(qStart.GetLine(ix))
        qFirstChars.append(qStart.sub(1))                         ! build a list of quote first characters
      end
    Else
      MultiQuotes = false
      QuoteStart &= qStart.GetValuePtr()
      QuoteEnd   &= qEnd.GetValuePtr()
      if pNested and QuoteStart = QuoteEnd
        pNested = false
      end
    End
  End
  state = LOOKINGFORBOUNDARY
  ! sLen is the length of the Split Boundary, -1
  loop splitStrPos = 1 to self._DataEnd
    c = self.value[splitStrPos]                                       ! set current char
    case state
    of LOOKINGFORBOUNDARY
      if c = splitChar1 and |
         (slen = 0 or (splitStrPos + sLen <= self._DataEnd and self.value[splitStrPos : splitStrPos + sLen] = pSplitStr))
        do AddLine
        splitStrPos += sLen
        startPos = splitStrPos + 1
        self.EndOfLastLine = startPos     ! position after the last termination boundary. Used when paging, and last line is an incomplete record.
      elsif multiQuotes
        ix = qFirstChars.findChar(c)
        if ix = 0 then cycle.                                         ! this char is not start of quote string
        loop ix = ix to qStart.records()
          qStart.setValue(qStart.GetLine(ix))
          if qStart._DataEnd = 0 or c <> qstart.value[1] then cycle.  ! not a match
          QuoteStart &= qStart.GetValuePtr()
          if size(QuoteStart) = 1 or                                  |  !single char match
             (splitStrPos + size(QuoteStart) - 1 <= self._DataEnd and |
              self.value[splitStrPos : splitStrPos + size(QuoteStart) - 1] = QuoteStart)
            state = LOOKINGFORENDQUOTE
            QuotesExist = true
            splitStrPos += size(QuoteStart) - 1
            qEnd.setValue(qEnd.GetLine(ix))
            if qEnd._DataEnd
              QuoteEnd &= qEnd.GetValuePtr()
            else
              QuoteEnd &= QuoteStart
            end
            break
          end
        end
      elsif c <> quoteStart[1]
        cycle
      elsif size(QuoteStart) = 1 or |
            (splitStrPos + size(QuoteStart) - 1 <= self._DataEnd and self.value[splitStrPos : splitStrPos + size(QuoteStart) - 1] = QuoteStart)
        state = LOOKINGFORENDQUOTE
        QuotesExist = true
        splitStrPos = splitStrPos + size(QuoteStart) - 1
      end
    of LOOKINGFORENDQUOTE
      if pNested and QuoteStart <> QuoteEnd and splitStrPos + size(QuoteStart) - 1 <= self._DataEnd and self.value[splitStrPos : splitStrPos + size(QuoteStart) - 1] = QuoteStart
        nest += 1
      elsif splitStrPos + size(QuoteEnd) <= self._DataEnd and self.value[splitStrPos : splitStrPos + size(QuoteEnd) - 1] = QuoteEnd
        if nest > 0
          nest -= 1
        else
          state = LOOKINGFORBOUNDARY
          splitStrPos = splitStrPos + size(QuoteEnd) - 1
        end
      end
    end
  end
  if splitStrPos > self._DataEnd
    do AddLine
  end

splitNoQuotes routine
  removeQuotes = false
  loop
    if slen
      splitStrPos = self.findChars(pSplitStr, startPos)
    else
      splitStrPos = self.findChar(pSplitStr, startPos)
    end
    if splitStrPos
      do AddLine
      StartPos = SplitStrPos + size(pSplitStr)
      self.EndOfLastLine = startPos     ! position after the last termination boundary. Used when paging, and last line is an incomplete record.
      if startPos <= self._DataEnd then CYCLE. ! delimiter was not at end of string
    end
    splitStrPos = self._DataEnd + 1
    do AddLine
    break
  end

AddLine Routine
  self.lines.quoted = false
  sPos = startPos
  if splitStrPos > self._DataEnd
    epos = self._DataEnd
  else
    ePos = splitStrPos - 1
  end
  if removeQuotes and QuotesExist and sPos > 0 and sPos <= self._DataEnd
  ! only quotes at the start and end of the line are removed.
    if self.value[sPos] = QuoteStart[1] and |   ! quite often quotes are single char
       (size(QuoteStart) = 1 or (sPos + size(QuoteStart) - 1 <= self._DataEnd and self.value[sPos : sPos + size(QuoteStart) - 1] = QuoteStart))
      sPos += size(QuoteStart)
      self.lines.quoted += st:left
    end
    if epos >= size(QuoteEnd) and self.value[epos + 1 - size(QuoteEnd)] = quoteEnd[1] and | ! quite often quotes are single char
       (size(QuoteEnd) = 1 or self.value[epos + 1 - size(QuoteEnd) : epos] = quoteEnd)
      ePos -= size(QuoteEnd)
      self.lines.quoted += st:right
    end
  end

  if epos < sPos or sPos < 1 or (pClip and self.value[sPos : epos] = '')
   ! Empty string, so add a single character entry that contains a space
    self.Lines.line &= new string(1)
    self.Lines.Empty = TRUE
  else
    self.Lines.Empty = FALSE
    if pClip
      if pLeft
        self.Lines.line &= new string(len(clip(left(self.value[sPos : epos]))))
        self.Lines.line = left(self.value[sPos : epos])
      else
        self.Lines.line &= new string(self.clipLen(self.value[sPos : epos]))
        stMemCpyLeft(address(self.lines.line), address(self.value)+sPos-1, size(self.lines.line))
      end
    elsif pLeft
      self.Lines.line &= new string(epos + 1 - sPos)
      self.Lines.line = left(self.value[sPos : epos])
    else
      self.Lines.line &= new string(epos + 1 - sPos)
      stMemCpyLeft(address(self.lines.line), address(self.value)+sPos-1, size(self.lines.line))
    end
  end
  Add(self.Lines)

!-----------------------------------------------------------------------------------
!!! <summary>Splits the string in numChars lengths and stores each new substring
!!!     as a line in the self.lines queue
!!! </summary>
!!! <param name="numChars">The number of characters that each new substring should contain, i.e.
!!!     the length to split the string up using</param>
!!! <remarks>If the string is shorter than numChars then a single "line" entry is added which contains
!!!     the string. If the string is not an exact multiple of numChars then the last substring split
!!!     contains however many characters remain</remarks>
StringTheory.SplitEvery Procedure(long numChars)
addr         long,auto
maxAddr      long,auto
  code
    self.freeLines()
    if self._DataEnd = 0 or numChars < 1 then return.

    self.Lines.Empty  = FALSE
    self.lines.Quoted = FALSE
    maxAddr = address(self.value) + self._DataEnd - 1
    addr = address(self.value) - numChars
    loop
      addr += numChars
      if addr + numChars > maxAddr
        if addr > maxAddr then break.
        numChars = maxAddr - addr + 1  ! last section may be shorter
      end
      self.lines.line &= new string(numChars)
      stMemCpyLeft(address(self.lines.line),addr,numChars)
      Add(self.lines)
      if errorcode()
        ! probably out of memory
        self.errorTrap('SplitEvery','Add to Lines queue failed: err' & errorcode(),true)
        self.freeLines()
        break
      end
    end

!-----------------------------------------------------------------------------------
StringTheory.SplitIntoWords Procedure(long StartPos = 1, long TextType=ST:TEXT, <String pCharlist>,Long pSmartWords=true)
endPos            long,auto
  code
  self.freeLines()
  if startPos < 1 or startPos > self._DataEnd then return.

  self.Lines.Empty  = FALSE
  self.lines.Quoted = FALSE
  loop
    startPos = self.WordStart(startPos, textType, st:Forwards, pCharList)
    if startPos < 1 then break.

    endPos = self.WordEnd(startPos, textType, pCharList,pSmartWords)
    if endPos < startPos or endPos > self._DataEnd then break.

    self.lines.line &= new string(endPos - startPos + 1)
    stMemCpyLeft(address(self.lines.line), address(self.value)+startPos-1, size(self.lines.line))
    Add(self.lines)

    startPos = endPos + 1
  end

!-----------------------------------------------------------------------------------
! returns the position of the substring (pRegEx) in the object
! Similar to INSTRING but allows for regular expression matching.
! If match not found returns 0.
! The object itself is not changed.
! Note that this differs from the clarion MATCH command.
! Match:Simple and Match:Regular are supported but not Match:Soundex nor Match:Wild.
StringTheory.Match Procedure(string pRegEx, Long pStart=1, Long pEnd=0, long pMode=Match:Regular, long pNoCase=0)
findPos  long,auto
  code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd
    pEnd = self._DataEnd
  end
  if pStart > pEnd then return 0.

  if pMode = Match:Simple
    if pNoCase = false
      return(self.findChars(pRegEx,pStart,pEnd))
    else
      return(self.Instring(pRegEx,1,pStart,pEnd,pNoCase,false))
    end
  end

? assert(pMode=Match:Regular)
  if pMode <> Match:Regular then return 0. ! mode not supported

  ! note that STRPOS does _not_ want the MODE passed.
  findPos = strPos(self.value[pStart : pEnd], pRegEx, pNoCase)
  if findPos
    findPos += pStart - 1
  end

  return findPos

!-----------------------------------------------------------------------------------
! returns the substring of the match.
! also sets pStart & pEnd to the location of the returned string in the object
! The object itself is not changed.
! Match:Simple and Match:Regular are supported but not Match:Soundex nor Match:Wild.
StringTheory.FindMatch Procedure(string pRegEx, *long pStart, *long pEnd, long pMode=Match:Regular, long pNoCase=0)
  code
  self.FindMatchPosition(pRegEx,pStart,pEnd,pMode,pNoCase)
  if pStart <= 0 or pStart > pEnd
    return ''
  else
    return self.value[pStart : pEnd]
  end

! provides the start and end positions - no returned string for performance reasons
StringTheory.FindMatchPosition Procedure(string pRegEx, *long pStart, *long pEnd, long pMode=Match:Regular, long pNoCase=0)
startPos  long,auto
endPos    long,auto
  code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd
    pEnd = self._DataEnd
  end
  if pStart > pEnd
    pStart = 0
    pEnd = 0
    return
  end

  ! take care of simple case first.
  if pMode = Match:Simple
    if pNoCase = false
      pStart = self.findChars(pRegEx,pStart,pEnd)
    else
      pStart = self.Instring(pRegEx,1,pStart,pEnd,pNoCase,false)
    end
    if pStart
      pEnd = pStart + size(pRegEx) - 1
    else
      pEnd = 0
    end
    return
  end

? assert(pMode=Match:Regular)
  if pMode <> Match:Regular ! mode not supported
    pStart = 0
    pEnd = 0
    return
  end

  startPos = pStart
  endPos = pEnd

  pStart = strPos(self.value[startPos : endPos], pRegEx, pNoCase) + startPos - 1
  if pStart < startPos
    pStart = 0
    pEnd = 0
    return
  end

  loop pEnd = pStart TO endPos     ! find the minimum end position for the match
    ! we check tiny strings, getting incrementally bigger, until the same match is found.
    if strPos(self.value[pStart : pEnd], pRegEx, pNoCase)
      return                       ! we have found the shortest match from pStart
    end
  end

? stop('logic error in FindMatch') ! should never happen

!-----------------------------------------------------------------------------------
StringTheory.SplitByMatch Procedure(string pRegEx, long pNoCase=0)
startPos  Long,auto
endPos    Long
dataStart Long,auto
dataEnd   Long,auto

  code
  self.freeLines()
  self.lines.Quoted = FALSE
  loop
    dataStart = endPos + 1
    if dataStart > self._DataEnd
      ! add blank record at end...
      dataEnd = self._DataEnd
    else
      startPos = dataStart
      endPos = self._DataEnd  ! or could set to zero
      self.FindMatchPosition(pRegEx, startPos, endPos , match:regular , pNoCase)
      if startPos
        dataEnd = startPos - 1
      else
        ! regex not found - put remainder of data into final queue line
        dataEnd = self._DataEnd
      end
    end

    if dataEnd < dataStart
      self.Lines.Empty = TRUE
      self.lines.line &= new string(1)
    else
      self.Lines.Empty = FALSE
      self.lines.line &= new string(dataEnd - dataStart + 1)
      stMemCpyLeft(address(self.lines.line), address(self.value)+dataStart-1, size(self.lines.line))
    end
    Add(self.lines)

    if dataEnd = self._DataEnd then BREAK.

  end
!-----------------------------------------------------------------------------------
StringTheory.SplitBetween Procedure (string pLeft, string pRight, long pNoCase=false, long pExclusive=true)
startPos  Long
endPos    Long,auto
  code
  self.freeLines()
  self.lines.Quoted = FALSE
  loop
    endPos = self._DataEnd ! or can also set to zero for end of string
    self.FindBetweenPosition(pLeft, pRight, startPos, endPos, pNoCase, pExclusive)
    if startPos = 0 then break.

    if endPos < startPos
      self.Lines.Empty = TRUE
      self.lines.line &= new string(1)
    else
      self.Lines.Empty = FALSE
      self.lines.line &= new string(endPos - startPos + 1)
      stMemCpyLeft(address(self.lines.line), address(self.value)+startPos-1, size(self.lines.line))
    end
    Add(self.lines)
    startPos = endPos + 1 + choose(pExclusive = 0,0,size(pRight))
  end

!-----------------------------------------------------------------------------------
StringTheory.Sort Procedure (Long pSortType,string pSplitStr,<string pQuotestart>,<string pQuoteEnd>, bool pClip = false, bool pLeft=false)
  code
  self.split(pSplitStr,pQuotestart,pQuoteEnd,true,pClip,pLeft)
  self.sort(pSortType)
  self.join(pSplitStr,pQuotestart,pQuoteEnd,st:IfQuoted)
  self.freelines()

!-----------------------------------------------------------------------------------
StringTheory.Sort Procedure(Long pSortType)
  code
  case pSortType
  of st:SortNoCase
    sort(self.lines,SortCaseInsensitive)
  of st:SortCase
    sort(self.lines,SortCaseSensitive)
  of st:SortLength
    sort(self.lines,SortLength)
  end

!-----------------------------------------------------------
StringTheory.SerializeQueue  Procedure (*Queue pQueue,<String pRecordBoundary>,<string pFieldBoundary>,<string pQuotestart>,<string pQuoteEnd>,Long pLevel=1,Long pFree=true,long pOptions=0)
str  StringTheory
  CODE
  If Omitted(pFieldBoundary) or size(pFieldBoundary) = 0
    str.SetValue(',')
  else
    str.SetValue(pFieldBoundary)
    str.split('I')
  end
  self.SerializeQueue(pQueue,pRecordBoundary,str,pQuotestart,pQuoteEnd,pLevel,pFree,pOptions)
!-----------------------------------------------------------
StringTheory.SerializeQueue  Procedure (*Queue pQueue,<string pRecordBoundary>,*StringTheory pFieldBoundary,<string pQuotestart>,<string pQuoteEnd>,Long pLevel=1,Long pFree=true,long pOptions=0)
r       long, auto
grp     &Group
ptr     Long
crlf    string('<13,10>')
bndry   &string
saveBuffer  string(size(pQueue))
  CODE
  saveBuffer = pQueue
  if pFree = 1
    self.Free(false)
  end
  grp &= pQueue
  ptr = Pointer(pQueue)
  if omitted(pRecordBoundary) or size(pRecordBoundary) = 0
    bndry &= crlf
  else
    bndry &= pRecordBoundary
  end
  if records(pQueue)
    Get(pQueue,1)
    self.SerializeGroup(grp,pFieldBoundary,pQuotestart,pQuoteEnd,pLevel,false,pOptions)
    loop r = 2 to records(pQueue)
      Get(pQueue,r)
      self.append(bndry)
      self.SerializeGroup(grp,pFieldBoundary,pQuotestart,pQuoteEnd,pLevel,false,pOptions)
    end
  end
  get(pQueue,ptr)
  pQueue = saveBuffer

!-----------------------------------------------------------
!!! <summary>Serializes a group into a (comma) separated string
!!! </summary>
!!! <param name="pGroup">The group to serialize</param>
!!! <param name="pBoundary">The boundary to use. If omitted it is comma separated.</param>
!!! <param name="pQuotestart">Starting Quote charcter. If omitted then no quotes are used.</param>
!!! <param name="pQuoteEnd">Ending Quote charcter. If omitted start quote is used.</param>
!!! <param name="pLevel">The nesting level of the first field int he group. Default is 1</param>
!!! <remarks>For nested groups alternate boundaries can be used, in which case pBoundary is an I separated list.</remarks>
!!!
StringTheory.SerializeGroup    Procedure (*Group pGroup,<String pBoundary>,<string pQuotestart>,<string pQuoteEnd>,Long pLevel=1,Long pFree=true,long pOptions=0)
str  StringTheory
  CODE
  If Omitted(pBoundary) or size(pBoundary) = 0
    str.SetValue(',')
  else
    str.SetValue(pBoundary)
    if str.containsChar('I')
      str.split('I')
    end
  end
  return self.SerializeGroup(pGroup,str,pQuotestart,pQuoteEnd,pLevel,pFree,pOptions)

!-----------------------------------------------------------
!!! <summary>Serializes a group into a (comma) separated string
!!! </summary>
!!! <param name="pGroup">The group to serialize</param>
!!! <param name="pBoundary">The boundary to use. If omitted it is comma separated.</param>
!!! <param name="pQuotestart">Starting Quote charcter. If omitted then no quotes are used.</param>
!!! <param name="pQuoteEnd">Ending Quote charcter. If omitted start quote is used.</param>
!!! <param name="pLevel">The nesting level of the first field in the group. Default is 1</param>
!!! <remarks>For nested groups alternate boundaries can be used, in which case pBoundary is a StringTheory object, already SPLIT into the various boundaries.</remarks>
!!!
StringTheory.SerializeGroup   Procedure (*Group pGroup,*StringTheory pBoundary,<string pQuotestart>,<string pQuoteEnd>,Long pLevel=1,Long pFree=true,long pOptions=0)
an                           any
g                            &group
fld                          long
QuoteStart                   string(1)
QuoteEnd                     string(1)
Q                            Long
Boundary                     StringTheory
BoundaryRecs                 Long,Auto
dimCount                     long,auto
x                            long,auto
  code
  if pLevel < 1 then pLevel = 1.
  if not omitted(pQuotestart) and size(pQuotestart) <> 0
    if size(pQuotestart) >= pLevel
      quoteStart = pQuoteStart[pLevel]
    else
      quoteStart = pQuoteStart[size(pQuotestart)]
    end
    if not omitted(pQuoteEnd) and size(pQuoteEnd) <> 0
      if size(pQuoteEnd) >= pLevel
        quoteEnd = pQuoteEnd[pLevel]
      else
        quoteEnd = pQuoteEnd[size(pQuoteEnd)]
      end
    else
      quoteEnd = quoteStart
    end
    if size(pQuotestart) <> 0
      q = 1
    end
  end
  if q = 0 and band(pOptions, st:QuoteAlways) ! default quotes to " if not specified
    q = 1
    if not quoteStart then quoteStart = '"'.
    if not quoteEnd   then quoteEnd   = '"'.
  end
  if pFree = true
    self.Free(false)
  end
  BoundaryRecs = pBoundary.Records()
  if BoundaryRecs = 0
    boundary.SetValue(pBoundary)
  elsif pLevel > BoundaryRecs
    boundary.SetValue(pBoundary.GetLine(BoundaryRecs))
  else
    boundary.SetValue(pBoundary.GetLine(pLevel))
  end
  if boundary._DataEnd < 1 then boundary.SetValue(',').
  loop
    fld += 1
    an &= What(pGroup, fld)
    if an &= NULL then BREAK.
    if fld > 1 then self.catAddr(address(boundary.value), Boundary._DataEnd).
    dimCount = howmany(pGroup, fld)
    x = 1
    if dimCount > 1 then an &= What(pGroup, fld, 1).
    LOOP
      if IsGroup(pGroup, fld)
        g &= GetGroup(pGroup, fld, choose(dimCount > 1,x,0))
        if x >= dimCount
          fld += self.SerializeGroup(g,pBoundary,pQuotestart,pQuoteEnd,pLevel+1,false,pOptions) - 1 ! recursive call for nested groups
        else
          self.SerializeGroup(g,pBoundary,pQuotestart,pQuoteEnd,pLevel+1,false,pOptions)            ! recursive call for nested groups
        end
      elsif q > 0 and (band(pOptions, st:QuoteAlways) or instring(boundary.value[1 : boundary._DataEnd],an,1,1))
        self.Append(quoteStart & clip(an) & quoteend)
      else
        self.Append(clip(an))
      end
      if x >= dimCount then break.
      x += 1
      an &= What(pGroup, fld, x)
      if an &= NULL then BREAK. ! should not happen
      self.catAddr(address(boundary.value), Boundary._DataEnd)
    END
  end
  Return fld

!-----------------------------------------------------------
StringTheory.Join Procedure(string pBoundary,<string pQuotestart>,<string pQuoteEnd>,long pAlwaysQuote=false)
QuoteStart            string(1)
QuoteEnd              string(1)
QuotesExist           long
LineNumber            long,auto
e                     long,auto
svUseBuffer           long,auto
  code
  self.Free(false)
  if self.Lines &= null or self.records() = 0
    return
  end
  svUseBuffer = self.UseBuffer
  self.UseBuffer = TRUE
  if not omitted(pQuotestart) and size(pQuotestart) <> 0
    quoteStart = pQuoteStart
    if not omitted(pQuoteEnd) and size(pQuoteEnd) <> 0
      quoteEnd = pQuoteEnd
    else
      quoteEnd = quoteStart
    end
    if size(pQuotestart) <> 0
      QuotesExist = true
    end
  end

  loop LineNumber = 1 to Records(self.lines)
    Get(self.Lines, LineNumber)
    if LineNumber > 1 then self.CatAddr(address(pBoundary),size(pBoundary)).

    if self.lines.line &= null or (self.Lines.Empty and len(self.Lines.Line) = 1 and self.Lines.Line = ' ')
      if QuotesExist and |
         (pAlwaysQuote = st:QuoteAlways or (pAlwaysQuote = st:IfQuoted and self.Lines.quoted))
        self.Append(quoteStart & QuoteEnd)
      end
    elsif QuotesExist and |
       (pAlwaysQuote = st:QuoteAlways or |
        (pAlwaysQuote = st:IfQuoted and self.Lines.quoted) or |
        instring(pBoundary,self.Lines.line,1,1))
      ! add quoted string
      e = size(self.Lines.line)
      if e > 0
        if self.Lines.line[1] = quoteStart
          self.CatAddr(address(self.Lines.line), size(self.Lines.line))
          if self.Lines.line[e] <> quoteEnd
            if self._DataEnd < size(self.value)
              self._DataEnd += 1
              self.value[self._DataEnd] = quoteEnd
            else
              self.Cat(quoteEnd)
            end
          end
        else
          ! need to add quote at start
          if self._DataEnd < size(self.value)
            self._DataEnd += 1
            self.value[self._DataEnd] = quoteStart
          else
            self.Cat(quoteStart)
          end
          self.CatAddr(address(self.Lines.line), size(self.Lines.line))
          if self.Lines.line[e] <> quoteEnd
            ! add quote at end
            if self._DataEnd < size(self.value)
              self._DataEnd += 1
              self.value[self._DataEnd] = quoteEnd
            else
              self.Cat(quoteEnd)
            end
          end
        end
      elsif self._DataEnd+1 < size(self.value)
        self._DataEnd += 1
        self.value[self._DataEnd] = quoteStart
        self._DataEnd += 1
        self.value[self._DataEnd] = quoteEnd
      else
        self.Append(quoteStart & QuoteEnd)
      end
    else
      ! add unquoted String
      self.CatAddr(address(self.Lines.line), size(self.Lines.line))
    end
  end ! loop

  if svUseBuffer = 0
    self.UseBuffer = 0
    self.SetLength(self._DataEnd) ! make physical size match exactly
  end

!-----------------------------------------------------------
!!! <summary>Filter the current Lines Queue</summary>
!!! <param name="Include">Only include lines containing this string</param>
!!! <param name="Exclude">Exclude all lines containing this string</param>
!!! <remarks>If the include parameter is blank, then only the exclude parameter applies, and vice versa.</remarks>
StringTheory.Filter Procedure(string pInclude, string pExclude, long pNoCase=TRUE, long pClip=st:clip)
x      long,auto
incLen long,auto
excLen long,auto
inc    &STRING
exc    &STRING
  code
  if self.Lines &= null or records(self.lines) = 0
    return
  end

  if pClip
    incLen = self.clipLen(pInclude)
  else
    inclen = size(pInclude)
  end
  if incLen
    inc &= new string(incLen)
    if pNoCase
      inc = upper(pInclude)
    else
      inc = pInclude
    end
  end

  if pClip
    excLen = self.clipLen(pExclude)
  else
    excLen = size(pExclude)
  end
  if excLen
    exc &= new string(excLen)
    if pNoCase
      exc = upper(pExclude)
    else
      exc = pExclude
    end
  end

  if incLen = 0 and excLen = 0 then return.

  if pNoCase
    loop x = records(self.lines) to 1 by -1
      get(self.lines,x)
      if (incLen and (incLen > size(self.lines.line) or instring(inc,upper(self.lines.line),1,1) = 0)) or |
         (excLen and excLen <= size(self.lines.line) and instring(exc,upper(self.lines.line),1,1) <> 0)
        dispose(self.lines.line)
        delete(self.lines)
      end
    end
  else
    loop x = records(self.lines) to 1 by -1
      get(self.lines,x)
      if (incLen and (incLen > size(self.lines.line) or instring(inc,self.lines.line,1,1) = 0)) or |
         (excLen and excLen <= size(self.lines.line) and instring(exc,self.lines.line,1,1) <> 0)
        dispose(self.lines.line)
        delete(self.lines)
      end
    end
  end

  dispose(Inc)
  dispose(Exc)

!-----------------------------------------------------------------------------------
!!! <summary>Return sub-string from the current string value.</summary>
!!! <param name="Start">Start of sub-string.</param>
!!! <param name="Length">Length of sub-string.</param>
!!! <remarks>If the Length paramter is omitted then one character, at position Start, is returned.</remarks>
StringTheory.Sub Procedure(long pStart=1, long pLength=1) !, string
  code
    if self._DataEnd = 0
        return ''
    end
    if pStart < 1
        pStart = 1
    end
    if pStart > self._DataEnd
        return ''
    end

    if pLength+pStart-1 > self._DataEnd
        pLength = self._DataEnd - pStart + 1
    end
    if pLength < 1
        return ''
    end
    return self.Value[pStart : pStart + pLength - 1]

!-----------------------------------------------------------------------------------
!!! <summary>Return sub-string from the current string value.</summary>
!!! <param name="Start">Start of sub-string.</param>
!!! <param name="End">End of sub-string.</param>
!!! <remarks>If the End position is greater than the length of the string the string length is used
!!! as the stop position. If the Start position greater than the stop position or the length
!!! of the string then an empty string is returned.</remarks>

StringTheory.Slice Procedure(Long pStart=1, Long pEnd=0)
  code
    if self._DataEnd = 0
        return ''
    end
    if pEnd > self._DataEnd or pEnd < 1
        pEnd = self._DataEnd
    end
    if pStart < 1
        pStart = 1
    end
    if pStart > pEnd
        return ''
    end
    return self.Value[pStart : pEnd]

!-----------------------------------------------------------------------------------
!!! <summary>Extracts a "subset" from the string and assigns stores the resultant "slice"
!!! of the string, replacing the original string with the sliced substring</summary>
!!! <param name="Start">Position of the first character to slice from</param>
!!! <param name="Stop">Position of the last character in the slice</param>
!!! <remarks>This is the same as assigning the value to a slice of itself.</remarks>
StringTheory.Crop Procedure(long pStart=1, long pEnd=0)
  code
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart < 1 then pStart = 1.
  if pStart > pEnd
    self.free()
  else
    if pEnd < self._DataEnd
      if self.UseBuffer
        if self.CleanBuffer
          stMemSet(address(self.value)+pEnd,32,self._DataEnd-pEnd)
        end
        self._DataEnd = pEnd
      else
        self.SetLength(pEnd)
      end
    end
    if pStart > 1
      self.RemoveFromPosition(1,pStart - 1)
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.MakeGuid Procedure(long pLength=16, long pFlags=st:Upper+st:Number)
  CODE
  return self.random(pLength,pFlags)

!-----------------------------------------------------------------------------------
! set Options to st:format to format the output as GuidEncoded.
! if set, then Options for GuidEncode can also be passed through here.
! generates a random string as version-4 UUIDs
StringTheory.MakeGuid4 Procedure(Long pOptions=0)
  code
  self.SetRandom(16,st:binary)
  self.value[7] = chr(40h + band(val(self.value[7]),0Fh) )
  self.value[9] = chr( 10000000b + band(val(self.value[9]),111111b) )
  if band(pOptions,st:format)
    self.GuidEncode(pOptions)
  End
  if self._dataEnd < 1
    return ''
  else
    return self.value[1:self._dataEnd]
  end

!-----------------------------------------------------------------------------------
StringTheory.SeedRandom Procedure()
s1 long,auto
  code
  stSeedRandom(bor(clock(),bshift(stGetCurrentProcessId(),24)))  ! process Id's are 16 bit, so we only get the low part of the process ID here
  loop mousex() TIMES                                            ! take some random calls off the random sequence just to add some more variability
    s1 += stRand()
  end
  loop mousey() TIMES
    s1 += stRand()
  end
!-----------------------------------------------------------------------------------
!!! <summary>Populates a string with psuedo random alpha numeric characters</summary>
!!! <param name="Length">Position of the first character to slice from</param>
!!! <param name="Stop">Position of the last character in the slice</param>
!!! <param name="pFlags">A combination of the following flags:
!!!     st:Upper       Equate(1)
!!!     st:Lower       Equate(2)
!!!     st:Number      Equate(4)
!!!     st:AlphaFirst  Equate(8)
!!!     st:Punctuation Equate(16) ! warning may not be SQL, html, or xml friendly.
!!! </param>
!!! <remarks>
!!!     If the stored string is empty or the start or end positions are invalid
!!!     then the stored string is set to an empty string. Not that is not a cryptographically
!!!     random string, it is sufficiently random for most uses.
!!! </remarks>
StringTheory.Random Procedure(long pLength=16, long pFlags=0, <String pAlphabet>)
  code
  if self.SetRandom(pLength, pFlags, pAlphabet) = st:OK
    return self.value[1 : self._DataEnd]
  else
    return ''
  end

!-----------------------------------------------------------------------------------
! same as Random, but does not return the string. The contents of the object are altered.
StringTheory.SetRandom Procedure(long pLength=16, long pFlags=0, <String pAlphabet>)
px      long, auto
s4      string('GCAT')  ! dna
s5      string('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
s6      string('abcdefghijklmnopqrstuvwxyz')
s7      string('0123456789')
s8      string('!@#$^&*()-_+={{}[]:;,.`~')
s9      string('ABCDEF0123456789')
s99     pstring(256)
sl      long, auto
  code
  self.free()
  if pLength < 1 then return st:NotOk.

  !randcrit.wait()
  if seeded = 0
    self.SeedRandom()
    seeded = TRUE
  end

  If (omitted(pAlphabet) or size(pAlphabet) = 0) and pFlags = 0 then pFlags = st:Upper.
  self.setLength(pLength)
  If self._dataEnd <> pLength
    self.ErrorTrap('Random','Unable to allocate ' & pLength & ' bytes for Random string.',true)
    !randcrit.release()
    return st:NotOK
  End
  If Band(pFlags, st:AlphaFirst)
    self.value[1] = chr(65+stRand()%26)    ! Random(65,90)
    px = 2
  Else
    px = 1
  End

  if band(pFlags, st:Binary)
    loop px = px to pLength
      self.value[px] = chr(stRand()%256)   ! Random(0,255)
    end
    !randcrit.release()
    return st:ok
  elsif band(pFlags, st:AlmostBinary)
    loop px = px to pLength
      self.value[px] = chr(1+stRand()%255) ! Random(1,255)
    end
    !randcrit.release()
    return st:ok
  else
    if band(pFlags, st:Upper)
      s99 = s5
    elsif band(pFlags, st:Dna)
      s99 = s4
    end
    if band(pFlags, st:Lower)
      s99 = s99 & s6
    end
    if band(pFlags, st:Number)
      s99 = s99 & s7
    end
    if band(pFlags, st:Punctuation)
      s99 = s99 & s8
    end
    if band(pFlags, st:Space)
      s99 = ' ' & s99
    end
    if band(pFlags, st:Hex) and band(pFlags, st:upper) = 0 and band(pFlags, st:lower) = 0 and band(pFlags, st:Number)= 0
      s99 = s99 & s9
    end
    if not omitted(pAlphabet)
      s99 = s99 & clip(pAlphabet)
    end
  end
  if s99 = ''
    s99 = s5
  end

  sl = Len(s99)
  loop px = px to self._dataEnd
    self.value[px] = s99[1+stRand()%sl]  ! Random(1, sl)
  end
  !randcrit.release()
  return st:ok

!-----------------------------------------------------------------------------------
!!! <summary>Method to dispose of dynamic memory allocated by Split method.</summary>
StringTheory.FreeLines Procedure()
i           long, auto
  code
  if self.Lines &= null
    self.Lines &= new LinesQType
    return
  end
  loop i = 1 to Records(self.Lines)
    Get(self.Lines, i)
    Dispose(self.Lines.Line)
  end
  Free(self.Lines)

!-----------------------------------------------------------------------------------
StringTheory.Free Procedure()
  code
  if self.UseBuffer and self.streamFileName &= null and self.CleanBuffer = false
    self._DataEnd = 0  ! this is the most common scenario
  else
    self.free(false,false)
  end
!-----------------------------------------------------------------------------------
StringTheory.Free Procedure(Long pLines)
  code
  if self.UseBuffer and self.streamFileName &= null and self.CleanBuffer = false
    if pLines and not self.lines &= null then self.FreeLines().
    self._DataEnd = 0
  else
    self.free(pLines,false)
  end
!-----------------------------------------------------------------------------------
!!! <summary>Internal method to dispose of string value.</summary>
StringTheory.Free Procedure(Long pLines, Long pForce)
  code
  if pLines and not self.lines &= null then self.FreeLines().
  if not self.streamFileName &= null
    self.Flush()
    if pForce     ! if pforce then cancel streaming
      dispose(self.streamFileName)
    end
  end

  if self.UseBuffer and not pForce
    if self.CleanBuffer and size(self.value)
      stMemSet(address(self.value),32,self._DataEnd)
    end
  else
    Dispose(self.value)
    self.value &= Null  ! do NOT remove this line - necessary to correctly set size()
    self.valueptr &= Null
  end
  self._DataEnd = 0

!-----------------------------------------------------------------------------------
!!! <summary>Returns the clipped length of the string (the length excluding any spaces
!!! on the end of the string.</summary>
StringTheory.ClipLen Procedure()  ! same as clipLength (code repeated to save call overhead)
x long,auto
  code
  if self._DataEnd < 1 then return 0.
  ! do in-situ to save memory (no use of stack) rather than "return len(clip(...))"
  loop x = self._DataEnd to 1 by -1
    if self.value[x] <> ' ' then break.
  end
  return x

StringTheory.ClipLen Procedure(*string pStr)  ! same as clipLength (code repeated to save call overhead)
x long,auto
  code
  if address(pStr) = 0 or size(pStr) = 0 then return 0.
  ! do in-situ to save memory (no use of stack) rather than "return len(clip(...))"
  loop x = size(pStr) to 1 by -1
    if pStr[x] <> ' ' then break.
  end
  return x

!-----------------------------------------------------------------------------------
!!! <summary>
!!!     Returns the clipped length of the string (the length excluding
!!!     any spaces on the end of the string.
!!! </summary>
StringTheory.ClipLength Procedure()
x long,auto
  code
  if self._DataEnd < 1 then return 0.
  ! do in-situ to save memory (no use of stack) rather than "return len(clip(...))"
  loop x = self._DataEnd to 1 by -1
    if self.value[x] <> ' ' then break.
  end
  return x

StringTheory.ClipLength Procedure(*string pStr)
x long,auto
  code
  if address(pStr) = 0 or size(pStr) = 0 then return 0.
  ! do in-situ to save memory (no use of stack) rather than "return len(clip(...))"
  loop x = size(pStr) to 1 by -1
    if pStr[x] <> ' ' then break.
  end
  return x

!-----------------------------------------------------------------------------------
StringTheory.FileSize Procedure (string pFileName)
rData                    like(os_WIN32_FIND_DATAA)
os_INVALID_HANDLE_VALUE  equate(-1)
ans                      real
FileName                 Cstring(256)
result                   long
  code
  Filename = clip(pFileName)
  result = stFindFirstFile(Filename,address(rdata))
  if result <> os_INVALID_HANDLE_VALUE
    ans = rData.nFileSizeHigh * MAXULONG + rData.nFileSizeLow
  else
    ans = result
  end
  return ans

!-----------------------------------------------------------------------------------
!!! <summary>Loads the specified file into memory</summary>
!!! <param name="fileName>The name of the file to read from</param>
!!! <returns>True if successful, False for errors. There ErrorTrap method will be
!!! called to allow errors to be trapped and handled</returns>
!!! <seealso>SaveFile, ErrorTrap</seealso>
StringTheory.LoadFile Procedure (string fileName,BIGINT pOffset=0, Long pLength=0, Long pRemoveBOM=false)
hFile                   long, auto
lpFileName              cstring(st:MAX_PATH+1), auto
FileSize                like(int64)
binDataLen              real
realfilesize            real
FNULL                   &int64
result                  long
Offset                  like(int64)
x  long
  code
    self.start()
    if fileName = ''
      self.winErrorCode = 0
      self.ErrorTrap('LoadFile', 'Cannot load the file, the name is blank.')
      return false
    end
    lpFileName = clip(left(fileName))
    if lpFileName[1 : 2] = '.\'
      lpFileName = longpath() & lpFileName[2 : len(lpFileName)]
    end
    if Exists(lpFileName) = 0
      self.winErrorCode = 0
      self.ErrorTrap('LoadFile', 'Cannot load the file, the file [' & lpFileName & '] does not exist.')
      return false
    end
    hFile = stCreateFile(lpFileName, st:GENERIC_READ, st:FILE_SHARE_READ + st:FILE_SHARE_WRITE, 0, st:OPEN_EXISTING, st:FILE_ATTRIBUTE_NORMAL, 0)
    if hFile = st:INVALID_HANDLE_VALUE
        self.winErrorCode = stGetLastError()
        self.ErrorTrap('LoadFile', 'Error loading the file, could not open ' & Clip(lpFileName) & '.')
        return false
    end

    If stGetFileSizeEx (hFile, FileSize)
      BinDataLen = FileSize.hi * MAXULONG + FileSize.lo
      realfilesize = BinDataLen
    End

    if BinDataLen = 0
        stCloseHandle(hFile)
        self.winErrorCode = 0
        self.ErrorTrap('LoadFile', 'Error loading the file, the file size is zero. no data to read (' & Clip(lpFileName) & ').')
        return false
    end

    If pLength < 0 then pLength = 0.
    If pLength > 0
      If pOffset > 0
        binDataLen -= pOffset
      Elsif pOffset < 0
        binDataLen = abs(pOffset)
      End
      If binDataLen > pLength then binDataLen = pLength.
    Elsif pOffset > 0
      binDataLen -= pOffset
    Elsif pOffset < 0
      If abs(pOffset) > bindatalen
        pOffset = 0
      Else
        binDataLen = abs(pOffset)
      End
    End

    If binDataLen <= 0
      stCloseHandle(hFile)
      self.winErrorCode = 0
      self.ErrorTrap('LoadFile', 'Error loading the file, the offset is greater than the file length.')
      return false
    End

    !self.trace('Loadfile: realfilesize=' & realfilesize & '  pOffset=' & pOffset & ' pLength=' & pLength )

    if pOffset < 0
      pOffset = abs(pOffset)
      ! convert to int64 as positive number
      Offset.hi = pOffset / MAXULONG
      Offset.lo = pOffset % MAXULONG

      ! use two's complement to negate the positive number (flip all the bits, and add 1)
      Offset.lo = bxor(Offset.lo,0FFFFFFFFh) ! flip all the bits
      Offset.hi = bxor(Offset.hi,0FFFFFFFFh) ! flip all the bits
      if Offset.lo = 0FFFFFFFFh
        Offset.lo = 0
        Offset.hi += 1
      else
        Offset.lo += 1
      end

      result = stSetFilePointerEx(hFile, Offset, FNULL, st:FILE_END)
    elsif pOffset > 0
      Offset.hi = pOffset / MAXULONG
      Offset.lo = pOffset % MAXULONG
      result = stSetFilePointerEx(hFile, Offset, FNULL, st:FILE_BEGIN)
    end

    self.eof = False
    If pLength >= 0 and pOffset + pLength >= realfilesize
      self.eof = True
    End

    self.base64 = 0
    self._Malloc(binDataLen)
    If self.value &= NULL
        ! Malloc failed
        stCloseHandle(hFile)
        self.winErrorCode = 0
        self.ErrorTrap('LoadFile', 'Error loading the file, not enough memory to load')
        return false
    End

    if not stReadFile(hFile, self.value, binDataLen, self.bytes, 0)
        stCloseHandle(hFile)
        self.Free(false)
        binDataLen = 0
        self.winErrorCode = stGetLastError()
        self.ErrorTrap('LoadFile', 'Error loading the file, the ReadFile API failed.')
        return false
    end

    stCloseHandle(hFile)
    self.SetEncodingFromBOM(pRemoveBOM)
    return true

!-----------------------------------------------------------------------------------
StringTheory.SetEncodingFromBOM  Procedure(Long pRemoveBOM=true)
  CODE
  if self._DataEnd > 2 and self.value[1 : 3] = '<0EFh,0BBh,0BFh>' ! utf-8 byte order mark
    if pRemoveBOM then self.RemoveFromPosition(1,3).
    self.encoding = st:EncodeUtf8
  elsif self._DataEnd > 1
    case self.value[1 : 2]
    of '<0FEh,0FFh>'   ! utf-16 byte order mark ! big-endian - would need to swap bytes to use ToAnsi etc...
      if pRemoveBOM then self.RemoveFromPosition(1,2).
      self.encoding = st:EncodeUtf16
      self.endian = st:bigEndian
    of '<0FFh,0FEh>'   ! utf-16 byte order mark ! little-endian (windows default)
      if pRemoveBOM then self.RemoveFromPosition(1,2).
      self.encoding = st:EncodeUtf16
      self.endian = st:littleEndian
    end
  end
  return self.encoding

!-----------------------------------------------------------------------------------
StringTheory.AddBOM  Procedure(Long pEncoding=-1)
  CODE
  if pEncoding = -1 then pEncoding = self.encoding.
  case pEncoding
  of st:EncodeUtf8
    if self._DataEnd < 3 or self.value[1 : 3] <> '<0EFh,0BBh,0BFh>' ! utf-8 byte order mark
      self.prepend('<0EFh,0BBh,0BFh>')
    end
  of st:EncodeUtf16
    if self.endian = st:littleEndian
      if self._DataEnd < 2 or self.value[1 : 2] <> '<0FFh,0FEh>'    ! utf-16 byte order mark
        self.prepend('<0FFh,0FEh>')
      end
    else
      if self._DataEnd < 2 or self.value[1 : 2] <> '<0FEh,0FFh>'    ! utf-16 byte order mark
        self.prepend('<0FEh,0FFh>')
      end
    end
  end

!-----------------------------------------------------------------------------------
!!! <summary>Save the current string to disk</summary>
!!! <param name="fileName">The name of the file to write to</param>
!!! <param name="pAppendFlag">If this is set to true (1) then the string is appended
!!! to the file, otherwise it overwrites the file if it exists.</param>
!!! <returns>false if not ok, true if ok</returns>
StringTheory.SaveFile Procedure (string fileName, bool pAppendFlag=false)
  code
  if self._DataEnd = 0
    return(self.SaveFile(self.value, fileName, pAppendFlag,-1))
  else
    return(self.SaveFile(self.value[1 : self._DataEnd], fileName, pAppendFlag))
  end

!-----------------------------------------------------------------------------------
! Saves the specified string to disk, either appending or
! overwriting if the file exists.
StringTheory.SaveFileA Procedure(string WriteString, string fileName, bool pAppendFlag=false)
  code
  return(self.SaveFile(writeString, fileName, pAppendFlag))

!-----------------------------------------------------------------------------------
StringTheory.SaveFile Procedure (*string writeString, string fileName, bool pAppendFlag, long dataLen=0)
hFile                   long, auto
lpFileName              cstring(st:MAX_PATH+1), auto
bytesWritten            long
writeSize               long, auto
FNULL                   &int64
Offset                  like(int64)
  code
    if fileName = ''
        self.winErrorCode = 0
        self.ErrorTrap('SaveFile', 'Cannot save the file, the file name passed is blank.')
        return false
    end

    lpFileName = Clip(left(fileName))
    hFile = stCreateFile(lpFileName, st:GENERIC_WRITE, st:FILE_SHARE_READ, 0, Choose(pAppendFlag=0, st:CREATE_ALWAYS, st:OPEN_ALWAYS), 0, 0)
    if hFile = st:INVALID_HANDLE_VALUE
        self.winErrorCode = stGetLastError()
        self.ErrorTrap('SaveFile', 'Could not save the file, the CreateFile API failed to create ' & Clip(fileName))
        return false
    end

    if dataLen < 0
      writesize = 0
    elsif dataLen = 0
      writeSize = Size(writeString)
    else
      writeSize = dataLen
    end

    if writeSize
      if pAppendFlag
        if stSetFilePointerEx(hFile, Offset, FNULL, st:FILE_END) = st:INVALID_SET_FILE_POINTER    ! Offset = 0
            stCloseHandle(hFile)
            self.winErrorCode = stGetLastError()
            self.ErrorTrap('SaveFile', 'Failed to save the file, SetFilePointer failed, so could not append.')
            return false
        end
      end

      if not stWriteFile(hFile, writeString, writeSize, bytesWritten, 0) ! (handle, data, size, *bytesWritten, overlapped)
        stCloseHandle(hFile)
        self.winErrorCode = stGetLastError()
        self.ErrorTrap('SaveFile', 'Failed to save the file, WriteFile failed to write to ' & Clip(fileName))
        return false
      end
    end
    stCloseHandle(hFile)
    return true

!-----------------------------------------------------------------------------------
StringTheory.Upper Procedure(<String pQuote>, <String pQuoteEnd>)
startquote   string(1),auto
startquoteB  byte, over(startquote)
endquote     string(1),auto
endquoteB    byte, over(endquote)
b            &byte
inquotes     long
addr         long,auto
endAddr      long,auto
  code
  if self._DataEnd < 1 then return.
  addr = address(self.value)
  endAddr = addr + self._DataEnd - 1
  if omitted(pQuote) or size(pQuote) = 0
    loop addr = addr to endAddr
      b &= (addr)    ! point at byte
      case b
      of 97 to 122   ! 'a' to 'z'
        b = toUpper(b)
      end
    end
  else
    startQuote = pQuote
    if omitted(pQuoteEnd) or size(pQuoteEnd) = 0
      endQuote = pQuote
    else
      endQuote = pQuoteEnd
    end
    loop addr = addr to endAddr
      b &= (addr)    ! point at byte
      if inquotes
        if b = endquoteB
          inquotes = 0
        end
      elsif b = startquoteB
        inquotes = 1
      else
        case b
        of 97 to 122 ! 'a' to 'z'
          b = toUpper(b)
        end
      end
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Lower Procedure(<String pQuote>, <String pQuoteEnd>)
startquote   string(1),auto
startquoteB  byte, over(startquote)
endquote     string(1),auto
endquoteB    byte, over(endquote)
b            &byte
inquotes     long
addr         long,auto
endAddr      long,auto
  code
  if self._DataEnd < 1 then return.

  addr = address(self.value)
  endAddr = addr + self._DataEnd - 1
  if omitted(pQuote) or size(pQuote) = 0
!    self.value = lower(self.value[ 1: self._DataEnd])
!    if value is large we may not have memory for a copy on the stack to do lower(), so do in situ instead:
    loop addr = addr to endAddr
      b &= (addr)    ! point at byte
      case b
      of 65 to 90    ! 'A' to 'Z'
        b = toLower(b)
      end
    end
  else
    startQuote = pQuote
    if omitted(pQuoteEnd) or size(pQuoteEnd) = 0
      endQuote = pQuote
    else
      endQuote = pQuoteEnd
    end
    loop addr = addr to endAddr
      b &= (addr)    ! point at byte
      if inquotes
        if b = endquoteB
          inquotes = 0
        end
      elsif b = startquoteB
        inquotes = 1
      else
        case b
        of 65 to 90  ! 'A' to 'Z'
          b = toLower(b)
        end
      end
    end
  end

!-----------------------------------------------------------------------------------
! set the contents of the object from ram, where the string is null terminated. either <0> or <0,0> or <0,0,0,0>
! depending on encoding.
StringTheory.SetValueByCstringAddress Procedure(long pAddress,Long pEncoding=-1)
x  long, auto
b  byte
s  short
l  long
m  long
  code
  if pAddress = 0
    self.free()
    return
  end
  x = pAddress
  if pEncoding <> -1
    self.encoding = pEncoding
  end
  loop
    case self.encoding
    of st:EncodeUtf32
      if m = 0
        peek(x,l)            ! address, destination
        if l = 0 then break. ! x points to wide null char
      end
      m += 1
      if m = 4 then m = 0.
    of st:EncodeUtf16
      if m = 0
        peek(x,s)            ! address, destination
        if s = 0 then break. ! x points to wide null char
      end
      m += 1
      if m = 2 then m = 0.
    of st:EncodeUtf8 orof st:EncodeAnsi
      peek(x,b)              ! address, destination
      if b = 0 then break.   ! x points to null char
    end
    x += 1
  end
  self.SetValueByAddress(pAddress,x-pAddress)

!-----------------------------------------------------------------------------------
!!! <summary>Returns a cstring that contains the contents of the stored string</summary>
!!! <remarks>The caller must dispose the returned cstring</remarks>
StringTheory.ToCstring Procedure()
psz         &cstring
  code
  if self._DataEnd = 0 then return ''.
  psz &= new cstring(self.clipLen(self.value[1 : self._DataEnd])+2)
  psz = clip(self.value[1 : self._DataEnd]) & '<0,0>'  ! double 0 to allow for wide-char case.
  return psz

!-----------------------------------------------------------------------------------
!!! <summary>Error handling method, called if an error occurs with information
!!!     pertaining to the error</summary>
StringTheory.ErrorTrap Procedure(string methodName, string errorMessage, byte forceLog=false)
clipLen long,auto
  code
  clipLen = self.clipLen(errorMessage)
  if clipLen < 1 then clipLen = 1.                     ! minimum length 1 char for backwards compatibility
  if size(self.LastError) <> clipLen
    dispose(self.LastError)
    self.LastError &= new string(clipLen)
  end
  self.LastError = errorMessage
  if self.logErrors or forceLog
    self.Trace(Clip(methodName) & ': ' & choose(len(self.lastError) > 0,self.LastError,''))
    if self.winErrorCode
      self.Trace('  API Error: ' & self.WinErrorCode & ': ' & Self.FormatMessage(self.WinErrorCode))
    end
  end

!-----------------------------------------------------------------------------------
StringTheory.Trace Procedure(Queue pQueue)
str  StringTheory
  code
  PushErrors()
  str.trace('Records in Queue: ' & records(pQueue))
  str.SerializeQueue(pQueue)
  str.trace()
  PopErrors()

!-----------------------------------------------------------------------------------
StringTheory.Trace Procedure(<string errMsg>)
szMsg         cString(size(errMsg)+11)
pMsg          &Cstring
  code
  PushErrors()
  if omitted(errMsg) or size(errMsg) = 0
    if self._DataEnd = 0
      szMsg = '[st][' & thread() & ']'
      stOutPutDebugString(szMsg)
    else
      pMsg &= new cstring(self._DataEnd+11)
      pMsg = '[st][' & thread() & '] ' & self.value[1 : self._DataEnd]
      stOutPutDebugString(pMsg)
      dispose(pMsg)
    end
  else
    szMsg = '[st][' & thread() & '] ' & Clip(errMsg)
    stOutPutDebugString(szMsg)
  end
  PopErrors()

!-----------------------------------------------------------------------------------
StringTheory.MD5 Procedure( Long pFormat=st:EncHex,<*String pStr>,Long pLength=0)
Digest          cstring(33),auto
RetVal          long,auto
ctxPtr          long,auto

ContextType     group, type
State             long,DIM(4)       !state (ABCD)
Count             long,DIM(2)       !number of bits, modulo 2^64 (lsb first)
MD5Buffer         byte,DIM(64)      !input buffer
                end
emptystring     string(1)

Context         group(ContextType),auto.
str             StringTheory

  code
  !compile ('****',MD5=1)
    ctxPtr = Address(Context)
    RetVal = stMD5Init(ctxPtr)
    if omitted(pStr) or (pStr = '' and pLength=0)
      If self._DataEnd > 0
        RetVal = stMD5Update(ctxPtr, self.value[1 : self._DataEnd], self._DataEnd)
      Else
        RetVal = stMD5Update(ctxPtr, emptystring, 0)
      End
    else
      If pLength <= 0 then pLength = self.clipLen(pStr).
      if pLength = 0
        RetVal = stMD5Update(ctxPtr, emptystring, 0)
      else
        RetVal = stMD5Update(ctxPtr, pStr, pLength)
      end
    end
    RetVal = stMD5Final(Digest, ctxPtr)
    str.setValue(Digest[1:16])
    case pFormat
    of st:EncNone
    of st:EncHex
      str.ToHex()
    of st:EncBase64
      str.Base64Encode()
    end
  !****
  if str._DataEnd < 1
    return ''
  else
    return str.Value[1 : str._DataEnd]
  end

!-----------------------------------------------------------------------------------
StringTheory.FormatMessage Function(long err)
winErrMessage      cstring(255)
numChars           ulong, auto
  code
  numChars = stFormatMessage(st:FORMAT_MESSAGE_FROM_SYSTEM + st:FORMAT_MESSAGE_IGNORE_INSERTS, 0, err, 0, winErrMessage, 255, 0)
  Return(Clip(winErrMessage))


!-----------------------------------------------------------!
!             Unicode processing and conversion             !
!-----------------------------------------------------------!


!-----------------------------------------------------------!
! Converts the passed ANSI string to a UTF-16 (wide) string
! The returned cstring is twice the length in bytes as the ANSI cstring is.
! Parameters:
!   strAnsi [in]: The string to convert to UTF-16
!   unicodeSize [out]: Set to the number of characters (not the number of bytes)
!       in the returned Unicode string.
! Returns
!
StringTheory.AnsiToUtf16 Procedure(*string strAnsi, *long unicodeChars, ulong CodePage=st:CP_US_ASCII)
flags              long, auto
strLen             long, auto
unicodeString      &string
  code
    strLen = Len(strAnsi)
    flags = 0
    unicodeChars = stMultiByteToWideChar(CodePage,          |       ! Code page to convert from
                                 flags,                     |       ! dwFlags
                                 strAnsi,                   |       ! Multibyte string
                                 strLen,                    |       ! Number of chars in string (-1 = auto detect)
                                 unicodeString,             |       ! Buffer for new string
                                 0)                         ! Size of buffer

    if unicodeChars = 0
        self.ErrorTrap('AnsiToUtf16', 'There is no data to convert, the string length is zero')
        unicodeChars = 0
        return unicodeString                                ! Return Null
    end

    unicodeString &= new string(unicodeChars*2)

    ! Convert to Unicode (UTF-16)
    if not stMultiByteToWideChar(CodePage, flags, strAnsi, strLen, unicodeString, unicodeChars)
        self.WinErrorCode = stGetLastError()
        self.ErrorTrap('AnsiToUtf16', 'Converting ANSI String to Unicode failed.')
        unicodeChars = 0
        Dispose(unicodeString)
        return unicodeString                               ! Return a null
    end

    return unicodeString


!-----------------------------------------------------------!
! UTF-16 to ANSI string conversion
! Parameters:
!   unicodeString: A null terminated string that contains the Unicode (wide) text (UTF-16 encoded)
!   unicodeChars: The number of Unicode characters in the string
!   ansiLen: Set to the length of the returned string that contains the ANSI text
! Returns
!   A pointer to a string that contains the ANSI version of the passed
!   Unicode (UTF-16) string. Returns Null if it fails. The caller is responsible
!   for disposing the returned pointer.
StringTheory.Utf16ToAnsi Procedure(*string unicodeString, *long ansiLen, long unicodeChars=-1, ulong CodePage=st:CP_US_ASCII)
flags              long(0)
ansi               &string
lpDefaultChar      long
lpUsedDefaultChar  long
  code
    ! Get the size required
    if unicodeChars = -1 then unicodeChars = self.chars(st:EncodeUtf16,unicodeString).
    ansiLen = stWideCharToMultiByte(CodePage,               |       ! CodePage
                                 flags,                     |       ! dwFlags
                                 unicodeString,             |       ! wide-character string
                                 unicodeChars,              |       ! number of chars in string
                                 ansi,                      |       ! buffer for new string
                                 0,                         |       ! size of buffer
                                 lpDefaultChar,             |       ! lpDefaultChar - default for unmappable chars - fastest when NULL
                                 lpUsedDefaultChar)         !  lpUsedDefaultChar - set when default char used - fastest when NULL
    if ansiLen = 0
        self.winErrorCode = stGetLastError()
        self.ErrorTrap('Utf16ToAnsi', 'Cannot convert he string to ANSI, the length is zero, or an error occured calculating the length')
        return ansi
    end

    ansi &= new string(ansiLen)

    if not stWideCharToMultiByte(CodePage, flags, unicodeString, unicodeChars, ansi, ansiLen, lpDefaultChar, lpUsedDefaultChar)
        Dispose(ansi)
        self.winErrorCode = stGetLastError()
        self.Errortrap('Utf16ToAnsi', 'Conversion from Unicode to ANSI failed')
        return ansi                                         ! Return a null
    end
    return ansi



!-----------------------------------------------------------!
! UTF-8 to UTF-16
! Parameters
!   strUtf8 [in]: A string that contains the UTF-8 string to convert to UTF-16
!   unicodeChars [out]: The number of Unicode (wide) characters in the
!       converted string (each character is 16 bits).
! Returns
!   A Pointer to a string that contains the UTF-16 encoded text, or Null
!   if an error occurs. The caller is responsible for disposing the returned
!   pointer.
StringTheory.Utf8To16 Procedure(*string strUtf8, *long unicodeChars)
strLen             long, auto
flags              long(0)
unicodeString      &string
  code
    strLen = Len(strUtf8)

    unicodeChars = stMultiByteToWideChar(st:CP_UTF8,        |! Code page to convert from
                                 flags,                     |! dwFlags
                                 strUtf8,                   |! Multibyte string
                                 strLen,                    |! Number of byte in string (-1 = auto detect for null terminated string)
                                 unicodeString,             |! Buffer for new string
                                 0)                         ! Size of buffer
    if unicodeChars = 0
        self.ErrorTrap('Utf8ToAnsi', 'There is no data to convert, the string length is zero')
        unicodeChars = 0
        return unicodeString
    end

    unicodeString &= new string(unicodeChars*2)             ! Returned string is NOT null terminated, because the length of the input string is specified

    ! Convert to Unicode (UTF-16)
    if not stMultiByteToWideChar(st:CP_UTF8, 0, strUtf8, strLen, unicodeString, unicodeChars)
        self.winErrorCode = stGetLastError()
        self.ErrorTrap('Utf8ToUtf16', 'Conversion to UTF-16 failed')
        Dispose(unicodeString)
        return unicodeString                                ! Return a null
    end

    return unicodeString


!-----------------------------------------------------------!
! UTF-16 to UTF-8 conversion
! Parameters
!   unicodeString [in]: A pointer to the UTF-16 encoded string
!   unicodeChars: The number of Unicode (wide) characters in the string.
!       note that this is the number of characters to convert, not the byte length.
!   utf8Len [out]: The length of the returned UTF-8 encoded string
! Returns
!   A pointer to a string that contains the UTF-8 encoded text, or Null in the event
!   of an error. The caller is responsible for disposing the returned pointer.
StringTheory.Utf16to8 Procedure(*string unicodeString, *long utf8Len, long unicodeChars=-1)
flags               long
lpDefaultChar       long
lpUsedDefaultChar   long
utf8                &string
n                   long,auto
  code
    if unicodeChars < 0 then unicodeChars = -1.
    if unicodeChars = 0 or unicodeChars >  Size(unicodeString)/2
      unicodeChars = Size(unicodeString)/2
    end
    if unicodeChars = -1                                    ! the string should be null terminated
      n = instring('<0,0>',unicodestring,1,1)               ! if it's not, then prevent a buffer overflow.
      if n = 0 then unicodeChars = Size(unicodeString)/2.
    end

    ! Get the size required
    utf8Len = stWideCharToMultiByte(st:CP_UTF8,             |! CodePage
                                 flags,                     |! dwFlags
                                 unicodeString,             |! wide-character string
                                 unicodeChars,              |! number of chars in string
                                 utf8,                      |! buffer for new string
                                 0,                         |! size of buffer
                                 lpDefaultChar,             |! lpDefaultChar - default for unmappable chars - fastest when NULL
                                 lpUsedDefaultChar)         !  lpUsedDefaultChar - set when default char used - fastest when NULL

    if utf8Len = 0
        self.ErrorTrap('Utf16To8', 'The passed string did not contain any text to convert, or an API error occured')
        utf8Len = 0
        return utf8
    end

    utf8 &= new string(utf8Len)

    if not stWideCharToMultiByte(st:CP_UTF8, flags, unicodeString, unicodeChars, utf8, utf8Len, lpDefaultChar, lpUsedDefaultChar)
        Dispose(utf8)
        self.WinErrorCode = stGetLastError()
        self.ErrorTrap('Utf16To8', 'Could not convert the passed string')
        utf8Len = 0
        return utf8
    end

    return utf8


!-----------------------------------------------------------!
! Convert the UTF8 string to an ANSI string
! Parameters
!   strUtf8 [in]: A string that contains the UTF-8 encoded text to convert to ANSI
!   ansiLen [out]: Set to the length of the returned ANSI string
! Returns
!   A pointer to a string that contains the ANSI encoded text if successful
!   and Null if an error occurs. The caller is reponsible for disposing the
!   returned string.
StringTheory.Utf8ToAnsi Procedure (*string strUtf8, *long ansiLen, long pCodePage=st:CP_US_ASCII)
unicodeString      &string
unicodeChars       long                             ! Number of wchar characters in the string
ansi               &string
  code
  If pCodePage = st:CP_ACP or pCodePage = st:CP_Detect Then pCodePage = self.GetCodePageFromCharset().

    ! Convert to UTF-16
    unicodeString &= self.Utf8To16(strUtf8, unicodeChars)
    if unicodeString &= null
        ansiLen = 0
        return unicodeString
    end

    ! Convert the UTF-16 string to ANSI
    ansi &= self.Utf16ToAnsi(unicodeString, ansiLen, unicodeChars, pCodePage)
    Dispose(unicodeString)
    return ansi


!-----------------------------------------------------------!
! Convert ANSI encoded text to UTF-8 encoded Unicode text
! Parameters:
!   strAnsi [in]: The ANSI encoded text to convert
!   utf8Len [out]: Set to the length of the UTF-8 encoded string returned
! Returns:
!   A pointer to a string that contains the UTF-8 encoded Unicode text
!   if successful and Null if it fails. The caller is responsible for
!   disposing the returned string.
StringTheory.AnsiToUtf8 Procedure(*string strAnsi, *long utf8Len, long pCodePage=st:CP_US_ASCII)
unicodeString      &string
unicodeSize        long                                     ! Number of wchar characters in the string
utf8               &string
  code
  If pCodePage = st:CP_ACP or pCodePage = st:CP_Detect Then pCodePage = self.GetCodePageFromCharset().
    ! Convert to UTF-16
    unicodeString &= self.AnsiToUtf16(strAnsi, unicodeSize,pCodePage)
    if unicodeString &= null
        self.Trace('AnsiToUtf8. Failed to convert to UTF-16')
        utf8Len = 0
        return unicodeString                                ! return null
    end

    ! Convert the UTF-16 string to UTF-8
    utf8 &= self.Utf16to8(unicodeString, utf8Len, unicodeSize)
    Dispose(unicodeString)
    return utf8                                             ! Return the UTF 8 string. The number of characters in the string is returned in the utf8Len parameter

!-----------------------------------------------------------!
! Backward compatibility wrapper
StringTheory.apiAnsiToUtf8 Procedure(*string strAnsi, *long utf8Len)
  code
  return self.AnsiToUtf8(strAnsi, utf8Len)


! Backward compatibility wrapper
StringTheory.apiUtf8ToAnsi Procedure (*string strUtf8, *long ansiLen)
  code
  return self.Utf8ToAnsi(strUtf8, ansiLen)


!-----------------------------------------------------------!
! Convert the current string to Ansi if it contains Unicode data.
! The .encoding property of the object must have been set to
! st:EncodeUtf8 or st:EncodeUtf16 for this method to have been
! called (or the encoding is specified in the call).
! The ToUnicode method sets this property when an ANSI
! string is converted, and this method sets the encoding to
! st:EncodeAnsi if it completes successfully.
! Returns
!   True for success, False for failure.
StringTheory.ToAnsi Procedure(long encoding=0, long pCodePage=st:CP_US_ASCII)
encVal          &string
rLen            long
  code
  if self._DataEnd < 1 then return true.
  If pCodePage = st:CP_ACP or pCodePage = st:CP_Detect Then pCodePage = self.GetCodePageFromCharset().

  if encoding
    self.encoding = encoding
  end
  self.SetEncodingFromBOM() ! remove BOM if it's there.
  case self.encoding
  of st:EncodeUtf8
    if self.Normalize(st:NFKC,false) = st:Z_DLL_ERROR
      encVal &= self.Utf8ToAnsi(self.value[1 : self._DataEnd], rLen, pCodePage)
    else                    ! will convert it to utf-16 regardless if it actually succeeded or not
      encVal &= self.Utf16ToAnsi(self.value[1 : self._DataEnd], rLen, , pCodePage)
    end
  of st:EncodeUtf16
    self.LittleEndian()     ! in case the string is BigEndian
    self.Normalize(st:NFKC)
    encVal &= self.Utf16ToAnsi(self.value[1 : self._DataEnd], rLen, , pCodePage)
  else
    return False
  end
  if encVal &= null
    return False
  end
  self._StealValue(encVal)
  self.encoding = st:EncodeAnsi
  return True

!-----------------------------------------------------------!
! utf-8 to ansi is expensive because the whole string is converted to utf-16 first.
! this version of the method breaks the string into substrings, then converts the sub-strings
! so using much less memory, at the cost of longer processing times.
StringTheory.ToAnsi Procedure(long encoding=0, long pCodePage=st:CP_US_ASCII,Long pBlockSize)
str       StringTheory
utfSpos   long, auto
utfEpos   long, auto
ansiEpos  long, auto
utfLength Long, auto
  code
  if encoding <> st:EncodeUtf8
    return(self.ToAnsi(encoding,pCodePage))
  end
  If pCodePage = st:CP_ACP or pCodePage = st:CP_Detect Then pCodePage = self.GetCodePageFromCharset().
  if pBlockSize <= 1 then pBlockSize = 10. ! 1 meg minimum, 10 megs default
  if pBlockSize > 50 then pBlockSize = 50. ! 1 meg minimum, 10 megs default
  pBlockSize = pBlockSize * 1000000        ! incoming pWorkingSize is in megs
  utfLength = self._DataEnd
  if utfLength <= pBlockSize
    return(self.ToAnsi(encoding,pCodePage))
  end

  ansiEpos = 0
  utfSpos = 1
  utfEpos = utfSpos + pBlockSize - 1
  loop
    if utfSpos > utfLength then break.
    if utfEpos > utfLength
      utfEpos = utfLength
    else
      do CheckEpos
    end
    str.SetValue(self.value[ utfSpos : utfEpos ])
    str.ToAnsi(encoding,pCodePage)
    if str._DataEnd > 0
      if self._DataEnd < ansiEpos + str._DataEnd
        self.SetLength(ansiEpos + str._DataEnd)
      end
      self.value[ ansiEpos + 1 : ansiEpos + str._DataEnd ] = str.value[1 : str._DataEnd]
      ansiEpos += str._DataEnd
    end
    utfSpos = utfEpos + 1
    utfEpos = utfSpos + pBlockSize - 1
  end
  self.SetLength(ansiEpos)

! want to make the break at the end of a character, utf or ansi.
! TODO - check to make sure the boundary does not split in the middle a run of code points that would be altered by normalize
CheckEpos  routine
  loop
    if utfEpos > utfLength then break.
    if band(val(self.value[utfEpos]),10000000b) = 0            ! found 1 byte char
      ! utfEpos is fine
    elsif band(val(self.value[utfEpos]),11100000b) = 11000000b ! found first char in 2 char pair
      utfEpos += 1
    elsif band(val(self.value[utfEpos]),11110000b) = 11100000b ! found first char in 3 char pair
      utfEpos += 2
    elsif band(val(self.value[utfEpos]),11111000b) = 11110000b ! found first char in 4 char pair
      utfEpos += 3
    else
      utfEpos += 1
      cycle
    end
    break
  end

!-----------------------------------------------------------!
! Converts the stored text to Unicode
! using either UTF-8 or UTF-16 encoding
StringTheory.ToUnicode Procedure(long encoding=st:EncodeUtf8, long pCodePage=st:CP_US_ASCII)
encVal          &string
rLen            long
  code
  if self._DataEnd < 1 then return true.
  If pCodePage = st:CP_ACP or pCodePage = st:CP_Detect Then pCodePage = self.GetCodePageFromCharset().
  case self.encoding
  of st:EncodeUtf8 ! currently utf-8
    case encoding
    of st:EncodeUtf16
      encVal &= self.Utf8To16(self.value[1: self._DataEnd],rLen) ! convert utf-8 to utf-16
      self.Endian = st:littleEndian
    end
  of st:EncodeUtf16 ! currently utf-16
    case encoding
    of st:EncodeUtf8                                               ! Convert to UTF-8
       self.LittleEndian()
       encVal &= self.Utf16To8(self.value[1: self._DataEnd],rLen)  ! convert utf-16 to utf-8
    end
  else                                                             ! currently ANSI
    case encoding
    of st:EncodeUtf8                                               ! Convert to UTF-8
      encVal &= self.AnsiToUtf8(self.value[1: self._DataEnd], rLen, pCodePage)
    of st:EncodeUtf16                                              ! Convert to UTF-16
      encVal &= self.AnsiToUtf16(self.value[1: self._DataEnd], rLen,pCodePage)
      self.Endian = st:littleEndian
    else
      self.Trace('ToUnicode: invalid encoding')
      return False
    end
  end
  if encVal &= null
    ! did nothing, so leave string as-is
  else
    self._stealValue(encVal)
    encVal &= null
    self.encoding = encoding
  end
  return True

!-----------------------------------------------------------!
!!! <summary>
!!!   Takes a Unicode UTF-16 number (0-1114111) and returns a utf-8 string of 1 to 4 chars long
!!! </summary>
!!! <returns>
!!! Returns a string of rLen bytes containing the utf-8 encoding of the utf-16 number.
!!! </returns>
!-----------------------------------------------------------!
StringTheory.Utf16ToUtf8Char      Procedure (String p_utf16Char,*Long rLen)
returnValue  string(4)
sutf         string(4)
nutf         long,over(sutf)
  code
  sutf = sub(p_utf16Char,1,2) & '<0,0,0,0>'
  case nutf
  of 0 to 127
    rlen = 1
    return chr(nutf)
  of 128 to 2047
    returnvalue[1] = chr(11000000b + band(bshift(nutf,-6) ,11111b))
    returnvalue[2] = chr(10000000b + band(nutf,111111b))
    rlen = 2
    return returnvalue[1:2]
  of 2048 to 65535
    returnvalue[1] = chr(11100000b + bshift(nutf,-12))
    returnvalue[2] = chr(10000000b + band(bshift(nutf,-6) ,111111b))
    returnvalue[3] = chr(10000000b + band(nutf,111111b))
    rlen = 3
    return returnvalue[1:3]
  of 65536 to 1114111
    returnvalue[1] = chr(11110000b + bshift(nutf,-24))
    returnvalue[2] = chr(10000000b + band(bshift(nutf,-12) ,111111b))
    returnvalue[3] = chr(10000000b + band(bshift(nutf,-6) ,111111b))
    returnvalue[4] = chr(10000000b + band(nutf,111111b))
    rlen = 4
    return returnvalue[1:4]
  end
  return ''

!-----------------------------------------------------------!
StringTheory.IsValidUtf8     Procedure()
buffer  string(10) ,auto
error   long       ,auto
x       long       ,auto
  code
  if self._DataEnd = 0 then return true.
  x = stMultiByteToWideChar(st:CP_UTF8, st:MB_ERR_INVALID_CHARS, self.value, self._dataend, buffer, 0) ! will return 0 or string length required to convert
  Error = stGetLastError()    ! should be st:ERROR_INSUFFICIENT_BUFFER if utf-8 is valid.
  if Error = st:ERROR_NO_UNICODE_TRANSLATION then  return false.
  return true

!-----------------------------------------------------------!
StringTheory.FindEndOfString  Procedure(Long pEncoding, Long pStringAddress, Long pMaxLength=255)
ans long
s1  string(1)
s2  string(2)
  code
  s1 = '<0>'
  s2 = '<0,0>'
  if pStringAddress = 0 then return 0.
  case pEncoding
  of st:EncodeAnsi
  orof st:EncodeUtf8
    ans = self.FindCharsAddr(s1, pStringAddress, pMaxLength)!,long
  of st:EncodeUtf16
    ans = self.FindCharsAddr(s2, pStringAddress, pMaxLength)!,long
  end
  if ans = 0 then ans = pMaxLength.
  return ans

!-----------------------------------------------------------!
StringTheory.Chars      Procedure(Long pEncoding=-1, <String pStr>)
ans  long
x    long
  CODE
  if pEncoding = -1 then pEncoding = self.encoding.
  if omitted(pStr) or size(pStr) = 0
    case pEncoding
    of st:EncodeUtf8
      loop x = 1 to self._DataEnd
        if band(val(self.value[x]),10000000b) = 0 or band(val(self.value[x]),11000000b) = 11000000b
          ans += 1
        end
      end
    of st:EncodeUtf16
      ans = self._DataEnd / 2
    else
      ans = self._DataEnd
    end
  ELSE
    case pEncoding
    of st:EncodeUtf8
      loop x = 1 to size(pStr)
        if band(val(pStr[x]),10000000b) = 0 or band(val(pStr[x]),11000000b) = 11000000b
          ans += 1
        end
      end
    of st:EncodeUtf16
      ans = size(pStr) / 2
    else
      ans = size(pStr)
    end
  End
  return ans
!-----------------------------------------------------------!
StringTheory.MatchBrackets  Procedure(String pLeftBracket, String pRightBracket, Long pStart=1)
ans     long
depth   long
x       long,auto
lb1     string(1)   ! first char of left bracket
rb1     string(1)   ! first char of right bracket
lOffset long,auto   ! length of left bracket less 1
rOffset long,auto   ! length of right bracket less 1
  code
  lOffset = size(pLeftBracket) - 1
  rOffset = size(pRightBracket) - 1
  if lOffset < 0 or rOffset < 0 or self._DataEnd < size(pLeftBracket) + size(pRightBracket) then return 0.
  if pStart < 1 then pStart = 1.

  if lOffset or rOffset      ! multi-character tokens/brackets?
    lb1 = pLeftBracket[1]
    rb1 = pRightBracket[1]
    loop x = pStart to self._DataEnd
      if self.value[x] = lb1 and (lOffset = 0 or (x+lOffset <= self._DataEnd and self.value[x : x+lOffset] = pLeftBracket))
        depth += 1
        x += lOffset
      elsif depth and self.value[x] = rb1 and (rOffset = 0 or (x+rOffset <= self._DataEnd and self.value[x : x+rOffset] = pRightBracket))
        depth -= 1
        if depth = 0
          ans = x
          break
        end
        x += rOffset
      end
    end
  else
    loop x = pStart to self._DataEnd
      if self.value[x] = pLeftBracket
        depth += 1
      elsif depth and self.value[x] = pRightBracket
        depth -= 1
        if depth = 0
          ans = x
          break
        end
      end
    end
  end
  return ans

!-----------------------------------------------------------!
StringTheory.Normalize  Procedure(Long pForm=st:NFKD,Long pPreserveEncoding=true)
srcChars      long
SizeEstimated long
Error         ulong
nullstr       &String
destString    &String
enc           Long
  Code
  if pPreserveEncoding and self.encoding = st:EncodeAnsi then return st:ok.
  if self._DataEnd < 1 then return st:ok.
  self.LoadNormalize()
  if fp_NormalizeString = 0 then return st:Z_DLL_ERROR.
  enc = self.encoding
  self.ToUnicode(st:EncodeUtf16)
  srcChars = self.Chars()
  if srcChars = 0 then return ''.
  SizeEstimated = stNormalizeString(pForm, self.value[1 : self._DataEnd], srcChars, nullstr, 0)
  loop 10 times
    Error = 0   ! if error already set then reset error and try again
    dispose(deststring)
    deststring &= new(String(SizeEstimated*2))
    if deststring &= null and SizeEstimated then return st:notOK. ! out of memory?
    SizeEstimated = stNormalizeString(pForm, self.value[1 : self._DataEnd], srcChars, deststring, SizeEstimated)
    if SizeEstimated > 0 then break.                              ! success
    Error = stGetLastError()
    if Error = st:ERROR_INSUFFICIENT_BUFFER then break.           ! Failed
    SizeEstimated = -SizeEstimated                                ! New guess is negative of the return value.
  End
  if Error
    dispose(destString)
    return st:notOk
  end

  if SizeEstimated
    if self.UseBuffer
      dispose(self.value)
      self.value &= destString
      self.valuePtr &= self.value
      self._DataEnd = choose(size(self.value) < SizeEstimated*2,size(self.value),SizeEstimated*2)
      destString &= null
      if self.CleanBuffer and self._dataEnd < size(self.value)
        stMemSet(address(self.value)+self._DataEnd,32,size(self.value) - self._dataEnd)
      end
    else
      self.setValue(destString[1 : choose(size(destString) < SizeEstimated*2,size(destString),SizeEstimated*2)])
      dispose(destString)
    end
    if pPreserveEncoding and enc <> self.encoding
      case enc
        of st:EncodeUtf8
          self.ToUnicode(st:EncodeUtf8)
      end
    end
  else
    dispose(destString)
  end
  return st:ok

!-----------------------------------------------------------!
!!! <summary>
!!!     Converts the passed Base 10 (decimal) integer to the specified
!!!     base (hexadecimal by default). Does not support bases above 36.
!!! </summary>
!!! <returns>
!!!     Returns a string containing the number in the base specified.
!!!     This converts the entire number to the new base, rather than each byte.
!!!     To convert each byte to hex use the ByteToHex, LongToHex and StringToHex methods.
!!! </returns>
StringTheory.DecToBase  Procedure(long num, long base=16, long lowerCase=1)
remainder       long, auto
newNum          string(33)  ! allow extra char for possible '-' at start
x               long(size(newNum))
result          long, auto
alphas          string('0123456789abcdefghijklmnopqrstuvwxyz')
negative        byte
  code
  if num = 0 or base < 2 or base > 36 then return '0'.
  if num < 0
    negative = true
    num = abs(num)
  end
  result = num
  if lowerCase = false
    alphas = upper(alphas)
  end
  loop while result
    result = num / base
    remainder = num - (result * base) ! faster than num%base (one division is enough!)
    num = result
!?   assert(x > 0)
    newNum[x] = alphas[remainder+1]   ! Prefix the string with the next remainder
    x -= 1
  end
  if negative
    newNum[x] = '-'
    x -= 1
  end
  return newNum[x+1 : size(newNum)]

! ----------------------------------------------------------------------------------
!!! <summary>
!!!     Converts the passed integer to base 10 (decimal)
!!!     Supports bases up to 36.
!!! <summary>
!!! <returns>
!!!     Returns a long that contains the decimal (base 10) integer
!!!     of the number passed. Invalid numbers will return 0.
!!! </returns>
!!! <remarks>The pass string is treated as a single big endian number,
!!!     with the first digit in the string being the most significant.
!!! </remarks>
StringTheory.BaseToDec  Procedure (string num, long base=16)
decNum          long
power           long auto
dVal            long
i               long, auto
negative        byte
  code
  if num = '' or base < 2 or base > 36 then return 0.
  num = left(num)
  if num[1] = '-'
    negative = true
    num[1] = ' '
    num = left(num)
  end
  if num = '' or num = '0' then return 0.

  power = 1
  loop i= self.clipLen(num) to 1 by -1
    dval = val(num[i])
    case dVal
    of 48 to 57                 ! '0' to '9'
      dVal -= 48
    of 97 to 122                ! 'a' to 'z'
      dval -= 87
    of 65 to 90                 ! 'A' to 'Z'
      dval -= 55
    else
      cycle                     ! dval = 0  ! changed in 2.70, invalid chars are ignored as below.
    end
    if dVal > base then cycle.  ! digit out of range, so ignore
    decNum += (dVal * power)
    power = power * base        ! Move to the next power of the base
  end
  if negative then decNum = -decNum.
  return decNum

! ----------------------------------------------------------------------------------
!!! <summary>Decodes /xHH and /UHHHH into appropriate characters in an ANSI string.
!!! <summary>
!!! <returns>Nothing. The current string is altered.
!!! </returns>
!!! <remarks>Assumes the current string value is in ANSI, and the result should
!!! be converted to ANSI.
!!! </remarks>
StringTheory.DecodeHexInline      Procedure (long pCodePage=st:CP_US_ASCII, long pEncoding=-1)
  CODE
  If pCodePage = st:CP_ACP or pCodePage = st:CP_Detect Then pCodePage = self.GetCodePageFromCharset().
  self.DecodeHexInline('\x',2,pCodePage,pEncoding)
  self.DecodeHexInline('\u',4,pCodePage,pEncoding)

! ----------------------------------------------------------------------------------
!!! <summary>Decodes /[pid][H..H] into appropriate characters in an ANSI string.
!!! <summary>
!!! <returns>Nothing. The current string is altered.
!!! </returns>
!!! <remarks>Assumes the current string value is in ANSI, and the result should
!!! be converted to ANSI.
!!! </remarks>
StringTheory.DecodeHexInline      Procedure (string pId, long pLength, long pCodePage, long pEncoding=-1)
n         Long,auto
idClipLen long,auto
v         ulong,auto
vs        string(4),over(v)
vl        long
u8text    string(4),auto
ansitext  &string
  CODE
  idClipLen = self.clipLen(pId)
  if idClipLen = 0 then return.
  If pCodePage = st:CP_ACP or pCodePage = st:CP_Detect Then pCodePage = self.GetCodePageFromCharset().
  Loop
    n = self.findChars(pId[1 : idClipLen])                        ! find the indicator
    If n = 0 then break.
    v = self.BaseToDec(self.sub(n + idClipLen,pLength))           ! decode the following chars into a number
    If pLength = 2
      self.replaceSlice(n,n+idClipLen+pLength-1,vs[1])
    Elsif pLength = 4
      If pEncoding = -1 then pEncoding = self.encoding.
      case pEncoding
      of st:EncodeAnsi
        ansitext &= self.Utf16ToAnsi(vs,vl,1,pCodePage)             ! convert that result from utf-16 to ansi
        self.replaceSlice(n,n+idClipLen+pLength-1,ansitext[1])      ! inject the ansi into the string
        dispose(ansitext)
      of st:EncodeUtf8
        u8text = self.Utf16ToUtf8Char(vs,vl)
        self.replaceSlice(n,n+idClipLen+pLength-1, u8text[1 : vl] )
      of st:EncodeUtf16
        break
      else
        break
      End
    End
  End
  return

! ----------------------------------------------------------------------------------
!!! <summary>
!!!     Converts a single byte to hex
!!! </summary>
StringTheory.ByteToHex Procedure (byte pByte)
hex                     string(2), auto
hexChars                string('0123456789abcdef')
  code
  hex[1] = hexChars [bshift(pbyte, -4) + 1]
  hex[2] = hexChars [band(pbyte, 0fh) + 1]
  return hex

! ----------------------------------------------------------------------------------
StringTheory.HexToByte Procedure(string hexVal)
  code
  if size(hexVal) > 0 and size(hexVal) < 3
    return self.BaseToDec(hexVal,16)
  end
  return 0

! ----------------------------------------------------------------------------------
!!! <summary>
!!!     Converts a long of 4 bytes to hex
!!! </summary>
StringTheory.LongToHex  procedure (long pLong)
hex                     string(8), auto
inb                     byte, dim(4), over(plong)
  code
  hex[1 : 2] = self.ByteToHex(inb[4])
  hex[3 : 4] = self.ByteToHex(inb[3])
  hex[5 : 6] = self.ByteToHex(inb[2])
  hex[7 : 8] = self.ByteToHex(inb[1])
  return hex

! ------------------------------------------------------------------------------------------
StringTheory.StringToHex Procedure (string binData,Long pLen =0,Long pCase=0)
  code
  return self.StringToHex(binData, pLen, pCase)

StringTheory.StringToHex Procedure (*string binData,Long pLen =0,Long pCase=0)
hex             &string
i               long, auto
j               long, auto
  code
  if pLen = 0 then pLen = self.clipLen(binData).
  if pLen = 0
    return hex                                         ! null
  end

  hex &= new string(pLen * 2)                          ! Need two characters for each byte
  j = 1
  loop i = 1 to pLen
    hex[j : j + 1] = self.ByteToHex(Val(binData[i]))   ! lower case
    j += 2
  end
  case pCase
  of st:Upper
    hex = upper(hex)
  else ! of st:Lower
    hex = lower(hex)
  end
  return hex

! ------------------------------------------------------------------------------------------
StringTheory.HexToString Procedure (string hexData)
bin             &string
bin2            &string
i               long, auto
j               long, auto
firstinpair     string(1)
discarded       long
  code
  if size(hexData) = 0
    return bin
  end
  bin &= new string(size(hexData)/2)                       ! Hex uses two characters for each byte
  j = 0
  loop i = 1 to size(hexData)
    case val(hexdata[i])
    of   65 to 70  ! 'A' to 'F'
    orof 97 to 102 ! 'a' to 'f'
    orof 48 to 57  ! '0' to '9'
      if firstinpair
        j += 1
        bin[j] = Chr(self.BaseToDec(firstinpair & hexdata[i]))
        firstinpair = ''
      else
        firstinpair = hexdata[i]
      end
    else
      discarded += 1
    end
  end
  if j
    if discarded
      bin2 &= new string(j)
      bin2 = bin
    else
      return bin
    end
  end
  dispose(bin)
  return bin2

!----------------------------------------------------------------------------------
!!! <summary>
!!!     Converts the stored string to a hexidecimal representation
!!!     each byte is converted to the hex equivilent. The resultant
!!!     string is twice the length (each byte requires two characters
!!!     to represent it).
!!! </summary>
StringTheory.ToHex Procedure (Long pCase=0,Long pSpacer=0)
hex     &string
  code
  If self._DataEnd < 1 then return.
  hex &= self.StringToHex(self.value[1 : self._DataEnd],self._DataEnd,pCase)
  if hex &= null
    self.free()
  else
    self._StealValue(hex)
    if pSpacer then self.InsertEvery(2,' ').
  end

!----------------------------------------------------------------------------------
StringTheory.FromHex Procedure ()
bin         &string
  code
  If self._DataEnd < 1 then return.
  bin &= self.HexToString(self.value[1 : self._DataEnd])
  if bin &= null
    self.free()
  else
    self._StealValue(bin)
  end

!----------------------------------------------------------------------------------
!!! <summary>
!!!   breaks the text into multiple lines,
!!!   on a natural whitespace section,
!!!   based on the length passed in.
!!! </summary>
StringTheory.WrapText Procedure(long wrapAt=80, bool keepExistingBreaks=true, bool pleft=false)
i       long,auto
j       long,auto
len     long,auto
recs    long,auto
wrapPos long,auto
st      StringTheory
  code

  if wrapAt < 1 then return.                                      ! Invalid line length
  if wrapAt >= self._DataEnd and keepExistingBreaks then return.  ! text too short to wrap

  ! first get rid of extraneous spaces and tabs at the end of lines
  loop
    if self.replace('<32,13,10>','<13,10>',,,,,true) = 0 and |
       self.replace('<9,13,10>','<13,10>',,,,,true) = 0
      break
    end
  end

  if pleft
    ! get rid of spaces and tabs at the start of lines
    self.setLeft(, st:spaces+st:tabs)
    self.clip('<32,9>')                         ! handles last line
    loop
      if self.replace('<13,10,32>','<13,10>',,,,,true) = 0 and |
         self.replace('<13,10,9>','<13,10>',,,,,true) = 0
        break
      end
    end
  end

  if not keepExistingBreaks
    ! check if there are any blank lines - we keep these breaks for formatting new paragraphs etc.
    if self.FindChars('<0,34,1,4>') = 0 and self.FindChars('<13,10,13,10,251,3>') = 0
      i = self.replace('<13,10,13,10>','<0,34,1,4>')
      if i
        j = self.replace('<0,34,1,4,13,10>','<0,34,1,4,251,3>')
      else
        j = 0
      end
      self.replace('<13,10> ',' ')
      self.replace('<13,10>',' ')
      if j
        self.replace('<0,34,1,4,251,3>','<13,10,13,10,13,10>')
      END
      if i
        self.replace('<0,34,1,4>','<13,10,13,10>')
      end
    end
  end

  self.Split('<13,10>')

  recs = self.Records()

  loop i = 1 to recs
    st.SetValue(self.GetLine(i))
    if pleft
      len = st._DataEnd
      st.setLeft(, st:spaces+st:tabs)                          ! get rid of spaces and tabs at start of line
      st.clip('<32,9>')                                        ! get rid of spaces and tabs at end of line
      if len <> st._DataEnd
        if st._DataEnd > 0
          self.SetLine(i, st.value[1 : st._DataEnd])           ! replace changed line in queue
        else
          self.SetLine(i, '')                                  ! replace changed line in queue
        end
      end
    end

    if st._DataEnd <= wrapAt then cycle.                       ! no need to shorten line

    wrapPos = 0
    loop j = 2 to st._DataEnd - 1
      if st.value[j] = ' ' or st.value[j] = '<9>'              ! if space or tab
        if j > wrapAt + 1
          if not wrapPos
            wrapPos = j                                        ! no earlier wrap position so wrap here despite being after wrapAt
          end
          break
        else
          wrapPos = j                                          ! store potential wrap position
          if j > wrapAt
            break
          end
        end
      end
    end
    if wrapPos                                                 !and wrapPos < st._DataEnd            ! do we need to wrap?
      self.AddLine(i, st.value[1 : wrapPos - 1])               ! add line with first part of string
      recs += 1
      self.SetLine(i + 1, st.value[wrapPos + 1 : st._DataEnd]) ! replace existing line with remainder of string
    end
  end

  self.join('<13,10>')                                         ! we join the lines back together

!!! <summary>Safe copy between two strings. Does bounds checking
!!!     and truncates the output if the string is not large enough
!!!     to contain it.
!!! </summary>
!!! <param name=""
!!! <returns>
!!!     Returns 0 for success, -1 for failure, and if the destination
!!!     string is too small to contain all the data, the size required
!!!     is returned.
!!! </returns>
StringTheory.StrCpy Procedure(*string pIn, *string pOut, bool pClip = true)
sLen        long, auto
dLen        long, auto
  code
    if pClip
        sLen = self.clipLen(pIn)
    else
        sLen = Len(pIn)
    end
    dLen = Len(pOut)

    if dLen = 0
        return -1
    elsif sLen = 0
        Clear(pOut)
        return 0
    end

    pOut = pIn           ! Truncation will occur naturally - no need for "safe" string slicing, also clipping achieves nothing
    return Choose(sLen > dLen, slen, 0)

!----------------------------------------------------------!
! Conversion functions. Push the data into the string as a series of bytes values
! so that no typecasting is done.
!
! Ideally this could be done with a single method that takes a *? parameter, however because of the
! way that ANYs work in Clarion this is not possible; Clarion doesn't provide a void* equivilent
! and passing a long that stores the address requires the call to pass Address(param)
!----------------------------------------------------------
StringTheory.ToBytes Procedure(*long pSrc, *string pDest, long pOffset=1)
sVal        string(size(pSrc)), over(pSrc)
  code
  if pOffset < 1 then pOffset = 1 .
  If pOffset + size(pSrc) - 1 <=  size(pDest)
    pDest[pOffset : pOffset + size(pSrc) - 1]  = sVal
  End
!----------------------------------------------------------
StringTheory.ToBytes Procedure(*ulong pSrc, *string pDest, long pOffset=1)
sVal        string(size(pSrc)), over(pSrc)
  code
  if pOffset < 1 then pOffset = 1 .
  If pOffset + size(pSrc) - 1 <=  size(pDest)
    pDest[pOffset : pOffset + size(pSrc) - 1]  = sVal
  End
!----------------------------------------------------------
StringTheory.ToBytes Procedure(*short pSrc, *string pDest, long pOffset=1)
sVal        string(Size(pSrc)), over(pSrc)
  code
  if pOffset < 1 then pOffset = 1 .
  If pOffset + size(pSrc) - 1 <=  size(pDest)
    pDest[pOffset : pOffset + size(pSrc) - 1]  = sVal
  End
!----------------------------------------------------------
StringTheory.ToBytes Procedure(*ushort pSrc, *string pDest, long pOffset=1)
sVal        string(size(pSrc)), over(pSrc)
  code
  if pOffset < 1 then pOffset = 1 .
  If pOffset + size(pSrc) - 1 <=  size(pDest)
    pDest[pOffset : pOffset + size(pSrc) - 1]  = sVal
  End
!----------------------------------------------------------
StringTheory.ToBytes Procedure(*byte pSrc, *string pDest, long pOffset=1)
sVal        string(Size(pSrc)), over(pSrc)
  code
  if pOffset < 1 then pOffset = 1 .
  If pOffset + size(pSrc) - 1 <=  size(pDest)
    pDest[pOffset : pOffset + size(pSrc) - 1]  = sVal
  End
!----------------------------------------------------------
! When a decimal is passed by reference Size() cannot be used
! for an Over(), so the data has the be Peek'd (or memcpy'd)
StringTheory.ToBytes Procedure(*decimal pSrc, *string pDest, long pOffset=1)
  code
  Peek(Address(pSrc), pDest[pOffset])
!----------------------------------------------------------
StringTheory.ToBytes Procedure(*real pSrc, *string pDest, long pOffset=1)
sVal        string(Size(pSrc)), over(pSrc)
  code
  if pOffset < 1 then pOffset = 1 .
  If pOffset + size(pSrc) - 1 <=  size(pDest)
    pDest[pOffset : pOffset + size(pSrc) - 1]  = sVal
  End
!----------------------------------------------------------
StringTheory.ToBytes Procedure(*sreal pSrc, *string pDest, long pOffset=1)
sVal        string(Size(pSrc)), over(pSrc)
  code
  if pOffset < 1 then pOffset = 1 .
  If pOffset + size(pSrc) - 1 <=  size(pDest)
    pDest[pOffset : pOffset + size(pSrc) - 1]  = sVal
  End
!----------------------------------------------------------!
! Note that the *string and *cstring variants are essentially just assignments (direct copies).
! They are provided for convenience so that the caller doesn't have to differeniate between data types - the
! ToBytes and FromBytes methods can be called regardless of what data type is being handled.
!----------------------------------------------------------!
StringTheory.ToBytes Procedure(*cstring pSrc, *string pDest, long pOffset=1)
  code
  pDest = sub(pSrc,pOffset,size(pSrc))
!----------------------------------------------------------!
StringTheory.ToBytes Procedure(*pstring pSrc, *string pDest, long pOffset=1)
  code
  pDest = sub(pSrc,pOffset,size(pSrc))
!----------------------------------------------------------!
StringTheory.ToBytes Procedure(*string pSrc, *string pDest, long pOffset=1)
  code
  pDest = sub(pSrc,pOffset,size(pSrc))
!----------------------------------------------------------!
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *long pDest, long pOffset=1)
sVal        string(size(pDest)), over(pDest)
  code
  if pOffset < 1 then pOffset = 1.
  sVal = sub(pSrc,pOffset,size(pDest))
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *ulong pDest, long pOffset=1)
sVal        string(size(pDest)), over(pDest)
  code
  if pOffset < 1 then pOffset = 1.
  sVal = sub(pSrc,pOffset,size(pDest))
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *short pDest, long pOffset=1)
sVal        string(size(pDest)), over(pDest)
  code
  if pOffset < 1 then pOffset = 1.
  sVal = sub(pSrc,pOffset,size(pDest))
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *ushort pDest, long pOffset=1)
sVal        string(size(pDest)), over(pDest)
  code
  if pOffset < 1 then pOffset = 1.
  sVal = sub(pSrc,pOffset,size(pDest))
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *byte pDest, long pOffset=1)
sVal        string(size(pDest)), over(pDest)
  code
  if pOffset < 1 then pOffset = 1.
  sVal = sub(pSrc,pOffset,size(pDest))
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *decimal pDest, long pOffset=1)
  code
  if pOffset < 1 then pOffset = 1.
  if pOffset + size(pDest) - 1 > size(pSrc)
    pDest = 0
  Else
    Peek(Address(pSrc)+pOffset-1, pDest)
  End
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *real pDest, long pOffset=1)
sVal        string(size(pDest)), over(pDest)
  code
  if pOffset < 1 then pOffset = 1.
  sVal = sub(pSrc,pOffset,size(pDest))
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *sreal pDest, long pOffset=1)
sVal        string(size(pDest)), over(pDest)
  code
  if pOffset < 1 then pOffset = 1.
  sVal = sub(pSrc,pOffset,size(pDest))
!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *cstring pDest, long pOffset=1)
  code
  pDest = sub(pSrc,pOffset,size(pSrc))

!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *string pDest, long pOffset=1)
  code
  pDest = sub(pSrc,pOffset,size(pSrc))

!----------------------------------------------------------!
StringTheory.FromBytes Procedure (*string pSrc, *pstring pDest, long pOffset=1)
  code
  pDest = sub(pSrc,pOffset,size(pSrc))
!----------------------------------------------------------!
! Store the passed parameter as bytes in the StringTheory object. The bytes are copied directly without any type
! conversion. For example this allows a long to be be stored in a 4 byte string by call SetBytes followed by
! GetBytes to retrieve the value.
!
! Unfortunately this cannot be done with a single method that takes a ?* because of Clarion's storage of
! the ANY type and there is no void*  equivilent.
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*long pSrc)
sVal        string(Size(pSrc)), over(pSrc)
  code
  self.SetValue(sVal)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*ulong pSrc)
sVal        string(Size(pSrc)), over(pSrc)
  code
  self.SetValue(sVal)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*short pSrc)
sVal        string(Size(pSrc)), over(pSrc)
  code
  self.SetValue(sVal)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*ushort pSrc)
sVal        string(Size(pSrc)), over(pSrc)
  code
  self.SetValue(sVal)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*byte pSrc)
sVal        string(Size(pSrc)), over(pSrc)
  code
  self.SetValue(sVal)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*decimal pSrc)
dLen        long
  code
  dLen = Size(pSrc)
  self.SetLength(dLen)
  self.ToBytes(pSrc,self.value)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*real pSrc)
sVal        string(Size(pSrc)), over(pSrc)
  code
  self.SetValue(sVal)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*sreal pSrc)
sVal        string(Size(pSrc)), over(pSrc)
  code
  self.SetValue(sVal)
!----------------------------------------------------------!
! The string methods are a direct assignment the same as calling SetValue. They are provided for
! convenience so that the caller doesn't handle to handle different data types (for example when
! processing all data in a structure such as a File, Group or Queue).
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*cstring pVal)
  code
  self.SetValue(pVal)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*string pVal)
  code
  self.SetValue(pVal)
!----------------------------------------------------------!
StringTheory.SetBytes Procedure (*pstring pVal)
  code
  self.SetValue(pVal)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*long pDest, long pOffset=1)
  code
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*ulong pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*short pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*ushort pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*byte pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*decimal pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*real pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*sreal pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*cstring pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*string pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
StringTheory.GetBytes Procedure (*pstring pDest, long pOffset=1)
  code
  if self._DataEnd = 0 then return.
  self.FromBytes(self.value, pDest, pOffset)
!----------------------------------------------------------!
! General handling method that provide byte storage for any data type.
StringTheory.SetBytes Procedure (*? pVal, string pType, long pOffset=1)
_v              string(1)
_v2             string(2)
_v4             string(4)
_v8             string(8)

bVal            byte, over(_v)
sVal            short, over(_v2)
usVal           ushort, over(_v2)
lVal            long, over(_v4)
ulVal           ulong, over(_v4)
srVal           sreal, over(_v4)
rVal            real, over(_v8)
pn              equate('StringTheory.SetBytes')
  code
    case upper(pType)
    of 'BYTE'
        bVal = pVal
        self.SetValue(_v)
    of 'SHORT'
        sVal = pVal
        self.SetValue(_v2)
    of 'USHORT'
        usVal = pVal
        self.SetValue(_v2)
    of 'LONG'
        lVal = pVal
        self.SetValue(_v4)
    of 'ULONG'
        ulVal = pVal
        self.SetValue(_v4)
    of 'SREAL'
        srVal = pVal
        self.SetValue(_v4)
    of 'REAL' orof 'DECIMAL'                                ! Decimals stored in an ANY are stored as REALs and hence may loose precision
        rVal = pVal
        self.SetValue(_v8)
    of 'CSTRING' orof 'STRING' orof 'PSTRING'               ! For strings Len() returns the length of the string stored in the ANY
        if Len(pVal) > 0
            self.SetValue(pVal)
        else
            self.ErrorTrap(pn, 'Cannot store the passed string, the length is zero')
            return False
        end
    else                                                    ! Invalid or unsupported data type
        self.ErrorTrap(pn, 'Cannot store the passed value, it is not of a valid type (' & pType & ' is not supported)')
        return False
    end
    return True

StringTheory.GetBytes Procedure (*? pVal, string pType, long pOffset=1)
_v              string(1)
_v2             string(2)
_v4             string(4)
_v8             string(8)

bVal            byte, over(_v)
sVal            short, over(_v2)
usVal           ushort, over(_v2)
lVal            long, over(_v4)
ulVal           ulong, over(_v4)
srVal           sreal, over(_v4)
rVal            real, over(_v8)

  code

    case Upper(pType)
    of 'BYTE'
       if self._DataEnd < 1 then return false.
        _v = self.value[1]
        pVal = bVal
    of 'SHORT'
        if self._DataEnd < 2 then return false.
        _v2 = self.value[1 : 2]
        pVal = sVal
    of 'USHORT'
        if self._DataEnd < 2 then return false.
        _v2 = self.value[1 : 2]
        pVal = usVal
    of 'LONG'
        if self._DataEnd < 4 then return false.
        _v4 = self.value[1 : 4]
        pVal = lVal
    of 'ULONG'
        if self._DataEnd < 4 then return false.
        _v4 = self.value[1 : 4]
        pVal = ulVal
    of 'SREAL'
        if self._DataEnd < 4 then return false.
        _v4 = self.value[1 : 4]
        pVal = srVal
    of 'REAL' orof 'DECIMAL'                                ! Decimals stored in an ANY are stored as REALs and hence may loose precision
        if self._DataEnd < 8 then return false.
        _v8 = self.value[1 : 8]
        pVal = rVal
    of 'CSTRING' orof 'STRING' orof 'PSTRING'               ! For strings Len() returns the length of the string stored in the ANY
        if self._DataEnd < 1
          pVal = ''
        else
          pVal = self.value[1 : self._DataEnd]
        End
    else                                                    ! Invalid or unsupported data type (should never get here as the first CASE statement already handles this)
        return False
    end

    return True

! Find the start of the next word in the string from the passed starting position
! Also supports searching within data from and HTML string (handles escaped character etc.)
! Note for HTML this won't skip over HTML tags, that needs to be handled by the caller.
! Parameters
!   pStartPos: The position in the string to start at.
!   textType: Specifies what type of handling of white space is done:
!           ST:TEXT: (the default) Input is treated as text and all punctuation is excluded from "words"
!           ST:HTML: handling for HTML. Handles ampersands used for escape encoding
!           ST:NOPUNCTUATION: Punctuation is included in the "word" returned. Only space characters are treated as breaking words space.
!           ST:CONTROLCHARS: similar to ST:TEXT but all control characters (where val() < 32) are also treated as breaking words space.
StringTheory.WordStart Procedure(long pStartPos=1, long textType=ST:TEXT,Long pDir=st:Forwards,<String pCharlist>)
cPos                long, auto
textList            string('. <13,10,9>,-;"''!?&()*/+=<>:')
htmlList            string('. <13,10,9>,-;"''!?()*/+=<>:')
ccList              string('. ,-;"''!?&()*/+=<>:')
charList            &String
ws                  long, auto
escEnd              long, auto
nws                 long
  code
  if pStartPos < 1 or pStartPos > self._DataEnd
    return 0
  end
  if pDir = 0 then pDir = st:Forwards.
  if omitted(pCharlist) or size(pCharlist) = 0
    if textType = ST:HTML
      CharList &= htmlList
    elsif textType = ST:CONTROLCHARS
      CharList &= ccList
    else
      CharList &= textList
    end
  else
    Charlist &= pCharList
  end

  cPos = pStartPos
  loop
    if cPos > self._DataEnd
      return 0 !   Not found
    end

    if textType = ST:HTML and pDir = st:Forwards and self.value[cPos] = '&' ! Check for escape codes
      escEnd = self.findChar(';', cPos)
      if escEnd
        cPos = escEnd + 1
      else           ! Not an escape sequence (HTML is probably invalid, so treat this like a single char whitespace).
        cPos += 1    ! skip just the ampersand
      end
      cycle
    end

    if textType = ST:NOPUNCTUATION
      ws = choose(self.value[cPos] = ' ')
    elsif textType = ST:CONTROLCHARS and val(self.value[cPos]) < 32
      ws = true
    else
      ws = choose( MemChr(Address(Charlist), val(self.value[cPos]), size(Charlist)) )! is this character in charlist?
    end

    if pDir = st:Backwards
      if ws
        if nws
          return nws
        elsif cPos = 1
          return 0  ! word not found
        else
          cPos -= 1
        end
      else
        if cPos = 1
          return 1
        else
          nws = cPos
          cPos -= 1
        end
      end
    else
      if ws               ! Character is whitespace
        cPos += 1         ! skip over whitespace
      else
        return cPos
      end
    end
  end
!  return 0 (removed as unreachable)               ! Not found


! Returns the end position of the word when passed the start position.
! Returns 0 if the start position is invalid, or the position of the end of
! the word, or the string length if the no white space is found before the end
! of the string.
!
! Parameters
!   pStartPos: The position in the string to start at.
!   textType: Specifies what type of handling of white space is done:
!       ST:TEXT: (the default) Input is treated as text and all punctuation is excluded from "words"
!       ST:HTML: handling for HTML. Handles ampersands used for escape encoding
!       ST:NOPUNCTIONATION: Punctuation is included in the "word" returned. Only space characters are treated as breaking words space.
!       ST:CONTROLCHARS: similar to ST:TEXT but all control characters (where val() < 32) are also treated as breaking words space.
StringTheory.WordEnd Procedure (long pStartPos=1, long textType=ST:TEXT,<String pCharlist>,Long pSmartWords=true)
i                   long, auto
textList            string('. <13,10,9>,-;"''!?&()*/+=<>:')
htmlList            string('. <13,10,9>,-;"''!?()*/+=<>:')
ccList              string('. ,-;"''!?&()*/+=<>:')
charList            &String
singleQuotes        byte,auto
  code
  if pStartPos < 1 or pStartPos > self._DataEnd
    return 0
  end

  if omitted(pCharlist) or size(pCharlist) = 0
    if textType = ST:HTML
      CharList &= htmlList
    elsif textType = ST:CONTROLCHARS
      CharList &= ccList
    else
      CharList &= textList
    end
  else
    Charlist &= pCharList
  end

  if pStartPos = self._DataEnd                              ! Only the final character checked (or a single char string)
    if textType = ST:NOPUNCTUATION                          ! Only spaces used to break words
      return choose(self.value[pStartPos] = ' ',0,self._DataEnd)
    elsif textType = ST:CONTROLCHARS and val(self.value[pStartPos]) < 32
      return 0
    else                                                    ! Normal text (ST:TEXT) or HTML - handles punctation etc.
      return choose(MemChr(Address(Charlist),val(self.value[pStartPos]),size(Charlist)),0,self._DataEnd)
    end
  end

  if instring('''',pCharlist,1,1)
    singleQuotes = true                                     ! a single quote can delimit a word
  else
    singleQuotes = false
  end
  loop i = pStartPos to self._DataEnd
    if textType = ST:NOPUNCTUATION                          ! if no punctuation we only look for spaces
      if self.value[i] = ' '
        break
      end
    elsif textType = ST:CONTROLCHARS and val(self.value[i]) < 32
      break
    elsif self.value[i] = '''' and singleQuotes             ! Apostrophes (single quotes) need to be handled separately
      if i = self._DataEnd or not IsAlpha(self.value[i + 1])! If the single quote terminates the string, or the next character is not alphabetic, then this is the end of the word
        if i > pStartPos+1 and lower(self.value[i-2 : i-1]) = 'in'
          ! exception: allow apostrophe as the last char of the word eg. goin' leavin' comin' dreamin'
        else
          break
        end
      end
    elsif pSmartWords and (self.value[i] = ',' or self.value[i] = '.' or self.value[i] = '/'  or self.value[i] = ':') and | ! Characters handled differently if within a number or date
          i > pStartPos and i < self._DataEnd and self.IsDigit(i-1) and self.isdigit(i+1)
      ! if within a number or date or time then it is not the end of the word
    elsif MemChr(Address(Charlist),val(self.value[i]),size(Charlist))
      break
    end
  end
  Return Choose(i > pStartPos, i - 1, 0)

StringTheory.CountWords Procedure(long startPos = 1, long textType=ST:TEXT,<String pCharlist>,Long pSmartWords=true)
wordCount       long
endPos          long, auto
  code
  if startPos < 1 or startPos > self._DataEnd
    return 0
  end

  loop
    startPos = self.WordStart(startPos, textType, st:Forwards, pCharList)
    if not startPos
      break
    else                                                ! Found a word
      wordCount += 1

      ! Find the end of the word
      endPos = self.WordEnd(startPos, textType, pCharList, pSmartWords)
      if endPos = 0 or endPos >= self._DataEnd
          break
      end
      startPos = endPos + 1
    end
  end
  return wordCount

!!! <summary> Capitalizes the first letter of a word, or words, in the string.
!!! </summary>
!!! <param name="pCount">The number of words which should be capitalized (defaults to 1)</param>
!!! <param name="pStartPos">The start position in the string (defaults to start of string)</param>
!!! <param name="pEndPos">The end position in the string (defaults to end of string)</param>
!!! <returns>
!!!     nothing.
!!! </returns>
StringTheory.Capitalize Procedure(long pCount=1, long pStartPos=1, long pEndPos=0,<String pCharlist>)
pos             long,auto
ctr             long
newWord         long,auto
defaultCharList string('. <13,10,9>,-;"''!?&()*/+=<>:')
charList        &string
  CODE
  if pStartPos < 1
    pos = 1
  else
    pos = pStartPos
  end
  if pEndPos < 1 or pEndPos > self._DataEnd
    pEndPos = self._DataEnd
  end
  if pos > pEndPos then return.

  if omitted(pCharlist) or size(pCharlist) = 0
    charList &= defaultCharList
  else
    charList &= pCharList
  end

  if pos = 1
    newWord = true  ! first character always capitalized
  else
    newWord = choose(memChr(address(CharList),val(self.value[pos-1]),size(CharList))) ! check if previous char is delimiter
  end

  loop pos = pos to pEndPos
    if newWord
      newWord = choose(memChr(address(CharList),val(self.value[pos]),size(CharList))) ! need to do this here BEFORE we upper the char
      self.value[pos] = chr(ToUpper(val(self.value[pos])))
      if pCount
        ctr += 1
        if ctr >= pCount then break.
      end
    else
      newWord = choose(memChr(address(CharList),val(self.value[pos]),size(CharList)))
    end
  end

!--------------------------------------------------------------------------------------
!!! <summary> Removes all attributes from all instances of an html tag in the string.
!!! </summary>
!!! <param name="pTag">The HTML tag, without the brackets from which attributes should be removed.</param>
!!! <returns>
!!!     nothing.
!!! </returns>
StringTheory.RemoveAttributes Procedure(String pTag,Long pCount=0)
x             long              ! position of opening '<'
y             long, auto        ! position of closing '>'
z             long              ! last char pointer for shuffled string
cl            long, auto        ! clip length of tag name
c             long              ! count
searchFor     &string
charsRemoved  long
  code
  cl = self.clipLen(pTag)
  searchFor &= new string(cl+2) ! allow for: '<' & clip(pTag) & ' '
  searchFor = '<' & pTag
  loop
    x = self.findChars(searchFor, x+1)
    if x
      y = self.findChar('>', x)
      if y
        if charsRemoved
          stMemCpyLeft(address(self.value)+z,address(self.value)+z+charsRemoved,x+cl-z-charsRemoved) ! shuffle down chars
        end
        z = x+cl-charsRemoved
        charsRemoved += y-x-cl-1
        x = y
      else
        break
      end
      if pCount
        c += 1
        if c >= pCount
          break
        end
      end
    else
      break
    end
  end
  if charsRemoved
    if self._DataEnd > z+charsRemoved
      stMemCpyLeft(address(self.value)+z,address(self.value)+z+charsRemoved,self._DataEnd-z-charsRemoved) ! shuffle down any remaining chars
    end
    if self.UseBuffer
      self._DataEnd -= charsRemoved
      if self.CleanBuffer
        stMemSet(address(self.value)+self._DataEnd,32,charsRemoved)
      end
    else
      self.setLength(self._DataEnd - charsRemoved)
    end
  end
  dispose(searchFor)

!------------------------------------------------------------------------------------------------------
StringTheory.Remove  Procedure(string pLeft)
  code
  if size(pLeft) < 1 or self._DataEnd < size(pLeft)
    return 0
  elsif size(pLeft) = 1
    return self.removeByte(val(pLeft))
  else
    return self.replace(pLeft,'')
  end

StringTheory.Remove  Procedure(string pLeft,string pRight)
  code
  if size(pLeft) < 1 or self._DataEnd < size(pLeft) + size(pRight)
    return 0
  elsif size(pRight) = 0
    if size(pLeft) = 1
      return self.removeByte(val(pLeft))
    else
      return self.replace(pLeft,'')
    end
  else
    return self.remove(pLeft,pRight,0,0,0)
  end

StringTheory.Remove  Procedure(string pLeft,<string pRight>,long pNoCase)
  code
  if size(pLeft) < 1
    return 0
  elsif omitted(pRight) or size(pRight) = 0
    if self._DataEnd < size(pLeft)
      return 0
    elsif pNoCase
      return self.replace(pLeft,'',,,,pNoCase)
    elsif size(pLeft) = 1
      return self.removeByte(val(pLeft))
    else
      return self.replace(pLeft,'')
    end
  elsif self._DataEnd < size(pLeft) + size(pRight)
    return 0
  else
    return self.remove(pLeft,pRight,pNoCase,0,0)
  end

StringTheory.Remove  Procedure(string pLeft,<string pRight>,long pNoCase=0,long pContentsOnly)
  code
  if size(pLeft) < 1
    return 0
  elsif omitted(pRight) or size(pRight) = 0
    if self._DataEnd < size(pLeft)
      return 0
    elsif pNoCase
      return self.replace(pLeft,'',,,,pNoCase)
    elsif size(pLeft) = 1
      return self.removeByte(val(pLeft))
    else
      return self.replace(pLeft,'')
    end
  elsif self._DataEnd < size(pLeft) + size(pRight)
    return 0
  else
    return self.remove(pLeft,pRight,pNoCase,pContentsOnly,0)
  end

StringTheory.Remove  Procedure(string pLeft,<string pRight>,long pNoCase=0,long pContentsOnly=0,long pCount)
count        long
skip         long
addr         long,auto
lAddr        long,auto ! address of left delimiter
rAddr        long,auto ! address of right delimiter
maxAddr      long,auto ! maximum address - one beyond end of initial value
startPtr     long,auto ! pointer to start of next block of included text
endPtr       long      ! pointer to end of included text
adjust       long,auto ! address adjustment - will be 0 unless pNoCase is true
lLen         long,auto
rLen         long,auto
lrLen        long,auto
rAdj         long,auto ! right length adjustment used for pContentsOnly
lAdj         long,auto ! left  length adjustment used for pContentsOnly
maxStartAddr long,auto ! maximum address to start searching
UprStr       &string   ! copy of string UPPERed to search when pNoCase is true
  code
  lLen = size(pLeft)
  if lLen < 1 or self._DataEnd < lLen then return 0.

  if omitted(pRight) or size(pRight) = 0
    return self.replace(pLeft,'',pCount,,,pNoCase)
  end

  rLen = size(pRight)
  lrLen = lLen + rLen
  if rLen < 1 or self._DataEnd < lrLen then return 0.

  if pContentsOnly
    rAdj = rLen
    lAdj = lLen
  else
    rAdj = 0
    lAdj = 0
  end

  if pNoCase
    pLeft = upper(pLeft)
    pRight = upper(pRight)
    if pLeft = lower(pLeft) and pRight = lower(pRight)
      pNocase = false
    end
  end

  if pNoCase
    ! we will search in an UPPERed copy of string
    UprStr &= new String(self._DataEnd)
    UprStr = upper(self.value[1 : self._DataEnd])
    addr = address(UprStr)
  else
    addr = address(Self.value)
  end

  startPtr = addr
  adjust = addr - address(self.value)
  maxAddr  = startPtr + self._DataEnd
  maxStartAddr = maxAddr - lrLen                                     ! max address to start search

  if pContentsOnly = false and lLen = 1 and rLen = 1                 ! optimized version of common case
    loop
      if startPtr > maxAddr - 2 then break.                          ! not enough room for delimiters
      lAddr = MemChr(startPtr, val(pLeft), maxAddr-startPtr)         ! find left delimiter
      if lAddr = 0 then break.                                       ! not found
      if lAddr >= maxAddr - 1 then break.                            ! not enough room for right delimiter
      rAddr = lAddr + 1
      rAddr = MemChr(rAddr, val(pRight), maxAddr-rAddr)              ! find right delimiter
      if rAddr = 0 then break.                                       ! not found
      if endPtr
        if lAddr > startPtr                                          ! is there any text to shuffle?
          stMemCpyLeft(endPtr+1-adjust, startPtr-adjust, lAddr-startPtr) ! shuffle down characters in situ
          endPtr += lAddr - startPtr                                 ! increment pointer to last used char
        end
      else
        endPtr = lAddr - 1 ! pointer to last used char (so far...) in string
      end
      startPtr = rAddr + 1 ! pointer to first character of next block of text
      count += 1
      if count = pCount then break.
    end !loop
  else
    ! multi-character delimiters and/or pContentsOnly
L   loop
      lAddr = startPtr
      if skip
        ! we are skipping over characters where pContentsOnly and there is no contents between left and right delimiters to remove
        lAddr += skip
        skip = 0
      end

      loop  ! look for left delimiter
        if lAddr > maxStartAddr then break L.                          ! not enough room for delimiters
        lAddr = MemChr(lAddr, val(pLeft), maxStartAddr - lAddr + 1)    ! find 1st char of left delimiter
        if lAddr = 0 then break L.                                     ! left delim not found
        if MemCmp(lAddr, Address(pLeft), lLen) = 0 then break.         ! matched left delim
        lAddr += 1
      end

      rAddr = lAddr + lLen
      loop  ! look for right delimiter
        if rAddr > maxAddr - rLen then break L.                               ! not enough room for right delimiter
        rAddr = MemChr(rAddr, val(pRight), maxAddr - rLen - rAddr + 1)        ! find 1st char of right delimiter
        if rAddr = 0 then break L.                                            ! right delim not found
        if MemCmp(rAddr, Address(pRight), rLen) = 0 then break.               ! matched right delim
        rAddr += 1
      end

      if pContentsOnly and rAddr = lAddr + lLen                               ! no contents to remove so don't increase count
        skip = rAddr + rLen - startPtr                                        ! skip over characters for now rather than do separate move
        cycle
      end

      if endPtr
        if lAddr > startPtr - rAdj                                            ! is there any text to shuffle?
          stMemCpyLeft(endPtr+1-adjust, startPtr-rAdj-adjust, lAddr-startPtr+rAdj)! shuffle down characters in situ
          endPtr += lAddr - startPtr + rAdj                                   ! increment pointer to last used char
          if pContentsOnly
            stMemCpyLeft(endPtr+1-adjust, lAddr-adjust, lLen)                     ! append left delimiter
            endPtr += lLen                                                    ! increment pointer to last used char
          end
        end
      else
        endPtr = lAddr + lAdj - 1 ! pointer to last used char (so far...) in string
      end
      startPtr = rAddr + rLen     ! pointer to first character of next block of text
      count += 1
      if count = pCount then break.
    end !loop L
  end

  if pNoCase then dispose(UprStr).

  if count
    ! nothing more to remove so shuffle down any text on the end
    if startPtr - rAdj > endPtr + 1 and maxAddr > startPtr - rAdj
      stMemCpyLeft(endPtr+1-adjust, startPtr-rAdj-adjust, maxAddr-startPtr+rAdj) ! shuffle down remaining characters
    end
    ! and reduce the length
    if self.UseBuffer
      self._DataEnd += endPtr + 1 - startPtr + rAdj
      if self.CleanBuffer
        stMemSet(address(self.value)+self._DataEnd,32,startPtr-endPtr-1-rAdj)
      end
    else
      self.setLength(self._DataEnd - startPtr + endPtr + 1 + rAdj)
    end
  end
  return count

!------------------------------------------------------------------------------------------------------
StringTheory.RemoveFromPosition Procedure(long pPosition, long pLength) !remove a given number of characters from a given position
  code
  if pPosition > self._DataEnd
    pLength = 0
  elsif pPosition + pLength > self._DataEnd
    pLength = self._DataEnd - pPosition + 1
  end
  if pPosition < 1
    pLength += pPosition - 1
    pPosition = 1
  end
  if pLength < 1
    pLength = 0
  elsif pLength = self._DataEnd
    self.free()
  else
    stMemCpyLeft(address(self.value)+pPosition-1, address(self.value)+pPosition-1+pLength, self._DataEnd-pPosition+1-pLength) ! shuffle down text
    ! and reduce the length
    if self.UseBuffer
      self._DataEnd -= pLength
      if self.CleanBuffer
        stMemSet(address(self.value)+self._DataEnd,32,pLength)
      end
    else
      self.setLength(self._DataEnd - pLength)
    end
  end
  return pLength  ! return actual number of chars removed

!-----------------------------------------------------------
! remove leading string from start of string value eg. remove a prefix
StringTheory.RemoveLeading    Procedure (String pStr, Long pNoCase=0)
sz long,auto
  code
  sz = size(pStr)
  if sz > 0 and sz <= self._DataEnd
    if pNoCase
      if lower(self.Value[1 : sz]) = lower(pStr)
        self.RemoveFromPosition(1, sz)
        return true
      end
    else
      if self.Value[1 : sz] = pStr
        self.RemoveFromPosition(1, sz)
        return true
      end
    end
  end
  return false

!------------------------------------------------------------------------------------------------------
! Get a given word number
StringTheory.GetWord Procedure(long pWordNumber,long startPos = -1, long textType=ST:TEXT, <String pCharlist>,Long pSmartWords=true) !, string
ps  long
pe  long
  code
  return self.FindWord(pWordNumber,startPos,textType,ps,pe,pCharlist,pSmartWords)

!! Commented out because of a linker clash with the WORD equate.
!! same as getword, but better name.
!StringTheory.Word Procedure(long pWordNumber,long startPos = -1, long textType=ST:TEXT) !, string
!ps  long
!pe  long
!  code
!  return self.FindWord(pWordNumber,startPos,textType,ps,pe)

! same as Word, but returns positions for the boundaries of the word as well.
StringTheory.FindWord Procedure(long pWordNumber,long startPos = -1, long textType=ST:TEXT,*Long pStart, *Long pEnd,<String pCharlist>,Long pSmartWords=true) !, string
wordCount       long
endPos          long, auto
  code
  pStart = 0
  pEnd = 0

  if pWordNumber = 0 then return ''.

  if pWordNumber > 0
    if startPos < 1 then startPos = 1.
  else
    if startPos < 1 then startPos = self._DataEnd.
  end

  if startPos > self._DataEnd then startPos = self._DataEnd.

  if pWordNumber > 0
    loop
      startPos = self.WordStart(startPos, textType, st:Forwards, pCharList)
      if startPos < 1 then break.    ! word not found
      endPos = self.WordEnd(startPos, textType, pCharList, pSmartWords)        ! Find the end of the word
      if endPos < startPos or endPos > self._DataEnd then break.               ! word not found
      wordCount += 1  ! Found a word
      if wordCount = pWordNumber
        pStart = startPos
        pEnd = endPos
        return self.Value[startPos : endPos]                                  ! found THE word we wanted
      end
      startPos = endPos + 1
    end
  elsif pWordNumber < 0
    loop
      startPos = self.WordStart(startPos, textType, st:backwards, pCharList)
      if startPos < 1 then break.                                             ! word not found
      endPos = self.WordEnd(startPos, textType, pCharList,pSmartWords)        ! Find the end of the word
      if endPos < startPos or endPos > self._DataEnd then break.              ! word not found
      wordCount += 1                                                          ! Found a word
      if wordCount = -pWordNumber
        pStart = startPos
        pEnd = endPos
        return self.Value[startPos : endPos]                                  ! found THE word we wanted
      end
      startPos = startPos - 1
    end
  end

  return ''                                                                   ! requested word not found

! ------------------------------------------------------------
! Clip the current value
StringTheory.Clip Procedure()
  code
  if self._DataEnd and self.value[self._DataEnd] = ' '
    if self.UseBuffer
      self._DataEnd = self.clipLen(self.value[1 : self._DataEnd])
    else
      self.SetLength(self.clipLen(self.value))
    end
  end

StringTheory.Clip Procedure(String pAlphabet)
y  long,auto
  code
  if self._DataEnd = 0 then return.
  if pAlphabet = ''
    self.clip()
    return
  end
  loop y = self._DataEnd to 1 by -1
    if MemChr(Address(pAlphabet), val(self.value[y]), size(pAlphabet)) = 0
      break
    end
  end
  if y = self._DataEnd then return. ! nothing to clip
  if self.UseBuffer
    if self.CleanBuffer
      stMemSet(address(self.value)+y,32,self._DataEnd-y)
    end
    self._DataEnd = y
  else
    self.setLength(y)
  end

! ------------------------------------------------------------
! not suitable if the string contains unicode chars.
! Remove space off the start and end of the current value
StringTheory.Trim Procedure()
  code
  if self._DataEnd = 0 then return.
  if self.value[1] = ' '
    self.setValue(clip(left(self.value[1 : self._DataEnd])))
  elsif self.value[self._DataEnd] = ' '
    if self.UseBuffer
      self._DataEnd = self.clipLen(self.value[1 : self._DataEnd])
    else
      self.SetLength(self.clipLen(self.value))
    end
  end
  return

StringTheory.Trim Procedure(String pAlphabet)
x  long,auto
y  long,auto
  code
  if self._DataEnd = 0 then return.
  if pAlphabet = ''
    self.trim()
    return
  end
  x = 1
  loop
    if MemChr(Address(pAlphabet), val(self.value[x]), size(pAlphabet)) = 0
      break
    end
    x += 1
    if x > self._DataEnd
      self.free()  ! empty string
      return
    end
  end
  y = self._DataEnd
  loop
    if MemChr(Address(pAlphabet), val(self.value[y]), size(pAlphabet)) = 0
      break
    end
    y -= 1
    if y = x
      break
    end
  end
  self.crop(x,y)

! Remove excessive white space. Each word separated by one space only.
! Shuffles down words in situ then truncates the remaining length.
! Parameters
!       ST:TEXT - (the default) Input is treated as text and all punctuation is excluded from "words" (and hence treated as white space)
!       ST:HTML - handling for HTML. Handles ampersands used for escape encoding.
!       ST:NOPUNCTIONATION - Punctuation is treated as normal characters as not as white space.
StringTheory.Squeeze Procedure(long textType = ST:TEXT,<String pCharlist>,Long pSmartWords=true)
startPos        long, auto
endPos          long, auto
ptr             long, auto         ! Pointer to current position (end of current string)
newPtrPos       long, auto         ! Pointer to new position
  code
  if self._DataEnd < 1
    return
  end

  startPos = 1
  ptr = 0

  loop
    startPos = self.WordStart(startPos, textType, st:Forwards, pCharlist)
    if startPos < 1
      break                                                         ! Word not found
    end

    endPos = self.WordEnd(startPos, textType,pCharlist,pSmartWords) ! Find the end of the word
    if endPos < startPos or endPos > self._DataEnd
      break    ! word not found
    end

    if ptr                                              ! do we already have a word??
      ptr += 1
      self.value[ptr] = ' '                             ! put a space between words
    end

    ptr += 1
    newPtrPos = ptr + endPos - startPos

    if startPos > ptr
      ! shuffle down characters...
!?     Assert(newPtrPos - ptr = endPos - startPos, 'StringTheory Error in Squeeze: The shuffle lengths are not the same!')   ! Check lengths are equal
      stMemCpyLeft(address(self.value)+ptr-1, address(self.value)+startPos-1, endPos-startPos+1)
    end
    ptr = newPtrPos
    startPos = endPos + 1
  end

  if ptr < self._DataEnd                                ! truncate the length
    if self.UseBuffer
      if self.CleanBuffer
        stMemSet(address(self.value)+ptr,32,self._DataEnd-ptr)
      end
      self._DataEnd = ptr
    else
      self.SetLength(ptr)
    end
  end

!-----------------------------------------------------------------------------
! Returns True (1) if the string contains at least one of the
! "digit" characters. The alphabet to search against
StringTheory.ContainsADigit  Procedure() !, bool
x            long,auto
  code
  loop x = 1 to self._DataEnd
    case val(self.value[x])
    of 48 to 57 ! '0' to '9'
      return true
    end
  end
  return false

!-----------------------------------------------------------------------------
! Returns True (1) if self.value contains the specified byte pByte
StringTheory.ContainsByte  Procedure(byte pByte) !, bool
  code
  return choose(MemChr(Address(self.value), pByte, self._DataEnd))

!-----------------------------------------------------------------------------
StringTheory.ContainsByte  Procedure(byte pByte, *String pTestString) !, bool
  code
  return choose(MemChr(Address(pTestString), pByte, len(pTestString)))

!-----------------------------------------------------------------------------
StringTheory.ContainsByte  Procedure(byte pByte, String pTestString) !, bool
  code
  return choose(MemChr(Address(pTestString), pByte, size(pTestString)))

!-----------------------------------------------------------------------------
! Returns True (1) if self.value contains the specified character pChar
StringTheory.ContainsChar  Procedure(String pChar) !, bool
  code
  If size(pChar) = 0 then return false.
  return choose(MemChr(Address(self.value), val(pChar), self._DataEnd))

!-----------------------------------------------------------------------------
! Returns True (1) if the passed string contains the specified character pChar
StringTheory.ContainsChar  Procedure(String pChar, *String pTestString) !, bool
  code
  If size(pChar) = 0 then return false.
  return choose(MemChr(Address(pTestString), val(pChar), len(pTestString)))

!-----------------------------------------------------------------------------
! Returns True (1) if the passed string contains the specified character pChar
StringTheory.ContainsChar  Procedure(String pChar, String pTestString) !, bool
  code
  If size(pChar) = 0 then return false.
  return choose(MemChr(Address(pTestString), val(pChar), size(pTestString)))

!-----------------------------------------------------------------------------
! Returns True (1) if the string contains at least one of the
! "alphabet" characters. The alphabet to search against
StringTheory.ContainsA  Procedure(String pAlphabet,<String pTestString>,Long pClip=st:clip) !, bool
i       long, auto
alphLen long, auto
c       string(1),auto
b       byte,over(c)
  code

  if pClip
    alphLen = self.clipLen(pAlphabet)
  else
    alphLen = size(pAlphabet)
  end
  if alphLen < 1 then return false.

  if omitted(pTestString) or size(pTestString) < 1
    if self._DataEnd < 1 then return false.
    loop i = 1 TO alphLen
      c = pAlphabet[i]
      if MemChr(Address(self.value), b, self._DataEnd)
        return true
      end
    end
  else
    loop i = 1 TO alphLen
      c = pAlphabet[i]
      if MemChr(Address(pTestString), b, size(pTestString))
        return true
      end
    end
  end
  return false

!--------------------------------------------------------------------------------------------
! Returns True if the string does not contain any non-digit characters (ie. only '0' to '9')
! or False otherwise. If empty (zero length) string then returns true.
StringTheory.IsAllDigits  Procedure(Long pStart=1, Long pEnd=0) !, bool
x            long,auto
  code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart > pEnd then return true.
  loop x = pStart to pEnd
    case val(self.value[x])
    of 48 to 57 ! '0' to '9'
      cycle
    end
    return false
  end
  return true

StringTheory.IsDigit  Procedure(long pPos) !, bool
  code
  if pPos < 1 or pPos > self._DataEnd then return false.
  case val(self.value[pPos])
  of 48 to 57 ! '0' to '9'
    return true
  else
    return false
  end

!--------------------------------------------------------------------------------------------
! returns true if zero length or all chars in the string are spaces
StringTheory.IsEmpty  Procedure(long pStart=1, long pEnd=0) !, bool
  code
  if self._DataEnd < 1 then return true.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart > pEnd or self.value[pStart : pEnd] = ''
    return true
  else
    return false
  end

!--------------------------------------------------------------------------------------------
! returns true if all chars in the string are in the range 0 to 127
StringTheory.IsASCII Procedure(long pStart=1, long pEnd=0) !, bool
x            long,auto
  Code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  loop x = pStart to pEnd
    if val(self.value[x]) > 127
      return false
    end
  end
  return true

!--------------------------------------------------------------------------------------------
! returns true if value contains no lower case letters - the value would be unchanged by doing UPPER on it
! null string returns true
StringTheory.IsUpper Procedure(long pStart=1, long pEnd=0) !, bool
x            long,auto
  Code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart > pEnd then return true.
  loop x = pStart to pEnd
    case val(self.value[x])
    of 97 to 122  ! a to z
      return false
    end
  end
  return true

!--------------------------------------------------------------------------------------------
! returns true if value contains ONLY upper case letters
! null string returns true
StringTheory.IsAllUpper Procedure(long pStart=1, long pEnd=0) !, bool
x            long,auto
  Code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart > pEnd then return true.
  loop x = pStart to pEnd
    case val(self.value[x])
    of 65 to 90 ! A to Z
      cycle
    else
      return false
    end
  end
  return true

!--------------------------------------------------------------------------------------------
! returns true if value contains no upper case letters - the value would be unchanged by doing LOWER on it
! null string returns true
StringTheory.IsLower Procedure(long pStart=1, long pEnd=0) !, bool
x            long,auto
  Code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart > pEnd then return true.
  loop x = pStart to pEnd
    case val(self.value[x])
    of 65 to 90 ! A to Z
      return false
    end
  end
  return true

!--------------------------------------------------------------------------------------------
! returns true if value contains ONLY lower case letters
! null string returns true
StringTheory.IsAllLower Procedure(long pStart=1, long pEnd=0) !, bool
x            long,auto
  Code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart > pEnd then return true.
  loop x = pStart to pEnd
    case val(self.value[x])
    of 97 to 122  ! a to z
      cycle
    else
      return false
    end
  end
  return true

!--------------------------------------------------------------------------------------------
! Returns True if the string contains only characters in the passed parameter
StringTheory.IsAll  Procedure(String pAlphabet,<String pTestString>,Long pClip=st:clip) !, bool
i       long, auto
alphLen long, auto
str     &string
strLen  long, auto
  code
  if pClip
    alphLen = self.clipLen(pAlphabet)
  else
    alphLen = size(pAlphabet)
  end

  if alphLen < 1 then return false.

  if omitted(pTestString) or size(pTestString) = 0
    str &= self.value
    strLen = self._DataEnd
  else
    str &= pTestString
    strLen = size(pTestString)
  end

  if strLen < 1 then return false.

  loop i = 1 to strLen
    if MemChr(Address(pAlphabet),val(str[i]),alphLen) = 0 then return false.
  end
  return true

!----------------------------------------------------------------------------------
! Replace characters that are found in passed alphabet
! returns the number of chars replaced
StringTheory.RemoveChars  Procedure(String pAlphabet, String pReplacementChar) !,LONG
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
b         &byte
addr      long,auto
endAddr   long,auto
  code
  if self._DataEnd < 1 or size(pAlphabet) < 1 then return 0.
  if size(pReplacementChar) < 1 then return self.RemoveChars(pAlphabet).
  if size(pAlphabet) = 1
    if pAlphabet = pReplacementChar[1]
      return 0                                                        ! replace single char with same char
    else
      return self.replaceByte(val(pAlphabet),val(pReplacementChar))   ! optimize for single char pAlphabet
    end
  end

  stMemSet(address(charsMap),0,size(charsMap))
  addr = address(pAlphabet)
  endAddr = addr + size(pAlphabet) - 1
  loop addr = addr to endAddr                                         ! initialize the char map
    b &= (addr)                                                       ! point at byte
    charMap[b+1] = 1                                                  ! char needs replacing
  end

  b &= (address(pReplacementChar))                                    ! point at replacement byte
  return self._replaceMatchingChars(charsMap,b)

!----------------------------------------------------------------------------------
! remove characters from string which are found in the passed alphabet
! returns the number of chars removed
StringTheory.RemoveChars  Procedure(String pAlphabet) !,LONG
i         long, auto
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
  code
  if self._DataEnd < 1 or size(pAlphabet) < 1 then return 0.
  if size(pAlphabet) = 1 then return self.removeByte(val(pAlphabet)). ! optimize for case where pAlphabet is 1 char long.

  stMemSet(address(charsMap),0,size(charsMap))
  loop i = 1 to size(pAlphabet)
    charMap[val(pAlphabet[i])+1] = 1                                  ! this char is to be removed
  end
  return self._removeMatchingChars(charsMap)

!----------------------------------------------------------------------------------
StringTheory.RemoveCharRanges  Procedure(String pAlphabet, String pReplacementChar) !,LONG
  code
  if self._DataEnd < 1 or size(pAlphabet) < 1 then return 0.
  if size(pReplacementChar) < 1 then return self.RemoveCharRanges(pAlphabet).
  if size(pAlphabet) = 1
    if pAlphabet = pReplacementChar[1]
      return 0                                                        ! replace single char with same char
    else
      return self.replaceByte(val(pAlphabet),val(pReplacementChar))   ! optimize for single char pAlphabet
    end
  end
  if size(pAlphabet) < 3 or self.containsByte(45,pAlphabet) = 0 then return self.removeChars(pAlphabet,pReplacementChar). ! 45='-' no range of chars eg. A-Z

  return self._ProcessCharRanges(pAlphabet, true, pReplacementChar)

!----------------------------------------------------------------------------------
StringTheory.RemoveCharRanges  Procedure(String pAlphabet) !,LONG
  code
  if self._DataEnd < 1 or size(pAlphabet) < 1 then return 0.
  if size(pAlphabet) < 3 or self.containsByte(45,pAlphabet) = 0 then return self.removeChars(pAlphabet). ! 45='-' no range of chars eg. A-Z
  return self._ProcessCharRanges(pAlphabet, true)

!----------------------------------------------------------------------------------
StringTheory.KeepCharRanges  Procedure(String pAlphabet, String pReplacementChar) !,LONG
  code
  if self._DataEnd < 1 then return 0.
  if size(pReplacementChar) < 1 then return self.KeepCharRanges(pAlphabet).
  if size(pAlphabet) < 3 or self.containsByte(45,pAlphabet) = 0 then return self.keepChars(pAlphabet,pReplacementChar). ! 45='-' no range of chars eg. A-Z
  return self._ProcessCharRanges(pAlphabet, false, pReplacementChar)

!----------------------------------------------------------------------------------
StringTheory.KeepCharRanges  Procedure(String pAlphabet) !,LONG
  code
  if self._DataEnd < 1 then return 0.
  if size(pAlphabet) < 3 or self.containsByte(45,pAlphabet) = 0 then return self.keepChars(pAlphabet). ! 45='-' no range of chars eg. A-Z
  return self._ProcessCharRanges(pAlphabet, false)

! -------------------------------------------------------------------------------------
! Remove (or retain) chars (either individual or ranges) and return number of bytes removed.
! the first parameter is a string indicating chars to process - this can contain ranges
! Eg.  _ProcessCharRanges('A-Za-z',true)             ! remove alphabetic chars
!      _ProcessCharRanges('<0>-<31,127>-<255>',true) ! remove "non-printable" chars
! you can mix up individual characters and ranges: ProcessCharRanges('A-CZz123a-c')
! to remove the single character '-' either do a single character range '---' or make it the first or last character
! if the passed alphabet parameter is invalid then no removals are done and ErrorTrap is called
! if the second parameter (pRemove) is set to false, then the indicated characters are not removed,
! but retained (and all other characters are removed).
! if the optional third parameter is included, then characters are replaced rather than removed.
StringTheory._ProcessCharRanges Procedure(string pAlphabet, byte pRemove, <String pReplacementChar>) !,long
x         long,auto
y         long,auto
low       long,auto
high      long,auto
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
pn        string('_ProcessCharRanges')
  code
  if self._DataEnd < 1 or size(pAlphabet) = 0 then return 0.

  pRemove = choose(pRemove)  ! make sure it is boolean (1/0)
  stMemSet(address(charsMap),1-pRemove,size(charsMap))

  ! before we do any removals we first validate the passed parameter, building a map of chars to be removed as we go
  ! if all is ok, only then do we proceed and do the actual removals

  y = size(pAlphabet) - 1
  loop x = 1 to y
    if pAlphabet[x] = '-'
      if pAlphabet[x+1] <> '-'
        if x = 1
          charMap[46] = pRemove                        ! mark that '-' is to be processed  note: 46 = val('-') + 1
          cycle
        else
          self.ErrorTrap(pn,'INVALID alphabet parameter : "-" character at position ' & x & ' in "' & pAlphabet & '"',true)
          return 0
        end
      end
      if x < y and pAlphabet[x+2] = '-'                ! special case: '---' is range for single char '-'
        charMap[46] = pRemove                          ! mark that '-' is to be processed  note: 46 = val('-') + 1
        x += 2
        cycle
      end
    end

    if pAlphabet[x+1] = '-' and x < y                  ! are we possibly doing a range?
      if x < y-1 and pAlphabet[x+2] = '-' and pAlphabet[x+3] = '-'   ! are following 3 chars '---' ??
        charMap[val(pAlphabet[x])+1] = pRemove         ! mark that char is to be processed
        charMap[46] = pRemove                          ! mark that '-' is to be processed  note: 46 = val('-') + 1
        x += 3
      else
        low  = val(pAlphabet[x])+1
        high = val(pAlphabet[x+2])+1
        if low > high
          self.ErrorTrap(pn,'INVALID range in alphabet parameter : chars "' & pAlphabet[x : x+2] & '" in "' & pAlphabet & '"',true)
          return 0
        end
        loop low = low to high
          charMap[low] = pRemove                       ! mark that char is to be processed
        end
        x += 2
      end
    else
      charMap[val(pAlphabet[x])+1] = pRemove           ! mark that char is to be processed
    end
  end
  charMap[val(pAlphabet[size(pAlphabet)])+1] = pRemove ! mark that final alphabet char is to be processed

  ! we have confirmed the input parameter is valid so we now go ahead and do the actual removals using the character map
  if omitted(pReplacementChar) or size(pReplacementChar) < 1
    return self._removeMatchingChars(charsMap)
  else
    return self._replaceMatchingChars(charsMap, val(pReplacementChar))
  end

!----------------------------------------------------------------------------------
! Keep only specified characters. Other chars are either replaced or removed.
! returns the number of chars replaced or removed
! the passed pTestString is altered
StringTheory.KeepChars  Procedure(String pAlphabet, String pReplacementChar, Byte pAlphaNum=false, *string pTestString) !,LONG
st  StringTheory
ret long,auto
  code
  st.setValue(pTestString,st:clip)
  if st._DataEnd < 1 then return 0.
  ret = st.KeepChars(pAlphabet, pReplacementChar, pAlphaNum)
  if st._DataEnd
    pTestString = st.valueptr[1 : st._DataEnd]
  else
    pTestString = ''
  end
  return ret

!----------------------------------------------------------------------------------
! Keep only characters that are found in passed alphabet
! ie. replace characters from string which are NOT found in passed alphabet
! returns the number of chars replaced
StringTheory.KeepChars  Procedure(String pAlphabet, String pReplacementChar, Byte pAlphaNum) !,LONG
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
b         byte,auto
x         long,auto
  code
  if self._DataEnd < 1 then return 0.
  if pAlphaNum = false then return self.KeepChars(pAlphabet,pReplacementChar).

  stMemSet(address(charsMap),1,size(charsMap))                 ! initialize the char map
  loop x = 1 to size(pAlphabet)
    charMap[val(pAlphabet[x])+1] = 0                           ! char does not need replacing
  end
  loop b = 0 to 255                                            ! alphanumerics are added to the specified alphabet
    If stIsCharAlphaNumericA(b)
      charMap[b+1] = 0                                         ! char does not need replacing
    End
  end
  if size(pReplacementChar)
    b = val(pReplacementChar)
    return self._replaceMatchingChars(charsMap,b)
  else
    return self._removeMatchingChars(charsMap)
  end
!----------------------------------------------------------------------------------
! Keep only characters that are found in passed alphabet
! ie. replace characters from string which are NOT found in passed alphabet
! returns the number of chars replaced
StringTheory.KeepChars  Procedure(String pAlphabet, String pReplacementChar) !,LONG
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
b         &byte
addr      long,auto
endAddr   long,auto
replaced  long,auto
  code
  if self._DataEnd < 1 then return 0.
  if size(pReplacementChar) < 1 then return self.KeepChars(pAlphabet).
  if size(pAlphabet) < 1
    b &= (address(pReplacementChar))
    replaced = self._DataEnd - self.countByte(b)
    if replaced then stMemSet(address(self.value), b, self._DataEnd). ! replace all chars in string
    return replaced
  end

  stMemSet(address(charsMap),1,size(charsMap))
  addr = address(pAlphabet)
  endAddr = addr + size(pAlphabet) - 1
  loop addr = addr to endAddr                                         ! initialize the char map
    b &= (addr)                                                       ! point at byte
    charMap[b+1] = 0                                                  ! char does not need replacing
  end
  b &= (address(pReplacementChar))                                    ! point at replacement byte
  return self._replaceMatchingChars(charsMap,b)

!----------------------------------------------------------------------------------
! Keep only characters that are found in passed alphabet
! ie. remove characters from string which are NOT found in passed alphabet
! returns the number of chars removed
StringTheory.KeepChars  Procedure(String pAlphabet) !,LONG
count     long
removed   long
b         &byte
addr      long,auto
endAddr   long,auto
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
  code
  if self._DataEnd < 1 then return 0.

  if size(pAlphabet) < 1
    removed = self._DataEnd
    self.free()
    return removed
  end

  if size(pAlphabet) = 1                                       ! optimize for case where pAlphabet is 1 char long.
    b &= (address(pAlphabet))
    count = self.countByte(b)
    removed = self._DataEnd - count
    if removed
      stMemSet(address(self.value),b,count)
      self.setLength(count)
    end
    return removed
  end

  stMemSet(address(charsMap),1,size(charsMap))                 ! default to remove all chars
  addr = address(pAlphabet)
  endAddr = addr + size(pAlphabet) - 1
  loop addr = addr to endAddr                                  ! set up the char map
    b &= (addr)                                                ! point at byte
    charMap[b+1] = 0                                           ! this char is kept (not removed)
  end
  return self._removeMatchingChars(charsMap)

!----------------------------------------------------------------------------------
StringTheory.BigEndian Procedure()
  code
  if self.endian <> st:BigEndian and self.encoding = st:EncodeUtf16
    self._switchEndian()
    self.endian = st:BigEndian
  end

!----------------------------------------------------------------------------------
! little endian has least significant byte first, eg 65 00 66 00 and so on.
StringTheory.LittleEndian Procedure()
  code
  if self.endian <> st:LittleEndian and self.encoding = st:EncodeUtf16
    self._switchEndian()
    self.endian = st:LittleEndian
  end

!----------------------------------------------------------------------------------
StringTheory._SwitchEndian Procedure()
t   string(1)
x   long
  CODE
  loop x = 1 to self._DataEnd-1 by 2
    t = self.value[x]
    self.value[x] = self.value[x+1]
    self.value[x + 1] = t
  end

!----------------------------------------------------------------------------------
! Switches between big endian and little endian
StringTheory.SwitchEndian Procedure(ulong x)
bigEnd          group, over(x)
first               byte
second              byte
third               byte
fourth              byte
                end

temp            byte, auto
  code
  temp = BigEnd.first
  bigEnd.first = BigEnd.fourth
  bigEnd.fourth = temp

  temp = BigEnd.second
  BigEnd.second = BigEnd.third
  BigEnd.third = temp

  return x

! BigEndian and LittleEndian methods, provided for clarity

!----------------------------------------------------------------------------------
! Returns a big endian long when passed a little endian one
StringTheory.BigEndian Procedure(ulong x)
  code
  return self.SwitchEndian(x)

!----------------------------------------------------------------------------------
! Returns a little endian long when passed a big endian one
StringTheory.LittleEndian Procedure(ulong x)
  CODE
  return self.SwitchEndian(x)

!----------------------------------------------------------------------------------
! Reverse the byte order of the stored string
StringTheory.ReverseByteOrder Procedure()
  CODE
  self.reverse()

!----------------------------------------------------------------------------------
StringTheory.Reverse  Procedure (String pString)
str  StringTheory
  CODE
  if size(pString) = 0 then return ''.
  str.SetValue(pString)
  str.Reverse()
  Return Str.value[1 : str._DataEnd]

!----------------------------------------------------------------------------------
StringTheory.Reverse  Procedure ()
s               string(1), auto
sPos            long, auto
ePos            long, auto
dataLen         long, auto
  code
  ePos = self._DataEnd
  if epos < 1 then return.

  dataLen = Int(ePos/2)
  loop sPos = 1 to dataLen
    s = self.value[sPos]
    self.value[sPos] = self.value[ePos]
    self.value[ePos] = s
    ePos -= 1
  end

!----------------------------------------------------------------------------------
! Returns the current value as a string (equivilent to GetValue())
StringTheory.Str Procedure() !, string
  code
  if self._DataEnd < 1 then return ''.
  return self.value[1 : self._DataEnd]


!----------------------------------------------------------------------------------
! Sets the value to newValue and returns the value set
! or an empty string is the passed string length is zero.
StringTheory.Str Procedure(string newValue) !, string
  code
  self.SetValue(newValue)
  if self._DataEnd < 1 then return ''.
  return self.value[1 : self._DataEnd]

!----------------------------------------------------------------------------------
StringTheory.Str Procedure(*string newValue) !, string
  code
  self.SetValue(newValue)
  if self._DataEnd < 1 then return ''.
  return self.value[1 : self._DataEnd]

!----------------------------------------------------------------------------------
! Sets the value of the specified region within the string to the passed string.
! If pEnd is zero then it is calculated based on the start position and size of
! the passed newValue, otherwise if the newValue is too large to fit in the slice
! it is truncated and if it is too small it is padded with spaces. The string is
! expanded if pEnd is greater than the current string length.
StringTheory.SetSlice Procedure(long pStart=1, long pEnd=0, stringTheory newValue)
  code
  if newValue._DataEnd
    self.setSlice(pStart, pEnd, newValue.value[1 : newValue._DataEnd])
  else
    self.setSlice(pStart, pEnd, '')
  end

StringTheory.SetSlice Procedure(long pStart=1, long pEnd=0, string newValue)
  code
  self.setSlice(pStart, pEnd, newValue)

StringTheory.SetSlice Procedure(long pStart=1, long pEnd=0, *string newValue)
  code
  if pStart < 1
    return
  elsif pEnd = 0
    if size(newValue) > 0
      pEnd = pStart + size(newValue) - 1
    else
      pEnd = pStart
    end
  elsif pEnd < pStart
    return
  end

  if pEnd > self._DataEnd
    self.SetLength(pEnd)    ! expand the string
  end

  self.Value[pStart : pEnd] = newValue

!----------------------------------------------------------------------------------
! Sets the value of the specified region within the string to the passed string.
! Unlike setSlice() which either truncates or space fills the new value to fit the
! existing size of the slice, replaceSlice() will expand or contract the slice
! within the value string to exactly fit the newValue.
StringTheory.ReplaceSlice Procedure(long pStart=1, long pEnd=0, stringTheory newValue)
  code
  if newValue._DataEnd
    self.ReplaceSlice(pStart, pEnd, newValue.value[1 : newValue._DataEnd])
  else
    self.ReplaceSlice(pStart, pEnd, '')
  end

StringTheory.ReplaceSlice Procedure(long pStart=1, long pEnd=0, string newValue)
  code
  self.ReplaceSlice(pStart, pEnd, newValue)

StringTheory.ReplaceSlice Procedure(long pStart=1, long pEnd=0, *string newValue)
curSize long,auto
lenDiff long,auto
  code
  if pStart < 1 then return.
  if pEnd = 0
    if size(newValue) > 0
      pEnd = pStart + size(newValue) - 1
    else
      pEnd = pStart
    end
  elsif pEnd < pStart
    return
  end

  if pEnd < self._DataEnd
    curSize = pEnd-pStart+1                           ! current size of slice
    if address(newValue) = 0 or size(newValue) = 0
      if curSize = self._DataEnd
        self.free()
      else
        self.removeFromPosition(pStart, curSize)
      end
    else
      lenDiff = size(newValue) - curSize
      if lenDiff > 0
        self.insert(pStart,all(' ',lenDiff))          ! expand slice
      elsif lenDiff < 0
        self.removeFromPosition(pStart, abs(lenDiff)) ! contract slice
      end
      stMemCpyLeft(address(self.value)+pStart-1, address(newValue),size(newValue))
    end
  else
    self.setLength(pStart+size(newValue)-1)
    if size(newValue) and address(newValue) then stMemCpyLeft(address(self.value)+pStart-1,address(newValue),size(newValue)).
  end

StringTheory.Insert Procedure(long pStart, stringTheory insertValue)
  code
  if insertValue._DataEnd
    self.Insert(pStart, insertValue.value[1 : insertValue._DataEnd])
  end

StringTheory.Insert Procedure(long pStart, string insertValue)
  code
  self.Insert(pStart, insertValue)

StringTheory.Insert Procedure(long pStart, *string insertValue)
newStr  &string
newSize long,auto
  code
  if address(insertValue) = 0 or size(insertValue) = 0 then return.
  if pStart < 1 then pStart = 1.

  if pStart = 1
    self.prepend(InsertValue)
  elsif pStart > self._DataEnd
    self.setLength(pStart+size(insertValue)-1)
    stMemCpyLeft(address(self.value)+pStart-1,address(insertValue),size(insertValue))
  else
    newSize = self._DataEnd + size(insertValue)
    if self.UseBuffer = 0 or size(self.value) < newSize
      ! need to change physical buffer size
      ! following is equivalent of: self.setvalue(self.value[1 : pStart-1] & insertValue & self.value[pstart : self._DataEnd])
      if self.UseBuffer
        newStr &= new string(self._GetNextBufferSize(newSize))
      else
        newStr &= new string(newSize) ! exact size if not using buffer
      end
      if newStr &= null
        ! out of memory?? - try slower way to get memory messages etc
        dispose(newStr)
        self.setvalue(self.value[1 : pStart-1] & insertValue & self.value[pstart : self._DataEnd])
      else
        stMemCpyLeft(address(newStr),address(self.Value),pstart-1)
        stMemCpyLeft(address(newStr)+pStart-1,address(insertValue),size(insertValue))
        stMemCpyLeft(address(newStr)+pStart-1+size(insertValue),address(self.value)+pStart-1,self._DataEnd-pStart+1)
        dispose(self.value)
        self.value &= newStr
        self.valuePtr &= self.value
      end
    else
      ! fits in current buffer so shuffle along old contents
      stMemCpyRight(address(self.value)+pStart-1+size(insertValue),address(self.value)+pStart-1,self._DataEnd-pStart+1)
      stMemCpyLeft(address(self.value)+pStart-1,address(insertValue),size(insertValue))
    end
    self._DataEnd = newSize
  end

! -----------------------------------------------------------------------------------------------
! insert a value every x characters.  this is functionally the same as:
!    self.splitEvery(numChars)
!    self.join(insertValue)
! but was written to cater for low memory situation where insufficient memory
! is available for the lines queue.
StringTheory.InsertEvery Procedure(long numChars, string insertValue)
  code
  self.InsertEvery(numChars, insertValue)

StringTheory.InsertEvery Procedure(long numChars, *string insertValue)
oldLen   long,auto
newLen   long,auto
toMove   long,auto
destAddr long,auto
srcAddr  long,auto
inserts  long,auto
  code
  if self._DataEnd <= numChars or address(insertValue) = 0 or size(insertValue) = 0 then return.

  oldLen = self._DataEnd       ! save old (current) size
  inserts = oldLen / numChars
  toMove  = oldLen % numChars  ! the first move may be an odd number of chars, but the subsequent moves will be exactly numChars
  if toMove = 0
    toMove = numChars
    inserts -= 1               ! last row is exact multiple of numChars width
  end
  newLen = oldLen + (inserts * size(insertValue))
  self.SetLength(newLen)
  if self._DataEnd <> newLen
    self.ErrorTrap('InsertEvery','Unable to increase value size - probably out of memory',true)
    return
  end
  ! we now shuffle down characters to the right inserting new chars as we go.  Characters are only ever moved at most once.
  destAddr = address(self.value) + newLen
  srcAddr  = address(self.value) + oldLen
  loop inserts times
    destAddr -= toMove
    srcAddr  -= toMove
    stMemCpyRight(destAddr, srcAddr, toMove)
    destAddr -= size(insertValue)
    stMemCpyLeft(destAddr, address(insertValue), size(insertValue))  ! insert divider char(s)
    toMove = numChars
  end
! -----------------------------------------------------------------------------------------------
! Quote the string
StringTheory.Quote Procedure(<string pQuotestart>, <string pQuoteEnd>, bool pQuoteEmpty=false)
quoteStart          string(1), auto
quoteEnd            string(1), auto
  code

  if self._DataEnd < 1 and pQuoteEmpty = false then return.

  if omitted(pQuotestart) or size(pQuoteStart) = 0
    quoteStart = '"'
  else
    quoteStart = pQuoteStart
  end

  if omitted(pQuoteEnd) or size(pQuoteEnd) = 0
    quoteEnd = quoteStart
  else
    quoteEnd = pQuoteEnd
  end

  if self._DataEnd > 1 and self.value[1] = quoteStart and self.value[self._DataEnd] = quoteEnd
    ! do nothing as string is already quoted
  elsif self._DataEnd < 1
    self.SetValue(quoteStart & quoteEnd)    ! quote empty string
  else
    if self.UseBuffer and size(self.value) >= self._DataEnd + 2
      self._DataEnd += 2
    else
      self.SetLength(self._DataEnd + 2)
    end
    stMemCpyRight(address(self.value)+1,address(self.value),self._DataEnd)
    self.value[1] = quoteStart
    self.value[self._DataEnd] = quoteEnd
  end

! -----------------------------------------------------------------------------------------------
! Remove quotes from the string
StringTheory.UnQuote Procedure(<string pQuotestart>, <string pQuoteEnd>)
quoteStart          string(1), auto
quoteEnd            string(1), auto
  code

    if self._DataEnd < 2
        return
    end

    if omitted(pQuotestart) or size(pQuoteStart) = 0
        if self.value[1] = ''''
            quoteStart = ''''                               ! single quote
        else
            quoteStart = '"'                                ! double quote (default)
        end
    else
        quoteStart = pQuoteStart
    end

    if omitted(pQuoteEnd) or size(pQuoteEnd) = 0
        quoteEnd = quoteStart
    else
        quoteEnd = pQuoteEnd
    end

    if self.value[1] = quoteStart and self.value[self._DataEnd] = quoteEnd
      self.crop(2, self._DataEnd - 1)
    end

! -------------------------------------------------------------------------------------
! Search for and replace a specific byte in the string with another byte and return number of replacements
StringTheory.ReplaceByte Procedure(byte pOld, byte pNew) !,long
count       long
addr        long, auto
beyond      long, auto  ! address one past end of value
  code
  if self._DataEnd < 1 or pOld = pNew then return 0.
  addr   = address(self.value)
  beyond = addr + self._DataEnd
  loop
    addr = memchr(addr, pOld, beyond - addr)
    if not addr then break.
    stMemSet(addr,pNew,1)
    count += 1
    addr  += 1
  end
  return count

! -------------------------------------------------------------------------------------
! Remove bytes flagged in passed CharMap and return number of removals
! pCharMap is 256 bytes long.  offset by 1 so chars 0->255 are represented by bytes 1->256
StringTheory._removeMatchingChars Procedure(*string pCharMap) !,long
charMap   byte, dim(size(pCharMap)), over(pCharMap)
removed   long
count     long
b         &byte
addr      long,auto
endAddr   long,auto
  code
  if size(pCharMap) <> 256
    self.ErrorTrap('_removeMatchingChars','Character Map parameter must be a string of size 256.',true)
    return 0
  end

  addr = address(self.value)
  endAddr = addr + self._DataEnd - 1
  loop addr = addr to endAddr
    b &= (addr)                                                ! point at byte
    if charMap[b+1] = 1                                        ! remove this character?
      if count
        stMemCpyLeft(addr-removed-count,addr-count,count)          ! shuffle down chars
        count = 0
      end
      removed += 1
    else
      if removed then count += 1.
    end
  end
  if count then stMemCpyLeft(addr-removed-count,addr-count,count). ! shuffle down last chars

  if removed
    if self.UseBuffer
      self._DataEnd -= removed
      if self.CleanBuffer
        stMemSet(address(self.value)+self._DataEnd,32,removed)
      end
    else
      self.setLength(self._DataEnd-removed)
    end
  end
  return removed

! -------------------------------------------------------------------------------------
! Replace bytes flagged in passed CharMap and return number of replacements
! pCharMap is 256 bytes long.  offset by 1 so chars 0->255 are represented by bytes 1->256
StringTheory._replaceMatchingChars Procedure(*string pCharMap, byte pReplacement) !,long
charMap   byte, dim(size(pCharMap)), over(pCharMap)
replaced  long
b         &byte
addr      long,auto
endAddr   long,auto
  code
  if size(pCharMap) <> 256
    self.ErrorTrap('_replaceMatchingChars','Character Map parameter must be a string of size 256.',true)
    return 0
  end

  charMap[pReplacement+1] = 0                                         ! replacement char does not need replacing

  addr = address(self.value)
  endAddr = addr + self._DataEnd - 1
  loop addr = addr to endAddr
    b &= (addr)                                                       ! point at byte
    if charMap[b+1]
      stMemSet(addr, pReplacement, 1)                                 ! replace char
      replaced += 1
    end
  end
  return replaced

! -------------------------------------------------------------------------------------
! Remove a range of bytes in the string and return number of removals
! this is more efficient than using RemoveByteRanges where there is only one range
StringTheory.RemoveByteRange Procedure(byte pLow, byte pHigh) !,long
charsMap  string(256),auto
charMap   byte,dim(256),over(charsMap)
  code
  if self._DataEnd < 1 or pLow > pHigh then return 0.
  if pLow = pHigh then return self.removeByte(pLow).

  stMemSet(address(charsMap),0,size(charsMap))
  loop pLow = pLow to pHigh
    charMap[pLow+1] = 1                        ! mark that char is to be removed
  end
  return self._removeMatchingChars(charsMap)

! -------------------------------------------------------------------------------------
! Search for and remove a specific byte in the string and return number of removals
StringTheory.RemoveByte Procedure(byte pByte) !,long
dest      long,auto                                                  ! destination to shuffle chars down to
removed   long
addr      long,auto
beyond    long,auto                                                  ! address one past end of value
  code
  if self._DataEnd < 1 then return 0.
  addr   = address(self.value)
  beyond = addr + self._DataEnd
  loop
    addr = memchr(addr, pByte, beyond-addr)
    if not addr then break.
    if removed then stMemCpyLeft(dest, dest+removed, addr-dest-removed). !shuffle down chars
    dest = addr - removed
    removed += 1
    addr  += 1
  end
  if removed ! do we need to shuffle down remaining chars and adjust length?
    if beyond > dest+removed then stMemCpyLeft(dest, dest+removed, beyond-dest-removed). !shuffle down last chars
    if self.UseBuffer
      self._DataEnd -= removed
      if self.CleanBuffer
        stMemSet(address(self.value)+self._DataEnd,32,removed)
      end
    else
      self.setLength(self._DataEnd - removed)
    end
  end
  return removed

! -------------------------------------------------------------------------------------
! Count the number of times a specific byte is in the string
StringTheory.CountByte Procedure(byte pSearchValue) !,long
count       long
addr        long, auto
beyond      long, auto  ! address one past end of value
  code
  if self._DataEnd < 1 then return 0.
  addr   = address(self.value)
  beyond = addr + self._DataEnd
  loop
    addr = memchr(addr, pSearchValue, beyond - addr)
    if not addr then break.
    count += 1
    addr  += 1
  end
  return count

StringTheory.CountByte Procedure(byte pSearchValue, long pStart) !,long
count       long
addr        long, auto
beyond      long, auto  ! address one past end of value
  code
  if self._DataEnd < 1 or pStart > self._DataEnd then return 0.
  if pStart < 2
    addr = address(self.value)
  else
    addr = address(self.value) + pStart - 1
  end
  beyond = address(self.value) + self._DataEnd
  loop
    addr = memchr(addr, pSearchValue, beyond - addr)
    if not addr then break.
    count += 1
    addr  += 1
  end
  return count

StringTheory.CountByte Procedure(byte pSearchValue, long pStart, long pEnd) !,long
count       long
addr        long, auto
beyond      long, auto  ! address one past end char
  code
  if self._DataEnd < 1 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart > pEnd then return 0.
  addr   = address(self.value) + pStart - 1
  beyond = address(self.value) + pEnd
  loop
    addr = memchr(addr, pSearchValue, beyond - addr)
    if not addr then break.
    count += 1
    addr  += 1
  end
  return count

! -------------------------------------------------------------------------------------
! Find a specific byte and return the position of the match
StringTheory.FindByte Procedure(byte pSearchValue) !,long
i           long, auto
  code
  if self._DataEnd = 0 then return 0.
  i = memchr(address(self.value), pSearchValue, self._DataEnd)
  if i = 0 then return 0.
  return i - address(self.value) + 1

! -------------------------------------------------------------------------------------
StringTheory.FindByte Procedure(byte pSearchValue, long pStart) !,long
i           long, auto
numChars    long, auto
  code
  if self._DataEnd = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pStart = 1
    i = memchr(address(self.value), pSearchValue, self._DataEnd)
  else
    numChars = self._DataEnd - pStart + 1
    if numChars < 1 then return 0.
    i = memchr(address(self.value) + pStart - 1, pSearchValue, numChars)
  end
  if i = 0 then return 0.
  return i - address(self.value) + 1

! -------------------------------------------------------------------------------------
StringTheory.FindByte Procedure(byte pSearchValue, long pStart=1, long pEnd) !,long
i           long, auto
numChars    long, auto
  code
  if self._DataEnd = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  numChars = pEnd - pStart + 1
  if numChars < 1 then return 0.
  i = memchr(address(self.value) + pStart - 1, pSearchValue, numChars)
  if i = 0 then return 0.
  return i - address(self.value) + 1

! -------------------------------------------------------------------------------------
StringTheory.FindByte Procedure(byte pSearchValue, long pStart=1, long pEnd=0, String p_Text) !,long
i           long, auto
numChars    long, auto
  code
  if size(p_text) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > size(p_text) then pEnd = size(p_text).
  numChars = pEnd - pStart + 1
  if numChars < 1 then return 0.
  i = memchr(address(p_Text) + pStart - 1, pSearchValue, numChars)
  if i = 0 then return 0.
  return i - address(p_Text) + 1

! -------------------------------------------------------------------------------------
StringTheory.FindByte Procedure(byte pSearchValue, long pStart=1, long pEnd=0, *String p_Text) !,long
i           long, auto
numChars    long, auto
  code
  if size(p_text) = 0 or address(p_text) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > size(p_text) then pEnd = size(p_text).
  numChars = pEnd - pStart + 1
  if numChars < 1 then return 0.
  i = memchr(address(p_Text) + pStart - 1, pSearchValue, numChars)
  if i = 0 then return 0.
  return i - address(p_Text) + 1

! -------------------------------------------------------------------------------------
! Find a specific character and return the position of the match
StringTheory.FindChar Procedure(string pSearchValue)
i           long, auto
  code
  if self._DataEnd = 0 or size(pSearchValue) = 0 then return 0.
  i = memchr(address(self.value), val(pSearchValue[1]), self._DataEnd)
  if i = 0 then return 0.
  return i - address(self.value) + 1

! -------------------------------------------------------------------------------------
StringTheory.FindChar Procedure(string pSearchValue, long pStart)
i           long, auto
numChars    long, auto
  code
  if self._DataEnd = 0 or size(pSearchValue) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pStart = 1
    i = memchr(address(self.value), val(pSearchValue[1]), self._DataEnd)
  else
    numChars = self._DataEnd - pStart + 1
    if numChars < 1 then return 0.
    i = memchr(address(self.value) + pStart - 1, val(pSearchValue[1]), numChars)
  end
  if i = 0 then return 0.
  return i - address(self.value) + 1

! -------------------------------------------------------------------------------------
StringTheory.FindChar Procedure(string pSearchValue, long pStart=1, long pEnd)
i           long, auto
numChars    long, auto
  code
  if self._DataEnd = 0 or size(pSearchValue) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  numChars = pEnd - pStart + 1
  if numChars < 1 then return 0.
  i = memchr(address(self.value) + pStart - 1, val(pSearchValue[1]), numChars)
  if i = 0 then return 0.
  return i - address(self.value) + 1

! -------------------------------------------------------------------------------------
StringTheory.FindChar Procedure(string pSearchValue, long pStart=1, long pEnd=0, String p_Text)!,long
i           long, auto
numChars    long, auto
  code
  if size(p_text) = 0 or size(pSearchValue) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > size(p_text) then pEnd = size(p_text).
  numChars = pEnd - pStart + 1
  if numChars < 1 then return 0.
  i = memchr(address(p_Text) + pStart - 1, val(pSearchValue[1]), numChars)
  if i = 0 then return 0.
  return i - address(p_Text) + 1

! -------------------------------------------------------------------------------------
StringTheory.FindChar Procedure(string pSearchValue, long pStart=1, long pEnd=0, *String p_Text)!,long
i           long, auto
numChars    long, auto
  code
  if size(p_text) = 0 or address(p_text) = 0 or size(pSearchValue) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > size(p_text) then pEnd = size(p_text).
  numChars = pEnd - pStart + 1
  if numChars < 1 then return 0.
  i = memchr(address(p_Text) + pStart - 1, val(pSearchValue[1]), numChars)
  if i = 0 then return 0.
  return i - address(p_Text) + 1

! -------------------------------------------------------------------------------------
! Find a string and return the position of the match
StringTheory.FindChars Procedure(*string pSearchValue)
  code
  return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)

StringTheory.FindChars Procedure(string pSearchValue)
  code
  return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)

StringTheory.FindChars Procedure(*string pSearchValue, long pStart)
i           long, auto
  code
  if pStart < 2
    return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)
  else
    i = self.FindCharsAddr(pSearchValue,address(self.value)+pStart-1,self._DataEnd-pStart+1)
    if i
      return i - 1 + pStart
    else
      return 0
    end
  end

StringTheory.FindChars Procedure(string pSearchValue, long pStart)
i           long, auto
  code
  if pStart < 2
    return self.FindCharsAddr(pSearchValue,address(self.value),self._DataEnd)
  else
    i = self.FindCharsAddr(pSearchValue,address(self.value)+pStart-1,self._DataEnd-pStart+1)
    if i
      return i - 1 + pStart
    else
      return 0
    end
  end

StringTheory.FindChars Procedure(*string pSearchValue, long pStart=1, long pEnd)
i           long, auto
  code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart = 1 then return self.FindCharsAddr(pSearchValue,address(self.value),pEnd).
  i = self.FindCharsAddr(pSearchValue,address(self.value)+pStart-1,pEnd-pStart+1)
  if i
    return i - 1 + pStart
  else
    return 0
  end

StringTheory.FindChars Procedure(string pSearchValue, long pStart=1, long pEnd)
i           long, auto
  code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd then pEnd = self._DataEnd.
  if pStart = 1 then return self.FindCharsAddr(pSearchValue,address(self.value),pEnd).
  i = self.FindCharsAddr(pSearchValue,address(self.value)+pStart-1,pEnd-pStart+1)
  if i
    return i - 1 + pStart
  else
    return 0
  end

StringTheory.FindChars Procedure(*string pSearchValue, long pStart=1, long pEnd=0, *String p_Text)!,long
i           long, auto
  code
  if size(p_Text) = 0 or address(p_Text) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > size(p_Text) then pEnd = size(p_Text).
  if pStart = 1 then return self.FindCharsAddr(pSearchValue,address(p_Text),pEnd).
  i = self.FindCharsAddr(pSearchValue,address(p_Text)+pStart-1,pEnd-pStart+1)
  if i
    return i - 1 + pStart
  else
    return 0
  end

StringTheory.FindChars Procedure(string pSearchValue, long pStart=1, long pEnd=0, *String p_Text)!,long
i           long, auto
  code
  if address(p_Text) = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > size(p_Text) then pEnd = size(p_Text).
  if pStart = 1 then return self.FindCharsAddr(pSearchValue,address(p_Text),pEnd).
  i = self.FindCharsAddr(pSearchValue,address(p_Text)+pStart-1,pEnd-pStart+1)
  if i
    return i - 1 + pStart
  else
    return 0
  end

!-----------------------------------------------------------------------------------------------------
StringTheory.FindChars Procedure(string pSearchValue, long pStart=1, long pEnd=0, String p_Text)!,long
i           long, auto
  code
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > size(p_Text) then pEnd = size(p_Text).
  if pStart = 1 then return self.FindCharsAddr(pSearchValue,address(p_Text),pEnd).
  i = self.FindCharsAddr(pSearchValue,address(p_Text)+pStart-1,pEnd-pStart+1)
  if i
    return i - 1 + pStart
  else
    return 0
  end

!-----------------------------------------------------------------------------------------------------
! find the last occurrence of search string
StringTheory.FindLast  Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNocase=false) !, long
  code
  return self.Instring(pSearchValue, -1, pStart, pEnd, pNoCase, false)

!-----------------------------------------------------------------------------------------------------
! replace the last occurrence of search string
StringTheory.ReplaceLast  Procedure (string pOldValue, string pNewValue, long pStart=1, long pEnd=0, long pNocase=0) !, long
x           long, auto
  code
  x = self.FindLast(pOldValue, pStart, pEnd, pNocase)
  if x = 0 then return 0.                ! occurrence not found
  self.replaceSlice(x,x+size(pOldValue)-1,pNewValue)
  return 1

!-----------------------------------------------------------------------------------------------------
! find the Nth occurrence of search string
StringTheory.FindNth  Procedure (string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNocase=false) !, long
x           long, auto
y           long, auto
ans         long
count       long
i           long, auto
len         long, auto
haystack    &string
  code
  if size(pSearchValue) = 0 or pOccurrence = 0 then return 0.
  if pStart < 1 then pStart = 1.
  if pEnd < 1 or pEnd > self._DataEnd
    pEnd = self._DataEnd
  end
  len = pEnd - pStart + 1
  if size(pSearchValue) * abs(pOccurrence) > len then return 0. ! search value too long to match N occurrences
  if pOccurrence < 0  ! negative occurrence is counted from the end backwards
    if pOccurrence = -1
      ans = self.findLast(pSearchValue, pStart, pEnd, pNocase)
    else
      do findBackwards
    end
  else
    if pNoCase
      pSearchValue = Upper(pSearchValue)
      if pSearchValue = Lower(pSearchValue)
        pNocase = false
        haystack &= (address(self.value) + pStart - 1) & ':' & len
      else
        haystack &= new String(len)
        haystack = upper(self.value[pStart : pEnd])
      end
    else
      haystack &= (address(self.value) + pStart - 1) & ':' & len
    end
    if size(pSearchValue) = 1 ! optimized version when searching for a single character
      x = address(haystack)
      i = address(haystack) + len
      loop
        x = memchr(x, val(pSearchValue), i - x)
        if x
          count += 1
          if count < pOccurrence
            x += 1
            cycle
          end
          ans = x - address(haystack) + pStart ! found occurrence
        end
        break
      end
    else
      x = 0                                    ! x is offset on haystack. note: haystack is already offset if the passed-in value of pStart was > 1, hence we ignore pStart
      loop
        y = self.FindCharsAddr(pSearchValue,address(haystack)+x,len-x)
        if y
          x += y - 1
          count += 1
          if count < pOccurrence
            x += size(pSearchValue)
            cycle
          end
          ans = x + pStart                     ! found occurrence
        end
        break
      end
    end
    if pNoCase then dispose(haystack).
  end
  return ans

findBackwards routine                          ! we reverse needle and haystack and search forwards
  data
str  StringTheory
  code
  if self.useBuffer then str.setLength(len).   ! pre-allocate exact memory required later for haystack
  str.setValue(pSearchValue)                   ! note do NOT do reverse directly on pSearchValue as that will create another ST object
  str.reverse()
  pSearchValue = str.value[1 : str._DataEnd]
  if pNoCase
    pSearchValue = Upper(pSearchValue)
    if pSearchValue = Lower(pSearchValue)
      pNocase = false
      str.setValueByAddress(address(self.value) + pStart - 1,len)
    else
      str.setValue(upper(self.value[pStart : pEnd]))
    end
  else
    str.setValueByAddress(address(self.value) + pStart - 1,len)
  end
  str.reverse()
  ans = str.findNth(pSearchValue,abs(pOccurrence)) ! search forwards for Nth occurrence
  if ans
    ans = str._DataEnd - ans - size(pSearchValue) + 1 + pStart
  end

!-----------------------------------------------------------------------------------------------------
! replace the Nth occurrence of search string
StringTheory.ReplaceNth  Procedure (string pOldValue, string pNewValue, long pOccurrence, long pStart=1, long pEnd=0, long pNocase=0) !, long
x           long, auto
  code
  x = self.FindNth(pOldValue, pOccurrence, pStart, pEnd, pNocase)
  if x = 0 then return 0.                ! occurrence not found
  self.replaceSlice(x,x+size(pOldValue)-1,pNewValue)
  return 1

!-----------------------------------------------------------------------------------------------------
StringTheory.FindCharsAddr Procedure(*string pSearchValue, long pAddr, long pLen)!,long
i           long, auto
endAddress  long, auto
pos         long, auto
searchLen   long, auto
compareLen  long, auto
  code
  if size(pSearchValue) = 0 or address(pSearchValue) = 0 or pLen < 1 then return 0.
  compareLen = size(pSearchValue)-1
  if compareLen = 0
    ! optimize single char search
    i = memChr(pAddr,val(pSearchValue),pLen)
    if i = 0 then return 0.
    return i - pAddr + 1                                     ! return byte position where pSearchValue was matched
  end

  endAddress = pAddr + pLen - size(pSearchValue)
  i = pAddr                                                  ! set up the initial address to search from
  loop
    loop pos = 1 TO size(pSearchValue)                       ! get match on each character of pSearchValue
      searchLen = endAddress - i + pos
      if searchLen <= 0 then return 0.                       ! no room for match
      i = memChr(i, val(pSearchValue[pos]),searchLen)        ! search for next character
      if i = 0 then return 0.                                ! no match
      i += 1
    end
    i -= size(pSearchValue)
    if memcmp(i, Address(pSearchValue), compareLen) = 0      ! do we have match? (with memcmp 0 = match)
      return i - pAddr + 1                                   ! return byte position where pSearchValue was matched
    end
    i += 1
  end

!--------------------------------------------------------------------------------------------------------
! similar to memChr but works on multi-character strings like findCharsAddr.
! Like memChr it returns memory address of match or zero if no match
StringTheory._memChrs Procedure(*string pSearchValue, long pAddr, long pMaxStartAddr)!,long
pos        LONG,auto
searchLen  LONG,auto
compareLen LONG,auto
  code
  if address(pSearchValue) = 0 or size(pSearchValue) = 0 then return 0.
  compareLen = size(pSearchValue)-1
  if compareLen = 0 then return memChr(pAddr,val(pSearchValue),pMaxStartAddr - pAddr + 1). ! single char search

  loop
    loop pos = 1 TO size(pSearchValue)                                                     ! get match on each character of pSearchValue
      searchLen = pMaxStartAddr - pAddr + pos
      if searchLen <= 0 then return 0.                                                     ! no room for match
      pAddr = memChr(pAddr, val(pSearchValue[pos]),searchLen)                              ! search for next character
      if pAddr = 0 then return 0.                                                          ! no match
      pAddr += 1
    end
    pAddr -= size(pSearchValue)
    if memcmp(pAddr, Address(pSearchValue), compareLen) = 0                                ! do we have match? (with memcmp 0 = match)
      return pAddr
    end
    pAddr += 1
  end

! case insensitive version of _memChrs
StringTheory._memiChrs Procedure(*string pSearchValue, long pAddr, long pMaxStartAddr)!,long
pos        LONG,auto
searchLen  LONG,auto
compareLen LONG,auto
  code
  if address(pSearchValue) = 0 or size(pSearchValue) = 0 then return 0.
  compareLen = size(pSearchValue)-1
  if compareLen = 0 then return self._memiChr(pAddr,val(pSearchValue),pMaxStartAddr - pAddr + 1). ! single char search
  loop
    loop pos = 1 TO size(pSearchValue)                                                            ! get match on each character of pSearchValue
      searchLen = pMaxStartAddr - pAddr + pos
      if searchLen <= 0 then return 0.                                                            ! no room for match
      pAddr = self._memiChr(pAddr, val(pSearchValue[pos]),searchLen)                              ! search for next character
      if pAddr = 0 then return 0.                                                                 ! no match
      pAddr += 1
    end
    pAddr -= size(pSearchValue)
    if stMemiCmp(pAddr, Address(pSearchValue), compareLen) = 0                                    ! do we have match? (with memicmp 0 = match)
      return pAddr
    end
    pAddr += 1
  end

! case insensitive version of memChr - note: parms modelled on memChr not _memiChrs
StringTheory._memiChr Procedure(long pAddr, long pChar, long pLen)!,long
pos1       LONG,auto
pos2       LONG,auto
  code
  if pAddr = 0 or pLen < 1 then return 0.
  pos1 = memChr(pAddr,pChar,pLen)
  if pos1 = pAddr then return pos1.    ! match on first char
  case pChar                           ! swap case and see if it occurs sooner
  of 65 to 90                          ! A to Z
    pChar += 32
  of 97 to 122                         ! a to z
    pChar -= 32
  else
    return pos1                        ! not an alpha letter
  end
  pos2 = memChr(pAddr,pChar,choose(pos1 = 0,pLen,pos1-pAddr))
  return choose(pos2 = 0,pos1,pos2)    ! return whichever occurs first

!------------------------------------------------------------------------------
! takes in a color in clarion, or web format, and returns it in Clarion format.
StringTheory.ColorFromHex Procedure  (String pColor)
  code
  return self.ColorToLong(pColor)

!------------------------------------------------------------------------------
! takes in a color in clarion, or web format, and returns it in Clarion format.
StringTheory.ColorToLong Procedure  (String pColor)
str  StringTheory
  CODE
  str.SetValue(clip(pColor))
  if str._DataEnd < 1 then return color:none.

  if str.value[1] = '#'                   ! web # format
    return self._ColorFromHex(pColor)
  elsif str.IsAll('01234567890-.')        ! clarion long format
    str.removeChars('.')
    if pColor < 0                         ! System color
      return stGetSysColor(pColor - 80000000h)
    else
      return pColor
    end
  elsif str.count(',') >= 2 or (str.containsChar('(') and str.containsChar(')'))
    return self._ColorFromCSL(str.value[1 : str._DataEnd])
  else                                    ! try standard color names
    str.setvalue(self.ColorToHex(pColor,false))
    if str.IsAll('01234567890abcdefABCDEF') and (str._DataEnd = 3 or str._DataEnd = 6)
      str.prepend('#')
      return self._ColorFromHex(str.value[1 : str._DataEnd])
    else
      return color:none
    end
  end
  return color:none

!------------------------------------------------------------------------------
! takes in a color in Clarion or Web (#abcdef , #FFF, name) format and returns the color in web format.
StringTheory.ColorToHex  Procedure  (String pColor,long pAddHash=false)
str     StringTheory
clipLen long,auto
found   long,auto
  CODE
  if pColor = '' then return ''.
  str.SetValue(clip(pColor))
  if str.value[1] = '#'
    if str._DataEnd = 4
      str.setvalue(str.value[2] & str.value[2] & str.value[3] & str.value[3] & str.value[4] & str.value[4])
    end
  else
    if str.containsChar(',') or (str.containsChar('(') and str.containsChar(')'))
      str.SetValue(self._ColorFromCSL(str.value[1 : str._DataEnd]))  ! converts it to long
    end
    if str.IsAllDigits()
      str._ColorToHex(pAddHash)
    else
      str.removeByte(32)  ! remove all ' '
      if str._DataEnd < 3 ! shortest colors are three chars eg. red & tan
        found = false
      else
        found = true      ! default
        case lower(str.value[1 : str._DataEnd])
          of 'aliceblue' ; str.SetValue('#f0f8ff')
          of 'antiquewhite' ; str.SetValue('#faebd7')
          of 'aqua' ; str.SetValue('#00ffff')
          of 'aquamarine' ; str.SetValue('#7fffd4')
          of 'azure' ; str.SetValue('#f0ffff')
          of 'beige' ; str.SetValue('#f5f5dc')
          of 'bisque' ; str.SetValue('#ffe4c4')
          of 'black' ; str.SetValue('#000000')
          of 'blanchedalmond' ; str.SetValue('#ffebcd')
          of 'blue' ; str.SetValue('#0000ff')
          of 'blueviolet' ; str.SetValue('#8a2be2')
          of 'brown' ; str.SetValue('#a52a2a')
          of 'burlywood' ; str.SetValue('#deb887')
          of 'cadetblue' ; str.SetValue('#5f9ea0')
          of 'chartreuse' ; str.SetValue('#7fff00')
          of 'chocolate' ; str.SetValue('#d2691e')
          of 'coral' ; str.SetValue('#ff7f50')
          of 'cornflowerblue' ; str.SetValue('#6495ed')
          of 'cornsilk' ; str.SetValue('#fff8dc')
          of 'crimson' ; str.SetValue('#dc143c')
          of 'cyan' ; str.SetValue('#00ffff')
          of 'darkblue' ; str.SetValue('#00008b')
          of 'darkcyan' ; str.SetValue('#008b8b')
          of 'darkgoldenrod' ; str.SetValue('#b8860b')
          of 'darkgray' ; str.SetValue('#a9a9a9')
          of 'darkgreen' ; str.SetValue('#006400')
          of 'darkkhaki' ; str.SetValue('#bdb76b')
          of 'darkmagenta' ; str.SetValue('#8b008b')
          of 'darkolivegreen' ; str.SetValue('#556b2f')
          of 'darkorange' ; str.SetValue('#ff8c00')
          of 'darkorchid' ; str.SetValue('#9932cc')
          of 'darkred' ; str.SetValue('#8b0000')
          of 'darksalmon' ; str.SetValue('#e9967a')
          of 'darkseagreen' ; str.SetValue('#8fbc8f')
          of 'darkslateblue' ; str.SetValue('#483d8b')
          of 'darkslategrey' ; str.SetValue('#2f4f4f')
          of 'darkturquoise' ; str.SetValue('#00ced1')
          of 'darkviolet' ; str.SetValue('#9400d3')
          of 'deeppink' ; str.SetValue('#ff1493')
          of 'deepskyblue' ; str.SetValue('#00bfff')
          of 'dimgrey' ; str.SetValue('#696969')
          of 'dodgerblue' ; str.SetValue('#1e90ff')
          of 'firebrick' ; str.SetValue('#b22222')
          of 'floralwhite' ; str.SetValue('#fffaf0')
          of 'forestgreen' ; str.SetValue('#228b22')
          of 'fuchsia' ; str.SetValue('#ff00ff')
          of 'gainsboro' ; str.SetValue('#dcdcdc')
          of 'ghostwhite' ; str.SetValue('#f8f8ff')
          of 'gold' ; str.SetValue('#ffd700')
          of 'goldenrod' ; str.SetValue('#daa520')
          of 'gray' ; str.SetValue('#808080')
          of 'grey' ; str.SetValue('#808080')
          of 'green' ; str.SetValue('#008000')
          of 'greenyellow' ; str.SetValue('#adff2f')
          of 'honeydew' ; str.SetValue('#f0fff0')
          of 'hotpink' ; str.SetValue('#ff69b4')
          of 'indianred' ; str.SetValue('#cd5c5c')
          of 'indigo' ; str.SetValue('#4b0082')
          of 'ivory' ; str.SetValue('#fffff0')
          of 'khaki' ; str.SetValue('#f0e68c')
          of 'lavender' ; str.SetValue('#e6e6fa')
          of 'lavenderblush' ; str.SetValue('#fff0f5')
          of 'lawngreen' ; str.SetValue('#7cfc00')
          of 'lemonchiffon' ; str.SetValue('#fffacd')
          of 'lightblue' ; str.SetValue('#add8e6')
          of 'lightcoral' ; str.SetValue('#f08080')
          of 'lightcyan' ; str.SetValue('#e0ffff')
          of 'lightgoldenrodyellow' ; str.SetValue('#fafad2')
          of 'lightgray' ; str.SetValue('#d3d3d3')
          of 'lightgreen' ; str.SetValue('#90ee90')
          of 'lightpink' ; str.SetValue('#ffb6c1')
          of 'lightsalmon' ; str.SetValue('#ffa07a')
          of 'lightseagreen' ; str.SetValue('#20b2aa')
          of 'lightskyblue' ; str.SetValue('#87cefa')
          of 'lightslategrey' ; str.SetValue('#778899')
          of 'lightsteelblue' ; str.SetValue('#b0c4de')
          of 'lightyellow' ; str.SetValue('#ffffe0')
          of 'lime' ; str.SetValue('#00ff00')
          of 'limegreen' ; str.SetValue('#32cd32')
          of 'linen' ; str.SetValue('#faf0e6')
          of 'magenta' ; str.SetValue('#ff00ff')
          of 'maroon' ; str.SetValue('#800000')
          of 'mediumaquamarine' ; str.SetValue('#66cdaa')
          of 'mediumblue' ; str.SetValue('#0000cd')
          of 'mediumorchid' ; str.SetValue('#ba55d3')
          of 'mediumpurple' ; str.SetValue('#9370db')
          of 'mediumseagreen' ; str.SetValue('#3cb371')
          of 'mediumslateblue' ; str.SetValue('#7b68ee')
          of 'mediumspringgreen' ; str.SetValue('#00fa9a')
          of 'mediumturquoise' ; str.SetValue('#48d1cc')
          of 'mediumvioletred' ; str.SetValue('#c71585')
          of 'midnightblue' ; str.SetValue('#191970')
          of 'mintcream' ; str.SetValue('#f5fffa')
          of 'mistyrose' ; str.SetValue('#ffe4e1')
          of 'moccasin' ; str.SetValue('#ffe4b5')
          of 'navajowhite' ; str.SetValue('#ffdead')
          of 'navy' ; str.SetValue('#000080')
          of 'oldlace' ; str.SetValue('#fdf5e6')
          of 'olive' ; str.SetValue('#808000')
          of 'olivedrab' ; str.SetValue('#6b8e23')
          of 'orange' ; str.SetValue('#ffa500')
          of 'orangered' ; str.SetValue('#ff4500')
          of 'orchid' ; str.SetValue('#da70d6')
          of 'palegoldenrod' ; str.SetValue('#eee8aa')
          of 'palegreen' ; str.SetValue('#98fb98')
          of 'paleturquoise' ; str.SetValue('#afeeee')
          of 'palevioletred' ; str.SetValue('#db7093')
          of 'papayawhip' ; str.SetValue('#ffefd5')
          of 'peachpuff' ; str.SetValue('#ffdab9')
          of 'peru' ; str.SetValue('#cd853f')
          of 'pink' ; str.SetValue('#ffc0cb')
          of 'plum' ; str.SetValue('#dda0dd')
          of 'powderblue' ; str.SetValue('#b0e0e6')
          of 'purple' ; str.SetValue('#800080')
          of 'rebeccapurple' ; str.SetValue('#663399')
          of 'red' ; str.SetValue('#ff0000')
          of 'rosybrown' ; str.SetValue('#bc8f8f')
          of 'royalblue' ; str.SetValue('#4169e1')
          of 'saddlebrown' ; str.SetValue('#8b4513')
          of 'salmon' ; str.SetValue('#fa8072')
          of 'sandybrown' ; str.SetValue('#f4a460')
          of 'seagree' ; str.SetValue('#2e8b57')
          of 'seashell' ; str.SetValue('#fff5ee')
          of 'sienna' ; str.SetValue('#a0522d')
          of 'silver' ; str.SetValue('#c0c0c0')
          of 'skyblue' ; str.SetValue('#87ceeb')
          of 'slateblue' ; str.SetValue('#6a5acd')
          of 'slategray' ; str.SetValue('#708090')
          of 'snow' ; str.SetValue('#fffafa')
          of 'springgreen' ; str.SetValue('#00ff7f')
          of 'steelblue' ; str.SetValue('#4682b4')
          of 'tan' ; str.SetValue('#d2b48c')
          of 'teal' ; str.SetValue('#008080')
          of 'thistle' ; str.SetValue('#d8bfd8')
          of 'tomato' ; str.SetValue('#ff6347')
          of 'turquoise' ; str.SetValue('#40e0d0')
          of 'violet' ; str.SetValue('#ee82ee')
          of 'wheat' ; str.SetValue('#f5deb3')
          of 'white' ; str.SetValue('#ffffff')
          of 'whitesmoke' ; str.SetValue('#f5f5f5')
          of 'yellow' ; str.SetValue('#ffff00')
          of 'yellowgreen' ; str.SetValue('#9acd32')
        else
          found = false
        end ! case
      end

      if not found and str.IsAll('1234567890abcdefhABCDEFH')
        str.removeChars('hH')
        if str._DataEnd = 3
          str.setvalue(str.value[1] & str.value[1] & str.value[2] & str.value[2] & str.value[3] & str.value[3])
        end
      end
    end
  end
  if str._DataEnd < 1
      return ''
  elsif pAddHash = false
    if str.value[1] = '#' then str.RemoveFromPosition(1,1).
    if str._DataEnd > 6 then str.SetLength(6).
  else
    if str.value[1] <> '#' then str.Prepend('#').
    if str._DataEnd > 7 then str.SetLength(7).
  end
  clipLen = str.clipLength()
  if clipLen
    return str.value[1 : clipLen]
  else
    return ''
  end

! ----------------------------------------------------------------------------------
! Convert a color stored in a long to a hex string. If addHash is passed the
! color is returned using the standard web format: #FFFFFF
StringTheory._ColorToHex Procedure(long pAddHash=false)
pcolor              long,auto
rgb                 group,over(pColor)
r                       byte
g                       byte
b                       byte
                    end
  code
  pColor = self.GetValue()
  if pColor = COLOR:NONE
    self.free()
  end
  if pColor < 0 ! System color
    pColor = stGetSysColor(pColor - 80000000h)
  end
  ! Flip the byte order, as Clarion stores the red value in the lowest order byte and not the highest
  self.setvalue(choose(pAddHash=0,'','#') & self.ByteToHex(rgb.r) & self.ByteToHex(rgb.g) & self.ByteToHex(rgb.b))

!------------------------------------------------------------------------------------------
! Returns a long that contains the color when passed the a string
! containing a hexidecimal representation of the RGB value.
! Supports string of the form: #FFFFFF or FFFFFF or #FFF or FFF
! Returns -1 (COLOR:None) for invalid input
StringTheory._ColorFromHex Procedure(string pColor)
hcol                string(7)
claColor            long
rgb                 group,over(claColor)
r                       byte
g                       byte
b                       byte
                    end
clipLen             long,auto
  code
  if sub(pColor,1,1) = '#'
    pColor = sub(pColor,2,size(pColor)-1)
  end
  clipLen = self.clipLen(pColor)
  case clipLen
  of 3
    hcol = pColor[1] & pColor[1] & pColor[2] & pColor[2] & pColor[3] & pColor[3]
  of 6
    hcol = pColor
  else
    return color:none
  end
  rgb.r = self.HexToByte(hcol[1:2])
  rgb.g = self.HexToByte(hcol[3:4])
  rgb.b = self.HexToByte(hcol[5:6])
  return claColor

!------------------------------------------------------------------------------------------
! Returns a long that contains the color when passed a string
! containing a comma separated list of the RGB value. Missing values are assumed to be 0.
! Supports string of the form: rgb(r,g,b), (r,g,b) and r,g,b.
! Returns -1 (COLOR:None) for invalid input
StringTheory._ColorFromCSL Procedure(string pColor)
str                 StringTheory
claColor            long
rgb                 group,over(claColor)
r                       byte
g                       byte
b                       byte
                    end
x                   long,auto
  code
  str.SetValue(pColor)
  x = str.findChar('(')
  if x
    if x < str._DataEnd
      str.SetValue(str.value[x+1 : str._DataEnd])
    else
      str.free()
    end
  end
  x = str.findChar(')')
  if x then str.setLength(x-1).
  str.keepchars('0123456789,.')
  if str._DataEnd = 0 then return color:none.
  str.split(',')
  rgb.r = str.GetLine(1)
  rgb.g = str.GetLine(2)
  rgb.b = str.GetLine(3)
  return claColor

!-----------------------------------------------------------
! if called in this form, all the parameters must be set.
StringTheory.UrlEncode Procedure (String p_Text, long flags,String pDelimiter,String pSpace,String pAlphabet)
str   StringTheory
  code
  str.SetValue(p_Text)
  str.UrlEncode(flags,pDelimiter,pSpace,pAlphabet)
  if str._DataEnd < 1
    return ''
  else
    return str.value[1 : str._DataEnd]
  end

!-----------------------------------------------------------
! URL encode the stored string (also known as percent encoding)
! Encoding defined by RFC3986
StringTheory.UrlEncode Procedure (long flags=0,<String pDelimiter>,<String pSpace>,<String pAlphabet>)
mapping         string('0123456789ABCDEF')
x               long, auto
y               long, auto
Enc             StringTheory        ! The encoded value - Note do NOT use STATIC here...
loc:delim       string(1),auto
loc:space       string(1),auto
donequestion    long
alphabet        string(size(pAlphabet)+1)

  code
  if not omitted(pAlphabet)
    alphabet = pAlphabet
  end
  if self._DataEnd = 0 then return.
  Enc.SetLength(3 * self._DataEnd, TRUE)

  loc:delim = choose(omitted(pDelimiter) or pDelimiter='','%',pDelimiter)
  loc:space = choose(omitted(pSpace) or pSpace='','+',pSpace)

  y = 1
  loop x = 1 to self._DataEnd
      case Val(self.value[x])
      of val(loc:delim) orof val(loc:space)                    ! do this first in case delim is one of the chars below.
        Enc.value[y] = loc:delim
        Enc.value[y+1] = mapping[ Bshift(Band(Val(self.value[x]), 0F0h), -4) + 1 ]
        Enc.value[y+2] = mapping[ Band(Val(self.value[x]), 0Fh) + 1 ]
        y += 3
      of 48 to 57                                              ! 0 to 9
      orof 65 to 90                                            ! A to Z
      orof 97 to 122                                           ! a to z
        Enc.value[y] = self.value[x]
        y += 1

      of 45 orof 95 orof 126                                   ! '-' orof '_' orof '~'  ! - _ ~
        if band(flags,st:php) or instring(self.value[x],clip(alphabet))
          Enc.value[y] = self.value[x]
          y += 1
        else
          Enc.value[y] = loc:delim
          Enc.value[y+1] = mapping[ bshift(band(val(self.value[x]),0F0h),-4)+1 ]
          Enc.value[y+2] = mapping[ band(val(self.value[x]),0Fh)+1 ]
          y += 3
        end

      of 46 ! '.'
        if band(flags,st:dos + st:php) or instring(self.value[x],clip(alphabet))
          Enc.value[y] = self.value[x]
          y += 1
        else
          Enc.value[y] = loc:delim
          Enc.value[y+1] = mapping[ bshift(band(val(self.value[x]),0F0h),-4)+1 ]
          Enc.value[y+2] = mapping[ band(val(self.value[x]),0Fh)+1 ]
          y += 3
        end

      of 47 orof 92 orof 36 ! '/' orof '\' orof '$'
        if Band(flags, st:dos) or instring(self.value[x],clip(alphabet))
          Enc.value[y] = self.value[x]
          y += 1
        else
          Enc.value[y] = loc:delim
          Enc.value[y+1] = mapping[ bshift(band(val(self.value[x]),0F0h),-4)+1 ]
          Enc.value[y+2] = mapping[ band(val(self.value[x]),0Fh)+1 ]
          y += 3
        end

      of 32                                               ! space
        if Band(flags, st:NoHex + st:NoPlus) or instring(self.value[x],clip(alphabet))
          Enc.value[y] = self.value[x]
        elsif Band(flags, st:BigPlus)
          Enc.value[y : y+2] = loc:delim & '20'
          y += 2
        else
          Enc.value[y] = loc:space
        end
        y += 1

      of 58 ! :
        if band(flags,st:NoColon) or instring(self.value[x],clip(alphabet))
          Enc.value[y] = self.value[x]
          y += 1
        else
          Enc.value[y] = loc:delim
          Enc.value[y+1] = mapping[ bshift(band(val(self.value[x]),0F0h),-4)+1 ]
          Enc.value[y+2] = mapping[ band(val(self.value[x]),0Fh)+1 ]
          y += 3
        end

      of 38 orof 61 ! & =
        if band(flags,st:Parameters) or instring(self.value[x],clip(alphabet))
          Enc.value[y] = self.value[x]
          y += 1
        else
          Enc.value[y] = loc:delim
          Enc.value[y+1] = mapping[ Bshift(Band(Val(self.value[x]), 0F0h), -4) + 1 ]
          Enc.value[y+2] = mapping[ Band(Val(self.value[x]), 0Fh) + 1 ]
          y += 3
        end

      of 63 ! ?
        if (band(flags,st:Parameters) and donequestion = false)  or instring(self.value[x],clip(alphabet))
          donequestion = true
          Enc.value[y] = self.value[x]
          y += 1
        else
          Enc.value[y] = loc:delim
          Enc.value[y+1] = mapping[ Bshift(Band(Val(self.value[x]), 0F0h), -4) + 1 ]
          Enc.value[y+2] = mapping[ Band(Val(self.value[x]), 0Fh) + 1 ]
          y += 3
        end

      else
        if instring(self.value[x],clip(alphabet))
          Enc.value[y] = self.value[x]
          y += 1
        else
          Enc.value[y] = loc:delim
          Enc.value[y+1] = mapping[ Bshift(Band(Val(self.value[x]), 0F0h), -4) + 1 ]
          Enc.value[y+2] = mapping[ Band(Val(self.value[x]), 0Fh) + 1 ]
          y += 3
        end
      end
  end
  Enc.Clip()
  self._stealValue(enc)

!-----------------------------------------------------------
StringTheory.UrlDecode Procedure (<String pDelimiter>,<String pSpace>)
x               long                           ! position where loc:delim was found
y               long,auto                      ! value of new replacement char
z               long                           ! last char pointer for shuffled string
charsRemoved    long                           ! number of removed chars (2 chars per hit)
loc:delim       string(1),auto
loc:space       string(1),auto
  code
  if self._DataEnd = 0
    return
  end
  loc:delim = choose(omitted(pDelimiter) or pDelimiter='','%',pDelimiter)
  loc:space = choose(omitted(pSpace),'+',pSpace)
  if loc:space
    self.ReplaceSingleChars(loc:space, ' ')    ! turn '+' into ' ' (space)
  end

  ! turn %ab into a single char.
  loop
    x = self.findChar(loc:delim, x+1)
    if x = 0 or x > self._DataEnd - 2 then break.

    case val(self.value[x+1])
    of 48 to 57                                ! '0' to '9'
      y = self.value[x+1]
    of 65 to 70                                ! 'A' to 'F'
      y = Val(self.value[x+1])-55
    of 97 to 102                               ! 'a' to 'f'
      y = Val(self.value[x+1])-87
    else
      cycle
    end

    y = bshift(y,4)                            ! multiply by 16

    case val(self.value[x+2])
    of 48 to 57                                ! '0' to '9'
      y += self.value[x+2]
    of 65 to 70                                ! 'A' to 'F'
      y += val(self.value[x+2])-55
    of 97 to 102                               ! 'a' to 'f'
      y += val(self.value[x+2])-87
    else
      cycle
    end

    self.value[x] = Chr(y)
    if charsRemoved
      stMemCpyLeft(address(self.value)+z,address(self.value)+z+charsRemoved,x-z-charsRemoved)             ! shuffle down chars
    end
    z = x-charsRemoved
    charsRemoved += 2
    x += 2
  end
  if charsRemoved
    if self._DataEnd > z+charsRemoved
      stMemCpyLeft(address(self.value)+z,address(self.value)+z+charsRemoved,self._DataEnd-z-charsRemoved) ! shuffle down remaining chars
    end
    if self.UseBuffer
      self._DataEnd -= charsRemoved
      if self.CleanBuffer
        stMemSet(address(self.value)+self._DataEnd,32,charsRemoved)
      end
    else
      self.setLength(self._DataEnd - charsRemoved)
    end
  end

!-----------------------------------------------------------
!!! <summary>
!!!     Remove illegal characters from a file name. Note that this takes the full path
!!!     so \ is allowed where pAllowPath is true.
!!! <summary>
!!! <param name="fileName">The full path name to create a clean version of</param>
!!! <param name="replaceChar">Optional parameter for the replacement character. Defaults to
!!!     an underscore</param>
!!! <param name="pAllowPath">If true allows \ : / characters</param>

!!! <returns>A string which contains the cleaned full path name</returns>
StringTheory.CleanFileName     Procedure(<string pFullPath>, <string pReplaceChar>,Byte pAllowPath=st:nopath)
r                string(1),auto
allowedPathChars group,pre()
allowedFileChars   string('.,=+-_!@ #$%(){{}[]^~;''')
                   string('\')   ! extra chars that are ok for path  ! / is never allowed. : is only allowed in pos 2.
                 end
allowedChars     &string,Auto
colonok          byte
  code
  if Omitted(pReplaceChar) or size(pReplaceChar) = 0
    r = '_'
  else
    r = pReplaceChar[1]
  end
  if pAllowPath = st:noPath
    allowedChars &= allowedFileChars
  else
    allowedChars &= allowedPathChars
  end
  if omitted(pFullPath) or size(pFullPath) = 0
    if self._DataEnd = 0 then return ''.
    if self._DataEnd > 1 and pAllowPath and self.value[2] = ':' then colonok = true.
    self.keepChars(allowedChars,r,st:AllAlphaNum)
    if colonok then self.value[2] = ':'.
    if self._DataEnd < 1
      return ''
    else
      return self.value[1 : self._DataEnd]
    end
  else
    if size(pFullPath) > 1 and pAllowPath and pFullPath[2] = ':' then colonok = true.
    self.keepChars(allowedChars,r,st:AllAlphaNum,pFullPath)
    if colonok then pFullPath[2] = ':'.
    return clip(pFullPath)
  end

!-----------------------------------------------------------
! converts the string to a hex-encoded-byte-array, surrounded with square brackets.
! eg [0x65,0x89,0x9d,0x0a]
StringTheory.ZeroXEncode  Procedure()
output  stringtheory
x       long,auto
  code
  if self._DataEnd = 0
    self.setvalue('[]')
    return
  end
  if self.UseBuffer
    ! pre-allocate buffer to correct size
    output.SetLength(5*self._DataEnd + 1,true)
    output.free()
  end
  output.setvalue('[0x' & self.bytetohex(val(self.value[1])))
  loop x = 2 to self._DataEnd
    output.cat(',0x' & self.bytetohex(val(self.value[x])),5)
  end
  output.Append(']')
  self._stealValue(output)

!-----------------------------------------------------------
! converts the string from a hex-encoded-byte-array, surrounded with square brackets.
! eg [0x65,0x89,0x9d,0x0a]
StringTheory.ZeroXDecode  Procedure()
output  stringtheory
x       long,auto
  code
  if self._DataEnd = 0 then return.
  if self.value = '[]'
    self.free()
    return
  end
  if self.value[1] <> '[' or self.value[self._DataEnd] <> ']'
    ! not ZeroXEncoded, so leave unchanged
    return
  end
  self.KeepChars('0123456789abcdefABCDEF') ! remove CR,LF, hypens, commas, []xX etc
  loop x = 1 to self._DataEnd-2 by 3
    output.append(chr(self.HexToByte(self.value[x+1 : x+2])))
  end
  self._stealValue(output)

!-----------------------------------------------------------
StringTheory.PeekRam       Procedure(Long pFormat=st:Decimal)
  code
  self.PeekRam(address(self.value), self._DataEnd, pFormat)

!-----------------------------------------------------------
StringTheory.PeekRam       Procedure(uLong pAdr, Long pLen, Long pFormat=st:Decimal)
pResult StringTheory
  code
  self.PeekRam(pResult,pAdr,pLen,pFormat)
  if pResult._DataEnd
    self.trace('PeekRam at ' & pAdr & ', len=' & pLen & '<13,10>' & pResult.valuePtr[1 : pResult._DataEnd])
  end

!-----------------------------------------------------------
StringTheory.PeekRam       Procedure(stringTheory pResult, uLong pAdr, Long pLen, Long pFormat=st:Decimal)
dbl  string(10), auto
dbv  pstring(65),auto
dbt  string(16), auto
b    byte,auto
x    long,auto
last ulong,auto
  code
  pResult.free()
  If pAdr = 0
    pAdr = Address(self.value)
    if pLen > self._DataEnd or pLen = 0 then pLen = self._DataEnd.
  End
  IF pAdr <= 0FFFFh OR pLen < 1
    self.ErrorTrap('PeekRam','INVALID PeekRam at ' & pAdr & ', len=' & pLen,true)
    return
  End
  last = pAdr + pLen - 1
  loop
    dbl = self.LongToHex(pAdr) & 'h'
    dbv[0] = '<0>'
    dbt = ''
    loop x = 1 to 16
      peek(pAdr,b)
      dbv = dbv & ' ' & choose(pFormat=st:hex,self.ByteToHex(b),format(b,@n03))
      dbt[x] = choose(b < 32,'.',chr(b))
      pAdr += 1
      if pAdr > last
        if x < 16 then dbv = dbv & all(' ',(16-x) * choose(pFormat=st:hex,3,4)).
        break
      end
    end
    pResult.append(dbl & ' | ' & dbv & ' | ' & dbt & '<13,10>')
  until pAdr > last

!-----------------------------------------------------------
StringTheory.Gzip       Procedure(Long pLevel=5)
result    long,auto
gzstream  group(z_stream_s).
src       &string
srclen    Long,auto
zversion  cstring(20)
buffer    &string
x         long,auto
  code
  if self.gzipped or self._DataEnd = 0 then return st:Z_OK.
  self.loadlibs()
  if fp_DeflateInit2_ = 0 or fp_Deflate = 0 or fp_DeflateEnd = 0
    return st:Z_DLL_ERROR
  end

  ! make a buffer of a suitable size.
  buffer &= new(string(self._DataEnd + 20)) ! add a bit for the header.
  If buffer &= null    ! new failed
    self.errorTrap('GZip','Failed to get enough ram for gzip output - trying to get ' & self._DataEnd + 20 & ' bytes',true)
    return st:Z_NORAM_ERROR
  End

  ! store a pointer to the (currently) uncompressed string
  src &= self.value
  srcLen = self._DataEnd

  ! clear the official value field, and then give it some space to accept the decompression
  ! bypassing the normal allocation, because don't want to DISPOSE the old value yet.
  self.value &= Null
  self.valuePtr &= Null
  self._DataEnd = 0

  ! prepare the stream structure
  gzstream.next_in  = address(src)
  gzstream.avail_in = srclen
  gzstream.total_in = srclen
  gzstream.next_out   = address(buffer[1])
  gzstream.avail_out  = size(buffer)
  gzstream.data_type   = st:Z_UNKNOWN
  zversion = '1.2.5.0'
  ! init the stream structure
  result = stDeflateInit2_(address(gzstream), pLevel, st:Z_DEFLATED, (15+16), 9, st:Z_DEFAULT_STRATEGY,address(zversion),56)
  case result
  of st:Z_OK
    loop
      result = stDeflate(address(gzstream),st:Z_SYNC_FLUSH)
      case result
      of st:Z_OK
        if gzstream.avail_out = 0
          self.Append(buffer)
          gzstream.next_out   = address(buffer[1])
          gzstream.avail_out  = size(buffer)
          cycle
        else
          ! need to dispose the uncompressed version of the string now.
          ! doing it before the call to Append to maximise available memory space
          dispose(src)
          x = gzstream.total_out % size(buffer)
          if x = 0 then x = size(buffer).
          if self._DataEnd = 0  ! got it all in one go?
            self._StealValue(buffer)
            buffer &= null
            if x < self._DataEnd then self.SetLength(x).
          else
            self.cat(buffer,x)
          end
          self.gzipped = 1
          !break ! all finished
        end
      !orof st:Z_STREAM_ERROR
      !orof st:Z_BUF_ERROR
      ! failed, so restore pointer back the way it was
      else
        self._StealValue(src)  ! restore original
        self._DataEnd = srcLen
      end
      break
    end
    x = stDeflateEnd(address(gzstream))
  else
    ! failed, so restore pointer back the way it was
    self._StealValue(src)  ! restore original
    self._DataEnd = srclen
  end
  dispose(buffer)
  return result

!-----------------------------------------------------------
! offset is the number of uncompressed bytes. Allows for uncompressed header.
StringTheory.Gunzip     Procedure(Long pOffset=0)

result    long,auto
gzstream  group(z_stream_s).
src       &string
srclen    Long,auto
zversion  cstring(20)
buffer    &string
x         long,auto
  code
!  if not self.gzipped then return st:Z_OK.   ! removed this, because the user always forgets to set gzipped.
  if self._DataEnd = 0 or pOffset >= self._DataEnd then return st:Z_OK. ! nothing to do
  self.loadlibs()
  if fp_InflateInit2_ = 0 or fp_Inflate = 0 or fp_InflateEnd = 0
    self.errorTrap('Gunzip','StringTheory unable to Gunzip because of DLL Error',true)
    return st:Z_DLL_ERROR
  end

  ! store a pointer to the (currently) compressed string
  src &= self.value
  srcLen = self._DataEnd
  if pOffset > srcLen then pOffset = srcLen.
  if pOffset < 0 then pOffset = 0.

  ! make a buffer of a suitable size.
  loop x = 4 to 1 by -1
    buffer &= new(string(srclen * x))
    if not buffer &= null then break. ! we have memory allocated
    ! not enough memory so cycle back and try a smaller size
  end
  if buffer &= null
    self.errorTrap('Gunzip','StringTheory failed to get memory trying to get ' & srclen & ' bytes',true)
    return st:Z_MEM_ERROR
  end

  ! clear the official value field, and then give it some space to accept the decompression
  ! bypassing the normal allocation, because don't want to DISPOSE the old value yet.
  self.value &= Null
  self.valuePtr &= Null
  self._DataEnd = 0

  ! if offset is set then treat the first bytes as uncompressed, and move the pointers forward.
  if pOffset > 0 then self.Cat(src,pOffset).

  ! prepare the stream structure
  gzstream.next_in   = address(src) + pOffset
  gzstream.avail_in  = srclen - pOffset
  gzstream.next_out  = address(buffer[1])
  gzstream.avail_out = size(buffer)
  zversion = '1.2.5.0'

  ! init the stream structure
  result = stInflateInit2_(address(gzstream), 32+15,address(zversion),56)
  case result
  of st:Z_OK
    loop
      result = stInflate(address(gzstream),st:Z_SYNC_FLUSH)
      if result = st:Z_OK and gzstream.avail_in = 0 then result = st:Z_STREAM_END.
      case result
      of st:Z_OK
        self.append(buffer)
        gzstream.next_out   = address(buffer[1])
        gzstream.avail_out  = size(buffer)
        cycle
      of st:Z_STREAM_END
        x = gzstream.total_out % size(buffer)
        if x = 0 then x = size(buffer).
        if self._DataEnd = 0  ! got it all in one go (and no pOffset)?
          self._StealValue(buffer)
          if x < self._DataEnd then self.SetLength(x).
          buffer &= null
        else
          self.cat(buffer,x)
        end
        ! need to dispose the compressed version of the string now.
        dispose(src)
        result = st:Z_OK
        self.gzipped = 0
        !break ! all finished
      !of st:Z_NEED_DICT
      !orof st:Z_DATA_ERROR
      !orof st:Z_STREAM_ERROR
      !orof st:Z_MEM_ERROR
      !orof st:Z_BUF_ERROR
      ! failed, so restore pointer back the way it was
      else
        self._StealValue(src)  ! restore original
        self._DataEnd = srcLen
      end
      break
    end
    x = stInflateEnd(address(gzstream))
  else
    !of st:Z_MEM_ERROR
    !of st:Z_VERSION_ERROR
    !of st:Z_STREAM_ERROR
    ! failed, so restore pointer back the way it was
    self._StealValue(src)  ! restore original
    self._DataEnd = srcLen
  end
  dispose(buffer)
  return result

!-----------------------------------------------------------
StringTheory.LoadNormalize Procedure()
cname   cstring(50)
  CODE
  if hNormaliz = 0
    cname = 'Normaliz.dll'
    hNormaliz = stLoadLibrary(cname)
    if hNormaliz = 0                                             ! check library handle is not zero
      Self.ErrorTrap('LoadNormalize','Failed to load '&clip(cname),true)
      self._NormalizeDLLLoaded = 0
      return st:notOk
    end
    ! Retrieve the required function pointers
    cName = 'NormalizeString'
    fp_NormalizeString  = stGetProcAddress(hNormaliz, cName)
    self._NormalizeDLLLoaded = hNormaliz
  END
  return st:ok

!-----------------------------------------------------------
StringTheory.LoadLibs   Procedure()
cname   cstring(50)
  code
  if hZlib = 0
    cname = 'zlibwapi.dll'
    hZlib = stLoadLibrary(cname)
    if hZlib = 0                                             ! check library handle is not zero
      Self.ErrorTrap('LoadLibs','Failed to load '&clip(cname),true)
      self._GzipDLLLoaded = 0
      return st:notok
    end

    ! Retrieve the required function pointers
    cName = 'deflateInit2_'
    fp_DeflateInit2_  = stGetProcAddress(hZlib, cName)
    cName = 'deflate'
    fp_Deflate        = stGetProcAddress(hZlib, cName)
    cName = 'deflateEnd'
    fp_DeflateEnd     = stGetProcAddress(hZlib, cName)
    cName = 'inflateInit2_'
    fp_InflateInit2_  = stGetProcAddress(hZlib, cName)
    cName = 'inflate'
    fp_Inflate        = stGetProcAddress(hZlib, cName)
    cName = 'inflateEnd'
    fp_InflateEnd     = stGetProcAddress(hZlib, cName)
    self._GzipDLLLoaded = hZlib
  end
  return st:ok
!-----------------------------------------------------------
StringTheory.Left  Procedure(Long pLength=0,Long pwhat=st:spaces,<String pPad>)
x    long,auto
pad  string(1)
  code
  if not omitted(pPad) then pad = pPad.

  if pLength = 0 then pLength = self._DataEnd.
  if pLength < 1 then return ''.
  if self._DataEnd < 1 then return all(pad, pLength).

  if pWhat = st:Spaces and Pad = ' '
    return left(self.value[1: self._DataEnd],pLength)
  end

  loop x = 1 to self._DataEnd
    case val(self.value[x])
    of 48
      if band(pWhat,st:zeros) then cycle.
    of 32
      if band(pWhat,st:spaces) then cycle.
    of 9
      if band(pWhat,st:tabs) then cycle.
    of 13
      if band(pWhat,st:cr) then cycle.
    of 10
      if band(pWhat,st:lf) then cycle.
    end
    break
  end
  ! x now = the first non-space character in the string
  if x > self._DataEnd then return all(pad, pLength).

  if x+pLength-1 <= self._DataEnd then return self.value[x : x+pLength-1].

  return self.value[x : self._DataEnd] & all(pad, pLength - (self._DataEnd-x+1))

!-----------------------------------------------------------
StringTheory.SetLeft  Procedure(Long pLength=0,Long pwhat=st:spaces,<String pPad>)
pad  string(1)
  code
  if not omitted(pPad) then pad = pPad.
  self.SetValue(self.Left(pLength,pWhat,pad))

!-----------------------------------------------------------
StringTheory.Right  Procedure(Long pLength=0,Long pwhat=st:spaces,<String pPad>)
x    long,auto
pad  string(1)
  code
  if not omitted(pPad) then pad = pPad.

  if pLength = 0 then pLength = self._DataEnd.
  if pLength < 1 then return ''.
  if self._DataEnd < 1 then return all(pad, pLength).

  if pWhat = st:Spaces and Pad = ' '
    return right(self.value[1: self._DataEnd],pLength)
  end

  loop x = self._DataEnd to 1 by -1
    case val(self.value[x])
    of 48
      if band(pWhat,st:zeros) then cycle.
    of 32
      if band(pWhat,st:spaces) then cycle.
    of 9
      if band(pWhat,st:tabs) then cycle.
    of 13
      if band(pWhat,st:cr) then cycle.
    of 10
      if band(pWhat,st:lf) then cycle.
    end
    break
  end
  ! x is now the rightmost character in the string

  if x < 1 then return all(pad, pLength).

  if pLength <= x
    return self.value[x-pLength+1 : x]
  end

  return all(pad,pLength-x) & self.value[1 : x]

!-----------------------------------------------------------
StringTheory.SetRight  Procedure(Long pLength=0,Long pwhat=st:spaces,<String pPad>)
pad  string(1)
  code
  if not omitted(pPad) then pad = pPad.
  self.SetValue(self.Right(pLength,pWhat,pad))

!-----------------------------------------------------------
StringTheory.SetAll  Procedure(Long pLength=255)
  code
  if self._DataEnd < 1
    self.SetLength(pLength)
  else
    self.SetValue(All(self.value[1 : self._DataEnd],pLength))
  end

!-----------------------------------------------------------
StringTheory.All  Procedure(Long pLength=255)
  code
  if self._DataEnd < 1
    return All(' ',pLength)
  else
    return All(self.value[1 : self._DataEnd],pLength)
  end

!-----------------------------------------------------------
! The form is: "=?charset?encoding?encoded text?=".
! charset may be any character set registered with IANA. Typically it would be the same charset as the message body.
! encoding can be either "Q" denoting Q-encoding that is similar to the quoted-printable encoding, or "B" denoting base64 encoding.
! encoded text is the Q-encoded or base64-encoded text.
! An encoded-word may not be more than 75 characters long, including charset, encoding, encoded text, and delimiters.
! If it is desirable to encode more text than will fit in an encoded-word of 75 characters, multiple encoded-words (separated by CRLF SPACE) may be used.
! Note that only _part_ of the string may be encoded. everything between =? and ?= is decoded
StringTheory.EncodedWordDecode  Procedure()
seg     StringTheory
result  StringTheory  ! final result which is built up to save multiple moving of chars
x       long, auto
y       long, auto
charset string(12), auto
chStart long, auto
chEnd   long, auto

s       string(10), auto
  code

  ! string contains a unicode segment, so convert the whole string to unicode to begin with, so the segment slots in.
  if self.instring('=?utf-8?',1,1,self._DataEnd,st:nocase,false)
    self.ToUnicode(st:EncodeUtf8)
  end

  ! check to see if string contains multiple segments with different charsets. If they do then convert the string to utf-8
  if self.encoding <> st:EncodeUtf8
    chStart = 1
    chEnd = 0
    charset = self.FindBetween('=?','?',chStart,ChEnd)
    chStart = chEnd + 1
    if charset
      loop
        chEnd = 0
        if self.FindBetween('=?','?',chStart,ChEnd) <> charset
          self.ToUnicode(st:EncodeUtf8)
          break
        end
        chStart = chEnd + 1
      end
    end
  end

  ! get rid of CRLF SPACE where separating multiple encoded-words (used where resultant encoded word would exceed 75 chars)
  ! based on the ST docs which state: "An encoded-word may not be more than 75 characters long, including charset, encoding,
  !                                    encoded text, and delimiters. If it is desirable to encode more text than will fit in
  !                                    an encoded-word of 75 characters, multiple encoded-words (separated by CRLF SPACE)
  !                                    may be used."
  self.replace('?=<13,10,32>=?','?==?') ! note it is possible that replacement text should be '?= =?' if space is to be preserved?

  result.encoding = self.encoding
  ! now ready to start decoding segments
  chStart = 1
  loop
    x = self.findChars('=?',chStart)
    if x = 0 then break.
    y = self.findChar('?',x+2)
    if y = 0 then break.
    y = self.findChar('?',y+1)
    if y = 0 then break.
    y = self.findChars('?=',y+1)
    if y = 0 then break.
    if x > chStart then result.append(self.value[chStart : x-1]).
    chStart = y+2

    seg.SetValue(self.value[x+2 : y-1])     !  segment to be decoded...
    seg.split('?')
    s = lower(seg.GetLine(1))               ! iso-8859-1 / utf-8 or whatever
    case s
    of 'utf-8'
      seg.encoding = st:EncodeUtf8
    of 'utf-16'
      seg.encoding = st:EncodeUtf16
    else
      seg.encoding = st:EncodeAnsi
      seg.codepage = seg._IANANameToNumber(s)
    end
    seg.DeleteLine(1)                       ! iso-8859-1
    s = seg.GetLine(1)
    if s = 'Q' or  s = 'q'
      seg.DeleteLine(1)                     ! Q
      seg.SetValue(seg.getline(1))
      seg.UrlDecode('=','_')
    elsif s ='B' or s ='b'
      seg.DeleteLine(1)                     ! B
      seg.SetValue(seg.getline(1))
      seg.Base64Decode()
    end

    if seg.encoding <> self.encoding
      case self.encoding
      of st:EncodeUtf8
      orof st:EncodeUtf16
        seg.ToUnicode(self.encoding,seg.codepage)
      end
    end
    result.append(seg)
  end

  if chStart < self._dataEnd
    result.append(self.value[chStart : self._dataEnd]) ! add any remaining chars on end
  end
  self._stealValue(result)

!-----------------------------------------------------------
StringTheory.EncodedWordEncode  Procedure(<String pCharset>,long pEncoding=2)
  code
  if self._DataEnd < 1 then return.

  if Left(self.value[1 : self._DataEnd],2) = '=?' and Right(self.value[1 : self._DataEnd],2) = '?='
    ! already encoded. But can't just break here because desired charset or encoding might be different. So....
    self.EncodedWordDecode()
  end

  case pEncoding
  of st:Base64
    self.Base64Encode()
    self.prepend('B?')
  else
    self.URLEncode( ,'=','_')
    self.prepend('Q?')
  end
  if omitted(pCharset) or pCharset = ''
    self.prepend('=?iso-8859-1?')
  else
    self.prepend('=?' & clip(pCharset) & '?')
  end
  self.Append('?=')

!-----------------------------------------------------------
StringTheory.GetCodePageFromCharset  Procedure(<Long pCharSet>)
charset  Long,auto
  Code
  if omitted(pCharSet)
    charset = system{PROP:CharSet}
  else
    charset = pCharset
  end
  Case CharSet
  of CHARSET:GREEK
    return st:CP_WINDOWS_1253
  of CHARSET:HEBREW
    return st:CP_WINDOWS_1255
  of CHARSET:ARABIC
    return st:CP_WINDOWS_1256
  of CHARSET:BALTIC
    return st:CP_WINDOWS_1257
  of CHARSET:CYRILLIC
    return st:CP_WINDOWS_1251
  of CHARSET:TURKISH
    return st:CP_WINDOWS_1254
  of CHARSET:EASTEUROPE
    return st:CP_WINDOWS_1250
  of CHARSET:THAI
    return st:CP_WINDOWS_874
  of CHARSET:CHINESEBIG5
    return st:CP_Big5
  ELSE
    return st:CP_WINDOWS_1252   ! Western
  End

!-----------------------------------------------------------
! 16 char (128 bit) binary string is converted to hex format with hypens
! use st:nohyphens option to surrpess hyphens
! use st:brackets option to add {curly brackets} around the guid.
StringTheory.GuidEncode   Procedure(Long pOptions=st:Hyphen)
  code
  if self._DataEnd <> 16 then return.
  self.ToHex(st:Lower)
  case band(pOptions,st:Hyphen + st:NoHyphen + st:brackets)
  of st:Hyphen
    self.setvalue(self.Value[1 : 8] & '-' & self.Value[9 : 12] & '-' & self.Value[13 : 16] & |
                  '-' & self.Value[17 : 20] & '-' & self.Value[21 : 32])
  of st:brackets + st:Hyphen
    self.setvalue('{{' & self.Value[1 : 8] & '-' & self.Value[9 : 12] & '-' & self.Value[13 : 16] & |
                  '-' & self.Value[17 : 20] & '-' & self.Value[21 : 32] & '}')

  of st:NoHyphen + st:brackets
    self.setvalue('{{' & self.Value[1 : 32] & '}')

  of st:NoHyphen
    ! leave as is
  end

!-----------------------------------------------------------
! techhnically a Guid should always decode to 16 characters of binary, but
! this method doesn't really care if it doesn't.
StringTheory.GuidDecode   Procedure()
  code
  self.FromHex() ! will ignore anything other than hex digits.

!-----------------------------------------------------------
! pOptions : st:IgnoreIfNumber   : ! assume entities starting with &# are already encoded.
!          : st:Percent          : encode % to &#37;
!          : st:IgnoreIfValid    : ignore encoding the & if the & preceeds a valid xml entity.
!          : st:DecimalEncode128 : all chars > 127 are encoded as &#nn;
StringTheory.XMLEncode   Procedure(Long pOptions=0)
x  long
y  long
  code
  If band(pOptions,st:IgnoreIfValid)
    x = 0
    Loop
      x = self.FindChar('&',x + 1)
      if x = 0 then break.
      y = self.FindChar(';',x + 1)
      if y = 0
        self.Replace('&','&amp;',1,x)
        x += 5
        cycle
      End
      if y-x = 3 and (self.value[x : y ] = '&lt;' or self.value[x : y ] = '&gt;')
        x = y + 1
        cycle
      elsif y-x = 4 and self.value[x : y ] = '&amp;'
        x = y + 1
        cycle
      elsif y-x = 5  and (self.value[x : y ] = '&apos;' or self.value[x : y ] = '&quot;')
        x = y + 1
        cycle
      ElsIf self.value[x+1] = '#'  ! numeric encoding
        If self.value[x+2] = 'x' and self.IsAll('1234567890abcdefABCEDEF',self.value[ x+2 : y-1 ])  ! hex encoding
          x = y + 1
          cycle
        ElsIf self.IsAll('1234567890',self.value[ x+2 : y-1 ])                                      ! decimal encoding
          x = y + 1
          cycle
        End
      End
      ! not an exception, so encode as normal
      self.replace('&','&amp;',1,x)
      x += 5
    End
  ElsIf band(pOptions,st:IgnoreIfNumber)
   x = 0
    Loop
      x = self.FindChar('&',x + 1)
      if x = 0 then break.
      y = self.FindChar(';',x + 1)
      if y = 0
        self.replace('&','&amp;',1,x)
        x += 5
        cycle
      End
      If self.value[x+1] = '#'  ! numeric encoding
        If self.value[x+2] = 'x' and self.IsAll('1234567890abcdefABCEDEF',self.value[ x+2 : y-1 ])  ! hex encoding
          x = y + 1
          cycle
        ElsIf self.IsAll('1234567890',self.value[ x+2 : y-1 ])                                      ! decimal encoding
          x = y + 1
          cycle
        End
      End
      ! not an exception, so encode as normal
      self.replace('&','&amp;',1,x)
      x += 5
    End
  Elsif band(pOptions,st:IgnoreIfValid)

  Else
    Self.Replace('&','&amp;')
  End
  Self.Replace('<','&lt;')
  Self.Replace('>','&gt;')
  Self.Replace('"','&quot;')
  Self.Replace('''','&apos;')
  If band(pOptions,st:Percent)
    Self.Replace('%','&#37;')
  End
  Self.Replace('<0>','&#0;')
  If Band(pOptions,st:DecimalEncode128)
    self.CharToDecEntity(128)
  End

!-----------------------------------------------------------
StringTheory.XMLDecode   Procedure()
  code
  Self.Replace('&lt;','<')
  Self.Replace('&gt;','>')
  Self.Replace('&amp;','&')
  Self.Replace('&quot;','"')
  Self.Replace('&apos;','''')

!-----------------------------------------------------------
StringTheory.JsonEncode   Procedure(Long pOptions=0)
i  Long,auto
  code
  Self.Replace('\','\\')
  Self.Replace('"','\"')
  Self.Replace('</','<\/')  ! see  http://stackoverflow.com/questions/1580647/json-why-are-forward-slashes-escaped
  Self.Replace('<8>','\b')
  Self.Replace('<9>','\t')
  Self.Replace('<10>','\n')
  Self.Replace('<11>','\u000b')
  Self.Replace('<12>','\f')
  Self.Replace('<13>','\r')
  loop i = 0 to 7
    Self.Replace(chr(i),'\u000' & i)
  end
  loop i = 14 to 31
    Self.Replace(chr(i),'\u00' & self.ByteToHex(i))
  end
  if band(pOptions,st:xml)
    Self.Replace('<','\u003C') ! custom option to encode json inside xml 003c = <
  end

!-----------------------------------------------------------
StringTheory.JsonDecode  Procedure()
rpos   long,auto
x      long,auto
  code
  rpos = 1
  if self._DataEnd = 0 then return 0.

  If self.codepage = st:CP_ACP or self.codepage = st:CP_Detect Then self.codepage = self.GetCodePageFromCharset().
  loop x = 1 to self._DataEnd
    if self.Value[x] = '\' and x <> self._DataEnd
      case val(self.Value[x+1])
      of 114 ! 'r'
       self.value[rpos] = '<13>'
       rpos += 1
       x += 1
      of 110 ! 'n'
       self.value[rpos] = '<10>'
       rpos += 1
       x += 1
      of 116 ! 't'
       self.value[rpos] = '<9>'
       rpos += 1
       x += 1
      of 98  ! 'b'
       self.value[rpos] = '<8>'
       rpos += 1
       x += 1
      of 102 ! 'f'
       self.value[rpos] = '<12>'
       rpos += 1
       x += 1
      of 47  ! '/'
       self.value[rpos] = '/'
       rpos += 1
       x += 1
      of 92  ! '\'
       self.value[rpos] = '\'
       rpos += 1
       x += 1
      of 34  ! '"'
       self.value[rpos] = '"'
       rpos += 1
       x += 1
      of 117 ! 'u'
        if self._DataEnd >= x + 5
          do DecodeU
        else
          return x
        end
      else
        return x
      end
    else
      self.value[rpos] = self.Value[x]
      rpos += 1
    end
  end
  if self.UseBuffer
    self._DataEnd = rpos -1
    if self.CleanBuffer and self._DataEnd < size(self.value)
      stMemSet(address(self.value)+self._DataEnd,32,size(self.value)-self._DataEnd)
    end
  else
    self.SetLength(rpos-1) ! if buffer is off then length needs to be explicitly corrected.
  end
  return 0

DecodeU  routine
  data
ucs    StringTheory
uc     string(2)
u8     string(3)
ulen   long
alen   long
ant    &string
  code
  case self.encoding
  of st:EncodeAnsi
    if self.sub(x+2,2) = '00'
      ucs.SetValue(self.sub(x+4,2))
      if ucs.IsAll('0123456789ABCEDEFabcdef') = false
        return x
      end
      ucs.FromHex()
      self.value[rpos] = ucs.GetValue()
      rpos += 1
      x += 5
    Else
      ucs.SetValue(self.sub(x+2,4))
      if ucs.IsAll('0123456789ABCEDEFabcdef') = false
        return x
      end
      ucs.FromHex()
      uc = ucs.GetValue()
      ant &= self.Utf16ToAnsi(uc,aLen,1,self.codepage)
      ASSERT(aLen=1,'Bad assumption 1 in JsonDecode')
      self.value[rpos] = ant[1]
      rpos += 1
      x += 5
      dispose(ant)
    end
  of st:EncodeUtf8
    ucs.SetValue(self.sub(x+2,4))
    if ucs.IsAll('0123456789ABCEDEFabcdef') = false
      return x
    end
    ucs.FromHex()
    u8 = self.utf16ToUtf8Char(ucs.GetValue(),uLen)
    self.value[rpos : rpos + ulen - 1] = sub(u8,1,uLen)
    rpos += ulen
    x += 5
  of st:EncodeUtf16
    ucs.Setvalue(self.sub(x+2,8))
    if ucs.IsAll('<0>0123456789ABCEDEFabcdef') = false
      return x
    end
    ucs.removeByte(0) ! remove all '<0>'
    ucs.FromHex()
    self.value[rpos : rpos + ucs._DataEnd - 1] = ucs.value[1 : ucs._DataEnd]
    rpos += ucs._DataEnd
    x += 5
  end

!-----------------------------------------------------------
! https://github.com/heremaps/flexible-polyline/tree/master
StringTheory.FlexPolylineDecode  Procedure()
  Compile ('****',_C91_=1)
alphabet  string('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_')
DECODING_TABLE String('<255, 255, 255, 255, 255, 255, 255, 255, 255, 255>' & |
                      '<255, 255, 255, 255, 255, 255, 255, 255, 255, 255>' & |
                      '<255, 255, 255, 255, 255, 255, 255, 255, 255, 255>' & |
                      '<255, 255, 255, 255, 255, 255, 255, 255, 255, 255>' & |
                      '<255, 255, 255, 255, 255, 62, 255, 255, 52, 53>' & |
                      '<54, 55, 56, 57, 58, 59, 60, 61, 255, 255>' & |
                      '<255, 255, 255, 255, 255,  0,  1,  2,  3,  4>' & |
                      '<5,  6,  7,  8,  9, 10, 11, 12, 13, 14>' & |
                      '<15, 16, 17, 18, 19, 20, 21, 22, 23, 24>' & |
                      '<25, 255, 255, 255, 255, 63, 255, 26, 27, 28>' & |
                      '<29, 30, 31, 32, 33, 34, 35, 36, 37, 38>' & |
                      '<39, 40, 41, 42, 43, 44, 45, 46, 47, 48>' & |
                      '<49, 50, 51>')
header_version  long
header_content  long
precision_2d    byte
type_3d         byte
precision_3d    byte
chunk           byte
is_last_chunk   byte
chunk_value     like(INT64)
shift           byte

iDelta          long
deltas          like(INT64),dim(10000)
dx              like(INT64)
next_value      like(INT64)
d1              like(INT64)
d2              like(INT64)
d3              like(INT64)

op2             decimal(31)
op3             decimal(31)
viewint1        decimal(31,13)
viewint2        decimal(31,13)
viewint3        decimal(31,13)

str             StringTheory
x  long
  !****
  code
  Compile ('****',_C91_=1)
  If self._DataEnd < 2 then return.
  str.append('{{')
  Loop x = 1 to self._DataEnd
     chunk = val(DECODING_TABLE[val(self.value[x])+1])
     is_last_chunk = Choose( Band(chunk,20h) = 0, true,false)
     i64Assign(chunk_value,Band(chunk,01Fh))

     ! prepend the chunk value to next_value:

     i64Shift(chunk_value,Shift,chunk_value)
     i64Add(next_value,chunk_value)

     i64ToDecimal(viewint1,chunk_value)
     i64ToDecimal(viewint2,next_value)

     shift += 5
     If is_last_chunk
       ! Convert chunk_value to a signed integer:
       iDelta += 1
       if iDelta >= 3
         if band(next_value.lo,1) = 1 ! if first bit is 1, value is negative
           i64Assign(chunk_value,1)
           i64Add(next_value,chunk_value)
           i64Shift(next_value,-1,next_value)
           i64Negate(next_value)
           deltas[iDelta].lo = next_value.lo
           deltas[iDelta].hi = next_value.hi
         else
           i64Shift(next_value,-1,next_value)
           deltas[iDelta].lo = next_value.lo
           deltas[iDelta].hi = next_value.hi
         end
       else
         deltas[iDelta].lo = next_value.lo
         deltas[iDelta].hi = next_value.hi
       End
       dx.lo = deltas[iDelta].lo
       dx.hi = deltas[iDelta].hi
       i64ToDecimal(viewint1,dx)
       i64Assign(next_value,0)
       shift = 0
     End
  End
  dx.lo = deltas[1].lo
  dx.hi = deltas[1].hi
  i64To32(dx,header_version)
  dx.lo = deltas[2].lo
  dx.hi = deltas[2].hi
  i64To32(dx,header_content)

  precision_2d = Band(header_content,0Fh)             ! precision of first two dimensions
  type_3d = Band(BShift(header_content,-4),07h)       ! type of 3rd dimension Possible values are: 0 � absent, 1 � level, 2 � altitude, 3 � elevation, 4 � reserved1, 5 � reserved2, 6 � custom1, 7 � custom2
  precision_3d = Band(Bshift(header_content,-7),0Fh)  ! precision of 3rd dimension
  str.append('(' & precision_2d & ', ' & precision_3d & ', ' & type_3d & '); ')

  str.append('[')
  op2 = (10 ^ precision_2d)
  If type_3d  = 0 ! system is 2 dimensional
    Loop x = 3 to iDelta by 2
      dx.lo = deltas[x].lo
      dx.hi = deltas[x].hi
      i64Add(d1,dx)
      i64ToDecimal(viewint1,d1)
      viewint1 = viewint1 / op2

      dx.lo = deltas[x+1].lo
      dx.hi = deltas[x+1].hi
      i64Add(d2,dx)
      i64ToDecimal(viewint2,d2)
      viewint2 = viewint2 / op2

      str.append('(' & viewint1 & ',' & viewint2 & '), ')
    End
  Else            ! system is 3 dimensional
    op3 = (10 ^ precision_3d)
    Loop x = 3 to iDelta by 3
      dx.lo = deltas[x].lo
      dx.hi = deltas[x].hi
      i64Add(d1,dx)
      i64ToDecimal(viewint1,d1)
      viewint1 = viewint1 / op2

      dx.lo = deltas[x+1].lo
      dx.hi = deltas[x+1].hi
      i64Add(d2,dx)
      i64ToDecimal(viewint2,d2)
      viewint2 = viewint2 / op2

      dx.lo = deltas[x+2].lo
      dx.hi = deltas[x+2].hi
      i64Add(d3,dx)
      i64ToDecimal(viewint3,d3)
      viewint3 = viewint3 / op3

      str.append('(' & viewint1 & ',' & viewint2 &  ',' & viewint3 & '), ')
    End
  End
  str.append(']')
  str.append('}')
  self._StealValue(str)
  !****
  return

!-----------------------------------------------------------
StringTheory.MergeXml   Procedure(String pNew, Long pWhere)
pos     long,auto
clipLen long,auto
  code
  clipLen = self.clipLen(pNew)
  if clipLen = 0 then return.

  if self._DataEnd = 0
    self.Cat(pNew,clipLen)
  else
    case pWhere
    of st:first
      pos = self.FindChar('>')
      if pos = 0 or pos = self._DataEnd
        self.Cat(pNew,clipLen)
      else
        self.insert(pos+1,pNew[1:clipLen])
      end
    of st:last
      pos = self.Instring('<',-1,1,self._DataEnd,0,0)
      if pos <= 1
        self.Cat(pNew,clipLen)
      else
        self.insert(pos,pNew[1:clipLen])
      end
    end
  end
  return

!-----------------------------------------------------------
! removes all tag prefixes from xml. So for example
! <ns1:capesoft>Hello</ns1:capesoft> becomes
! <capesoft>Hello</capesoft>
StringTheory.RemoveXMLPrefixes  Procedure()
x        long,auto
tagstart long
  code
  loop x = 1 TO self._DataEnd
    case val(self.value[x])
    of 60                            ! '<'
      tagstart = x
    of 47                            ! '/'
      if tagstart > 0 and x = tagstart + 1
        tagstart = x
      end
    of 62                            ! '>'
    orof 32                          ! space ! space indicates the end of the tag name - then might be attributes.
      tagstart = 0
    of 58                            ! ':'
      if tagstart > 0
        if x < self._DataEnd
          self.RemoveFromPosition(tagstart+1,x-tagstart)
          x = tagstart
        else
          self.SetLength(tagstart)   ! Bruce check this is what you want??
        end
      end
    end
  end
!-----------------------------------------------------------
StringTheory.LineEndings  Procedure(Long pEndings=st:windows,Long pFrom=0)
  code
  if pEndings <> st:web and pFrom = st:web
    self.replace('<<br>','<13,10>')
    self.replace('<<br/>','<13,10>')
    self.replace('<<hr>','<13,10>')
    self.replace('<<hr/>','<13,10>')
    self.replace('<</p>','<13,10>')   ! _end_ paragraph
    self.replace('<<p/>','<13,10>')
  end

  case pEndings
  of st:windows                       ! CRLF
    self.replace('<13,10>','<13>')
    self.replaceByte(10,13)
    self.replace('<13>','<13,10>')
  of st:mac                           ! CR
    self.replace('<13,10>','<13>')
    self.replaceByte(10,13)
  of st:unix                          ! LF
    self.replace('<13,10>','<10>')
    self.replaceByte(13,10)
  of st:web                           ! <br><br/><hr></p><p/>
    self.replace('<13,10>','<<br/>')
    self.replace('<10>','<<br/>')
    self.replace('<13>','<<br/>')
  of st:None
    self.removeChars('<13,10>')
  end

!-----------------------------------------------------------
! If a value is passed to the method, then the deformat of the value is returned,
! but the contents of the existing string is not changed.
!-----------------------------------------------------------
StringTheory.DeformatTime PROCEDURE (String pValue)
dfmt  StringDeformat
  code
  return dfmt.DeformatTime(pValue)

!-----------------------------------------------------------
! deformats the contents of the string into standard clarion time format.
! pic is not needed because the format is unambiguous.
! result is placed in the string.
! if the contents are not recognised as a time, then the string is unchanged.
!-----------------------------------------------------------
StringTheory.DeformatTime PROCEDURE ()
dfmt  StringDeformat
  code
  if self._DataEnd
    self.SetValue(dfmt.DeformatTime(self.value[1 : self._DataEnd]))
  end

!-----------------------------------------------------------
StringTheory.FormatTime            PROCEDURE (String pValue, String pFormat)
fmt  StringFormat
  code
  return fmt.FormatTime(pValue,pFormat)

!-----------------------------------------------------------
StringTheory.FormatTime            PROCEDURE (String pFormat)
fmt  StringFormat
  code
  if self._DataEnd
    self.SetValue(fmt.FormatValue(self.value[1 : self._DataEnd],pFormat))
  end
!-----------------------------------------------------------
! consider if the string contains a human-formatted time.
! the following are detected as time.
! h:mm, hh:mm, hPM, hhAM, h:mmAM, hh:mmPM
! note that this method does not detect a lot of values that would be acceptable to the
! DeformatTime method. That method assumes the value IS a time, and so is not considering that
! it might just be a number. This method narrows the pattern considerably.

StringTheory.IsTime PROCEDURE (String pValue)
loc  StringTheory
  code
  loc.SetValue(pValue)
  return loc.IsTime()

StringTheory.IsTime PROCEDURE ()
x  long, auto
  code
  if self.IsAll('0123456789: apmAPM') = false then return false. ! simple exclusion for other chars.

  if self.ClipLength() = 0 or (self.ContainsChar(':') = 0 and |
     self.instring('am',1,1,self._DataEnd,st:noCase,false) = 0 and self.instring('pm',1,1,self._DataEnd,st:noCase,false) = 0)
    return false ! must contain at least one colon, or am/pm sign.
  end
  x = self.value[1 : self._DataEnd]
  if x > 24
    return false
  end
  return true

!-----------------------------------------------------------
StringTheory.FormatValue Procedure(String pPicture)
fmt  StringFormat
  code
  return fmt.FormatValue(self.GetValue(),pPicture)

!-----------------------------------------------------------
StringTheory.FormatValue Procedure(String pValue, String pPicture)
fmt  StringFormat
  code
  return fmt.FormatValue(pValue,pPicture)

!-----------------------------------------------------------
StringTheory.DeformatValue Procedure(String pPicture)
dfmt  StringDeformat
  code
  return dfmt.DeformatValue(self.GetValue(),pPicture)

!-----------------------------------------------------------
StringTheory.DeformatValue Procedure(String pValue,String pPicture)
dfmt  StringDeformat
  code
  return dfmt.DeformatValue(pValue,pPicture)

!-----------------------------------------------------------
StringTheory.SetFormatValue Procedure(String pPicture)
fmt  StringFormat
  code
  self.setvalue(fmt.FormatValue(self.GetValue(),pPicture))

!-----------------------------------------------------------
StringTheory.SetFormatValue Procedure(String pValue, String pPicture)
fmt  StringFormat
  code
  self.setvalue(fmt.FormatValue(pValue,pPicture))

!-----------------------------------------------------------
StringTheory.SetDeformatValue Procedure(String pPicture)
dfmt  StringDeformat
  code
  self.setvalue(dfmt.DeformatValue(self.GetValue(),pPicture))

!-----------------------------------------------------------
StringTheory.SetDeformatValue Procedure(String pValue,String pPicture)
dfmt  StringDeformat
  code
  self.setvalue(dfmt.DeformatValue(pValue,pPicture))

!------------------------------------------------------------------------------------------------------
StringTheory.startsWith    Procedure (String pStr,Long pCase=True,Long pClip=st:clip)
x  long,auto
  code
  if pClip
    x = self.clipLen(pStr)
  else
    x = size(pStr)
  end

  if x = 0 then return true.
  if x > self._DataEnd then return false.
  if pCase
    if self.Value[1 : x] = pStr then return true.
  else
    if lower(self.Value[1 : x]) = lower(pStr) then return true.
  end
  return false

!-----------------------------------------------------------
StringTheory.EndsWith    Procedure (String pStr,Long pCase=True,Long pClip=st:clip)
x  long,auto
  code
  if pClip
    x = self.clipLen(pStr)
  else
    x = size(pStr)
  end

  if x = 0 then return true.
  if x > self._DataEnd then return false.
  if pCase
    if self.Value[self._DataEnd - x + 1 : self._DataEnd] = pStr then return true.
  else
    if lower(self.Value[self._DataEnd - x + 1 : self._DataEnd]) = lower(pStr) then return true.
  end
  return false
!-----------------------------------------------------------
StringTheory.Abbreviate Procedure(Long pPos,Long pRangeLeft = 15,Long pRangeRight = 15)
x  Long
  code
  if pPos < 2
    self.SetLength(0)
    return 0
  end
  if pPos >= self._DataEnd then return self._DataEnd.
  if self.Value[pPos] = ' '
    self.SetLength(pPos-1)
  ELSE
    x = 1
    loop
      if (x > pRangeLeft and x > pRangeRight) or pPos < x or pPos+x > self._DataEnd
        self.SetLength(pPos)
        BREAK
      END
      if x <= pRangeLeft and x < pPos and self.value[pPos-x] = ' '
        self.SetLength(pPos-x-1)
        break
      END
      if x <= pRangeRight and pPos + x <= self._DataEnd and self.value[pPos+x] = ' '
        self.SetLength(pPos+x-1)
        break
      end
      x += 1
    END
  END
  return self._DataEnd

!-----------------------------------------------------------
StringTheory.CharToDecEntity Procedure(long pFrom=128, long pTo=255)
x       long,auto
y       long,auto
expand  byte,dim(256)          ! do not make auto
count   long                   ! do not make auto
oldLen  long,auto
oldChar string(1),auto
oldByte byte,over(oldChar)
  Code
  if pFrom < 0 then pFrom = 128.
  if pTo > 255 then pTo = 255.
  if pFrom > pTo or self._DataEnd < 1 then return.

  loop x = pFrom to pTo        ! initialise expansion table
    if x < 10
      expand[x+1] = 3          ! we add one to x as chars 0->255 map to bytes 1->256
    elsif x < 100
      expand[x+1] = 4
    else
      expand[x+1] = 5
    end
  end

  loop x = 1 to self._DataEnd  ! add up how many chars we need to expand
    count += expand[val(self.valueptr[x])+1]
  end

  if count = 0 then return.    ! nothing to expand

  oldLen = self._DataEnd
  y = oldLen + count
  self.setLength(y)            ! expand our string to new required length

  loop x = oldLen to 1 by -1   ! shuffle chars to the right
    oldChar = self.valuePtr[x]
    count = expand[oldByte+1]
    if count
      self.valuePtr[y - count : y] = '&#' & oldByte & ';'
      y -= count
    else
      self.valuePtr[y] = self.valuePtr[x]
    end
    y -= 1
  while x < y

!-----------------------------------------------------------
StringTheory.DecEntityToChar  Procedure()
n     long, auto
sn    string(4),over(n)
x     long  ! do not make this auto
y     long, auto
ans   long
rlen  long
u     string(4)
  Code
  Loop
    x = self.FindChars('&#',x+1)
    If x = 0 then return ans.
    y = self.FindChar(';',x+2,x+9)
    If y = 0 or y = x+2 then cycle.
    If self.value[x+2] = 'x' or self.value[x+2] = 'X'
      if y = x+3 or not self.isAll('0123456789ABCDEFabcdef', self.value[x+3 : y-1]) then cycle.
      n = self.BaseToDec(self.value[ x+3 : y-1 ] , 16)
    Elsif self.isAll('0123456789', self.value[x+2 : y-1])
      n = self.value[ x+2 : y-1 ]
    Else
      cycle
    End
    case self.encoding
    of st:EncodeAnsi
      if n < 256
        self.RemoveFromPosition(x,y-x)
        self.value[x] = chr(n)
        ans += 1
      else
        Self.ErrorTrap('StringTheory.DecEntityToChar','String is in ANSI mode, but contains Unicode entity ' & self.value[x : y])
      end
    of st:EncodeUtf16
      self.RemoveFromPosition(x,y-x-1)
      self.value[x]   = sn[1]
      self.value[x+1] = sn[2]
      ans += 1
    of st:EncodeUtf8
      u = self.Utf16ToUtf8Char(sn[1:2],rlen)
      if rlen > 4 then rlen = 4. ! to be sure, to be sure
      self.RemoveFromPosition(x,y-x+1-rlen)
      stMemCpyLeft(address(self.value)+x-1, address(u),rlen)
      ans += 1
    else
      Self.ErrorTrap('StringTheory.DecEntityToChar','String is has entity ' & self.value[x : y] & ' but unexpected encoding so no changes made.')
      break ! we are not doing any changes so no point searching any further
    end
  end
  return ans
!-----------------------------------------------------------
StringTheory.HtmlEntityToDec  Procedure()
  code
  if self.ContainsChar('&') = 0 then return.
  ! general
  self.replace('&nbsp;','&#160;')
  self.replace('&lt;','&#60;')
  self.replace('&gt;','&#62;')
  self.replace('&amp;','&#38;')
  self.replace('&quot;','&#34;')
  self.replace('&apos;','&#39;')
  ! punctuation
  self.replace('&iexcl;','&#161;')
  self.replace('&iquest;','&#191;')
  self.replace('&brvbar;','&#166;')
  self.replace('&sect;','&#167;')
  self.replace('&uml;','&#168;')
  self.replace('&laquo;','&#171;')
  self.replace('&raquo;','&#187;')
  self.replace('&ldquo;','&#8220;')
  self.replace('&rdquo;','&#8221;')
  self.replace('&acute;','&#180;')
  self.replace('&para;','&#182;')
  self.replace('&middot;','&#183;')
  self.replace('&cedil;','&#184;')
  self.replace('&bull;','&#8226;')
  ! currency
  self.replace('&cent;','&#162;')
  self.replace('&pound;','&#163;')
  self.replace('&curren;','&#164;')
  self.replace('&yen;','&#165;')
  self.replace('&euro;','&#8364;')
  ! copyright
  self.replace('&copy;','&#169;')
  self.replace('&reg;','&#174;')
  self.replace('&trade;','&#8482;')
  ! Math symbols
  self.replace('&forall;','&#8704;')
  self.replace('&part;','&#8706;')
  self.replace('&exist;','&#8707;')
  self.replace('&empty;','&#8709;')
  self.replace('&nabla;','&#8711;')
  self.replace('&isin;','&#8712;')
  self.replace('&notin;','&#8713;')
  self.replace('&ni;','&#8715;')
  self.replace('&prod;','&#8719;')
  self.replace('&sum;','&#8721;')
  self.replace('&not;','&#172;')
  self.replace('&deg;','&#176;')
  self.replace('&plusmn;','&#177;')
  self.replace('&sup1;','&#185;')
  self.replace('&sup2;','&#178;')
  self.replace('&sup3;','&#179;')
  self.replace('&micro;','&#181;')
  self.replace('&frac14;','&#188;')
  self.replace('&frac12;','&#189;')
  self.replace('&frac34;','&#190;')
  self.replace('&divide;','&#247;')
  ! Greek chars
  self.replace('&Alpha;','&#913;')
  self.replace('&Beta;','&#914;')
  self.replace('&Gamma;','&#915;')
  self.replace('&Delta;','&#916;')
  self.replace('&Epsilon;','&#917;')
  self.replace('&Zeta;','&#918;')
  self.replace('&alpha;','&#945;')
  self.replace('&beta;','&#946;')
  self.replace('&gamma;','&#947;')
  self.replace('&delta;','&#948;')
  self.replace('&epsilon;','&#949;')
  self.replace('&zeta;','&#950;')
  ! Upper Case Letters
  self.replace('&Agrave;','&#192;')
  self.replace('&Aacute;','&#193;')
  self.replace('&Acirc;','&#194;')
  self.replace('&Atilde;','&#195;')
  self.replace('&Auml;','&#196;')
  self.replace('&Aring;','&#197;')
  self.replace('&AElig;','&#198;')
  self.replace('&Ccedil;','&#199;')
  self.replace('&Egrave;','&#200;')
  self.replace('&Eacute;','&#201;')
  self.replace('&Ecirc;','&#202;')
  self.replace('&Euml;','&#203;')
  self.replace('&Igrave;','&#204;')
  self.replace('&Iacute;','&#205;')
  self.replace('&Icirc;','&#206;')
  self.replace('&Iuml;','&#207;')
  self.replace('&ETH;','&#208;')
  self.replace('&Ntilde;','&#209;')
  self.replace('&Ograve;','&#210;')
  self.replace('&Oacute;','&#211;')
  self.replace('&Ocirc;','&#212;')
  self.replace('&Otilde;','&#213;')
  self.replace('&Ouml;','&#214;')
  self.replace('&times;','&#215;')
  self.replace('&Oslash;','&#216;')
  self.replace('&Ugrave;','&#217;')
  self.replace('&Uacute;','&#218;')
  self.replace('&Ucirc;','&#219;')
  self.replace('&Uuml;','&#220;')
  self.replace('&Yacute;','&#221;')
  self.replace('&THORN;','&#222;')
  ! Lower case letters
  self.replace('&szlig;','&#223;')
  self.replace('&agrave;','&#224;')
  self.replace('&aacute;','&#225;')
  self.replace('&acirc;','&#226;')
  self.replace('&atilde;','&#227;')
  self.replace('&auml;','&#228;')
  self.replace('&aring;','&#229;')
  self.replace('&aelig;','&#230;')
  self.replace('&ccedil;','&#231;')
  self.replace('&egrave;','&#232;')
  self.replace('&eacute;','&#233;')
  self.replace('&ecirc;','&#234;')
  self.replace('&euml;','&#235;')
  self.replace('&igrave;','&#236;')
  self.replace('&iacute;','&#237;')
  self.replace('&icirc;','&#238;')
  self.replace('&iuml;','&#239;')
  self.replace('&eth;','&#240;')
  self.replace('&ntilde;','&#241;')
  self.replace('&ograve;','&#242;')
  self.replace('&oacute;','&#243;')
  self.replace('&ocirc;','&#244;')
  self.replace('&otilde;','&#245;')
  self.replace('&ouml;','&#246;')
  self.replace('&oslash;','&#248;')
  self.replace('&ugrave;','&#249;')
  self.replace('&uacute;','&#250;')
  self.replace('&ucirc;','&#251;')
  self.replace('&uuml;','&#252;')
  self.replace('&yacute;','&#253;')
  self.replace('&thorn;','&#254;')
  self.replace('&yuml;','&#255;')
  self.replace('&fnof;','&#402;')

!-----------------------------------------------------------
! ASN is of the form TYPE, LENGTH, VALUE
StringTheory.AsnDecode  Procedure(*Long pPos,*StringTheory rASNValue,<*String rASNType>)
returnValue Long,auto
abyte       Byte,auto
lenbytes    Byte,auto
endmarker   Long,auto
lASNLength  Long
originalPos Long,auto

  code
  ReturnValue = st:ok
  if pPos = 0 then pPos = 1.
  rASNValue.free()
  if not omitted(rASNType)
    rASNType = self.Sub(pPos)       ! type is in first char
  end
  originalPos = pPos
  pPos += 1
  aByte = val(self.Sub(pPos))       ! length of length is in second char
  if band(abyte,10000000b)          ! high bit set
    lenbytes = band(abyte,1111111b) ! number of bytes in the length
    pPos += 1
  else
    lenbytes = 1
  end
  If lenbytes = 0                   ! Indefinite Form
    EndMarker = self.FindChars('<0,0>',pPos + 1)
    If endMarker = 0
      pPos = originalPos
      return st:notok               ! Indeterminate length form, but no end of packet ('<0,0>') detected.
    end
    lASNLength = endMarker + 1 - pPos
    pPos += 1
  ElsIf lenbytes = 1                ! definite form - Length is 1 byte
    lASNLength = val(self.Sub(pPos))
    pPos += 1
  ElsIf lenbytes = 2                ! definite form - Length is 2 bytes
    lASNLength = val(self.Sub(pPos))*256 + val(self.Sub(pPos+1))
    pPos += 2
  elsif lenbytes = 4                ! definite form - Length is 4 bytes
    self.GetBytes(lASNLength,pPos)
    ! the _length_ field appears to be BigEndian. Although _value_ fields seem to be little endian.
    lASNLength = self.LittleEndian(lASNLength)
    pPos += 4
  end

  if lASNLength = 0
    ! no need to get value, rASNValue already cleared
  elsif self._DataEnd < pPos + lASNLength -  1
    returnValue = st:notOk
  else
    rASNValue.SetValue(self.Sub(pPos,lASNLength))
    pPos += lASNLength
  end
  !self.trace('rASNType = ' & val(rASNType) & ' aByte=' & aByte & ' lenbytes=' &lenbytes &  ' lASNLength=' & lASNLength & 'rtn=' & returnvalue)
  return ReturnValue

!-----------------------------------------------------------
StringTheory.AsnEncodeNumber  Procedure(String pType,Long pValue)
l    long
sl   string(4),over(l)
  code
  l = pValue
  if l < 256
    self.setvalue(chr(l))
  else
    self.setvalue(sl)
  end
  self.AsnEncode(pType)

!-----------------------------------------------------------
StringTheory.AsnEncode  Procedure(String pType,<String pValue>)
l    long
sl   string(4),over(l)

  code
  if not omitted(pValue)
    Self.SetValue(pValue)
  end
  l = self._DataEnd
  if l < 128
    self.prepend(chr(l))
  else
    l = self.SwitchEndian(l)
    self.prepend(sl)
    self.prepend('<084h>') ! 8 is the high bit set, 4 is the length of the length
  end
  self.prepend(pType)

!-----------------------------------------------------------
StringTheory.RemoveHTML            Procedure ()
  code
  self.HtmlEntityToDec()
  self.Remove('<<head', '<</head>',st:noCase)
  self.Remove('<<style', '<</style>',st:noCase)
  self.Remove('<<script', '<</script>',st:noCase)
  self.LineEndings(st:windows,st:web)
  self.Remove('<<', '>')
  self.Squeeze(ST:NOPUNCTUATION)
  !self.Replace('&nbsp;',' ')
  self.DecEntityToChar()

!-----------------------------------------------------------
! divide the current string by divisor returning the result and the remainder
StringTheory.LongDivision  Procedure(Long pDivisor, *Long rRemainder, Long pBase)
str  StringTheory
l    long
d    long, auto
n    long, auto
  code
  if self._DataEnd = 0 or pDivisor = 1 or pDivisor = 0
    rRemainder = 0
    return st:ok
  end
  if pBase < 2 or pBase > 36 then return st:notOk. ! Invalid BaseTo
  n = 1
  loop
    l += self.BaseToDec(self.sub(n),pBase)         ! handles up to base 36
    d = int(l/pDivisor)
    rRemainder = l % pDivisor
    If str._DataEnd = 0 and d = 0
    Else
      str.cat(self.DecToBase(d,pBase))             ! lower case
    End
    l = rRemainder * pBase
    n += 1
    if n > self._DataEnd then break.
  end
  self._stealValue(str)
  return st:ok

!-----------------------------------------------------------
StringTheory.ChangeBase  Procedure(Long pBaseFrom,Long pBaseTo)
m  stringtheory
r  long
  code
  If pBaseTo = pBaseFrom then return st:ok.
  if pBaseFrom < 2 or pBaseFrom > 36 then return st:notOk. ! Invalid BaseFrom
  if pBaseTo   < 2 or pBaseTo   > 36 then return st:notOk. ! Invalid BaseTo
  loop
    if self._DataEnd = 0
      break
    end
    self.LongDivision(pBaseTo,r,pBaseFrom)
    m.prepend(self.DecToBase(r,pBaseTo))
  end
  self._stealValue(m)
  Return st:Ok

!-----------------------------------------------------------
StringTheory.ConvertOemToAnsi  Procedure()
  code
  ConvertOemToAnsi(self.getvalueptr())

!-----------------------------------------------------------
StringTheory.ConvertAnsiToOem  Procedure()
  code
  ConvertAnsiToOem(self.getvalueptr())

!-----------------------------------------------------------
StringTheory.FormatHTML  Procedure()
str               StringTheory
tag               StringTheory
x                 Long,auto
indent            Long
TagPos            Long
InTag             Byte
InAttributes      Byte
lastwasStartTag   Byte
lastWasEndTag     Byte
lastWasWholeTag   Byte
lastWasCommentTag Byte
lastWasSpecialTag Byte
lastWasBreakTag   Byte
char              string(1),auto
  code
  self.RemoveChars('<13,10>')
  loop x = 1 to self._DataEnd
    char = self.value[x]
    case val(char)
    of 60 ! '<'
      InTag = true
      InAttributes = false
      tag.free()
      if lastWasStartTag or lastWasEndTag or lastWasWholeTag or lastWasCommentTag or lastWasSpecialTag or lastWasBreakTag
        str.append('<13,10>')
        if x < self._DataEnd and self.value[x+1] = '/' ! this is end tag
          indent -= 2
        elsif lastWasStartTag or lastWasSpecialTag
          indent += 2
        end
        str.append(all(' ',indent))
        lastWasStartTag = false
        lastWasEndTag    = false
        lastWasWholeTag  = false
        lastWasCommentTag = false
        lastWasSpecialTag = false
        lastWasBreakTag = false
      end
      TagPos = x
      str.append(char)
    of 62 ! '>'
      lastWasWholeTag = false
      lastWasEndTag = false
      lastWasStartTag = false
      lastWasCommentTag = false
      lastWasSpecialTag = false
      lastWasBreakTag = false
      if inlist(tag.getvalue(),'br','br/')
        lastWasBreakTag = true
      elsif x > 1 and self.value[x-1] = '/'
        lastWasWholeTag = true
      elsif TagPos < self._DataEnd and self.value[TagPos+1] = '/'
        lastWasEndTag = true
      elsif x > 2 and self.value[x-2 :x] = '-->' and TagPos < self._DataEnd - 2 and self.value[TagPos : Tagpos + 3] = '<!--'
        lastWasCommentTag = true
      elsif inlist(tag.getvalue(),'html','header','style','script','body','iframe')
        lastWasSpecialTag = true
      else
        lastWasStartTag = true
      end
      InTag = false
      InAttributes = false
      str.append(char)
    of 32                             ! space
      if InTag
        InAttributes = true
      end
      if lastWasWholeTag or lastWasStartTag or lastWasEndTag or lastWasCommentTag or lastWasSpecialTag or lastWasBreakTag
      else
        str.setLength(str._DataEnd+1) !str.append(char)
      end
!    of 13 orof 10                       !! looks unreachable as removed at top
!      if not inTag
!        str.append(char)
!      end
    else
      If InTag = false
        if lastWasSpecialTag
          indent += 2
        end
        if lastWasBreakTag or lastWasSpecialTag
          str.append('<13,10>')
          str.append(all(' ',indent))
        end
        lastWasWholeTag = false
        lastWasStartTag = false
        lastWasEndTag = false
        lastWasCommentTag = false
        lastWasSpecialTag = false
        lastWasBreakTag = false
        InAttributes = false
      ElsIf InAttributes = false
        tag.append(lower(char))
      end
      str.append(char)
    end
  end
  self._stealValue(str)

!-----------------------------------------------------------
StringTheory._IANANameToNumber  Procedure(String pIANAName)
str  StringTheory
  code
  str.SetValue(upper(pIANAName))
  str.KeepChars('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  if str._DataEnd > 0
    case str.value[1 : str._DataEnd]
    of 'USASCII'   orof 'ASCII'
      return(st:CP_US_ASCII)
    of 'WINDOWS1250' orof '1250' orof 'WIN1250'
      return(st:CP_WINDOWS_1250)
    of 'WINDOWS1251' orof '1251' orof 'WIN1251'
      return(st:CP_WINDOWS_1251)
    of 'WINDOWS1252' orof '1252' orof 'WIN1252'
      return(st:CP_WINDOWS_1252)
    of 'WINDOWS1253' orof '1253' orof 'WIN1253'
      return(st:CP_WINDOWS_1253)
    of 'WINDOWS1254' orof '1254' orof 'WIN1254'
      return(st:CP_WINDOWS_1254)
    of 'WINDOWS1255' orof '1255' orof 'WIN1255'
      return(st:CP_WINDOWS_1255)
    of 'WINDOWS1256' orof '1256' orof 'WIN1256'
      return(st:CP_WINDOWS_1256)
    of 'WINDOWS1257' orof '1257' orof 'WIN1257'
      return(st:CP_WINDOWS_1257)
    of 'WINDOWS1258' orof '1258' orof 'WIN1258'
      return(st:CP_WINDOWS_1258)
    of 'ISO88591' orof '88591'
      return(st:CP_ISO_8859_1)
    of 'ISO88592' orof '88592'
      return(st:CP_ISO_8859_2)
    of 'ISO88593' orof '88593'
      return(st:CP_ISO_8859_3)
    of 'ISO88594' orof '88594'
      return(st:CP_ISO_8859_4)
    of 'ISO88595' orof '88595'
      return(st:CP_ISO_8859_5)
    of 'ISO88596' orof '88596'
      return(st:CP_ISO_8859_6)
    of 'ISO88597' orof '88597'
      return(st:CP_ISO_8859_7)
    of 'ISO88598' orof '88598'
      return(st:CP_ISO_8859_8)
    of 'ISO88599' orof '88599'
      return(st:CP_ISO_8859_9)
    of 'ISO885913' orof '885913'
      return(st:CP_ISO_8859_13)
    of 'ISO885915' orof '885915'
      return(st:CP_ISO_8859_15)
    of 'UTF7'
      return st:CP_UTF7
    of 'UTF8'
      return st:CP_UTF8
    End
  end
  return st:CP_ACP
!-----------------------------------------------------------
!======================================================================================
StringPicture.CreatePicture           Procedure(<String pType>,Long pFlag=0)
loc:type  string(1),auto
  CODE
  if omitted(pType) or pType = ''
    loc:type = self.PicType
  else
    loc:type = pType
  end
  case loc:type
  of pic:Number
    return(self.CreateNumericPicture(pFlag))
  of pic:Date
    return(self.CreateDatePicture(pFlag))
  of pic:Time
    return(self.CreateTimePicture(pFlag))
  of pic:TimeHours
    return(self.CreateTimeHoursPicture(pFlag))
  of pic:Scientific
    return(self.CreateScientificPicture(pFlag))
  of pic:String
    return(self.CreateStringPicture(pFlag))
  of pic:Pattern
    return(self.CreatePatternPicture(pFlag))
  of pic:KeyIn
    return(self.CreateKeyinPicture(pFlag))
  of pic:UnixTimeStamp
    return(self.CreateUnixTimeStampPicture(pFlag))
  of pic:hex
    return(self.CreateHexPicture(pFlag))
  end
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateDatePicture        Procedure(Long pFlag=0)
  CODE
  self.pic = '@D' & choose(self.fill = '','','0') & clip(self.n) & |
                    choose(band(pFlag,st:Clarion) <> 0 or self.s <> '!',clip(self.s),'') & |
                    clip(self.Direction) & |
                    choose(self.Direction = 0,'',clip(self.Range)) & choose(self.b = '','','B') & |
                    choose(band(pFlag,st:Clarion) = 0 and self.u,'U','') & |
                    choose(band(pFlag,st:Clarion) = 0 and self.local,'L','') & |
                    choose(band(pFlag,st:Clarion) = 0 and self.utc,'T','')
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateTimePicture        Procedure(Long pFlag=0)
  CODE
  self.pic = '@T' & choose(self.fill = '','','0')
  if band(pFlag,st:Clarion)
    if self.n < 1 or self.n > 8
      self.pic = self.pic & '1'
    else
      self.pic = self.pic & clip(self.n)
    end
  else
    self.pic = self.pic & clip(self.n)
  end
  self.pic = self.pic & clip(self.s) & choose(self.b = '','','B')
  if band(pFlag,st:Clarion) = 0
    if self.u then self.pic = self.pic & 'U'.
    if self.z then self.pic = self.pic & 'Z'.
    if self.local then self.pic = self.pic & 'L'
    elsif self.utc then self.pic = self.pic & 'T'
    end
    if self.numberpart then self.pic = self.pic & clip(self.numberpart).
  end
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateStringPicture      Procedure(Long pFlag=0)
  CODE
  if band(pFlag,st:Clarion) > 0
    if self.length <= 1
      self.pic ='@S1'
    elsif self.length > 255
      self.pic ='@S255'
    else
      self.pic ='@S' & clip(self.Length)
    end
  else
    if self.length <= 1
      self.pic ='@S'
    else
      self.pic ='@S' & clip(self.Length)
    end
  end
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateScientificPicture  Procedure(Long pFlag=0)
  CODE
  self.pic = '@E'
  self.pic = self.pic & clip(self.size)
  if self.Separator = '.'
    if self.Grouping = ','
      self.pic = self.pic & '.'
    elsif self.Grouping = '.'
      self.pic = self.pic & '..'
    else
      self.pic = self.pic & '_.'
    end
  elsif self.Separator = ','
    self.pic = self.pic & '`'
  else
    self.pic = self.pic & '.'
  end
  !self.pic = self.pic & clip(self.s)
  self.pic = self.pic & clip(self.n)
  if self.b then self.pic = self.pic & 'B'.
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateTimeHoursPicture     Procedure(Long pFlag=0)
  code
  self.CreateNumericPicture()
  self.pic[2] = 'H'
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateNumericPicture      Procedure(Long pFlag=0)
  CODE
  self.pic = '@N' & choose(self.CurrencyBefore = '','',choose(self.CurrencyBefore='$','$','~' & clip(self.CurrencyBefore) & '~')) & |
                    clip(self.SignBefore) & clip(self.Fill) & clip(self.Size) & clip(self.grouping) & |
                    choose(self.separator = '','',clip(self.Separator) & clip(self.Places)) & clip(self.SignAfter) & |
                    choose(self.CurrencyAfter = '','',choose(self.CurrencyAfter='$','$','~' & clip(self.CurrencyAfter) & '~')) & |
                    choose(self.b = '','','B')
  return self.pic

!-----------------------------------------------------------
StringPicture.CreatePatternPicture     Procedure(Long pFlag=0)
lc  long,auto
  CODE
  lc = instring('P',self.pattern,1,1)
  self.pic = Choose(lc<>0,'@p','@P') & clip(self.Pattern) & Choose(lc<>0,'p','P') & choose(self.b = '','','B')
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateKeyInPicture     Procedure(Long pFlag=0)
lc  long,auto
  CODE
  lc = instring('K',self.pattern,1,1)
  self.pic = Choose(lc<>0,'@k','@K') & clip(self.Pattern) & Choose(lc<>0,'k','K') & choose(self.b = '','','B')
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateUnixTimeStampPicture     Procedure(Long pFlag=0)
  CODE
  self.pic = '@U' & clip(self.Length) & choose(self.separator = '','',clip(self.Separator)) & |
             choose(self.milli = '','','M') & choose(self.clarionDate = '','','D') & |
             choose(self.clarionTime = '','','T') & self.DatePart & self.TimePart
  return self.pic

!-----------------------------------------------------------
StringPicture.CreateHexPicture     Procedure(Long pFlag=0)
  CODE
  self.pic = '@X' & clip(self.Length) & clip(self.s)
  return self.pic

!-----------------------------------------------------------
StringPicture.ParsePicture            Procedure(<String pPic>)
pic  String(255),auto
  Code
  if omitted(pPic) then pic = self.pic else pic = pPic.
  self.pic = clip(pic)
  if pic[1] <> '@' then return st:notOk.
  case upper(pic[2])
  of pic:Number
    return(self.ParseNumericPicture(pic))
  of pic:Date
    return(self.ParseDatePicture(pic))
  of pic:String
    return(self.ParseStringPicture(pic))
  of pic:Time
    return(self.ParseTimePicture(pic))
  of pic:TimeHours
    return(self.ParseTimeHoursPicture(pic))
  of pic:Scientific
    return(self.ParseScientificPicture(pic))
  of pic:Pattern
    return(self.ParsePatternPicture(pic))
  of pic:Keyin
    return(self.ParseKeyinPicture(pic))
  of pic:UnixTimeStamp
    return(self.ParseUnixTimeStampPicture(pic))
  of pic:Hex
    return(self.ParseHexPicture(pic))
  ELSE
    return st:notOk
  End
  !return st:ok   !!never gets to here

!-----------------------------------------------------------
StringPicture.ParseDatePicture        Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 68 then return st:notOk. ! 68='D'
  self.picType = pic:Date
  x = 3
  self.fill = self._block(pic,'0',x,1)
  self.n = self._block(pic,'1234567890',x,0)
  self.s = self._block(pic,'.`-_!',x,1)
? assert(self.s[2] = ' ')
  case val(self.s[1])
  of 46 ! '.'
    self.Separator = '.'
  of 45 ! '-'
    self.Separator = '-'
  of 95 ! '_'
    self.Separator = ' '
  of 96 ! '`'
    self.Separator = ','
  of 33 ! '!'
    self.Separator = ''
  else
    self.Separator = '/'
  end

  self.direction = self._block(pic,'><',x,1)
  self.range = self._block(pic,'1234567890',x,2)
  self.b = self._block(pic,'Bb',x,1)
  self.u = self._block(pic,'Uu',x,1)
  self.milli = self._block(pic,'Mm',x,1)
  self.local = self._block(pic,'Ll',x,1)
  self.utc = self._block(pic,'Tt',x,1)
  if self.milli then self.u = 'U'.                                     ! M implies U
  return st:Ok
!-----------------------------------------------------------
StringPicture.ParseTimePicture        Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 84 then return st:notOk. ! 84='T'
  self.picType = pic:Time
  x = 3
  self.fill = self._block(pic,'0',x,1)
  self.n = self._block(pic,'1234567890',x,0)
  self.s = self._block(pic,'.`-_',x,1)
? assert(self.s[2] = ' ')
  case val(self.s[1])
  of 46 ! '.'
    self.Separator = '.'
  of 45 ! '-'
    self.Separator = '-'
  of 95 ! '_'
    self.Separator = ' '
  of 96 ! '`'
    self.Separator = ','
  else
    self.Separator = ':'
  end
  if instring('B',sub(pic,x,5),1,1) or instring('b',sub(pic,x,5),1,1) then self.b = 'B'.
  if instring('U',sub(pic,x,5),1,1) or instring('u',sub(pic,x,5),1,1) then self.u = 'U' ; self.milli = ''.
  if instring('M',sub(pic,x,5),1,1) or instring('m',sub(pic,x,5),1,1) then self.milli = 'M' ; self.u = 'U'. ! M implies U
  if instring('Z',sub(pic,x,5),1,1) or instring('z',sub(pic,x,5),1,1) then self.z = 'Z'.
  if instring('L',sub(pic,x,5),1,1) or instring('l',sub(pic,x,5),1,1) then self.local = 'L'.
  if instring('T',sub(pic,x,5),1,1) or instring('t',sub(pic,x,5),1,1) then self.utc = 'T'.

  if sub(pic,x,1) = '@'
    self.NumberPart = '@' & self._blockbound(clip(pic)&'@','@',x)
  elsif self.fill = '0'
    self.NumberPart = '@N02'
  else
    self.NumberPart = '@N10'
  end
  return st:Ok

!-----------------------------------------------------------
StringPicture.ParseStringPicture      Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 83 then return st:notOk. ! 83='S'
  self.picType = pic:String
  if pic[3 : size(pic)] = ''
    self.length = -1
  else
    x = 3
    self.length = self._block(pic,'1234567890',x,0)
  end
  return st:Ok

!-----------------------------------------------------------
StringPicture.ParseScientificPicture  Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 69 then return st:notOk. ! 69='E'
  self.picType = pic:Scientific
  x = 3
  self.size = self._block(pic,'1234567890',x,0)
  self.s = self._block(pic,'.`_',x,2)
  case self.s
  of '.'
    self.separator = '.'
    self.grouping = ','
  of '..'
    self.separator = '.'
    self.grouping = '.'
  of '`'
    self.separator = ','
    self.grouping = '.'
  of '_.'
    self.separator = '.'
    self.grouping = ' '
  end
  self.n = self._block(pic,'1234567890',x,0)
  self.B = self._block(pic,'Bb',x,1)
  return st:Ok

!-----------------------------------------------------------
StringPicture.ParseTimeHoursPicture   Procedure(<String pPic>)
pic  String(255),auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 72 then return st:notOk. ! 72='H'
  pic[2] = pic:Number
  self.ParseNumericPicture(pic)
  self.picType = pic:TimeHours
  return st:Ok

!-----------------------------------------------------------
StringPicture.ParseNumericPicture     Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 78 then return st:notOk. ! 78='N'
  self.picType = pic:Number
  x = 3
  self.CurrencyBefore = self._block(pic,'$',x,1)
  if self.CurrencyBefore = ''
    self.CurrencyBefore = self._blockbound(pic,'~',x)
  end
  self.SignBefore = self._block(pic,'-(',x,1)
  self.Fill = self._block(pic,'0_*',x,1)
  self.Size = self._block(pic,'1234567890',x,0)
  self.Grouping = self._block(pic,'._',x,1)
  self.Separator = self._block(pic,'.`vV',x,1)
  if self.Separator = '' and self.Grouping = '.'
    self.Separator = '.'
    self.Grouping = ''
  end
  self.Places = self._block(pic,'1234567890',x,0)
  self.SignAfter = self._block(pic,'-)',x,1)
  self.CurrencyAfter = self._block(pic,'$',x,1)
  if self.CurrencyAfter = ''
    self.CurrencyAfter = self._blockbound(pic,'~',x)
  end
  self.B = self._block(pic,'Bb',x,1)
  return st:Ok
!-----------------------------------------------------------
StringPicture.ParsePatternPicture  Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 80 then return st:notOk. ! 80='P'
  self.upper = pic[2]
  self.picType = pic:Pattern
  x = 2 ! note the cunning x-1 to get the start of the P boundary
  self.pattern = self._blockbound(pic,self.upper,x)
  self.B = self._block(pic,'Bb',x,1)
  return st:Ok
!-----------------------------------------------------------
StringPicture.ParseKeyinPicture  Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 75 then return st:notOk. ! 75='K'
  self.upper = pic[2]
  self.picType = pic:KeyIn
  x = 2 ! note the cunning x-1 to get the start of the K boundary
  self.pattern = self._blockbound(pic,self.upper,x)
  self.B = self._block(pic,'Bb',x,1)
  return st:Ok
!-----------------------------------------------------------
StringPicture.ParseUnixTimeStampPicture           Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 85 then return st:notOk. ! 85='U'
  self.picType = pic:UnixTimeStamp
  x = 3
  pic = clip(pic) & '@'  ! force a @ to the end of the string. helpful for _blockbound
  self.n = self._block(pic,'1234567890',x,0)
  if self.n = 0 then self.n = 1.
  if sub(pic,x,1) = '@'
    if lower(sub(pic,x+1,1)) = 'm'
      self.milli = 'm'
      x += 1
    end
    if sub(pic,x+1,1) = '@'
      self.s = '@'
      self.Separator = '@'
      x += 1
    else
      self.s = ''
      self.Separator = 'T'
    end
  else
    self.s = sub(pic,x,1)
    if self.s = '_' then self.Separator = ' ' else self.Separator = self.s.
    x += 1
    self.clariondate = ''
    self.clariontime = ''
    loop
      case val(lower(sub(pic,x,1)))
      of 109 ! 'm'
        self.milli = 'm'
        x += 1
        cycle
      of 100 ! 'd'
        self.clariondate = 'd'
        x += 1
        cycle
      of 116 ! 't'
        self.clariontime = 't'
        x += 1
        cycle
      end
      break
    end
  end
  if x < size(pic) and pic[x] = '@' and toUpper(val(pic[x+1])) = 68 ! 68='D'
    self.datepart = '@' & self._blockbound(pic,'@',x)
    x -= 1 ! want to start next block from this @
  else
    self.datepart = '@d010'
  end
  if x < size(pic) and pic[x] = '@' and toUpper(val(pic[x+1])) = 84 ! 84='T'
    self.timepart = '@' & self._blockbound(pic,'@',x)
  else
    self.timepart = '@t04'
  end
  return st:Ok

!-----------------------------------------------------------
StringPicture.ParseHexPicture           Procedure(<String pPic>)
pic  String(255),auto
x    Long,auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  if pic[1] <> '@' or ToUpper(val(pic[2])) <> 88 then return st:notOk. ! 88='X'
  self.picType = pic:Hex
  self.upper = pic[2]
  x = 3
  self.n = self._block(pic,'1234567890',x,0)
  self.Separator = ''
  if x <= len(clip(pic))
    self.s = pic[x]
    if self.s <> '_' then self.Separator = self.s.
    x += 1
  else
    self.s = ''
  end
  self.base = 16
  if upper(sub(pic,x,1)) = 'B'
    x += 1
    self.base = self._block(pic,'1234567890',x,0)
  end
  return st:Ok

!-----------------------------------------------------------
StringPicture.InterpretPicture           Procedure(<String pPic>)
pic  String(255),auto
  Code
  if omitted(pPic) or pPic = '' then pic = self.pic else pic = pPic.
  self.pic = clip(pic)
  if pic[1] <> '@' then return self.pic.
  self.ParsePicture()
  case self.PicType
  of pic:Number
    return(self.InterpretNumericPicture())
  of pic:Date
    return(self.InterpretDatePicture())
  of pic:String
    return(self.InterpretStringPicture())
  of pic:TimeHours
    return(self.InterpretTimeHoursPicture())
  of pic:Time
    return(self.InterpretTimePicture())
  of pic:Scientific
    return(self.InterpretScientificPicture())
  of pic:Pattern
    return(self.InterpretPatternPicture())
  of pic:KeyIn
    return(self.InterpretKeyinPicture())
  of pic:UnixTimeStamp
    return(self.InterpretUnixTimeStampPicture())
  of pic:Hex
    return(self.InterpretHexPicture())
  ELSE
    return self.pic
  End

!-----------------------------------------------------------
StringPicture.InterpretDatePicture       Procedure() !(<String pPic>)
sep  cstring(2)
  code
  if self.s = '!'
    sep = ''
  else
    sep = self.Separator
  end
  case self.n
  of 1
    return 'mm' & sep & 'dd'  & sep & 'yy'
  of 2
    return 'mm' & sep & 'dd'  & sep & 'yyyy'
  of 3
    return 'mmm dd,yyyy'
  of 4
    return 'mmmmmmmm dd,yyyy'
  of 5
    return 'dd' & sep & 'mm'  & sep & 'yy'
  of 6
    return 'dd' & sep & 'mm'  & sep & 'yyyy'
  of 7
    return 'dd mmm yy'
  of 8
    return 'dd mmm yyyy'
  of 9
    return 'yy' & sep & 'mm'  & sep & 'dd'
  of 10
    return 'yyyy' & sep & 'mm'  & sep & 'dd'
  of 11
    return 'yymmdd'
  of 12
    return 'yyyymmdd'
  of 13
    return 'mm'  & sep & 'yy'
  of 14
    return 'mm'  & sep & 'yyyy'
  of 15
    return 'yy'  & sep & 'mm'
  of 16
    return 'yy'  & sep & 'mmmm'
  of 91
    return 'yyyy' & sep & 'Www'
  of 92
    return 'Www' & sep & 'yyyy'
  of 93
    return 'yyyy' & sep & 'Www' & sep & 'd'
  ELSE
    return 'Date ' & self.pic
  end

!-----------------------------------------------------------
StringPicture.InterpretTimePicture       Procedure() !(<String pPic>)
  code
  case self.n
  of 1
    return 'hh'  & self.Separator & 'mm'
  of 2
    return 'hhmm'
  of 3
    return 'hh'  & self.Separator & 'mm am'
  of 4
    return 'hh'  & self.Separator & 'mm'  & self.Separator & 'ss'
  of 5
    return 'hhmmss'
  of 6
    return 'hh'  & self.Separator & 'mm'  & self.Separator & 'ss am'
  of 91
    return 'hh'  & self.Separator & 'mm'  & self.Separator & 'ss' & self.Separator & 'cc'
  of 92
    return 'hh'  & self.Separator & 'mm'  & self.Separator & 'ss'  & self.Separator & 'cc am'
  of 93
    return 'hh'  & self.Separator & 'mm'  & self.Separator & 'ss.mmm'
  of 94
    return 'hh'  & self.Separator & 'mm'  & self.Separator & 'ss.mmm am'
  END
  return 'Time ' & self.pic

!-----------------------------------------------------------
StringPicture.InterpretStringPicture     Procedure() !(<String pPic>)
  code
  return 'String from 0 to ' & clip(left(self.length)) & ' characters'

!-----------------------------------------------------------
StringPicture.InterpretScientificPicture Procedure() !(<String pPic>)
  code
  return 'Scientific Number'

!-----------------------------------------------------------
StringPicture.InterpretTimeHoursPicture    Procedure() !(<String pPic>)
  code
  return 'Decimal hours'
!-----------------------------------------------------------
StringPicture.InterpretNumericPicture    Procedure() !(<String pPic>)
  code
  return 'Number'

!-----------------------------------------------------------
StringPicture.InterpretPatternPicture    Procedure() !(<String pPic>)
  code
  return self.pic

!-----------------------------------------------------------
StringPicture.InterpretKeyInPicture      Procedure() !(<String pPic>)
  code
  return self.pic

!-----------------------------------------------------------
StringPicture.InterpretUnixTimeStampPicture      Procedure() !(<String pPic>)
fmt  StringPicture
  code
  return fmt.InterpretPicture(self.datepart) & choose(self.n,' T ','T','') & fmt.InterpretPicture(self.timepart)

!-----------------------------------------------------------
StringPicture.InterpretHexPicture      Procedure() !(<String pPic>)
  code
  return 'Number representation of a string. Base ' & clip(self.base) & ', ' & clip(self.n) & ' chars per line, separated by ' & self.Separator

!-----------------------------------------------------------
StringPicture._block                  Procedure(String pPic, String pAlphabet,*Long pPos,Long pMaxLen)!,String,Virtual
  Code
  return self._block(pPic, pAlphabet, pPos, pMaxLen)

StringPicture._block                  Procedure(*String pPic, String pAlphabet,*Long pPos,Long pMaxLen)!,String,Virtual
sPos   long,auto
lcp    long,auto
maxPos long,auto
  Code
  lcp = len(clip(pPic))
  if pPos > lcp or pPos < 1 or pMaxLen < 0 then return ''.
  if pMaxLen = 0
    maxPos = lcp
  else
    maxPos = pMaxLen + pPos - 1
    if maxPos > lcp
      maxPos = lcp
    end
  end
  sPos = pPos
  loop
    if MemChr(Address(pAlphabet), val(pPic[pPos]), size(pAlphabet)) = 0
      break ! the character at pPos is not in the passed alphabet
    end
    pPos += 1
    if pPos > maxPos then break.
  end
  if pPos <= sPos
    return ''
  else
    return pPic[sPos : pPos-1]
  end
!-----------------------------------------------------------
StringPicture._blockbound            Procedure(String pPic, String pBoundary,*Long pPos)!,String,Virtual
  Code
  return self._blockbound(pPic, pBoundary, pPos)

StringPicture._blockbound            Procedure(*String pPic, String pBoundary,*Long pPos)!,String,Virtual
lcp   long,auto
sPos  long,auto
  Code
  lcp = len(clip(pPic))
  if pPos > lcp or pPos < 1 or pPic[pPos] <> pBoundary then return ''.
  sPos = pPos + 1
  LOOP
    pPos += 1
    if pPos > lcp then break.
    if pPic[pPos] = pBoundary
      pPos += 1   ! move to char _after_ boundary
      if pPos <= sPos + 1
        return '' ! nothing before boundary
      else
        return pPic[sPos : pPos-2]
      end
    end
  END
  return ''       ! no closing boundary

!----------------------------------------------------------
StringPicture.Trace Procedure(string pMsg)
szMsg         cString(size(pMsg)+6)
  code
  szMsg = '[st] ' & Clip(pMsg)
  stOutPutDebugString(szMsg)
!----------------------------------------------------------
!------------------------------------------------------------------------------
StringFormat.FormatValue   PROCEDURE (String pValue,<String pPicture>,Long pFlag=0)
spic       StringPicture
ans        StringTheory
  code
  if omitted(pPicture) or pPicture = ''
    return clip(pValue)
  end
  spic.ParsePicture(pPicture)
  case spic.pictype
  !--------------
  of pic:Date
    ans.SetValue(self.FormatDate(pValue,pPicture,pFlag))
  !--------------
  of pic:Time
    if spic.u
      ans.SetValue(self.FormatTime(self.UnixToClarionTime(pValue),spic,pFlag))
    else
      ans.SetValue(self.FormatTime(pValue,spic,pFlag))
    end
  !--------------
  of pic:TimeHours
    ans.SetValue(self.FormatTimeHours(pValue,pPicture,pFlag))
  !--------------
  of pic:Number
    ans.SetValue(self.FormatNumber(pValue,pPicture,pFlag))
  !--------------
  of pic:UnixTimeStamp
    ans.SetValue(self.FormatUnixTimeStamp(pValue,spic,pFlag))
  !--------------
  of pic:hex
    ans.SetValue(self.FormatHex(pValue,spic,pFlag))
  !--------------
  of pic:String
    if spic.Length < 0
      ans.SetValue(pValue)
    elsif spic.Length = 0
      ! return nothing.
    elsif spic.Length < size(pValue) and band(pFlag,st:ExpandIfNeeded) = 0
      ans.SetValue(pValue[1: spic.Length])
    else
      ans.SetValue(pValue)
    end
  !--------------
  of pic:Pattern
  orof pic:KeyIn
    ans.SetValue(self.FormatPattern(pValue,spic,pFlag))
  !--------------
  else
    ans.SetValue(clip(left(Format(pValue,pPicture))))
    If band(pFlag,st:ExpandIfNeeded)
      if ans.ContainsADigit() = false  ! probably just ###.##, but @p and @k might introduce other chars.
        ans.SetValue(pValue)           ! just send it back unformatted.
      end
    End
  end
  if ans._DataEnd = 0
    return ''
  else
    return ans.Value[1 : ans._DataEnd]
  end

!-----------------------------------------------------------
StringFormat.FormatPattern         Procedure (String pValue,StringPicture pPic,Long pFlag=0)
str   stringtheory
  code
  str.SetValue(clip(pPic.pic))
  if str._DataEnd > 0
    str.replace('>','<<<<')
    return Format(pValue,str.valuePtr[1 : str._DataEnd])
  else
    return clip(pValue)
  end

!-----------------------------------------------------------
StringFormat.FormatHex             Procedure (String pValue,StringPicture pPic,Long pFlag=0)
x    long,auto
c    byte,auto
n    long
l    long
ans  StringTheory
num  StringTheory
  code

  ! work out the optimal length for each number, based on the base.
  case pPic.base
  of 2
    l = 8
  of 3
    l = 6
  of 4 to 6
    l = 4
  of 7 to 15
    l = 3
  of 16
    l = 2
  end

  loop x = 1 to size(pValue)
    c = val(pValue[x])
    num.SetValue(ans.DecToBase(c,pPic.Base,choose(pPic.upper = 'x',true,false)))
    ans.Append(num.right(l,st:spaces,'0')) ! left pad with zeros to the correct length
    n += 1
    if pPic.n and n = pPic.n
      ans.Append('<13,10>')
      n = 0
    elsif x = size(pValue)
    else
      case pPic.s
      of ''
        ! do nothing
      of '_'
        ans.Append(' ')
      else
        ans.cat(pPic.Separator)
      end
    end
  end
  if ans._DataEnd = 0
    return ''
  else
    return ans.Value[1 : ans._DataEnd]
  end

!-----------------------------------------------------------
StringFormat.FormatUnixTimeStamp   Procedure(Real pValue,StringPicture pPic,Long pFlag=0)
  code
  if pPic.clariondate
    return (self.FormatDate(pValue,pPic.DatePart) & |
          choose(pPic.n, ' ' & pPic.Separator & ' ',pPic.Separator,'')  & |
          self.FormatTime(0,pPic.Timepart & 'M',pFlag))
  elsif pPic.clariontime
    return (self.FormatDate(0,pPic.DatePart) & |
          choose(pPic.n, ' ' & pPic.Separator & ' ',pPic.Separator,'')  & |
          self.FormatTime(pValue,pPic.Timepart,pFlag))
  elsif pPic.milli <> ''
    return (self.FormatDate(self.UnixToClarionDate(pValue,true),pPic.DatePart) & |
          choose(pPic.n, ' ' & pPic.Separator & ' ',pPic.Separator,'')  & |
          self.FormatTime(pValue % 86400000,pPic.Timepart & 'M',pFlag))
  else
    return (self.FormatDate(self.UnixToClarionDate(pValue),pPic.DatePart) & |
          choose(pPic.n, ' ' & pPic.Separator & ' ',pPic.Separator,'')  & |
          self.FormatTime(self.UnixToClarionTime(pValue),pPic.Timepart,pFlag))
  end

!-----------------------------------------------------------
StringFormat.FormatTimeHours PROCEDURE (Real pValue,String pPicture,Long pFlag=0)
ONEHOUR        Equate(360000)
  code
  if upper(sub(pPicture,2,1)) = pic:TimeHours
    pPicture[2] = pic:Number
  end
  return self.FormatNumber(pValue/ONEHOUR,pPicture,pFlag)

!-----------------------------------------------------------
StringFormat.FormatNumber PROCEDURE (Real pValue,String pPicture,Long pFlag=0)
ans  StringTheory
  code
  if pPicture = '' then return pValue.
  ans.SetValue(clip(left(Format(pValue,pPicture))))
  If band(pFlag,st:ExpandIfNeeded)
    if ans.ContainsADigit() = false  ! probably just ###.##, but @p and @k might introduce other chars.
      ans.SetValue(pValue)           ! just send it back unformatted.
    end
  End
  if ans._DataEnd = 0
    return ''
  else
    return ans.Value[1 : ans._DataEnd]
  end

!-----------------------------------------------------------
StringFormat.FormatDate PROCEDURE (Real pValue,String pPicture,Long pFlag=0)
spic   StringPicture
  code
  spic.ParsePicture(pPicture)
  return self.FormatDate(pValue,spic,pFlag)

!-----------------------------------------------------------
! @D91 - yyyy/ww
! @D92 - ww/yyyy
! @D93 - yyyy/ww/d
StringFormat.FormatDate PROCEDURE (Real pValue,StringPicture pPic,Long pFlag=0)
loc:pic  string(20)
str      stringTheory
y        long
w        long
d        long
  code
  loc:pic = pPic.CreateDatePicture() ! create clarion compatible format
  if pValue = 0
    pPic.u = ''
    if pPic.Local
      pValue = today()
    elsif pPic.utc
      pValue = self.utcDate()
    end
  elsif pPic.milli
    pValue /= 1000
  end
  if pPic.u
    pValue = self.UnixToClarionDate(pValue)
  end
  case pPic.n
  of 91
    self.Week(pValue,y,w,d)
    str.SetValue(y & pPic.Separator & 'W' & format(w,@n02))
  of 92
    self.Week(pValue,y,w,d)
    str.SetValue('W' & format(w,@n02) & pPic.Separator & y)
  of 93
    self.Week(pValue,y,w,d)
    str.SetValue(y & pPic.Separator & 'W' & format(w,@n02) & pPic.Separator & d)
  else
    if pValue = 0 and (pPic.n = 3 or pPic.n = 7 or pPic.n = 8 or pPic.n = 18 or pPic.b)
      str.free()
    else
      str.SetValue(format(pValue,loc:pic))
      if pValue = 0 and pPic.fill then str.replaceByte(32,48). ! clarion returns / / for zero date, even if pic is @d0n replace spaces with '0'
      str.clip()
    end
  end
  if pPic.s = '!'                                              ! separator
    str.removeByte(47)                                         ! remove all '/'
  end
  if str._dataEnd < 1
    return ''
  else
    return str.value[1:str._dataEnd]
  end

!-----------------------------------------------------------
! return the week number as per  https://en.wikipedia.org/wiki/ISO_8601#Week_dates
! note that the week number can be week 1 in the following year, or week 52/53 in the previous year.
! Takes in a clarion date (pValue) and returns the year, week and day.
StringFormat.Week PROCEDURE (Long pValue, *Long pYear, *Long pWeek, *Long pDay)
FirstDayOfWeek1  long,auto
LastDayOfYear    long,auto
  code
  pYear = year(pValue)

  FirstDayOfWeek1 = date(12,29,pYear-1) ! the week starting with the Monday in the period 29 December � 4 January.
  loop until FirstDayOfWeek1 % 7 = 1    ! find first monday
   FirstDayOfWeek1 += 1
  end

  LastDayOfYear = date(12,28,pYear)     ! 28 December is always in the last week of its year.
  loop until LastDayOfYear % 7 = 0
    LastDayOfYear += 1                  ! last sunday in this year.
  end

  if pValue < FirstDayOfWeek1
    pYear -= 1
    FirstDayOfWeek1 = date(12,29,pYear-1)
    loop until FirstDayOfWeek1 % 7 = 1  ! find first monday
      FirstDayOfWeek1 += 1
    end
    pWeek = ((pValue - FirstDayOfWeek1 ) / 7) + 1
  elsif pValue > LastDayOfYear
    pWeek = 1
    pYear += 1
  else
    pWeek = ((pValue - FirstDayOfWeek1 ) / 7) + 1
  end
  pDay = (pValue % 7)
  if pDay = 0 then pDay = 7.

!-----------------------------------------------------------
! Formats supported.
!  [@][T][n][s][B][Z]
! @, T : optional.
! n : up to 3 digit number. If n is omitted defaults to 1.
!     Leading 0 indicates zero-filled hours (hh). Two leading zeros (hhh), Three leading zeros (hhhh).
!
!@T1       hh:mm        17:30
!@T2       hhmm         1730
!@T3       hh:mm XM     5:30 PM
!@T03      hh:mm XM     05:30 PM
!@T4       hh:mm:ss     17:30:00
!@T5       hhmmss       173000
!@T6       hh:mm:ss XM   5:30:00PM
!@T7                    Windows Control Panel setting for Short Time (*)
!@T8                    Windows Control Panel setting for Long Time  (*)
!@T91      hh:mm:ss:cc      17:30:00:19
!@T92      hh:mm:ss:cc XM   5:30:00:19 pm
!@T93      hh:mm:ss.mmm     17:30:00.123
!@T94      hh:mm:ss.mmm XM  5:30:00.123 pm

! s : separator. Can be _ ' . -
! B : set to blank if time is < 0. (also blank if time is 0 and Z not used).
! Z : time is formatted as "base 0"- in other words 0 = 0:00 and 360000 = 1:00
!
! (*) these formats do not support times > 23:59
!-----------------------------------------------------------
StringFormat.FormatTime PROCEDURE (Real pValue,String pPicture,Long pFlag=0)
spic   StringPicture
  code
  spic.ParsePicture(pPicture)
  return self.FormatTime(pValue,spic)

StringFormat.FormatTime PROCEDURE (Real pValue,StringPicture pPic,Long pFlag=0)
ONEHOUR        Equate(360000)
ONEMINUTE      Equate(6000)
ONESECOND      Equate(100)
result         StringTheory
h              long
m              long
s              long
cs             long
ms             long
base           long,auto
pic            string(20)
  code
  if pValue = 0
    pPic.u = ''
    pPic.milli = ''
    if pPic.Local
      pValue = clock()
    elsif pPic.utc
      pValue = self.utcTime()
    end
  end
  if pValue = 0 or pPic.z
    base = 0
  else
    base = 1
  end
  if pPic.milli
    ms = (abs(pValue)-base) % 1000
    pValue /= 10
  end

  h = (pValue-base) / ONEHOUR
  m = ((abs(pValue)-base) % ONEHOUR) / ONEMINUTE
  s = ((abs(pValue)-base) % ONEMINUTE) / ONESECOND
  cs = (abs(pValue)-base) % ONESECOND
  If pPic.milli = ''
    ms = cs * 10
  End

  If pPic.b and h = 0 and m = 0 and s = 0 and cs = 0 and ms = 0
    Return ''
  End
  pic = pPic.NumberPart
  case pPic.n
  of 1  ! hh:mm
    result.SetValue(self.FormatNumber(h,pic,pFlag) & pPic.Separator & format(m,'@n02'))
  of 2  ! hhmm
    result.SetValue(self.FormatNumber(h,pic,pFlag) & format(m,'@n02'))
  of 3  ! hh:mmXM
    result.SetValue(format(choose(h=12,12,h%12),pic) & pPic.Separator & format(m,'@n02') & choose(h <12,' am',' pm'))
  of 4  ! hh:mm:ss
    result.SetValue(self.FormatNumber(h,pic,pFlag) & pPic.Separator & format(m,'@n02') & pPic.Separator & format(s,'@n02'))
  of 5  ! hhmmss
    result.SetValue(self.FormatNumber(h,pic,pFlag) & format(m,'@n02') & format(s,'@n02'))
  of 6  ! hh:mm:ssXM
    result.SetValue(format(choose(h=12,12,h%12),pic) & pPic.Separator & format(m,'@n02') & pPic.Separator & format(s,'@n02') & choose(h <12,' am',' pm'))
  of 7  ! windows short
    result.SetValue(choose(base=1,format(pValue,'@t7'& clip(pPic.s) & pPic.b),format(pValue+1,'@t7'&clip(pPic.s) & pPic.b)))
  of 8  ! windows long
    result.SetValue(choose(base=1,format(pValue,'@t8' & clip(pPic.s) & pPic.b),format(pValue+1,'@t8' & clip(pPic.s) & pPic.b)))
  of 91 ! hh:mm:ss:cc
    result.SetValue(self.FormatNumber(h,pic,pFlag) & pPic.Separator & format(m,'@n02') & pPic.Separator & format(s,'@n02') & pPic.Separator &  format(cs,'@n02'))
  of 92 ! hh:mm:ss:ccXM
    result.SetValue(format(choose(h=12,12,h%12),pic) & pPic.Separator & format(m,'@n02') & pPic.Separator & format(s,'@n02') & pPic.Separator &  format(cs,'@n02') & choose(h <12,' am',' pm'))
  of 93 ! hh:mm:ss.mmm
    result.SetValue(self.FormatNumber(h,pic,pFlag) & pPic.Separator & format(m,'@n02') & pPic.Separator & format(s,'@n02') & '.' &  format(ms,'@n03'))
  of 94 ! hh:mm:ss.mmmXM
    result.SetValue(format(choose(h=12,12,h%12),pic) & pPic.Separator & format(m,'@n02') & pPic.Separator & format(s,'@n02') & '.' &  format(ms,'@n03') & choose(h <12,' am',' pm'))
  end
  if MemChr(Address(result.value), 35, result._DataEnd)             ! 35='#' !if result.containsChar('#')
    result.replaceSingleChars('0123456789','##########')
  end
  if result._DataEnd > 0 and (result.value[1] = ' ' or result.value[result._DataEnd] = ' ')
    result.setValue(clip(left(result.value[1 : result._DataEnd])))  ! trim it
  end
  if result._DataEnd < 1
    return ''
  else
    return result.Value[1 : result._DataEnd]
  end

!----------------------------------------------------------
UnixDate.Trace Procedure(string pMsg)
szMsg         cString(size(pMsg)+6)
  code
  szMsg = '[st] ' & Clip(pMsg)
  stOutPutDebugString(szMsg)

!------------------------------------------------------------------------------
! Extracts Clarion Date from a Unix date/time (which is stored as Seconds since Jan 1 1970)
UnixDate.UnixToClarionDate               Procedure(Real pDateTime,Long pMilli=-1)
  code
  if ((pDatetime) < 2147483647 or pMilli = 0) and pMilli <> 1 ! then in seconds
    if pDateTime >= 86400
      return (int(pDateTime / 86400) + 61730)                 ! 61730 = Date(1,1,1970)
    else              ! 86400 = seconds in 1 day
      return 61730    !date(1,1,1970)
    end
  else                ! in thousandths of a second
    return (int(pDateTime / 86400000) + 61730)                   ! 61730 = Date(1,1,1970)
  end

!------------------------------------------------------------------------------
! Extracts Clarion Time from a Unix date/time (which is stored as Seconds since Jan 1 1970)
UnixDate.UnixToClarionTime               Procedure(Real pDateTime,Long pMilli=-1)
r  real
  code
  if pDateTime < 0
    return 0
  elsif ((pDatetime) < 2147483647 or pMilli = 0) and pMilli <> 1 ! then in seconds
    return(1+(pDateTime % 86400) * 100)                          ! 86400 = seconds in 1 day
  else
    r = (pDateTime % 86400000)
    return(1 + r / 10)                                           ! 86400 = seconds in 1 day
  end
!------------------------------------------------------------------------------
! Converts a Clarion Date & Time to a Unix date/time (which is stored as Seconds since Jan 1 1970)
UnixDate.ClarionToUnixDate          Procedure(Long pDate, Long pTime,Long pMilli=false)
r   real
  code
  if pMilli = true
    if pDate > 61730                                             ! 61730 = date(1,1,1970)
      r = (pDate-61730)                                          ! do it in 3 steps to force to be a real
      r *= 86400000
      r+= (pTime*10)                                             ! 86400 = seconds in 1 day
    else
      r = pTime * 10
    end
  else
    if pDate > 61730                                             ! 61730 = date(1,1,1970)
      r = ((pDate-61730)*86400) + (pTime / 100)                  ! 86400 = seconds in 1 day
    else
      r = pTime / 100
    end
  end
  return int(r)

!------------------------------------------------------------------------------
! returns current date relative to utc in clarion date format
UnixDate.UtcDate                    Procedure()!,Long
tim                 Group(ST_SYSTEMTIME).
  code
  stGetSystemTime(tim)   ! returned time is for UTC not local time
  return date(tim.wMonth,tim.wDay,tim.wYear)

!------------------------------------------------------------------------------
! returns current time relative to utc in clarion time format (centiseconds, not milliseconds)
UnixDate.UtcTime                    Procedure()!,Long
tim                 Group(ST_SYSTEMTIME).
csPerHour           equate     (60 * 60 * 100)
csPerMinute         equate          (60 * 100)
csPerSecond         equate               (100)

  code
  stGetSystemTime(tim)                         ! returned time is for UTC not local time
  return (tim.wHour * csPerHour) + (tim.wMinute * csPerMinute) + (tim.wSecond * csPerSecond) + 1

!------------------------------------------------------------------------------
! returns current utc time as real
UnixDate.UtcNow                    Procedure()!,Real
tim                 Group(ST_SYSTEMTIME).
msPerDay            real(24 * 60 * 60 * 1000)    ! don't make this an equate, needs to force the calc below to be real.
pBaseDate           Equate            (61730)    ! 1 jan 1970
msPerHour           equate   (60 * 60 * 1000)
msPerMinute         equate        (60 * 1000)
msPerSecond         equate             (1000)
today               long
ans                 Real
  code
  stGetSystemTime(tim)   ! returned time is for UTC not local time
  today = date(tim.wMonth,tim.wDay,tim.wYear)
  ans = (( today - pBaseDate ) * msPerDay ) + (tim.wHour * msPerHour) + (tim.wMinute * msPerMinute) + (tim.wSecond * msPerSecond) + tim.wMilliseconds
  return ans

!------------------------------------------------------------------------------
StringDeformat.DeformatValue PROCEDURE (String pValue,<String pPicture>)
ClipLen LONG,auto
result  long,auto
sresult string(20),auto
  code
  if omitted(pPicture) then return pValue.

  clipLen = len(clip(pPicture))
  if ClipLen < 2 or pPicture[1] <> '@' then return pValue.

  case toLower(val(pPicture[2]))
  of 108      ! 'l' ! color
    if clipLen > 2
      case val(pPicture[3])
      of   49 ! '1' ! stored as Clarion Long  (includes translating system colors)
        do ColorToLong
        return result
      of 50   ! '2' ! stored as Web #rrggbb string
        do ColorToHex
        return sresult
      else
        return pValue
      end
    else
      return pValue
    end
  of 116      ! 't' ! time
    return self.DeformatTime(pValue,pPicture)
  of 104      ! 'h' ! decimal hours
    return self.DeformatTimeHours(pValue,pPicture)
  of 112      ! 'p'
  orof 107    ! 'k'
    return self.DeformatPattern(pValue,pPicture)
  of 100      ! 'd'
    return self.DeformatDate(pValue,pPicture)
  of 101      ! 'e'
    return self.DeformatScientific(pValue,pPicture)
  of 110      ! 'n'
    return self.DeformatNumber(pValue,pPicture)
  of 115      ! 's'
    return pValue
  of 117      ! 'u'
    return self.DeformatUnixTimeStamp(pValue,pPicture)
  of 120      ! 'x'
    return self.DeformatHex(pValue,pPicture)
  else
    return pValue
  end

! move this into a routine to delay instantiation of this object to the limited case
ColorToLong  routine
  data
str     StringTheory
  code
  result = str.ColorToLong(pValue)

ColorToHex  routine
  data
str     StringTheory
  code
  sresult = str.ColorToHex(pValue,true)

!------------------------------------------------------------------------------
StringDeformat.DeformatHex PROCEDURE (String pValue,<String pPicture>)
ans   StringTheory
spic  StringPicture
l     long
  code
  spic.ParsePicture(pPicture)
  ans.SetValue(clip(pValue))
  ans.removeChars('<13,10>' & spic.Separator)
  case sPic.base
  of 2
    l = 8
  of 3
    l = 6
  of 4 to 6
    l = 4
  of 7 to 15
    l = 3
  of 16
    l = 2
  end
  ans.SplitEvery(l)
  ans.free()
  loop l = 1 to ans.records()
    ans.cat(chr(ans.BaseToDec(ans.GetLine(l),spic.base)))
  end
  if ans._DataEnd = 0
    return ''
  else
    return ans.Value[1 : ans._DataEnd]
  end

!------------------------------------------------------------------------------
StringDeformat.DeformatScientific PROCEDURE (String pValue,<String pPicture>)
  code
  return deformat(pValue,pPicture)

!------------------------------------------------------------------------------
StringDeformat.DeformatPattern PROCEDURE (String pValue,<String pPicture>)
str  StringTheory
n    long,auto
  code
  if omitted(pPicture) or pPicture = ''
    n = 99
  else
    str.SetValue(pPicture)
    n = str.count('#') + str.count('<') + str.count('>')
  end
  str.SetValue(pValue)
  str.keepChars('1234567890')
  if str._DataEnd < n then n = str._DataEnd.
  if n < 1 then return ''.
  return str.valueptr[1 : n]

!------------------------------------------------------------------------------
StringDeformat.DeformatUnixTimeStamp PROCEDURE (String pValue,<String pPicture>)
str     StringTheory
spic    StringPicture
cDate   long,auto
ReturnValue  real
  code
  spic.ParsePicture(pPicture)
  str.SetValue(clip(pValue))
  ! split into date part and time part
  ! deformat date part
  cDate = self.DeformatDate(str.before(spic.Separator),spic.datepart)
  if spic.milli
    ReturnValue = self.ClarionToUnixDate(cDate,0,true)
  else
    ReturnValue = self.ClarionToUnixDate(cDate,0,false)
  end
  ! deformat time part
  if spic.timepart = '' then spic.timepart = '@t1zu'& spic.milli.     ! want unix, and possibly milli result.
  if instring('z',lower(spic.timepart),1,1) = 0
    spic.timepart = clip(spic.timepart) & 'z'
  end
  if instring('u',lower(spic.timepart),1,1) = 0
    spic.timepart = clip(spic.timepart) & 'u'
  end
  if spic.milli and instring('m',lower(spic.timepart),1,1) = 0
    spic.timepart = clip(spic.timepart) & 'm'
  end
  ReturnValue += self.DeformatTime(str.after(spic.Separator),spic.timepart)
  return ReturnValue
!------------------------------------------------------------------------------
StringDeformat.DeformatNumber PROCEDURE (String pValue,<String pPicture>)
use:dot  equate(1)
str      StringTheory
spic     StringPicture
comma    LONG,auto
dot      LONG,auto
x        Long
use      LONG
  CODE
  str.SetValue(pValue,st:clip)
  comma = str.Count(',')
  dot = str.Count('.')
  if comma > 1
    str.removeByte(44)                        ! remove all ','
    comma = 0
    use = use:dot                             ! definitely use dot.
  end
  if dot > 1
    str.removeByte(46)                        ! remove all '.'
    if comma                                  ! can only be 0 or 1 by here
      str.replaceByte(44,46)                  ! replace commas with dots
      dot = comma
      comma = 0
    end
    use = use:dot                             ! definitely use dot
  end
  ! at this point have 1 dot and/or 1 comma
  if comma and dot                            ! one of each, so find the right-most one
    loop x = str._DataEnd to 1 by -1
      if str.value[x] = '.'
        str.removeByte(44)                    ! remove all ','
        comma = 0
        use = use:dot                         ! definitely use dot
        break
      elsif str.value[x] = ','
        str.removeByte(46)                    ! remove all '.'
        str.replaceByte(44,46)                ! replace commas with dots
        comma = 0
        use = use:dot                         ! definitely use dot
        break
      end
    end
  END
  spic.ParsePicture(pPicture)
  ! at this point have either 1 dot or 1 comma or nothing
  if comma
    if use = use:dot
      str.removeByte(44)                      ! remove all ','
      comma = 0
    elsif spic.Places and spic.Places <> '0'  ! expecting a decimal part, so assume it's the decimal point
      str.replaceByte(44,46)                  ! replace commas with dots
      comma = 0
      dot = 1
      use = use:dot
    else                                      ! not expecting a decimal part, so assume its a separator and remove
      str.removeByte(44)                      ! remove all ','
      comma = 0
      use = use:dot
    end
  end

  ! at this point have 1 dot or nothing.
  if str.left(1) = '('
    str.replaceByte(40,45)                    ! replace '(' with '-'
  end
  str.KeepChars('01234567890.-')

  if str._DataEnd = 0
    return ''
  else
    return str.value[1 : str._DataEnd]
  end

!------------------------------------------------------------------------------
StringDeformat.DeformatTimeHours PROCEDURE (String pValue,<String pPicture>)
ONEHOUR        Equate(360000)
  code
  return self.DeformatNumber(pValue,pPicture) * ONEHOUR

!------------------------------------------------------------------------------
! picture hints: Z for base 0,
!                U for return Unix-Seconds time value
!                M for return Unix-Milliseconds time value
!                NumberPart for format of hours part
!                Separator if not automatically spotted.
StringDeformat.DeformatTime PROCEDURE (String pValue,<String pPicture>)
spic           StringPicture
ONEHOUR        Equate(360000)
HOURS12        Equate(ONEHOUR*12)
HOURS24        Equate(ONEHOUR*24)
ONEMINUTE      Equate(6000)
ONESECOND      Equate(100)
str            StringTheory
ReturnValue    Real
am             long,auto
pm             long,auto
base           long
neg            long(1)
  code
  str.SetValue(pValue)
  if not omitted(pPicture)
    spic.ParseTimePicture(pPicture)
  end
  str.setAfter('T',,,st:NoCase) ! removes the date part of an incoming that looks like 2009-01-31T00:00:00 or 2009-01-31 T 00:00:00

  am = str.remove('am',,st:nocase)
  pm = str.remove('pm',,st:nocase)
  str.trim()
  if str._DataEnd
    if str.value[1] = '-'
      neg = -1
      str.removeFromPosition(1,1)
    elsif str.value[1] = '+'
      str.removeFromPosition(1,1)
    end
  end

  if spic.z or spic.u or spic.milli then base = 0  else base = 1.

  str.trim()                                 !Removes whitespace from the start and the end of the string
  if str._DataEnd > 2
    case val(str.value[str._dataEnd - 2])    !val(sub(str.right(3),1,1))
    of 46                                    ! '.'
    orof 45                                  ! '-'
    orof 32                                  ! space
    orof 44                                  ! ','
    orof 58                                  ! ':'
      str.split(str.value[str._dataEnd - 2]) !sub(str.right(3),1,1))
    else
      str.split(spic.Separator)
    end
  else
    str.split(spic.Separator)
  end
  ! remove any number formatting from the "hours" part
  str.SetLine(1,self.DeformatNumber(str.GetLine(1),spic.NumberPart))

  if str.GetLine(2) <> '' or str.GetLine(3) <> '' or str.GetLine(4) <> ''
    ReturnValue = (str.GetLine(1) * ONEHOUR) + (str.GetLine(2) * ONEMINUTE) + (str.GetLine(3) * ONESECOND) + str.GetLine(4) + base
  else
    case len(clip(str.GetLine(1)))
    of 1                            !h
    orof 2                          !hh
      returnvalue = str.Lines.line      * ONEHOUR + base
    of 3                            ! hmm
      returnvalue = str.Lines.line[1]   * ONEHOUR + str.Lines.line[2:3] * ONEMINUTE + base
    of 4                            !hhmm
      returnvalue = str.Lines.line[1:2] * ONEHOUR + str.Lines.line[3:4] * ONEMINUTE + base
    of 5                            ! hmmss
      returnvalue = str.Lines.line[1]   * ONEHOUR + str.Lines.line[2:3] * ONEMINUTE + str.Lines.line[4:5] * ONESECOND + base
    of 6                            ! hhmmss
      returnvalue = str.Lines.line[1:2] * ONEHOUR + str.Lines.line[3:4] * ONEMINUTE + str.Lines.line[5:6] * ONESECOND + base
    of 7                            ! hmmsscc
      returnvalue = str.Lines.line[1]   * ONEHOUR + str.Lines.line[2:3] * ONEMINUTE + str.Lines.line[4:5] * ONESECOND + str.Lines.line[6:7] + base
    of 8                            ! hhmmsscc
      returnvalue = str.Lines.line[1:2] * ONEHOUR + str.Lines.line[3:4] * ONEMINUTE + str.Lines.line[5:6] * ONESECOND + str.Lines.line[7:8] + base
    of 9                            ! hhmmssccc
      returnvalue = str.Lines.line[1:2] * ONEHOUR + str.Lines.line[3:4] * ONEMINUTE + str.Lines.line[5:6] * ONESECOND + str.Lines.line[7:8] + (str.Lines.line[9] / 10) + base
    end
  end
  returnvalue *= neg
  if returnValue > 0 and ReturnValue <= HOURS24
    if pm and returnvalue < HOURS12 ! still am
      returnvalue += HOURS12        ! + 12 hours
    elsif am and returnvalue >= HOURS12
      returnvalue -= HOURS12        ! - 12 hours
    end
  end
  if spic.milli                     ! value returned should be in milliseconds unix epoch time, not clarion time.
    returnvalue = int(returnValue * 10)
  elsif spic.u                      ! value returned should be in unix epoch time, not clarion time.
    returnvalue = int(returnValue / 100)
  end
  If ReturnValue = 1 and not spic.z and spic.b then ReturnValue = 0.
  Return ReturnValue

!------------------------------------------------------------------------------
! the week starting with the Monday in the period 29 December � 4 January is the first week in the year
StringDeformat.DateFromWeek  Procedure(String pWeek, Long pYear, Long pDay)
x long
  code
  if pWeek = '' then return 0.
  x = date(12,29,pYear-1)
  loop until x % 7 = 1 ! first day, of first week.
    x += 1
  end
  if upper(pWeek[1]) = 'W'
    pWeek = pWeek[2:3]
  end
  if pWeek > 53 then pWeek = 53.
  x = x + ((pWeek-1) * 7) + (pDay-1)
  return x

!------------------------------------------------------------------------------
! works hard to figure out what the date is from the input.
! simple numbers > 2100 are assumed to be deformatted already, and returned as-is;
!  unless  @D11 or @d12
StringDeformat.DeformatDate PROCEDURE (String pValue,<String pPicture>)
ReturnValue  real
spic         StringPicture
part         string(20),dim(3)
numberofparts long
monthnumber  long
monthpart    long
weekpart     long
daynumber    long
daypart      long
yearnumber   long
yearpart     long
sep          string(1)
  Code
  if pValue = '' then return 0.
  spic.ParsePicture(pPicture)

! remove the time part of an incoming that looks like: 2009-01-31T00:00:00 or 2009-01-31 T 00:00:00
  if (size(pValue) > 13 and pValue[14] = ':' and toUpper(val(pValue[11])) = 84) or | 84='T'
     (size(pValue) > 15 and pValue[16] = ':' and pValue[11] = ' ' and pValue[13] = ' '  and toUpper(val(pValue[12])) = 84) ! 84='T'
    pValue[11 : size(pValue)] = ''
  end

  do MakeParts
  !self.trace('Dformatdate: ' & pValue & ' NumberOfParts=' & NumberOfParts & ' [' & part[1] & '][' & part[2] & '][' & part[3] &']')
  ReturnValue = self.DeformatDateText(NumberOfParts,part[1],part[2],part[3],sep)
  If ReturnValue = 0
    if part[1] = 0 and part[2] = 0 and part[3] = 0           ! needs to be after Textparts
      Return 0
    End
    do MakeYearNumber                                        ! if set, then has to be right. if not set then 2 digit year < 32 is there, or the year is not there at all
    do MakeMonthNumber                                       ! set only if name used. if not set month could be
    do MakeWeekNumber                                        ! identified by a Wnn as one of the first 2 parts
  End
  If ReturnValue = 0 and numberofparts = 1                   ! 1 part
    if weekpart
      returnvalue = self.DateFromWeek(part[1],year(today()),1)
    elsif monthpart
      returnvalue = date(monthnumber,1,year(today()))
    elsif yearpart
      returnvalue = date(1,1,yearnumber)
    elsif part[1] < 32                                       ! treat this as days in current month
      ReturnValue = date(month(today()),part[1],year(today()))
    elsif pValue = 366                                       ! always refers to the last day of this year
      ReturnValue = date(12,31,year(today()))
    elsif part[1] < 367                                      ! treat this as days in current year
      ReturnValue = date(1,1,year(today())) + pValue - 1
    elsif part[1] < 99999
      ReturnValue = part[1]
    else
      ! want to make this smarter to spot dmmyyyy etc such as 31122020
      ! although if pic contains ! then it's doing this already.
      case spic.n
      of 11
        ReturnValue = date(sub(part[1],3,2),sub(part[1],5,2),2000+sub(part[1],1,2))
      of 12
        ReturnValue = date(sub(part[1],5,2),sub(part[1],7,2),sub(part[1],1,4))
      else
        ! but for now just treat as clarion date
        ReturnValue = part[1]
      end
    end
  end
  if returnValue = 0 and numberofparts = 2
    if weekpart
      if yearpart
        returnvalue = self.DateFromWeek(part[weekpart],part[yearpart],1)
      elsif weekpart = 1
        returnvalue = self.DateFromWeek(part[1],year(today()),part[2])
      elsif weekpart = 2
        returnvalue = self.DateFromWeek(part[2],part[1],1)
      end
    elsif yearpart and monthpart = 0 ! know year for sure, month is the other part
      monthpart = choose(yearpart=1,2,1)
      monthnumber = part[monthpart]
    end
  end
  if returnvalue = 0 and numberofparts = 2
    if yearpart and monthpart
      returnvalue = date(monthnumber,1,yearnumber)
    else
      ! know month for sure, day is the other part
      if monthpart and yearpart = 0
        daypart = choose(monthpart=1,2,1)
        daynumber = part[daypart]
        returnvalue = date(monthnumber,daynumber,year(today()))
      else
        ! two unknown parts, check if one is > 12 (not >31 else the year would have claimed this part)
        do MakeDayNumber
        ! if know day then other part is the month part
        if daypart
          monthpart = choose(daypart=1,2,1)
          monthnumber = part[monthpart]
          returnvalue = date(monthnumber,daynumber,year(today()))
        else
          ! two unknown parts, both < 13. Use pic to give a hint as to which is which
          case spic.n
          of 0 orof 1 orof 2 orof 3 orof 4 ! mm/dd
            daypart = 2
            monthpart = 1
            daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
            monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
            returnvalue = date(monthnumber,daynumber,year(today()))
          of 5 orof 6 orof 7 orof 8        ! dd/mm
            daypart = 1
            monthpart = 2
            daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
            monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
            returnvalue = date(monthnumber,daynumber,year(today()))
          else                             ! yy/mm
            yearpart = 1
            monthpart = 2
            monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
            yearnumber = choose(part[yearpart] >= 1,part[yearpart],year(today()))
            returnvalue = date(monthnumber,1,yearnumber)
          end
        end
      end
    end
  end
  if returnvalue = 0 and numberofparts = 3
    ! know year part and monthpart, then day is the other part
    if weekpart
      if yearpart
        if yearpart <> 3 and weekpart <> 3 then daypart = 3
        elsif yearpart <> 2 and weekpart <> 2 then daypart = 2
        elsif yearpart <> 1 and weekpart <> 1 then daypart = 1
        end
        returnvalue = self.DateFromWeek(part[weekpart],part[yearpart],part[daypart])
      else
        if weekpart = 1
          returnvalue = self.DateFromWeek(part[1],part[2],part[3])
        else
          returnvalue = self.DateFromWeek(part[2],part[1],part[3])
        end
      end
    elsif yearpart and monthpart
      if yearpart <> 3 and monthpart <> 3 then daypart = 3
      elsif yearpart <> 2 and monthpart <> 2 then daypart = 2
      elsif yearpart <> 1 and monthpart <> 1 then daypart = 1
      end
      daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
      returnvalue = date(monthnumber,daynumber,yearnumber)
    else
      ! know year part, try and get daypart
      if yearpart
        do MakeDayNumber
        if daypart
          if yearpart <> 1 and daypart <> 1 then monthpart = 1
          elsif yearpart <> 2 and daypart <> 2 then monthpart = 2
          else monthpart = 3
          end
          monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
        ! know yearpart, but monthpart and daypart are both < 13 so if year part =1 then y/m/d
        elsif yearpart = 1
          monthpart = 2
          monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
          daypart = 3
          daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
        else
          ! know yearpart, but monthpart and daypart are both < 13, and yearpart > 1
          case spic.n
          of 0 orof 1 orof 2 orof 3 orof 4 ! mm/dd
            daypart = 2
            monthpart = 1
          of 5 orof 6 orof 7 orof 8        ! dd/mm
            daypart = 1
            monthpart = 2
          else
            daypart = 2
            monthpart = 1
          end
          daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
          monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
        end
        returnvalue = date(monthnumber,daynumber,yearnumber)
      else
        ! 3 completely undistingushable parts, use pic
        case spic.n
        of 0 orof 1 orof 2 orof 3 orof 4 ! m/d/y
          daypart = 2
          monthpart = 1
          yearpart = 3
        of 5 orof 6 orof 7 orof 8        ! d/m/y
          daypart = 1
          monthpart = 2
          yearpart = 3
        else                             ! y/m/d
          daypart = 3
          monthpart = 2
          yearpart = 1
        end
        if part[monthpart] > 12 and part[daypart] <= 12
          daynumber = monthpart
          monthpart = daypart
          daypart = daynumber
        end
        daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
        monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
        yearnumber = choose(part[yearpart] >= 1,part[yearpart],year(today()))
        returnvalue = date(monthnumber,daynumber,yearnumber)
      end
    end
  end
  if spic.milli
    returnvalue = self.ClarionToUnixDate(returnvalue,0,true)
  elsif spic.u
    returnvalue = self.ClarionToUnixDate(returnvalue,0,false)
  end
  return returnvalue

MakeParts  routine
  data
x    long,auto
p    long,auto
mode long(-1)
  code
  p = 0
  loop x = 1 to len(clip(pValue))
    case val(pValue[x])
    of 48 to 57        ! '0' to '9'
      if mode = 2 or mode = -1
        mode = 1
        p += 1
        if p > 3 then break.
      end
      part[p] = clip(part[p]) & pValue[x]
      if spic.s = '!'  ! input is a single number with no separator. So break on part length.
        if p = 1 and (spic.n = 10 or spic.n = 12 or spic.n = 16)
          if len(clip(part[p])) = 4
            p += 1
            if p > 3 then break.
          end
        else
          if len(clip(part[p])) = 2
            p += 1
            if p > 3 then break.
          end
        end
      end
    of 44 orof 46 orof 47 orof 45 orof 32 orof 95 orof 92 orof 43 ! ',' orof '.' orof '/' orof '-' orof space orof '_' orof '\' orof '+'
      if p = 0 then p = 1.
      sep = pValue[x]
      mode = 0
      if part[p] <> ''
        p += 1
        if p > 3 then break.
      end
    of 97 to 122  ! 'a' to 'z'
    orof 65 to 90 ! 'A' to 'Z'
      if mode = 1 or mode = -1
        mode = 2
        p += 1
        if p > 3 then break.
      end
      part[p] = clip(part[p]) & pValue[x]
    end
  end
  if part[3] <> '' then numberofparts = 3
  elsif part[2] <> '' then numberofparts = 2
  else numberofparts = 1
  end

makedaynumber   routine
  data
x long,auto
  code
  loop x = 1 to 3
    if part[x] >= 13 and part[x] <= 31
      daypart = x
      daynumber = part[x]
      break
    end
  end

makeyearnumber  routine
  data
x long,auto
  code
  loop x = 1 to 3
    if (part[x] >= 1800 and part[x] <= 2100) or (part[x] > 31 and part[x] < 100)
      yearpart = x
      yearnumber = part[x]
      break
    end
  end

makeweeknumber  routine
  data
x long,auto
  code
  loop x = 1 to 2
    if sub(upper(part[x]),1,1) = 'W' and sub(part[x],2,2) >= 1 and sub(part[x],2,2) <= 53
      weekpart = x
      break
    end
  end

makemonthnumber  routine
  data
x long,auto
  code
  monthnumber = 0
  loop x = 1 to 3
    case lower(part[x])
    of self.translate('jan')
      orof 'janeiro'                    !portuguese
      orof 'enero' orof 'ene'           !spanish
      orof 'januar'                     !german   !danish  !norwegian
      orof 'januari'                    !dutch
      orof 'januarie'                   !afrikaans
      orof self.translate('january')
        monthnumber = 1
    of self.translate('feb')
      orof 'fevereiro'                  !portuguese
      orof 'febrero'                    !spanish
      orof 'februar'                    !german !danish  !norwegian
      orof 'februari'                   !dutch
      orof 'februarie'                  !afrikaans
      orof self.translate('february')
        monthnumber = 2
    of self.translate('mar')
      orof 'mar<231>o'                  !portuguese
      orof 'marzo'                      !spanish
      orof 'mars'                       !norwegian
      orof 'm<228>rz'                   !german
      orof 'marts'                      !danish
      orof 'maart'                      !dutch   ! afrikaans
      orof self.translate('march')
        monthnumber = 3
    of self.translate('apr')
      orof 'abril' orof 'abr'           !spanish !portuguese
      orof self.translate('april')      ! afrikaans  ! dutch  ! danish ! german ! norwegian
        monthnumber = 4
    of self.translate('may')
      orof 'mayo'                       !spanish
      orof 'maio'                       !portuguese
      orof 'maj'                        !danish !norwegian
      orof 'kann'                       !german
      orof 'mei'                        !afrikaans  !dutch
        monthnumber = 5
    of self.translate('jun')
      orof 'junio'                      !spanish
      orof 'junho'                      !portuguese
      orof 'junie'                      !afrikaans
      orof 'juni'                       !dutch   !german !danish !norwegian
      orof self.translate('june')
        monthnumber = 6
    of self.translate('jul')
      orof 'julio'                      !spanish
      orof 'julho'                      !portuguese
      orof 'juli'                       !norwegian  !danish  !german  !dutch
      orof 'julie'                      !afrikaans
      orof self.translate('july')
        monthnumber = 7
    of self.translate('aug')
      orof 'agosto' orof 'ago'          !spanish    !portuguese
      orof 'augustus'                   !afrikaans  !dutch
      orof self.translate('august')     !danish !german !norwegian
        monthnumber = 8
    of self.translate('sep') orof self.translate('sept')
      orof 'setembro'                   !portuguese
      orof 'septiembre'                 !spanish
      orof self.translate('september')  ! norwegian !danish !german !afrikaans !dutch
        monthnumber = 9
    of self.translate('oct')
      orof 'okt'                        ! various short
      orof 'octubre'                    !portuguese
      orof 'outubro'                    !spanish
      orof 'oktober'                    !afrikaans !dutch  !german !danish !norwegian
      orof self.translate('october')
        monthnumber = 10
    of self.translate('nov')
      orof 'novembro'                   !portuguese
      orof 'noviembre'                  !spanish
      orof self.translate('november')   !norwegian  !danish  !german !afrikaans ! dutch
        monthnumber = 11
    of self.translate('dec')
      orof 'dezembro'                   !portuguese
      orof 'diciembre' orof 'dic'       !spanish
      orof 'desember'                   !norwegian  !afrikaans !
      orof 'dezember'                   !german
      orof self.translate('december')   !danish  !dutch
        monthnumber = 12
    end
    if monthnumber = 0
      case tolower(val(part[x,1]))
      of 102                            ! 'f'
        monthnumber = 2
      of 115                            ! 's'
        monthnumber = 9
      of 111                            ! 'o'
        monthnumber = 10
      of 110                            ! 'n'
        monthnumber = 11
      !of val('d')  finds d in dd,mm,yy
      !  monthnumber = 12
      end
    end
    if monthnumber > 0
      monthpart = x
      part[monthpart] = monthnumber
      break
    end
  end

!------------------------------------------------------------------------------
StringDeformat.DeformatDateText PROCEDURE (Long pNumberofParts, String pPart1, String pPart2, String pPart3, String pSep)
t            Long,auto
ReturnValue  Long
  code
  t = today()
  case lower(pPart1)
  of self.translate('week') orof 'w' orof 'u'
    ReturnValue = date(1,1,year(today()))  ! ISO 8601 standard for week numbers http://en.wikipedia.org/wiki/ISO_8601
    loop until ReturnValue % 7 = 4         ! find first thursday
      ReturnValue += 1
    end
    ReturnValue -= 3 + ((pPart2-1) *7)     ! go back to monday, and add the number of weeks.
  of self.translate('tomorrow') orof 'tm'
    ReturnValue = t+1
  of self.translate('yesterday') orof 'yd' orof 'y'
    ReturnValue = t-1
  of self.translate('today') orof 't'
      case pNumberOfParts
      of 1
        ReturnValue = t
      of 2
        if pSep = '+'
          ReturnValue = t+pPart2
        elsif pSep = '-'
          ReturnValue = t-pPart2
        end
      end
  of self.translate('next') orof 'nx'
      case lower(pPart2)
      of self.translate('day') orof 'd'
        returnValue = t + 1
      of self.translate('week') orof 'w'
        returnValue = t + 7
      of self.translate('month') orof 'm'
        returnValue = date(month(t)+1,1,year(t))
      of self.translate('quarter') orof 'q'
        returnValue = date(int((month(t)-1)/3)*3+4,1,year(t))
      of self.translate('year') orof 'y'
        returnValue = date(1,1,year(t)+1)
      of self.translate('mon') orof self.translate('monday')
        returnvalue = choose(1+t%7,t+1,t+7,t+6,t+5,t+4,t+3,t+2)
      of self.translate('tue') orof self.translate('tuesday')
        returnvalue = choose(1+t%7,t+2,t+1,t+7,t+6,t+5,t+4,t+3)
      of self.translate('wed') orof self.translate('wednesday')
        returnvalue = choose(1+t%7,t+3,t+2,t+1,t+7,t+6,t+5,t+4)
      of self.translate('thu') orof self.translate('thur') orof self.translate('thursday')
        returnvalue = choose(1+t%7,t+4,t+3,t+2,t+1,t+7,t+6,t+5)
      of self.translate('fri') orof self.translate('friday')
        returnvalue = choose(1+t%7,t+5,t+4,t+3,t+2,t+1,t+7,t+6)
      of self.translate('sat') orof self.translate('saturday')
        returnvalue = choose(1+t%7,t+6,t+5,t+4,t+3,t+2,t+1,t+7)
      of self.translate('sun') orof self.translate('sunday')
        returnvalue = choose(1+t%7,t+7,t+6,t+5,t+4,t+3,t+2,t+1)
      end
  of self.translate('last') orof self.translate('previous')  orof 'pv' orof 'ls'
      case lower(pPart2)
      of self.translate('day') orof 'd'
        returnValue = t - 1
      of self.translate('week') orof 'w'
        returnValue = t - 7
      of self.translate('month') orof 'm'
        returnValue = date(month(t)-1,1,year(t))
      of self.translate('quarter') orof 'q'
        returnValue = date(int((month(t)-1)/3)*3-2,1,year(t))
      of self.translate('year') orof 'y'
        returnValue = date(1,1,year(t)-1)
      of self.translate('mon') orof self.translate('monday')
        returnvalue = choose(1+t%7,t-6,t-7,t-1,t-2,t-3,t-4,t-5)
      of self.translate('tue') orof self.translate('tuesday')
        returnvalue = choose(1+t%7,t-5,t-6,t-7,t-1,t-2,t-3,t-4)
      of self.translate('wed') orof self.translate('wednesday')
        returnvalue = choose(1+t%7,t-4,t-5,t-6,t-7,t-1,t-2,t-3)
      of self.translate('thu') orof self.translate('thur') orof self.translate('thursday')
        returnvalue = choose(1+t%7,t-3,t-4,t-5,t-6,t-7,t-1,t-2)
      of self.translate('fri') orof self.translate('friday')
        returnvalue = choose(1+t%7,t-2,t-3,t-4,t-5,t-6,t-7,t-1)
      of self.translate('sat') orof self.translate('saturday')
        returnvalue = choose(1+t%7,t-1,t-2,t-3,t-4,t-5,t-6,t-7)
      of self.translate('sun') orof self.translate('sunday')
        returnvalue = choose(1+t%7,t-7,t-1,t-2,t-3,t-4,t-5,t-6)
      end
  End
  return ReturnValue

!----------------------------------------------------------
StringDeformat.Translate  Procedure(String pText)
  code
  return pText

!-----------------------------------------------------------------
stMemCpyLeft  Procedure(long dest, long src,  long count)
lg   long,auto
sh   short,auto
bt   byte,auto
  code
  loop bshift(count,-2) times
    peek(src,lg)
    poke(dest,lg)
    src  += 4
    dest += 4
  end
  if band(count,2)
    peek(src,sh)
    poke(dest,sh)
    src  += 2
    dest += 2
  end
  if band(count,1)
    peek(src,bt)
    poke(dest,bt)
  end
!-----------------------------------------------------------------
stMemCpyRight  Procedure(long dest, long src,  long count)
lg   long,auto
sh   short,auto
bt   byte,auto
  code
  dest += count
  src  += count
  if band(count,1)
    src  -= 1
    dest -= 1
    peek(src,bt)
    poke(dest,bt)
  end
  if band(count,2)
    src  -= 2
    dest -= 2
    peek(src,sh)
    poke(dest,sh)
  end
  loop bshift(count,-2) times
    src  -= 4
    dest -= 4
    peek(src,lg)
    poke(dest,lg)
  end
!-----------------------------------------------------------------
