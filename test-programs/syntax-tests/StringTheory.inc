!-----------------------------------------------------------------------------!
!                                                                             !
!   CapeSoft StringTheory class is copyright © 2025 by CapeSoft Software      !
!   Based on a StringClass by Rick Martin as published in www.clarionmag.com. !
!   Thanks to Geoff Robinson for many useful contributions                    !
!   Docs online at : https://capesoft.com/docs/StringTheory/StringTheory.htm  !
!                                                                             !
!-----------------------------------------------------------------------------!

! BIGINT: use this for now as a 52 bit integer. In later clarion versions could become a int64

!Region ----------  Equates ----------
StringTheory:Version                 equate('3.75')

BIGINT              Equate(REAL)

st:ok               Equate(0)
st:notOk            Equate(1)
st:notFound         Equate(2)
st:Error            Equate(-1)
st:End              Equate(2147483647)

! Basic encoding types
st:EncNone          Equate(0)       ! No encoding
st:EncHex           Equate(1)       ! Encoded as a hex string (pairs of ASCII characters representing the hexidecimal value of each byte)
st:EncBase64        Equate(2)       ! Base64 encoded

st:NoHex            Equate(1)
st:NoPlus           Equate(2)
st:NoColon          Equate(8)
st:Plus             Equate(4)
st:BigPlus          Equate(16)
st:dos              Equate(32)
st:php              Equate(64)
st:Parameters       Equate(128)

st:Hyphen           Equate(0)
st:format           Equate(1)
st:NoHyphen         Equate(8)
st:brackets         Equate(256)

st:windows          equate(1) ! CRLF
st:mac              equate(2) ! CR
st:unix             equate(3) ! LF
st:web              equate(4) ! <br><br/><hr></p><p/>

st:SortNoCase       equate(1)
st:SortCase         equate(2)
st:SortLength       equate(4)

st:begins           equate(1)
st:ends             equate(2)
st:anywhere         equate(0)

st:spaces           equate(1)
st:tabs             equate(2)
st:cr               equate(4)
st:lf               equate(8)
st:zeros            equate(16)

st:left             equate(1)
st:right            equate(2)

st:QuoteAlways      equate(1)
st:AlwaysQuote      equate(1)
st:IfQuoted         equate(2)

st:First            Equate(1)
st:Last             Equate(-1)

st:None             equate(0)
st:Alphabet         equate(0)
st:Upper            equate(1)
st:Lower            equate(2)
st:Number           equate(4)
st:AlphaFirst       equate(8)
st:Punctuation      equate(16)
st:Hex              equate(32)
st:DNA              equate(64)
st:Binary           equate(128)
st:AlmostBinary     equate(256)
st:Space            equate(512)

st:AllAlphaNum      equate(1)

st:Decimal          equate(16)

st:Append           equate(1)
st:Overwrite        equate(0)
st:Clip             equate(1)
st:NoBlanks         equate(2)
st:NoClip           equate(0)
st:Lines            equate(4)
st:nested           equate(1)
st:NoWrap           equate(1)
st:detectAlphabet   equate(1)
st:keep             equate(0)
st:remove           equate(1)
st:replace          equate(2)
st:NoPadding        equate(2)
st:URLSafe          equate(4)
st:Adobe85          equate(8)
st:tolerant         equate(16)

st:SimpleCompare    equate(2)
st:UnicodeCompare   equate(4)
st:NoCaseCompare    equate(8)

st:EncodeAnsi       equate(0)
st:EncodeUtf8       equate(1)
st:EncodeUtf16      equate(2)
st:EncodeUtf32      equate(4)

ST:TEXT             equate(0)
ST:HTML             equate(1)
ST:NOPUNCTUATION    equate(2)
ST:XML              equate(4)
ST:CONTROLCHARS     equate(8)

st:Forwards         equate(1)
st:Backwards        equate(-1)

st:Base64           equate(1)
st:QuotedPrintable  equate(2)

st:noCase           equate(1)
st:wholeWord        equate(1)
st:wholeLine        equate(1)
st:replaceAll       equate(1)

st:IgnoreIfValid    equate(1)
st:IgnoreIfNumber   equate(2)
st:percent          equate(4)
st:DecimalEncode128 equate(8)

st:removeBOM        equate(1)
st:nopath           equate(0)
st:allowpath        equate(1)


! ASN TYPES   Abstract Syntax Notation One
st:ASN_BOOLEAN           Equate('<01h>')
st:ASN_INTEGER           Equate('<02h>')
st:ASN_BITSTRING         Equate('<03h>')
st:ASN_OCTETSTRING       Equate('<04h>')
st:ASN_NULL              Equate('<05h>')
st:ASN_OBJECT            Equate('<06h>')
st:ASN_REAL              Equate('<09h>')
st:ASN_ENUMERATED        Equate('<00Ah>')
st:ASN_UTF8STRING        Equate('<00Ch>')
st:ASN_PRINTABLESTRING   Equate('<013h>')     ! limited charset. A-Z, a-z, 0-9,   ' ( ) + , - . / : = ? [space]
st:ASN_TELETEXTSTRING    Equate('<014h>')
st:ASN_IA5STRING         Equate('<016h>')     ! ASCII + Code Page
st:ASN_UTCTime           Equate('<017h>')
st:ASN_BMPSTRING         Equate('<01Eh>')     ! Basic Multilingual Plane - utf-16 string
st:ASN_SEQUENCE          Equate('<030h>')
st:ASN_SEQUENCEOF        Equate('<030h>')
st:ASN_SET               Equate('<031h>')

!EndRegion: Equates

!Region ---------- API Equates ----------

st:MAX_PATH                   equate(260)

st:GENERIC_READ               equate(80000000h)
st:GENERIC_WRITE              equate(40000000h)
st:FILE_SHARE_READ            equate(00000001h)
st:FILE_SHARE_WRITE           equate(00000002h)
st:FILE_SHARE_DELETE          equate(00000004h)
st:CREATE_NEW                 equate(1)
st:CREATE_ALWAYS              equate(2)
st:CREATE_EXISTING            equate(3)
st:OPEN_ALWAYS                equate(4)
st:OPEN_EXISTING              equate(3)
st:TRUNCATE_EXISTING          equate(5)
st:INVALID_SET_FILE_POINTER   equate(-1)
st:FILE_BEGIN                 equate(0)
st:FILE_CURRENT               equate(1)
st:FILE_END                   equate(2)
st:FILE_ATTRIBUTE_NORMAL      equate(080h)

st:INVALID_HANDLE_VALUE       equate(-1)

! equate for passing the the FormatMessage() function
st:FORMAT_MESSAGE_ALLOCATE_BUFFER equate(000100h)
st:FORMAT_MESSAGE_IGNORE_INSERTS  equate(000200h)
st:FORMAT_MESSAGE_FROM_STRING     equate(000400h)
st:FORMAT_MESSAGE_FROM_HMODULE    equate(000800h)
st:FORMAT_MESSAGE_FROM_SYSTEM     equate(001000h)
st:FORMAT_MESSAGE_ARGUMENT_ARRAY  equate(002000h)
st:FORMAT_MESSAGE_MAX_WIDTH_MASK  equate(0000FFh)

! Code Page Values.
st:CP_Detect            equate(-1)              ! Code page not set - try autodetect
st:CP_ACP               equate(0)               ! ANSI code page
st:CP_OEMCP             equate(1)               ! OEM  code page
st:CP_MACCP             equate(2)               ! MAC  code page
st:CP_THREAD_ACP        equate(3)               ! current thread's ANSI code page
st:CP_SYMBOL            equate(42)              ! SYMBOL translations

st:CP_US_ASCII          equate(20127)

st:CP_WINDOWS_850        equate(850)  ! CP850 (DOS Latin-1)
st:CP_Big5               equate(950)  ! ANSI/OEM Traditional Chinese (Taiwan; Hong Kong SAR, PRC); Chinese Traditional (Big5)
st:CP_WINDOWS_936        equate(936)  ! NSI/OEM Simplified Chinese (PRC, Singapore); Chinese Simplified (GB2312)

