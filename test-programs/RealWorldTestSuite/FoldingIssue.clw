!ABCIncludeFile(ABC)
!-----------------------------------------------------------------------------!
!                                                                             !
!   CapeSoft MessageBox classes are copyright � 2022 by CapeSoft Software     !
!   Docs online at : www.capesoft.com/docs/CapesoftMessageBox/MESSAGEBOX.htm  !
!                                                                             !
!-----------------------------------------------------------------------------!

MessageBoxVersion    equate ('2.49')
MessageBox:Version   Equate (MessageBoxVersion)
MessageBox:Copyright equate ('Copyright � 2001 - 2022 by Capesoft Software')

Glo:OverMaxLen                 equate(120)
Glo:StringXPos                 equate(6)
Glo:StringSpace                equate(-2)
Glo:MinButtonWidth             equate(45)
Glo:MaxNoOfLines               equate(120)
Glo:ButtonHeight               equate(14)
Glo:Button2Bottom              equate(5)
Glo:DontShowThisAgainControl   equate(396)
Glo:Set_WavFile               equate(1)
Glo:Set_MsgLogging            equate(2)
Glo:Set_NotAgain              equate(4)
Glo:Set_SkipNext              equate(8)
Glo:Set_TimeOut               equate(16)
Glo:Set_HALink                equate(32)
Glo:Set_DontShowWin           equate(64)

equ:MaxNumberOfButtons        equate(8)
equ:MaxNumberOfStrings        equate(255)
equ:PerformCheck              equate(0)
equ:UseLocal                  equate(1)
equ:UseGlobal                 equate(2)
equ:PropertyIsStatic          equate(8)
equ:ClearGlobal               equate(16)

Glo:HKEY_LOCAL_MACHINE          EQUATE(80000002h)
Glo:HKEY_CURRENT_USER           EQUATE(80000001h)


Glo:READ_CONTROL              EQUATE(00020000h)
Glo:STANDARD_RIGHTS_READ      EQUATE(Glo:READ_CONTROL)
Glo:STANDARD_RIGHTS_WRITE     EQUATE(Glo:READ_CONTROL)

Glo:KEY_QUERY_VALUE             EQUATE(00001h)
Glo:KEY_SET_VALUE               EQUATE(00002h)
Glo:KEY_CREATE_SUB_KEY          EQUATE(00004h)
Glo:KEY_ENUMERATE_SUB_KEYS      EQUATE(00008h)
Glo:KEY_NOTIFY                  EQUATE(00010h)

Glo:KEY_READ                    EQUATE(Glo:STANDARD_RIGHTS_READ + Glo:KEY_QUERY_VALUE + Glo:KEY_ENUMERATE_SUB_KEYS + Glo:KEY_NOTIFY)
Glo:KEY_WRITE                   EQUATE(Glo:STANDARD_RIGHTS_WRITE + Glo:KEY_SET_VALUE + Glo:KEY_CREATE_SUB_KEY)

Glo:REG_OPTION_NON_VOLATILE     EQUATE(000000000h)   !!// Key is preserved

Glo:REG_SZ                       EQUATE( 1 )   !!// Unicode nul terminated string
Glo:REG_EXPAND_SZ                EQUATE( 2 )   !!// Unicode nul terminated string
                                           !!// (with environment variable references)
Glo:REG_BINARY                   EQUATE( 3 )   !!// Free form binary
Glo:REG_DWORD                    EQUATE( 4 )   !!// 32-bit number
Glo:REG_DWORD_LITTLE_ENDIAN      EQUATE( 4 )   !!// 32-bit number (same as REG_DWORD)
Glo:REG_DWORD_BIG_ENDIAN         EQUATE( 5 )   !!// 32-bit number
Glo:REG_MULTI_SZ                 EQUATE( 7 )   !!// Multiple Unicode strings