st:CP_WINDOWS_874        equate(874)   ! Thai
st:CP_WINDOWS_1250       equate(1250)  ! Central / Eastern Europe
st:CP_WINDOWS_1251       equate(1251)  ! Cyrillic
st:CP_WINDOWS_1252       equate(1252)  ! Western Europe
st:CP_WINDOWS_1253       equate(1253)  ! Greek
st:CP_WINDOWS_1254       equate(1254)  ! Turkish
st:CP_WINDOWS_1255       equate(1255)  ! Hebrew
st:CP_WINDOWS_1256       equate(1256)  ! Arabic
st:CP_WINDOWS_1257       equate(1257)  ! Baltic
st:CP_WINDOWS_1258       equate(1258)  ! Vietnamese

st:CP_ISO_8859_1        equate(28591)
st:CP_ISO_8859_2        equate(28592)
st:CP_ISO_8859_3        equate(28593)
st:CP_ISO_8859_4        equate(28594)
st:CP_ISO_8859_5        equate(28595)
st:CP_ISO_8859_6        equate(28596)
st:CP_ISO_8859_7        equate(28597)
st:CP_ISO_8859_8        equate(28598)
st:CP_ISO_8859_9        equate(28599)
st:CP_ISO_8859_13       equate(28603)
st:CP_ISO_8859_15       equate(28605)

st:CP_ISO88591          equate(28591)
st:CP_ISO88592          equate(28592)
st:CP_ISO88593          equate(28593)
st:CP_ISO88594          equate(28594)
st:CP_ISO88595          equate(28595)
st:CP_ISO88596          equate(28596)
st:CP_ISO88597          equate(28597)
st:CP_ISO88598          equate(28598)
st:CP_ISO88599          equate(28599)
st:CP_ISO885913         equate(28603)
st:CP_ISO885915         equate(28605)

st:CP_UTF7              equate(65000)           ! UTF-7 translation
st:CP_UTF8              equate(65001)           ! UTF-8 translation

st:ERROR_INSUFFICIENT_BUFFER equate(122)
st:ERROR_NO_UNICODE_TRANSLATION  equate(0459h)

!  MBCS and Unicode Translation Flags.
st:MB_PRECOMPOSED       equate(000000001h)      ! use precomposed chars
st:MB_COMPOSITE         equate(000000002h)      ! use composite chars
st:MB_USEGLYPHCHARS     equate(000000004h)      ! use glyph chars, not ctrl chars
st:MB_ERR_INVALID_CHARS equate(000000008h)      ! error for invalid chars

st:WC_COMPOSITECHECK    equate(000000200h)      ! convert composite to precomposed
st:WC_DISCARDNS         equate(000000010h)      ! discard non-spacing chars
st:WC_SEPCHARS          equate(000000020h)      ! generate separate chars
st:WC_DEFAULTCHAR       equate(000000040h)      ! replace w/ default char

st:WC_NO_BEST_FIT_CHARS equate(000000400h)      ! do not use best fit chars

st:NFC                  Equate(1)
st:NFD                  Equate(2)
st:NFKC                 Equate(5)
st:NFKD                 Equate(6)

st:littleEndian         Equate(0)
st:bigEndian            Equate(1)
!EndRegion: API Equates

!Region ---------- Data: Queue and Group TYPE ----------
! Stores a string that has been split into parts based on a token (seperator)
LinesQType          queue, type
line                  &string,name('line | &string')
empty                 byte
quoted                byte
                    end

LinesGroupType      group,type
line                  &string,name('line | &string')
                    end

os_WIN32_FIND_DATAA         Group,TYPE
dwFileAttributes              Long
ftCreationTimeLow             uLong
ftCreationTimeHigh            uLong
ftLastAccessTimeLow           uLong
ftLastAccessTimeHigh          uLong
ftLastWriteTimeLow            uLong
ftLastWriteTimeHigh           uLong
nFileSizeHigh                 uLong
nFileSizeLow                  uLong
dwReserved0                   Long
dwReserved1                   Long
cFileName                     cstring(256)
cAlternateFileName            cstring(14)
dwFileType                    Long ! // Obsolete. Do not use.
dwCreatorType                 Long !// Obsolete. Do not use
wFinderFlags                  Short !// Obsolete. Do not use
                            End

!EndRegion: Data TYPEs

!Region ---------- G Zip Equates and Types ----------
st:Z_BINARY   Equate(0)
st:Z_TEXT     Equate(1)
st:Z_UNKNOWN  Equate(2)
st:Z_DEFLATED Equate(8)

st:Z_FILTERED         Equate(1)
st:Z_HUFFMAN_ONLY     Equate(2)
st:Z_RLE              Equate(3)
st:Z_FIXED            Equate(4)
st:Z_DEFAULT_STRATEGY Equate(0)

st:MAX_WBITS       Equate(15)
st:Z_NO_FLUSH      Equate(0)
st:Z_PARTIAL_FLUSH Equate(1)
st:Z_SYNC_FLUSH    Equate(2)
st:Z_FULL_FLUSH    Equate(3)
st:Z_FINISH        Equate(4)
st:Z_BLOCK         Equate(5)
st:Z_TREES         Equate(6)

st:Z_OK            Equate(0)
st:Z_STREAM_END    Equate(1)
st:Z_NEED_DICT     Equate(2)
st:Z_ERRNO         Equate(-1)
st:Z_STREAM_ERROR  Equate(-2)
st:Z_DATA_ERROR    Equate(-3)
st:Z_MEM_ERROR     Equate(-4)
st:Z_BUF_ERROR     Equate(-5)
st:Z_VERSION_ERROR Equate(-6)
st:Z_NORAM_ERROR   Equate(-98)
st:Z_DLL_ERROR     Equate(-99)

z_stream_s   Group,Type
next_in        ulong !&string    !  /* next input byte */
avail_in       ulong      !  /* number of bytes available at next_in */
total_in       ulong      !  /* total number of input bytes read so far */

next_out       ulong !&string    !  /* next output byte should be put there */
avail_out      ulong      !  /* remaining free space at next_out */
total_out      ulong      !  /* total number of bytes output so far */

msg            ulong !&cstring   !  /* last error message, NULL if no error */
state          long      !  /* not visible by applications */

zalloc         ulong      !  /* used to allocate the internal state */
zfree          ulong      !  /* used to free the internal state */
opaque         ulong      !  /* private data object passed to zalloc and zfree */

data_type      long       !  /* best guess about the data type: binary or text */
adler          ulong      !  /* adler32 value of the uncompressed data */
reserved       ulong      !  /* reserved for future use */
             End

!EndRegion: G Zip Equates and Types

!===================================================================!
StringTheory        Class(), type, Module('StringTheory.clw'), Link('StringTheory.clw',StringTheoryLinkMode),DLL(StringTheoryDLLMode)

! Private properties
value                 &string,PRIVATE,name('value | &string')  ! remove ,PRIVATE to go back to StringTheory 1 behaviour. However then it is STRONGLY recommended you adjust line in the CONSTRUCT method as well.
streamFileName        &string,PRIVATE,name('streamFileName | &string')  ! if set, value is appended to this file when flushed

! These properties should be treated as private in most cases
lines                 &LinesQType,name('lines | queue')

_DataEnd              long  ! internal

! Public properties
valueptr              &string,name('valueptr | &string') ! this allows access to the private value property - use with care

Bytes                 long        ! Bytes loaded in loadfile
LastError             &string,name('LastError | &string')   ! changed to string reference to further save ram - will be at least one char for backwards compatability
winErrorCode          long
CodePage              long
EndOfLastLine         long

UseBuffer             byte
CleanBuffer           byte
logErrors             byte        ! trace() errors on errorTrap
gzipped               byte
base64                byte
base64NoWrap          byte        ! If set, the base64 encoding doesn't break the line every 76 characters.
base64URLSafe         byte        ! If set uses alternative encoding without + and / characters.
encoding              byte        ! Text encoding - Ansi, UTf-8 or Utf16
Endian                byte
Eof                   byte

! Internal Properties
_first                byte
_NormalizeDLLLoaded   byte
_GzipDLLLoaded        byte


Construct             Procedure ()
Destruct              Procedure (),Virtual
Start                 Procedure (long pForce=true),Virtual

Stream                Procedure (string pFilename, long pSize=10, bool pAppendFlag=false),long, proc, virtual
NoStream              Procedure (),virtual
FlushAndKeep          Procedure (),long, proc, virtual
Flush                 Procedure (),long, proc, virtual
Flush                 Procedure (string pStr),long, proc, virtual
Flush                 Procedure (*string pStr),long, proc, virtual
Flush                 Procedure (StringTheory pStr),long, proc, virtual

AppendA               Procedure (string newValue, long pClip=st:NoClip, <string pSep>), virtual   ! Deprecated
AppendBinary          Procedure (long pValue,Long pLength=4),Virtual

Append                Procedure (string newValue), virtual
Append                Procedure (*string newValue), virtual
Append                Procedure (string newValue, long pOptions), virtual ! = st:NoClip
Append                Procedure (*string newValue, long pOptions), virtual  ! = st:NoClip
Append                Procedure (string newValue, long pOptions = st:NoClip, string pSep), virtual !
Append                Procedure (*string newValue, long pOptions = st:NoClip, string pSep), virtual !
Append                Procedure (StringTheory pStr, long pOptions = st:NoClip, string pSep), virtual
Append                Procedure (StringTheory pStr, string pSep), virtual
Append                Procedure (StringTheory pStr), virtual
Append                Procedure (Blob pBlob),virtual

Cat                   Procedure (stringTheory pStr),virtual
Cat                   Procedure (stringTheory pStr, long pLen ),virtual
Cat                   Procedure (string newValue),virtual
Cat                   Procedure (string newValue, long pLen ),virtual
Cat                   Procedure (*string newValue),virtual
Cat                   Procedure (*string newValue, long pLen),virtual
Cat                   Procedure (*byte newValue),virtual

CatAddr               Procedure (long pAddr, long pLen),virtual

SetValue              Procedure (StringTheory newValue), virtual
SetValue              Procedure (StringTheory newValue,long pOptions), virtual
SetValue              Procedure (string newValue,long pClip=st:NoClip), virtual
SetValue              Procedure (*string newValue,long pClip=st:NoClip), virtual

SetValueFromLine      Procedure (long pLineNumber), virtual
SetValueByAddress     Procedure (long newValueAddress,long pLength), virtual
SetValueByCstringAddress Procedure(long pAddress,Long pEncoding=-1), virtual
_EqualsUnicode        Procedure (*String otherValue, Long pOptions = st:UnicodeCompare),long, virtual
_EqualsUnicode        Procedure (StringTheory otherValue, Long pOptions = st:UnicodeCompare),long, virtual
Equals                Procedure (StringTheory otherValue, Long pOptions = ST:SimpleCompare),long, virtual
Equals                Procedure (String otherValue, Long pOptions = ST:SimpleCompare + ST:Clip),long, virtual
_GetNextBufferSize    Procedure (Long pLen),Long,Virtual
_SetValuePointer      Procedure (Long pPtr,Long pSize, Long pEnd, Long pDispose=1),Virtual
_StealValue           Procedure (stringTheory otherValue), virtual
_StealValue           Procedure (*string pOtherValue, long pReset=false), virtual

Swap                  Procedure (stringTheory pOther), virtual
Assign                Procedure (*string newValue), virtual
Assign                Procedure (string newValue), virtual
Abbreviate            Procedure (Long pPos,Long pRangeLeft = 15,Long pRangeRight = 15),Long,Proc,Virtual
GetValuePtr           Procedure (),*String,virtual
GetValuePtr           Procedure (Long pStart),*String,virtual
GetValuePtr           Procedure (Long pStart,Long pEnd),*String,virtual
GetAddress            Procedure (),Long,Virtual
Base32Encode          Procedure (Long pOptions=0, <String pAlphabet>),bool,proc,virtual
Base32Decode          Procedure (Long pOptions=0, <String pAlphabet>),bool,proc,virtual
Base64Encode          Procedure (Long pOptions=0),bool, proc,Virtual
Base64Encode          Procedure (*string pText, *long pLen),bool, proc, virtual
Base64Decode          Procedure (),bool, proc, virtual
Base64Decode          Procedure (*string pText, *long pLen),bool, proc, virtual
Base85Encode          Procedure (Long pOptions=0),virtual
Base85Decode          Procedure (),Long,virtual
CSVEncode             Procedure (),String,Proc , virtual
CSVEncode             Procedure (String pStr),String,Proc,Virtual
CSVEncode             Procedure (Long pAlwaysQuote,string pSeparator,string pLineEnding),Proc,String,Virtual
CSVEncode             Procedure (String pStr,Long pAlwaysQuote,string pSeparator,string pLineEnding),String,Virtual
CSVDecode             Procedure (),String,Proc, virtual
CSVDecode             Procedure (String pStr),String,Virtual
QuotedPrintableEncode Procedure (), virtual
QuotedPrintableDecode Procedure (), virtual
EncodedWordDecode     Procedure (), virtual
EncodedWordEncode     Procedure (<String pCharset>,long pEncoding=2),virtual
JsonEncode            Procedure (Long pOptions=0), virtual
JsonDecode            Procedure (), Long,Proc,virtual
XMLEncode             Procedure (Long pOptions=0), virtual
XMLDecode             Procedure (), virtual
ZeroXEncode           Procedure (),Virtual
ZeroXDecode           Procedure (),Virtual
FlexPolyLineDecode    Procedure (),Virtual
Free                  Procedure (), virtual
Free                  Procedure (Long pLines), virtual
Free                  Procedure (Long pLines, Long pForce), virtual
FreeLines             Procedure (), virtual
ClipLen               Procedure (), long, virtual
ClipLen               Procedure (*string pStr), long, virtual
ClipLength            Procedure (), long, virtual
ClipLength            Procedure (*string pStr), long, virtual
Crop                  Procedure (long pStart=1, long pEnd=0), Virtual

Instring              Procedure (string pSearchValue), long, virtual
Instring              Procedure (*string pSearchValue), long, virtual
Instring              Procedure (string pSearchValue, long pStep), long, virtual
Instring              Procedure (*string pSearchValue, long pStep), long, virtual
Instring              Procedure (string pSearchValue, long pStep=1, long pStart), long, virtual
Instring              Procedure (*string pSearchValue, long pStep=1, long pStart), long, virtual
Instring              Procedure (string pSearchValue, long pStep=1, long pStart=1, long pEnd), long, virtual
Instring              Procedure (*string pSearchValue, long pStep=1, long pStart=1, long pEnd), long, virtual
Instring              Procedure (string pSearchValue, long pStep=1, long pStart=1, long pEnd=0, long pNocase), long, virtual
Instring              Procedure (string pSearchValue, long pStep=1, long pStart=1, long pEnd=0, long pNocase=0, long pWholeWord), long, virtual