!--------------------------------------------------------------------------------
csThreadSafeMessageClass Class(),Type,Module('MessageBox.Clw'),LINK('MessageBox.Clw',_ABCLinkMode_),DLL(_ABCDllMode_)
WebSupportHere       byte          !Set in the template if in ClarioNET/Webbuilder mode or not.
ShowRepeatBar        byte
OKIcon               string(255)   !v1.75 - allow a default icon for the standard OK button
YesIcon              string(255)   !v1.75 - allow a default icon for the standard yes button
NoIcon               string(255)   !v1.75 - allow a default icon for the standard No button
AbortIcon            string(255)   !v1.75 - allow a default icon for the standard Abort button
RetryIcon            string(255)   !v1.75 - allow a default icon for the standard Retry button
IgnoreIcon           string(255)   !v1.75 - allow a default icon for the standard Ignore button
CancelIcon           string(255)   !v1.75 - allow a default icon for the standard Cancel button
HelpIcon             string(255)   !v1.75 - allow a default icon for the standard Help button
DefaultIconsOnRight  byte          !v1.75 - if clear icons on left, otherwise on right
TextYPos             long(5)       !v1.76 - allow programmer to place stuff above the text (if required)
TranslationFile      cstring(@s255)
CopyKey              long
INIFile              cstring(255)
INISection           cstring(100)
RegistryFolder       cstring(255)
RegistryKey          long
GPFHotKey            long
DateFormat           string('@d17')
ShowTimeOut          byte
NotAgainText         cstring(255)
LoggedIn             STRING(100)
LogFileName          string(252)
UseDefaultLogFile    long
ResetDontShowSetting long
DefaultButtonText    CSTRING(50),DIM(8)
TimeOutControl       Long                   ! 2.48
TimeOutText          cstring(50)            ! 2.48
LogTimer             cstring(50)
HaltHeader           cstring(50)
StopDefault          cstring(50)
StopHeader           cstring(50)
     !Properties with threaded OnlyOnce overrides
LogMessages          long
NotAgain             long
TimeOut              long
DontShowWindow       byte
HyperLink            cstring(255)
HyperLinkText        cstring(255)
PlayWavFile          CSTRING(255)
                   end

! -------------------------------------------------------------------------------------------------
csStandardMessageClass Class(),Type,Module('MessageBox.Clw'),LINK('MessageBox.Clw',_ABCLinkMode_),DLL(_ABCDllMode_)

ButtonPressed        LONG
ReturnValue          long
ButtonsSent          BYTE
ButtonYPos           long
IconWidth            LONG
NoOfButtons          LONG
DefaultButton        LONG
WinWidth             long       !Used for calculating the width of the message window
MinWinWidth          long       !Minimum width of message window.
Defaults             Long
MaxLen               LONG
FlatButtons          byte
TrnStrings           byte
FirstButton          long
PromptControlHeight  long
CenterPrompt         byte
FirstSelectEvent     byte
MessagesUsed         long
ButtonTextMaxWidth   long       !Used to check Button Text is not too long for button
ButtonHeight         long           !v1.6b - for font variations - checks that the button is high enough for the font used
ButtonText           cstring(@s100),dim(8)  !Contains the text of each button
SavedResponse        long          !v1.6d - Saves the GlobalResponse variable so that the message() procedure does not alter it
TrnButtons           byte       !v1.73 - separate property for setting the buttons to transparent.
FromProcedure        string(255)   !v1.74 - use this property to determine which procedure called the message() window - ABC, C55 and up only
FromExe              string(255)   !v1.74 - use this property to determine which EXE called the message window.
  omit('****',_MSGThreadSafe_=1)