Match                 Procedure (string pRegEx, Long pStart, Long pEnd, long pMode=Match:Regular, long pNoCase=0), long, virtual
FindMatch             Procedure (string pRegEx,*long pStart, *long pEnd, long pMode=Match:Regular, long pNoCase=0), String, virtual
FindMatchPosition     Procedure (string pRegEx,*long pStart, *long pEnd, long pMode=Match:Regular, long pNoCase=0), virtual
Count                 Procedure (string pSearchValue, long pStep=1, long pStart=1, long pEnd=0, long pNoCase=0, bool softClip=true, long pOverlap=true), long, virtual
Capitalize            Procedure (long pCount=1, long pStartPos=1, long pEndPos=0,<String pCharlist>), virtual
ErrorTrap             Procedure (string methodName, string errorMessage, byte forceLog=false), virtual
ExtensionOnly         Procedure (<string fPath>),String, virtual
FormatMessage         Procedure (long err), string, virtual
GetValue              Procedure (), string, virtual
GetValue              Procedure (long maxLen), string, virtual
GetVal                Procedure (), string, virtual
GetLine               Procedure (long pLineNumber), string, virtual
GetLines              Procedure (long pFromLineNumber, long pToLineNumber, string pSeparator),string,virtual
GetBufferLength       Procedure (),long,Virtual
InLine                Procedure (string pSearchValue, long pStep=1, long pStart=1, long pEnd=0, long pNocase=0, long pWholeLine=0, long pWhere=st:anywhere, long pClip=st:Clip),Long,virtual
SetLine               Procedure (long pLineNumber,String pValue),virtual
SetLine               Procedure (long pLineNumber,*String pValue),virtual
SetLine               Procedure (long pLineNumber,StringTheory pValue),virtual
SetLineFromValue      Procedure (long pLineNumber),virtual
AddLine               Procedure (long pLineNumber,String pValue),virtual
AddLine               Procedure (long pLineNumber,*String pValue),virtual
AddLine               Procedure (String pValue),virtual
AddLine               Procedure (*String pValue),virtual
DeleteLine            Procedure (long pLineNumber), long, proc, virtual
RemoveLines           Procedure (), long, proc, virtual
RemoveLines           Procedure (String pAlphabet), long, proc, virtual
SerializeQueue        Procedure (*Queue pQueue,<String pRecordBoundary>,<string pFieldBoundary>,<string pQuotestart>,<string pQuoteEnd>,Long pLevel=1,Long pFree=true,long pOptions=0),virtual
SerializeGroup        Procedure (*Group pGroup,<string pBoundary>,<string pQuotestart>,<string pQuoteEnd>,Long pLevel=1,Long pFree=true,long pOptions=0),long,proc,virtual
SerializeQueue        Procedure (*Queue pQueue,<string pRecordBoundary>,*StringTheory pFieldBoundary,<string pQuotestart>,<string pQuoteEnd>,Long pLevel=1,Long pFree=true,long pOptions=0),virtual
SerializeGroup        Procedure (*Group pGroup,*StringTheory pBoundary,<string pQuotestart>,<string pQuoteEnd>,Long pLevel=1,Long pFree=true,long pOptions=0),long,proc,virtual
Join                  Procedure (string pBoundary,<string pQuotestart>,<string pQuoteEnd>,long pAlwaysQuote=false),virtual
Length                Procedure (), long, virtual
LengthA               Procedure (), long, virtual  ! Deprecated
Len                   Procedure (), long, virtual
Capacity              Procedure (), long, virtual
SpareCapacity         Procedure (), long, virtual
ReleaseSpareCapacity  Procedure (), virtual
ReserveCapacity        Procedure (Long strLen), virtual

Chars                 Procedure (Long pEncoding=-1, <String pStr>),Long,Virtual ! counts characters not bytes
_Malloc               Procedure (Long strLen, Long pForce=false, Long pSilent=true), virtual
MD5                   Procedure (Long pFormat=st:EncHex ,<*String pStr>,Long pLength=0), string, virtual

Prepend               Procedure (string newValue, long pClip), virtual
Prepend               Procedure (string newValue, long pClip=st:NoClip, string pSep), virtual
Prepend               Procedure (string newValue), virtual
Prepend               Procedure (*string newValue), virtual
Prepend               Procedure (StringTheory newValue, long pOptions = st:NoClip, string pSep), virtual
Prepend               Procedure (stringtheory newValue, String pSep), virtual
Prepend               Procedure (stringtheory newValue), virtual

SeedRandom            Procedure (), virtual
Random                Procedure (long pLength=16, long pFlags=0, <String pAlphabet>),String, Proc, virtual
SetRandom             Procedure (long pLength=16, long pFlags=0, <String pAlphabet>),long, Proc, virtual
MakeGuid              Procedure (long pLength=16, long pFlags=st:Upper+st:Number),String, Proc, virtual
MakeGuid4             Procedure (Long pOptions=0),String, Proc, virtual
Records               Procedure (), long, virtual

Replace               Procedure (string pOldValue, string pNewValue, long pCount=0, long pStart=1, long pEnd=0, long pNoCase=0, bool pRecursive), Long, Proc, virtual
Replace               Procedure (string pOldValue, string pNewValue, long pCount=0, long pStart=1, long pEnd=0, long pNoCase=0), Long, Proc, virtual

ReplaceBetween        Procedure (string pLeft, <string pRight>, string pOldValue, string pNewValue, long pCount=0, long pStart=1, long pEnd=0, long pNoCase=0, long pReplaceAll=false), Long, Proc, virtual
ReplaceExceptBetween  Procedure (string pLeft, <string pRight>, string pOldValue, string pNewValue, long pCount=0, long pStart=1, long pEnd=0, long pNoCase=0), Long, Proc, virtual
ReplaceSingleChars    Procedure (string pOldChars, string pNewChars),long,proc, virtual
ReplaceSingleChars    Procedure (string pOldChars, string pNewChars, bool pOnceOnly),long,proc, virtual
ReplaceSlice          Procedure (long pStart=1, long pEnd=0, stringTheory newValue), virtual
ReplaceSlice          Procedure (long pStart=1, long pEnd=0, string newValue), virtual
ReplaceSlice          Procedure (long pStart=1, long pEnd=0, *string newValue), virtual
ConvertTabs           Procedure (long pTabSize=8,<string pLineEnding>)
RemoveHTML            Procedure (),Virtual
SetLength             Procedure (Long strLen, Long pForce=false), virtual
AdjustLength          Procedure (Long pLen), Long, Proc, virtual
Slice                 Procedure (Long pStart=1, Long pEnd=0),String, virtual
Split                 Procedure (string pSplitStr,<string pQuotestart>,<string pQuoteEnd>, bool removeQuotes = false, bool pClip=st:NoClip, bool pLeft=false, <string pSeparator>,Long pNested=false), virtual
SplitEvery            Procedure (long numChars), virtual
SplitIntoWords        Procedure (long startPos = 1, long textType=ST:TEXT, <String pCharlist>,Long pSmartWords=true)
SplitByMatch          Procedure (string pRegEx, long pNoCase=0), virtual
SplitBetween          Procedure (string pLeft, string pRight, long pNoCase=false, long pExclusive=true), virtual
Sort                  Procedure (Long pSortType,string pSplitStr,<string pQuotestart>,<string pQuoteEnd>, bool pClip=st:NoClip, bool pLeft=false),Virtual
Sort                  Procedure (Long pSortType),Virtual
Filter                Procedure (string pInclude, string pExclude, long pNoCase=st:NoCase, long pClip=st:Clip),virtual
Sub                   Procedure (long pStart=1, long pLength=1), string, virtual
GetCodePageFromCharset Procedure(<Long pCharSet>),Long, virtual
ToCstring             Procedure (), *cstring, virtual
Trace                 Procedure (Queue pQueue), virtual
Trace                 Procedure (<string errMsg>), virtual
Upper                 Procedure (<String pQuote>, <String pQuoteEnd>), virtual
Lower                 Procedure (<String pQuote>, <String pQuoteEnd>), virtual
FileNameOnly          Procedure (<string fPath>,Long pIncludeExtension=true), string, virtual
PathOnly              Procedure (<string fPath>), string, proc, virtual
UrlProtocolOnly       Procedure (<string pURL>), string, proc, virtual
UrlHostOnly           Procedure (<string pURL>,Long pIncludePort=true), string, proc, virtual
UrlPortOnly           Procedure (<string pURL>), long, proc, virtual
UrlPathOnly           Procedure (<string pURL>, Long pIncludeFile=true), string, proc, virtual
UrlFileOnly           Procedure (<string pURL>), string, proc, virtual
UrlParametersOnly     Procedure (<string pURL>), string, proc, virtual
UrlParameter          Procedure (String pParameter,<string pURL>), string, proc, virtual
FileSize              Procedure (string pFileName),Real, virtual
LoadFile              Procedure (string fileName,BIGINT pOffset=0, Long pLength=0, Long pRemoveBOM=false), long, proc, virtual
SaveFile              Procedure (string fileName, bool pAppendFlag=false), long, proc, virtual
SaveFile              Procedure (*string WriteString, string fileName, bool pAppendFlag, long dataLen=0), long, proc, virtual
SaveFileA             Procedure (string WriteString, string fileName, bool pAppendFlag=false), long, proc, virtual
SetEncodingFromBOM    Procedure (Long pRemoveBOM=true),Long,Proc,Virtual
AddBOM                Procedure (Long pEncoding=-1),Virtual

Before                Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0), string, virtual
BeforeLast            Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0), string, virtual
BeforeNth             Procedure (string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNoCase=0), string, virtual
SetBefore             Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false),long,proc, virtual
SetBeforeLast         Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false),long,proc, virtual
SetBeforeNth          Procedure (string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false),long,proc, virtual

Between               Procedure (string pLeft, string pRight,long pStart=1, long pEnd=0, long pNoCase=0, long pExclusive=true), string, virtual
FindBetween           Procedure (string pLeft, string pRight, *long pStart, *long pEnd, bool pNoCase=false, long pExclusive=true), string, virtual
SetBetween            Procedure (string pLeft, string pRight, long pStart=1, long pEnd=0, long pNoCase=0, long pExclusive=true, long pClearIfNotFound=false),long, proc, virtual
FindBetweenPosition   Procedure (string pLeft, string pRight, *long pStart, *long pEnd, bool pNoCase=false, long pExclusive=true), virtual
After                 Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0), string, virtual
AfterLast             Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0), string, virtual
AfterNth              Procedure (string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNoCase=0), string, virtual
SetAfter              Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false),long,proc virtual
SetAfterLast          Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false),long,proc virtual
SetAfterNth           Procedure (string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNoCase=0, long pClearIfNotFound=false),long,proc virtual

ToBlob                Procedure (*blob blobField), long, proc, virtual
FromBlob              Procedure (*blob blobField), long, proc, virtual

ChangeBase            Procedure (Long pBaseFrom,Long pBaseTo),long,proc,virtual
LongDivision          Procedure(Long pDivisor, *Long rRemainder, Long pBase),long,proc,virtual

!--- Unicode handling
! Conversion between ANSI and UTF-16
AnsiToUtf16           Procedure (*string strAnsi, *long unicodeChars, ulong CodePage=st:CP_US_ASCII), *string, virtual
Utf16ToAnsi           Procedure (*string unicodeString, *long ansiLen, long unicodeChars=-1, ulong CodePage=st:CP_US_ASCII), *string, virtual

! Conversion between UTF-8 and UTF-16
Utf8To16              Procedure (*string strUtf8, *long unicodeChars), *string, virtual
Utf16To8              Procedure (*string unicodeString, *long utf8Len, long unicodeChars=-1), *string, virtual

! Conversion between ANSI and UTF-8
Utf8ToAnsi            Procedure (*string strUtf8, *long ansiLen, long pCodePage=st:CP_US_ASCII), *string, virtual
AnsiToUtf8            Procedure (*string strAnsi, *long utf8Len, long pCodePage=st:CP_US_ASCII), *string, virtual

! Old method names, backward compatibility only
apiUtf8ToAnsi         Procedure (*string strUtf8, *long ansiLen), *string, virtual
apiAnsiToUtf8         Procedure (*string strAnsi, *long utf8Len), *string, virtual

ToAnsi                Procedure (long encoding=0, long pCodePage=st:CP_US_ASCII), long, proc, virtual
ToAnsi                Procedure (long encoding=0, long pCodePage=st:CP_US_ASCII,Long pBlockSize), long, proc, virtual
ToUnicode             Procedure (long encoding=st:EncodeUtf8, long pCodePage=st:CP_US_ASCII), long, proc, virtual
DecodeHexInline       Procedure (long pCodePage=st:CP_US_ASCII, long pEncoding=-1),Virtual
DecodeHexInline       Procedure (string pId, Long pLength, long pCodePage, long pEncoding=-1),Virtual
Utf16ToUtf8Char       Procedure (String p_utf16Char,*Long rLen),String,Virtual
Normalize             Procedure (Long pForm=st:NFKD,Long pPreserveEncoding=true),Long,Proc,Virtual
IsValidUtf8           Procedure(),Long,Virtual
! Base conversion
DecToBase             Procedure (long num, long base=16, long lowerCase=1), string, virtual
BaseToDec             Procedure (string num, long base=16), long, virtual

! Byte based conversion to hex
ByteToHex             Procedure (byte pByte), string, virtual
HexToByte             Procedure (string hexVal), byte, virtual
LongToHex             Procedure (long pLong), string, virtual
StringToHex           Procedure (*string binData,Long pLen=0,Long pCase=0), *string, virtual
StringToHex           Procedure (string binData,Long pLen=0,Long pCase=0), *string, virtual
HexToString           Procedure (string hexData), *string, virtual

ToHex                 Procedure (Long pCase=0,Long pSpacer=0), virtual     ! convert the stored string to hex
FromHex               Procedure (), virtual

WrapText              Procedure(long wrapAt=80, bool keepExistingBreaks=true, bool pleft=false), virtual
StrCpy                Procedure(*string pIn, *string pOut, bool pClip=st:Clip), long, proc, virtual

ToBytes               Procedure (*byte pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*short pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*ushort pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*long pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*ulong pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*sreal pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*real pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*decimal pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*cstring pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*pstring pSrc, *string pDest, long pOffset=1), virtual
ToBytes               Procedure (*string pSrc, *string pDest, long pOffset=1), virtual

FromBytes             Procedure (*string pSrc, *byte pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *short pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *ushort pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *long pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *ulong pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *sreal pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *real pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *decimal pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *cstring pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *string pDest, long pOffset=1), virtual
FromBytes             Procedure (*string pSrc, *pstring pDest, long pOffset=1), virtual

! Store the passed data in the StringTheory object as bytes
! The bytes are stored exactly as they are in the passed parameter
SetBytes              Procedure (*byte pSrc), virtual
SetBytes              Procedure (*short pSrc), virtual
SetBytes              Procedure (*ushort pSrc), virtual
SetBytes              Procedure (*long pSrc), virtual
SetBytes              Procedure (*ulong pSrc), virtual
SetBytes              Procedure (*sreal pSrc), virtual
SetBytes              Procedure (*real pSrc), virtual
SetBytes              Procedure (*decimal pSrc), virtual
SetBytes              Procedure (*cstring pSrc), virtual
SetBytes              Procedure (*string pSrc), virtual
SetBytes              Procedure (*pstring pSrc), virtual

! Retrieve the value stored in the StringTheory object and
! push the bytes into the passed parmeter.
GetBytes              Procedure (*byte pVal, long pOffset=1), virtual
GetBytes              Procedure (*short pVal, long pOffset=1), virtual
GetBytes              Procedure (*ushort pVal, long pOffset=1), virtual
GetBytes              Procedure (*long pVal, long pOffset=1), virtual
GetBytes              Procedure (*ulong pVal, long pOffset=1), virtual
GetBytes              Procedure (*sreal pVal, long pOffset=1), virtual
GetBytes              Procedure (*real pVal, long pOffset=1), virtual
GetBytes              Procedure (*decimal pVal, long pOffset=1), virtual
GetBytes              Procedure (*cstring pVal, long pOffset=1), virtual
GetBytes              Procedure (*string pVal, long pOffset=1), virtual
GetBytes              Procedure (*pstring pVal, long pOffset=1), virtual