WebSupportHere       byte       !Set in the template if in ClarioNET/Webbuilder mode or not.
ShowRepeatBar        byte
OKIcon               string(255)   !v1.75 - allow a default icon for the standard OK button
YesIcon              string(255)   !v1.75 - allow a default icon for the standard yes button
NoIcon               string(255)   !v1.75 - allow a default icon for the standard No button
AbortIcon            string(255)   !v1.75 - allow a default icon for the standard Abort button
RetryIcon            string(255)   !v1.75 - allow a default icon for the standard Retry button
IgnoreIcon           string(255)   !v1.75 - allow a default icon for the standard Ignore button
CancelIcon           string(255)   !v1.75 - allow a default icon for the standard Cancel button
HelpIcon             string(255)   !v1.75 - allow a default icon for the standard Help button
DefaultIconsOnRight  byte          !v1.75 - if clear icons on left, otherwise on right
TextYPos             long          !v1.76 - allow programmer to place stuff above the text (if required)
TranslationFile      cstring(@s255)
CopyKey              long
DefaultButtonText    CSTRING(50),DIM(8)     !
LogTimer             cstring(50)
HaltHeader           cstring(50)
StopDefault          cstring(50)
StopHeader           cstring(50)
  !****
CopyKeyTemp          long          !If CopyKey is not set, but the Style parameter is, then user CtrlC, otherwise use CopyKey

  compile('****',_MSGThreadSafe_=1)
GlobalClass          &csThreadSafeMessageClass
  !****

ButtonArray          long,dim(equ:MaxNumberOfButtons)
StringArray          string(255),dim(equ:MaxNumberOfStrings)
NoOfStrings          long
DebugOn              long
DebugSet             long
Message1               STRING(4096)
Heading                STRING(1024)
Icon1                  STRING(255)
Buttons                STRING(255)
IconControl            LONG
PromptControl          LONG
CreatedRegion          long
PromptControlWidth     LONG
_CloseAllWindows       BYTE
MinButtonWidth         long
EnableDebugLogging     long
Constructed            long
MsgMode                LONG

! Methods
Construct              PROCEDURE()
TakeEvent              PROCEDURE () ,VIRTUAL
Init                   PROCEDURE (long Reserved1=0,long Reserved2=0) ,VIRTUAL
CreateStrings          PROCEDURE () ,VIRTUAL
CreateButtons          PROCEDURE () ,VIRTUAL
SetControlProperties   PROCEDURE () ,VIRTUAL
BreakStringToQueue     PROCEDURE (string TempStr) ,VIRTUAL
ExtractStringToQueue   PROCEDURE (string TempStr,long NoOfTimes,byte MakeDoubleABar = 0) ,VIRTUAL
Kill                   PROCEDURE () ,VIRTUAL
Open                   PROCEDURE (string MessageTxt,string HeadingTxt,string IconSent,string ButtonsPar,long DefaultPar,<long StylePar>) ,VIRTUAL
SendClose              PROCEDURE () ,VIRTUAL
CheckIniEntries        PROCEDURE () ,VIRTUAL
CSLocale               PROCEDURE (STRING CSButton,<STRING ButtonText>) ,VIRTUAL
CloseNow               PROCEDURE (long pForce=0) ,VIRTUAL
Log                    PROCEDURE  (string pOutputString,long pLevel=3) ,VIRTUAL
Trace                  PROCEDURE  (string pOutputString) ,VIRTUAL
Destruct               procedure
GetGlobalSetting       procedure (string pSetting),string ,VIRTUAL
SetGlobalSetting       procedure (string pSetting, string pValue) ,VIRTUAL
AssignGlobalClass      procedure () ,VIRTUAL
ForClipboard           PROCEDURE (String pText),String,Virtual
_Wait                  procedure (long p_Count=-200) ,VIRTUAL
_Release               procedure (long p_Count=-201) ,VIRTUAL
                     END ! Class Definition

    compile('****',_MSGThreadSafe_=1)
CSMessageLogFileName    string(255),thread

CSMessageLog        File,driver('ASCII'),create,name(CSMessageLogFileName),bindable,pre(csML),thread
    !****
    omit('****',_MSGThreadSafe_=1)
CSMessageLogFileName    string(255)

CSMessageLog        File,driver('ASCII'),create,name(CSMessageLogFileName),bindable,pre(csML)
    !****
Record                Record
LogString               string(1024)
                      end
                    end