SetBytes              Procedure (*? pVal, string pType, long pOffset=1), bool, proc, virtual
GetBytes              Procedure (*? pVal, string pType, long pOffset=1), bool, proc, virtual

FindWord              Procedure(long pWordNumber,long startPos = -1, long textType=ST:TEXT,*Long pStart, *Long pEnd,<String pCharlist>,Long pSmartWords=true), string, virtual
GetWord               Procedure (long pWordNumber,long startPos = -1, long textType=ST:TEXT, <String pCharlist>,Long pSmartWords=true), string, virtual
!Word                  Procedure (long pWordNumber,long startPos = -1, long textType=ST:TEXT), string, virtual
WordStart             Procedure (long pStartPos=1, long textType=ST:TEXT,Long pDir=st:Forwards,<String pCharlist>), long, virtual
WordEnd               Procedure (long pStartPos=1, long textType=ST:TEXT,<String pCharlist>,Long pSmartWords=true), long, virtual
CountWords            Procedure (long startPos = 1, long textType=ST:TEXT,<String pCharlist>,Long pSmartWords=true), long, virtual
RemoveAttributes      Procedure (String pTag,Long pCount=0), virtual
RemoveXMLPrefixes     Procedure(), virtual
HtmlEntityToDec       Procedure(),virtual
DecEntityToChar       Procedure(),Long,Proc,Virtual
CharToDecEntity       Procedure(long pFrom=128, long pTo=255),Virtual

Remove                Procedure(string pLeft), Long,Proc,virtual
Remove                Procedure(string pLeft,string pRight), Long,Proc,virtual
Remove                Procedure(string pLeft,<string pRight>,long pNoCase), Long,Proc,virtual
Remove                Procedure(string pLeft,<string pRight>,long pNoCase=0,long pContentsOnly), Long,Proc,virtual
Remove                Procedure(string pLeft,<string pRight>,long pNoCase=0,long pContentsOnly=0, long pCount), Long,Proc,virtual

RemoveFromPosition    Procedure(long pPosition, long pLength), Long,Proc,virtual
RemoveLeading         Procedure(String pStr, Long pNoCase=0),  bool,Proc,virtual

Top                   Procedure(long pLength), Long,Proc,virtual
Tail                  Procedure(long pLength), Long,Proc,virtual
Clip                  Procedure (), virtual
Clip                  Procedure (String pAlphabet), virtual
Trim                  Procedure (), virtual
Trim                  Procedure (String pAlphabet), virtual
Reverse               Procedure (String pString),String,Proc Virtual
Reverse               Procedure (),Virtual
Left                  Procedure(Long pLength=0,Long pwhat=st:spaces,<String pPad>),String, virtual
SetLeft               Procedure(Long pLength=0,Long pwhat=st:spaces,<String pPad>), virtual
Right                 Procedure(Long pLength=0,Long pwhat=st:spaces,<String pPad>),String, virtual
SetRight              Procedure(Long pLength=0,Long pwhat=st:spaces,<String pPad>), virtual
All                   Procedure(Long pLength=255),String, virtual
SetAll                Procedure(Long pLength=255), virtual
Squeeze               Procedure (long textType=ST:TEXT,<String pCharlist>,Long pSmartWords=true), virtual
ContainsADigit        Procedure (), bool, virtual
IsAllDigits           Procedure (long pStart=1, long pEnd=0), bool, virtual
IsDigit               Procedure (long pPos),                  bool, virtual
IsEmpty               Procedure (long pStart=1, long pEnd=0), bool, virtual
IsUpper               Procedure (long pStart=1, long pEnd=0), bool, virtual
IsAllUpper            Procedure (long pStart=1, long pEnd=0), bool, virtual
IsLower               Procedure (long pStart=1, long pEnd=0), bool, virtual
IsAllLower            Procedure (long pStart=1, long pEnd=0), bool, virtual
ContainsA             Procedure (String pAlphabet, <String pTestString>,Long pClip=st:Clip), bool, virtual
ContainsByte          Procedure (Byte pByte), bool, virtual
ContainsByte          Procedure (Byte pByte, *string pTestString), bool, virtual
ContainsByte          Procedure (Byte pByte,  string pTestString), bool, virtual
ContainsChar          Procedure (String pChar), bool, virtual
ContainsChar          Procedure (String pChar, *string pTestString), bool, virtual
ContainsChar          Procedure (String pChar,  string pTestString), bool, virtual
IsAscii               Procedure (long pStart=1, long pEnd=0), bool, virtual
IsAll                 Procedure (String pAlphabet, <String pTestString>,Long pClip=st:Clip), bool, virtual
RemoveChars           Procedure (String pAlphabet,  String pReplacementChar), long, proc, virtual
RemoveChars           Procedure (String pAlphabet), long, proc, virtual
RemoveCharRanges      Procedure (String pAlphabet,  String pReplacementChar), long, proc, virtual
RemoveCharRanges      Procedure (String pAlphabet), long, proc, virtual
KeepChars             Procedure (String pAlphabet,  String pReplacementChar, Byte pAlphaNum, *String pTestString), long, proc, virtual
KeepChars             Procedure (String pAlphabet,  String pReplacementChar, Byte pAlphaNum), long, proc, virtual
KeepChars             Procedure (String pAlphabet,  String pReplacementChar), long, proc, virtual
KeepChars             Procedure (String pAlphabet), long, proc, virtual
KeepCharRanges        Procedure (String pAlphabet,  String pReplacementChar), long, proc, virtual
KeepCharRanges        Procedure (String pAlphabet), long, proc, virtual
_ProcessCharRanges    Procedure (String pAlphabet,  byte pRemove, <String pReplacementChar>), long, proc, virtual

MatchBrackets         Procedure (String pLeftBracket, String pRightBracket, Long pStart=1),Long,virtual

_SwitchEndian         Procedure (), virtual
BigEndian             Procedure (), virtual
LittleEndian          Procedure (), virtual

SwitchEndian          Procedure (ulong x), long, virtual
BigEndian             Procedure (ulong x), long, virtual
LittleEndian          Procedure (ulong x), long, virtual

ReverseByteOrder      Procedure (), virtual

Str                   Procedure (), string, virtual
Str                   Procedure (string newValue),  string, proc, virtual
Str                   Procedure (*string newValue), string, proc, virtual
SetSlice              Procedure (long pStart=1, long pEnd=0, stringTheory newValue), virtual
SetSlice              Procedure (long pStart=1, long pEnd=0, string newValue), virtual
SetSlice              Procedure (long pStart=1, long pEnd=0, *string newValue), virtual

Insert                Procedure (long pStart, stringTheory insertValue), virtual
Insert                Procedure (long pStart, string insertValue), virtual
Insert                Procedure (long pStart, *string insertValue), virtual

InsertEvery           Procedure (long numChars, string insertValue), virtual
InsertEvery           Procedure (long numChars, *string insertValue), virtual

Quote                 Procedure (<string pQuotestart>,<string pQuoteEnd>,bool pQuoteEmpty=false), virtual
UnQuote               Procedure (<string pQuotestart>,<string pQuoteEnd>), virtual

FindChar              Procedure (string pSearchValue), long, virtual
FindChar              Procedure (string pSearchValue, long pStart), long, virtual
FindChar              Procedure (string pSearchValue, long pStart=1, long pEnd), long, virtual
FindChar              Procedure (string pSearchValue, long pStart=1, long pEnd=0, String p_Text), long, virtual
FindChar              Procedure (string pSearchValue, long pStart=1, long pEnd=0, *String p_Text), long, virtual

FindByte              Procedure (byte pSearchValue), long, virtual
FindByte              Procedure (byte pSearchValue, long pStart), long, virtual
FindByte              Procedure (byte pSearchValue, long pStart=1, long pEnd), long, virtual
FindByte              Procedure (byte pSearchValue, long pStart=1, long pEnd=0, String p_Text), long, virtual
FindByte              Procedure (byte pSearchValue, long pStart=1, long pEnd=0, *String p_Text), long, virtual

CountByte             Procedure (byte pSearchValue), long, virtual
CountByte             Procedure (byte pSearchValue, long pStart), long, virtual
CountByte             Procedure (byte pSearchValue, long pStart=1, long pEnd), long, virtual

replaceByte           Procedure (byte pOld, byte pNew), long, proc, virtual
removeByte            Procedure (byte pOld), long, proc, virtual
removeByteRange       Procedure (byte pLow, byte pHigh), long, proc, virtual
_removeMatchingChars  Procedure (*string pCharMap), long, proc, virtual
_replaceMatchingChars Procedure (*string pCharMap, byte pReplacement), long, proc, virtual

_memChrs              Procedure (*string pSearchValue, long pAddr, long pMaxStartAddr), long, virtual
_memiChrs             Procedure (*string pSearchValue, long pAddr, long pMaxStartAddr), long, virtual
_memiChr              Procedure (long buf, long c, unsigned count), long, virtual
FindEndOfString       Procedure (Long pEncoding, Long pStringAddress, Long pMaxLength=255),long ,virtual
FindCharsAddr         Procedure (*string pSearchValue, long pAddr, long pLen), long, virtual
FindChars             Procedure (*string pSearchValue),long, virtual
FindChars             Procedure (string pSearchValue), long, virtual
FindChars             Procedure (*string pSearchValue, long pStart), long, virtual
FindChars             Procedure (string pSearchValue,  long pStart), long, virtual
FindChars             Procedure (*string pSearchValue, long pStart=1, long pEnd), long, virtual
FindChars             Procedure (string pSearchValue,  long pStart=1, long pEnd), long, virtual
FindChars             Procedure (*string pSearchValue, long pStart=1, long pEnd=0, *String p_Text), long, virtual
FindChars             Procedure (string pSearchValue,  long pStart=1, long pEnd=0, *String p_Text), long, virtual
FindChars             Procedure (string pSearchValue,  long pStart=1, long pEnd=0, String p_Text), long, virtual

FindNth               Procedure (string pSearchValue, long pOccurrence, long pStart=1, long pEnd=0, long pNocase=0), long, virtual
ReplaceNth            Procedure (string pOldValue, string pNewValue, long pOccurrence, long pStart=1, long pEnd=0, long pNocase=0) , long, virtual
FindLast              Procedure (string pSearchValue, long pStart=1, long pEnd=0, long pNocase=0), long, virtual
ReplaceLast           Procedure (string pOldValue, string pNewValue, long pStart=1, long pEnd=0, long pNocase=0) , long, virtual

ColorToHex            Procedure (string pColor, bool pAddHash=false), string, virtual
ColorFromHex          Procedure (String pColor),Long, virtual
ColorToLong           Procedure (String pColor),Long, virtual
_ColorToHex           Procedure (long pAddHash=false), virtual
_ColorFromHex         Procedure (string pColor),Long, virtual
_ColorFromCSL         Procedure (string pColor),Long, virtual

UrlEncode             Procedure (String p_Text, long flags, String pDelimiter,String pSpace,String pAlphabet), string, virtual
UrlEncode             Procedure (long flags =0,<String pDelimiter>,<String pSpace>,<String pAlphabet>), virtual
UrlDecode             Procedure (<String pDelimiter>,<String pSpace>), virtual

GuidEncode            Procedure (long flags = 0) ,Virtual
GuidDecode            Procedure ()               ,Virtual

CleanFileName         Procedure (<string pFileName>, <string pReplaceChar>,Byte pAllowPath=st:nopath), string, proc, virtual
PeekRam               Procedure(Long pFormat=st:Decimal),Virtual
PeekRam               Procedure(uLong pAdr,Long pLen, Long pFormat=st:Decimal),Virtual
PeekRam               Procedure(stringTheory pResult,uLong pAdr,Long pLen, Long pFormat=st:Decimal),Virtual
loadlibs              Procedure(),Long,Proc,Virtual
LoadNormalize         Procedure(),Long,Proc,Virtual
gzip                  Procedure(Long pLevel=5),Long,Virtual,Proc
gunzip                Procedure(Long pOffset=0),Long,Virtual,Proc
MergeXml              Procedure(String pNew, Long pWhere),Virtual
LineEndings           Procedure(Long pEndings=st:windows,Long pFrom=0), Virtual
FormatTime            PROCEDURE (String pValue, String pFormat),String,Virtual
FormatTime            PROCEDURE (String pFormat),Virtual
DeformatTime          PROCEDURE (String pValue),String, Virtual
DeformatTime          PROCEDURE (),Virtual
IsTime                PROCEDURE (String pValue),Long, Virtual
IsTime                PROCEDURE (),Long, Virtual
StartsWith            Procedure (String pStr,Long pCase=True,Long pClip=st:Clip),Long,Virtual
EndsWith              Procedure (String pStr,Long pCase=True,Long pClip=st:Clip),Long,Virtual
ConvertOemToAnsi      Procedure(),Virtual
ConvertAnsiToOem      Procedure(),Virtual
AsnDecode             Procedure (*Long pPos,*StringTheory rASNValue,<*String rASNType>),Long,Virtual
AsnEncode             Procedure (String pType,<String pValue>),Virtual
AsnEncodeNumber       Procedure (String pType,Long pValue),Virtual
FormatHTML            procedure (),Virtual
_IANANameToNumber     Procedure (String pIANAName),Long,Virtual
FormatValue           Procedure (String pPicture),String,Virtual
FormatValue           Procedure (String pValue,String pPicture),String,Virtual
DeformatValue         Procedure (String pPicture),String,Virtual
DeformatValue         Procedure (String pValue,String pPicture),String,Virtual
SetFormatValue        Procedure (String pPicture),Virtual
SetFormatValue        Procedure (String pValue,String pPicture),Virtual
SetDeformatValue      Procedure (String pPicture),Virtual
SetDeformatValue      Procedure (String pValue,String pPicture),Virtual
                    end

!===================================================================!

pic:Time            equate('T')
pic:Date            equate('D')
pic:TimeHours       equate('H')
pic:Scientific      equate('E')
pic:String          equate('S')
pic:Number          equate('N')
pic:Pattern         equate('P')
pic:KeyIn           equate('K')
pic:UnixTimeStamp   equate('U')
pic:Hex             equate('X')

st:ExpandIfNeeded     Equate(1) ! Flag for FormatValue
st:Clarion            Equate(1) ! Flag for CreatePicture
st:MilliSeconds       Equate(1)