!--------------------------------------------------------------------------------
!Class csEnhancedMessageClass
!MessageBox with Capesoft's features
!--------------------------------------------------------------------------------
csEnhancedMessageClass Class(csStandardMessageClass),Type,Module('MessageBox.Clw'),LINK('MessageBox.Clw',_ABCLinkMode_),DLL(_ABCDllMode_)
  compile('****',_MSGThreadSafe_=1)
TempLogFileName      &String
  !****
  omit('****',_MSGThreadSafe_=1)
UseDefaultLogFile    long
INIFile              cstring(255)
INISection           cstring(100)
RegistryFolder       cstring(255)
RegistryKey          long
GPFHotKey            long
DateFormat           string('@d17')
HyperLink            cstring(255)
HyperLinkText        cstring(255)
TimeOut              long
ShowTimeOut          byte
LogMessages          long
PlayWavFile          CSTRING(255)
NotAgain             long
LoggedIn             STRING(100)
DontShowWindow       byte
NotAgainText         cstring(255)
StaticFeatures       long
TempLogOff           byte
LogFileName          &String
ResetDontShowSetting long
  !****
! Properties
DontShowThisAgain    long
WhoPressed           STRING(100)
StartTime            long
StartDate            long
HeadingLen           long
MessageLen           long
NotAgainCheckBox     long
LogFileOpen          long
StartTimeOut         long
TimeOutTracker       long
TimeOutControl       Long                   ! 2.48
TimeOutText          cstring(50)            ! 2.48

HAControl            long
SkipNext:Message     string(255)
SkipNext:Heading     string(255)
SkipNext:Count       long
OnlyOnce             group                     !New properties for the thread safe MSGbox
LogMessages            long
NotAgain               long
TimeOut                long
DontShowWindow         long
HyperLink              string('NOLINK {249}')
HyperLinkText          string(255)
PlayWavFile            string('NOFILE {249}')
                     end
SkipNext             long
NotAgainID           long
NotAgainDefault      long
LogFile              &File

! Methods
Construct              PROCEDURE
PreOpen                PROCEDURE (string Message1,string Heading,<long DefaultButton>),long ,VIRTUAL
Init                   PROCEDURE (long UseABCClass=0,long UseDefaultLog=0) ,VIRTUAL
TakeEvent              PROCEDURE () ,VIRTUAL
SetControlProperties   PROCEDURE () ,VIRTUAL
Open                   PROCEDURE (string MessageTxt,string HeadingTxt,string IconSent,string ButtonsPar,long DefaultPar,long StylePar) ,VIRTUAL
Close                  PROCEDURE () ,VIRTUAL
OpenLog                PROCEDURE (<string ExtraDetails>) ,VIRTUAL
CloseLog               PROCEDURE () ,VIRTUAL
GetDontShowSetting     PROCEDURE (string pEntry),long ,VIRTUAL
PutDontShowSetting     PROCEDURE (string pEntry,long pValue=1) ,VIRTUAL
SendClose              PROCEDURE () ,VIRTUAL
PrimeLog               PROCEDURE (<string ExtraDetails>) ,VIRTUAL
InsertLog              PROCEDURE (),long ,VIRTUAL
LimitLog               PROCEDURE (long LogFileLimit) ,VIRTUAL
GetEmail               PROCEDURE (STRING EAddress,STRING ESubject,STRING EApplication),string ,VIRTUAL
ActivateTimeOut        PROCEDURE () ,VIRTUAL
GetReg                 PROCEDURE (LONG pHKey, STRING sSubKeyPath, STRING sValue),? ,VIRTUAL
PutReg                 PROCEDURE (LONG pHKey,STRING sSubKeyPath, STRING sValueName, STRING sValue, LONG lType=1),byte ,VIRTUAL
RemoveIllegalINIChars  PROCEDURE (string pEntry),string ,VIRTUAL
GetGlobalSetting       procedure (string pSetting),string ,VIRTUAL
SetGlobalSetting       procedure (string pSetting, string pValue) ,VIRTUAL
                     END ! Class Definition