StringPicture       Class(), type, Module('StringTheory.clw'), Link('StringTheory.clw',StringTheoryLinkMode),DLL(StringTheoryDLLMode)
picType               string(1)
pic                   pString(252)
!----------------------------------------------------
! number pictures  !! N[currency] [sign] [fill] size [grouping] [places] [sign] [currency] [B]
CurrencyBefore        string(10)
SignBefore            string(1)
Fill                  string(1)
Size                  string(6)
Grouping              string(1)
Separator             string(1)
Places                string(6)
SignAfter             string(1)
CurrencyAfter         string(10)
B                     String(1)
!----------------------------------------------------
! date pictures    !! Dn [s] [direction [range] ] [B]
!Fill                 string(1)
n                     String(6)
s                     string(2)
Direction             String(1)
Range                 String(2)
u                     String(1)
milli                 String(1)
local                 String(1)
utc                   String(1)
!B                    String(1)
!----------------------------------------------------
! time pictures   !! Tn[s][B]
!Fill                 string(1)
!n                    String(3)
!s                    string(2)
!B                    String(1)
!u                    String(1)
!milli                String(1)
!local                String(1)
!utc                  String(1)
z                     string(1)
numberpart            pString(252)
!----------------------------------------------------
! scientific      !! Emsn[B]
!size                     string(6)
!m                     string(6)
!s                     string(2)
!n                     String(6)
!B                    String(1)
!----------------------------------------------------
! string          !! Slength
length                 String(4)
!----------------------------------------------------
! Pattern         !! P[<][#][x]P[B]
pattern                string(255)
upper                  string(1)
!B                     String(1)
!----------------------------------------------------
! Key-in          !! K[@][#][<][x][\][?][^][_][|]K[B]
!pattern               string(255)
!upper                 string(1)
!B                     String(1)
!----------------------------------------------------
! Decimal Time     !! H[currency] [sign] [fill] size [grouping] [places] [sign] [currency] [B]
! exactly the same as a number picture, but divides value by 360000 (1 hour) to create decimal time.
!CurrencyBefore        string(10)
!SignBefore            string(1)
!Fill                  string(1)
!Size                  string(6)
!Grouping              string(1)
!Separator             string(1)
!Places                string(6)
!SignAfter             string(1)
!CurrencyAfter         string(10)
!B                     String(1)

!----------------------------------------------------
! UnixDateTime stamp  !! @Un[M][@D][@T]
!n                    String(3)
datepart              pString(252)
timepart              pString(252)
clariondate           String(1)
clariontime           String(1)
!milli                String(1)
!numberpart           pstring(252)

!----------------------------------------------------
! HEX pictures
!n                    String(3)
!s                    string(2)
!Separator            string(1)
!upper                string(1)
base                  Long

!----------------------------------------------------
CreatePicture              Procedure(<String pType>,Long pFlag=0),String,Virtual
CreateDatePicture          Procedure(Long pFlag=0),String,Proc,Virtual
CreateTimePicture          Procedure(Long pFlag=0),String,Proc,Virtual
CreateTimeHoursPicture     Procedure(Long pFlag=0),String,Proc,Virtual
CreateStringPicture        Procedure(Long pFlag=0),String,Proc,Virtual
CreateScientificPicture    Procedure(Long pFlag=0),String,Proc,Virtual
CreateNumericPicture       Procedure(Long pFlag=0),String,Proc,Virtual
CreatePatternPicture       Procedure(Long pFlag=0),String,Proc,Virtual
CreateKeyInPicture         Procedure(Long pFlag=0),String,Proc,Virtual
CreateUnixTimeStampPicture Procedure(Long pFlag=0),String,Proc,Virtual
CreateHexPicture           Procedure(Long pFlag=0),String,Proc,Virtual

ParsePicture               Procedure(<String pPic>),Long,Proc,Virtual
ParseDatePicture           Procedure(<String pPic>),Long,Proc,Virtual
ParseTimePicture           Procedure(<String pPic>),Long,Proc,Virtual
ParseTimeHoursPicture      Procedure(<String pPic>),Long,Proc,Virtual
ParseStringPicture         Procedure(<String pPic>),Long,Proc,Virtual
ParseScientificPicture     Procedure(<String pPic>),Long,Proc,Virtual
ParseNumericPicture        Procedure(<String pPic>),Long,Proc,Virtual
ParsePatternPicture        Procedure(<String pPic>),Long,Proc,Virtual
ParseKeyInPicture          Procedure(<String pPic>),Long,Proc,Virtual
ParseUnixTimeStampPicture  Procedure(<String pPic>),Long,Proc,Virtual
ParseHexPicture            Procedure(<String pPic>),Long,Proc,Virtual

InterpretPicture           Procedure(<String pPic>),String,Proc,Virtual
InterpretDatePicture       Procedure(),String,Proc,Virtual
InterpretTimePicture       Procedure(),String,Proc,Virtual
InterpretTimeHoursPicture  Procedure(),String,Proc,Virtual
InterpretStringPicture     Procedure(),String,Proc,Virtual
InterpretScientificPicture Procedure(),String,Proc,Virtual
InterpretNumericPicture    Procedure(),String,Proc,Virtual
InterpretPatternPicture    Procedure(),String,Proc,Virtual
InterpretKeyInPicture      Procedure(),String,Proc,Virtual
InterpretUnixTimeStampPicture Procedure(),String,Proc,Virtual
InterpretHexPicture        Procedure(),String,Proc,Virtual

Trace                      Procedure (string errMsg), virtual
_block                     Procedure(*String pPic, String pAlphabet,*Long pPos,Long pMaxLen),String,Virtual
_block                     Procedure(String pPic, String pAlphabet,*Long pPos,Long pMaxLen),String,Virtual
_blockbound                Procedure(*String pPic, String pBoundary,*Long pPos),String,Virtual
_blockbound                Procedure(String pPic, String pBoundary,*Long pPos),String,Virtual
                         End

!===================================================================!
UnixDate                 Class(),type, Module('StringTheory.clw'), Link('StringTheory.clw',StringTheoryLinkMode),DLL(StringTheoryDLLMode)
Trace                      Procedure (string errMsg), virtual
UnixToClarionDate          Procedure (Real pDateTime,Long pMilli=-1),Long,Virtual
UnixToClarionTime          Procedure (Real pDateTime,Long pMilli=-1),Long,Virtual
ClarionToUnixDate          Procedure (Long pDate, Long pTime,Long pMilli=false),Real,Virtual
UtcDate                    Procedure(),Long,Virtual
UtcTime                    Procedure(),Long,Virtual
UtcNow                     Procedure(),Real,Virtual
                         End
!===================================================================!
StringFormat             Class(UnixDate), type, Module('StringTheory.clw'), Link('StringTheory.clw',StringTheoryLinkMode),DLL(StringTheoryDLLMode)
FormatValue                Procedure (String pValue,<String pPicture>,Long pFlag=0),String,Virtual
FormatDate                 Procedure (Real pValue,string pPicture,Long pFlag=0),String,Virtual
FormatDate                 Procedure (Real pValue,StringPicture pPic,Long pFlag=0),String,Virtual
Week                       Procedure (Long pValue, *Long pYear, *Long pWeek, *Long pDay),Virtual
FormatTime                 Procedure (Real pValue,string pPicture,Long pFlag=0),String,Virtual
FormatTime                 Procedure (Real pValue,StringPicture pPic,Long pFlag=0),String,Virtual
FormatTimeHours            Procedure (Real pValue,String pPicture,Long pFlag=0),String,Virtual
FormatNumber               Procedure (Real pValue,String pPicture,Long pFlag=0),String,Virtual
FormatUnixTimeStamp        Procedure (Real pValue,StringPicture pPic,Long pFlag=0),String,Virtual
FormatHex                  Procedure (String pValue,StringPicture pPic,Long pFlag=0),String,Virtual
FormatPattern              Procedure (String pValue,StringPicture pPic,Long pFlag=0),String,Virtual
                         End

!===================================================================!
StringDeformat           Class(UnixDate), type, Module('StringTheory.clw'), Link('StringTheory.clw',StringTheoryLinkMode),DLL(StringTheoryDLLMode)
Translate                  Procedure (String pText),String,Virtual
DateFromWeek               Procedure(String pWeek, Long pYear, Long pDay),Long,Virtual
DeformatValue              Procedure (String pValue,<String pPicture>),String,Virtual
DeformatScientific         Procedure (String pValue,<String pPicture>),String,Virtual
DeformatPattern            Procedure (String pValue,<String pPicture>),String,Virtual
DeformatHex                Procedure (String pValue,<String pPicture>),String,Virtual
DeformatNumber             Procedure (String pValue,<String pPicture>),String,Virtual
DeformatTimeHours          Procedure (String pValue,<String pPicture>),Real,Virtual
DeformatTime               Procedure (String pValue,<String pPicture>),Real,Virtual
DeformatDate               Procedure (String pValue,<String pPicture>),Real,Virtual
DeformatDateText           Procedure (Long pNumberofParts, String pPart1, String pPart2, String pPart3, String pSep),Real,Virtual
DeformatUnixTimeStamp      PROCEDURE (String pValue,<String pPicture>),Real,Virtual
                         End
!===================================================================!

