

   MEMBER('IBSEmail.clw')                                  ! This is a MEMBER module


   INCLUDE('ABBROWSE.INC'),ONCE
   INCLUDE('ABPOPUP.INC'),ONCE
   INCLUDE('ABTOOLBA.INC'),ONCE
   INCLUDE('BRWEXT.INC'),ONCE
   INCLUDE('DIWindow.INC'),ONCE

                     MAP
                       INCLUDE('UPDATEEMAILSETTINGS_IBSEMAIL.INC'),ONCE        !Local module procedure declarations
                     END


    
  
!!! <summary>
!!! Generated from procedure template - Window
!!! </summary>
UpdateEmailSettings PROCEDURE (StringTheory stSettings)

                    MAP
                      UpdateBrowserView (*TClaEdgeBrowser edgeBrowser,  *StringTheory body, BOOL ShowHeaderFooter = 1)
                    END


cSettingsJson         &ctSettingsJson
stEditText            StringTheory
EditResult            LONG

DNSResult             STRING(5000)

i                     LONG
recordText            STRING(1024)
foundDKIM             BYTE
foundSPF              BYTE
foundCNAME            BYTE
txtLine               CSTRING(1024)
CNAMELINE             CSTRING(1024)
Founds1               CSTRING(1024)
Founds2               CSTRING(1024)
errMsg                CSTRING(1024)
stEmit                StringTheory
CNAMESOURCE           CSTRING(1000)
CNAMETARGET           CSTRING(1000)

TokensQueue           QUEUE(TokensQueueType).

OriginalHTML          GROUP
EmailHeader             &StringTheory
EmailFooter             &StringTheory
InvoiceHeader           &StringTheory
InvoiceFooter           &StringTheory
ARText                  &StringTheory
ARSTest                 &StringTheory
CRSText                 &StringTheory
DMText                  &StringTheory
DMSText                 &StringTheory
SMText                  &StringTheory
                      END

SharedEdgeEnv LIKE(TClaEdgeEnvironmentOptions)
udpt            UltimateDebugProcedureTracker
oHH           &tagHTMLHelp
LOC:Problem           BYTE
TABFEQ                LONG
LOC:FromAddressFormat LONG                                 ! 
LOC:UseARFileNumberInSubject LONG                          ! 
LOC:SendTestEmailTo  CSTRING(100)                          ! 
LOC:Number           LONG                                  ! 
LOC:UseSameForAllSendFrom BYTE                             ! 
LOC:UseSameForAllBCC BYTE                                  ! 
LOC:apbccto          STRING(255)                           ! 
LOC:crbccto          STRING(255)                           ! 
LOC:dmsbccto         STRING(255)                           ! 
LOC:smbccto          STRING(255)                           ! 
LOC:Sendusing        STRING('''MTP''e<160>vï<191,189,12>0eD {242}') ! 
LOC:UseSendGriAPIForinvoices BYTE                          ! 
LOC:Server           STRING(255)                           ! 
LOC:Always_tls       BYTE                                  ! 
LOC:Start_tls        BYTE                                  ! 
LOC:SSL_method       LONG(-1)                              ! 
LOC:Helo             STRING(255)                           ! 
LOC:Port             LONG                                  ! 
LOC:SingleSignon     BYTE                                  ! 
LOC:UserName         STRING(255)                           ! 
LOC:SMTPPassword     STRING(255)                           ! 
LOC:Timeout          LONG                                  ! 
LOC:Emaildomain      STRING(255)                           ! 
LOC:AllowNoReply     BYTE                                  ! 
LOC:SMTPbccAddress   STRING(255)                           ! 
LOC:SendGridbccAddress STRING(255)                         ! 
LOC:apikey           STRING(255)                           ! 
LOC:Domain           STRING(255)                           ! 
LOC:InvoiceAllowNoReply BYTE                               ! 
LOC:apibccAddress    STRING(255)                           ! 
LOC:apSendFrom       STRING(255)                           ! 
LOC:crSendFrom       STRING(255)                           ! 
LOC:dmSendFrom       STRING(255)                           ! 
LOC:smSendFrom       STRING(255)                           ! 
LOC:OverlayFile      CSTRING(256)                          ! 
LOC:ContentOffset    DECIMAL(6,2)                          ! 
RET:Saved            LONG                                  ! 
!---- Noyantis : Chilkat Wrapper - Start ----
ckTest                        CLASS(ChilkatClass)
Drop                            PROCEDURE(STRING paramDragID, STRING paramDropID),DERIVED
Event                           PROCEDURE(STRING paramEventName, <*SHORT paramReference>, <SIGNED paramOleControl>, <LONG paramCurrentEvent>),DERIVED
EventFunc                       PROCEDURE(*SHORT Reference, SIGNED OleControl, LONG CurrentEvent),DERIVED
EventFuncCommon                 PROCEDURE(*SHORT Reference, SIGNED OleControl, LONG CurrentEvent),DERIVED
Init                            PROCEDURE(),DERIVED
InitComplete                    PROCEDURE(),DERIVED
InitPrepare                     PROCEDURE(SIGNED paramOCXCtrl),DERIVED
InitResize                      PROCEDURE(),DERIVED
InitSecurity                    PROCEDURE(),DERIVED
InitTemplateSettings            PROCEDURE(),DERIVED
Keystroke                       PROCEDURE(UNSIGNED paramKeycode),DERIVED
Kill                            PROCEDURE(),DERIVED
KillComplete                    PROCEDURE(),DERIVED
ParametersReceived              PROCEDURE(),DERIVED
ProcessClones                   PROCEDURE(),DERIVED
ProcessMimics                   PROCEDURE(),DERIVED
ProcessShortcutKey              PROCEDURE(UNSIGNED pKeyCode),DERIVED
RefreshContents                 PROCEDURE(<BYTE paramForce>),DERIVED
SyncOCXHeight                   PROCEDURE(<BYTE pForce>),DERIVED
SyncOCXWidth                    PROCEDURE(<BYTE pForce>),DERIVED
TakeEvent                       PROCEDURE(SIGNED paramEvent),DERIVED
TakeNotify                      PROCEDURE(UNSIGNED paramNotifyCode, SIGNED paramThread, LONG paramParameter),DERIVED
TakeSubClassEvent               PROCEDURE(UNSIGNED paramWndHndl, UNSIGNED paramMsg, UNSIGNED paramWParam, LONG paramLParam),DERIVED
TakeTimer                       PROCEDURE(),DERIVED
TakeWindowEvent                 PROCEDURE(*WINDOW paramWindow),DERIVED
                              END
CKDkim                        CLASS(CKDkimClass)
Event                           PROCEDURE(STRING paramEventName, <*SHORT paramReference>, <SIGNED paramOleControl>, <LONG paramCurrentEvent>),DERIVED
                              END
CKDns                         CLASS(CKDnsClass)
Event                           PROCEDURE(STRING paramEventName, <*SHORT paramReference>, <SIGNED paramOleControl>, <LONG paramCurrentEvent>),DERIVED
                              END
CKJsonObject                  CLASS(CKJsonObjectClass)
Event                           PROCEDURE(STRING paramEventName, <*SHORT paramReference>, <SIGNED paramOleControl>, <LONG paramCurrentEvent>),DERIVED
                              END
ckTest_Ctrl    CSTRING(20)
ckTest_Feq     SIGNED
ckTest_Result  BYTE
!---- Noyantis : Chilkat Wrapper - End ----
BRW5::View:Browse    VIEW(EmailUsers)
                       PROJECT(EUSER:bccToUser)
                       PROJECT(EUSER:username)
                       PROJECT(EUSER:useremail)
                       PROJECT(EUSER:id)
                       PROJECT(EUSER:useraccount)
                       PROJECT(EUSER:userpassword)
                     END
Queue:Browse         QUEUE                            !Queue declaration for browse/combo box using ?List
EUSER:bccToUser        LIKE(EUSER:bccToUser)          !List box control field - type derived from field
EUSER:bccToUser_Icon   LONG                           !Entry's icon ID
EUSER:username         LIKE(EUSER:username)           !List box control field - type derived from field
EUSER:useremail        LIKE(EUSER:useremail)          !List box control field - type derived from field
EUSER:id               LIKE(EUSER:id)                 !Browse hot field - type derived from field
EUSER:useraccount      LIKE(EUSER:useraccount)        !Browse hot field - type derived from field
EUSER:userpassword     LIKE(EUSER:userpassword)       !Browse hot field - type derived from field
Mark                   BYTE                           !Entry's marked status
ViewPosition           STRING(1024)                   !Entry's view position
                     END
wbStaThread          TSTAThread                            !- Force STA mode for this thread (generated by WebBrowserControl(EasyEdge) template)
edgeARText           CLASS(TClaEdgeBrowser)
Init                         PROCEDURE(*TClaEdgeEnvironmentOptions pOptions, WINDOW pWin, SIGNED pFeq), BOOL, PROC, DERIVED
!- Obsolete method
Init                         PROCEDURE(WINDOW pWin, SIGNED pFeq, | 
                               <STRING pBrowserExecutableFolder>, | 
                               <STRING pUserDataFolder>, | 
                               <STRING pLanguage>, | 
                               <STRING pAdditionalBrowserArguments>, |
                               BOOL pAllowSingleSignOnUsingOSPrimaryAccount=FALSE, |
                               BOOL pExclusiveUserDataFolderAccess=FALSE), BOOL, PROC, DERIVED
OnExceptionThrown            PROCEDURE(STRING pExceptionType,STRING pMessage,HRESULT pHR,STRING pSource,STRING pStackTrace), DERIVED, PROTECTED
OnInitializationCompleted    PROCEDURE(), DERIVED, PROTECTED
OnInitializationFailed       PROCEDURE(STRING pSource, STRING pMessage, STRING pStackTrace, LONG pHResult), DERIVED, PROTECTED
OnControllerCreated          PROCEDURE(), DERIVED, PROTECTED
OnNavigationStarting         PROCEDURE(STRING pNavigationId, STRING pUri, BOOL isUserInitiated, BOOL isRedirected, STRING pRequestHeaders, CoreWebView2NavigationKind pKind, | 
                               *BOOL pCancel, *STRING pUserAgent, *STRING pAdditionalAllowedFrameAncestors), STRING, PROC, DERIVED, PROTECTED
OnNavigationCompleted        PROCEDURE(STRING pNavigationId, BOOL pIsSuccess, CoreWebView2WebErrorStatus pWebErrorStatus, LONG pHttpStatusCode), DERIVED, PROTECTED
OnWebMessageStringReceived   PROCEDURE(STRING pSrc, STRING pMsg, LONG pAdditionalObjectsCount), DERIVED, PROTECTED
OnWebMessageJsonReceived     PROCEDURE(STRING pSrc, STRING pMsg, LONG pAdditionalObjectsCount), DERIVED, PROTECTED
OnDocumentTitleChanged       PROCEDURE(), DERIVED, PROTECTED
OnHistoryChanged             PROCEDURE(), DERIVED, PROTECTED
OnScriptResult               PROCEDURE(STRING pScriptName, STRING pResult, STRING pException), DERIVED, PROTECTED
OnKeyDown                    PROCEDURE(BOOL pCtrl, BOOL pAlt, BOOL pShift, ULONG pModifiers, | 
                               ULONG pKeyCode, LONG pKeyValue, ULONG pKeyData, | 
                               *BOOL pSuppressKeyPress, *BOOL pHandled), DERIVED, PROTECTED
OnKeyUp                      PROCEDURE(BOOL pCtrl, BOOL pAlt, BOOL pShift, ULONG pModifiers, | 
                               ULONG pKeyCode, LONG pKeyValue, ULONG pKeyData, | 
                               *BOOL pSuppressKeyPress, *BOOL pHandled), DERIVED, PROTECTED
OnDevToolsProtocolMethodResult  PROCEDURE(STRING pMethodName, STRING pParameters, STRING pResult), DERIVED, PROTECTED
OnDevToolsProtocolMethodForSessionResult  PROCEDURE(STRING pSessionId, STRING pMethodName, STRING pParameters, STRING pResult), DERIVED, PROTECTED
OnDevToolsProtocolEventReceived PROCEDURE(STRING pEventLabel, STRING pSessionId, STRING pParameterObjectAsJson), DERIVED, PROTECTED
OnScriptDialogOpening        PROCEDURE(STRING pUri, CoreWebView2ScriptDialogKind pKind, STRING pMessage, |
                               STRING pDefaultText, *STRING pResultText, *BOOL pDoAccept), DERIVED, PROTECTED
OnFrameNavigationStarting    PROCEDURE(LONG pFrameInst, STRING pNavigationId, STRING pUri, BOOL isUserInitiated, BOOL isRedirected, | 
                               *BOOL pCancel, *STRING pAdditionalAllowedFrameAncestors), STRING, DERIVED, PROTECTED
OnFrameNavigationCompleted   PROCEDURE(LONG pFrameInst, STRING pNavigationId, BOOL pIsSuccess, CoreWebView2WebErrorStatus pWebErrorStatus, LONG pHttpStatusCode), DERIVED, PROTECTED
OnFrameCreated               PROCEDURE(LONG pFrameInst, STRING pName), DERIVED, PROTECTED
OnFrameDestroyed             PROCEDURE(LONG pFrameInst), DERIVED, PROTECTED
OnFrameContentLoading        PROCEDURE(LONG pFrameInst, STRING pNavigationId, BOOL isErrorPage), DERIVED, PROTECTED
OnFrameDOMContentLoaded      PROCEDURE(LONG pFrameInst, STRING pNavigationId), DERIVED, PROTECTED
OnFrameWebMessageStringReceived PROCEDURE(LONG pFrameInst, STRING pSrc, STRING pMsg), DERIVED, PROTECTED
OnFrameWebMessageJsonReceived   PROCEDURE(LONG pFrameInst, STRING pSrc, STRING pMsg), DERIVED, PROTECTED
OnFrameScriptResult          PROCEDURE(LONG pFrameInst, STRING pScriptName, STRING pResult), DERIVED, PROTECTED
OnFramePermissionRequested   PROCEDURE(LONG pFrameInst, STRING pUri, CoreWebView2PermissionKind pKind, |
                                  BOOL pIsUserInitiated, *CoreWebView2PermissionState pState, *BOOL pSavesInProfile, *BOOL pHandled), DERIVED, PROTECTED
OnProcessFailed              PROCEDURE(CoreWebView2ProcessFailedKind pKind, |
                               CoreWebView2ProcessFailedReason pReason, |
                               LONG pExitCode, |
                               STRING pProcessDescription, |
                               STRING pFrameInfosForFailedProcess), DERIVED, PROTECTED
OnSourceChanged              PROCEDURE(BOOL isNewDocument), DERIVED, PROTECTED
OnContentLoading             PROCEDURE(STRING pNavigationId, BOOL isErrorPage), DERIVED, PROTECTED
OnNewWindowRequested         PROCEDURE(STRING pUri, *BOOL pHandled, BOOL pIsUserInitiated, STRING pName), DERIVED, PROTECTED
OnContainsFullScreenElementChanged  PROCEDURE(), DERIVED, PROTECTED
OnWebResourceRequested       PROCEDURE(*TWebResourceRequest pRequest, *TWebResourceResponse pResponse, CoreWebView2WebResourceContext pContext), DERIVED, PROTECTED
OnWebResourceResponseReceived   PROCEDURE(TWebResourceRequest pRequest, TWebResourceResponse pResponse), DERIVED, PROTECTED
OnWindowCloseRequested       PROCEDURE(), DERIVED, PROTECTED
OnPermissionRequested        PROCEDURE(STRING pUri, CoreWebView2PermissionKind pKind, BOOL pIsUserInitiated, *CoreWebView2PermissionState pState, *BOOL pSavesInProfile, *BOOL pHandled), DERIVED, PROTECTED
OnDOMContentLoaded           PROCEDURE(STRING pNavigationId), DERIVED, PROTECTED
OnDownloadStarting           PROCEDURE(LONG pDownloadID, STRING pUri, STRING pMimeType, *BOOL pCancel, *STRING pResultFilePath, *BOOL pHandled), DERIVED, PROTECTED
OnDownloadBytesReceivedChanged  PROCEDURE(LONG pDownloadID, LONG pBytesReceived, LONG pTotalBytesToReceive), DERIVED, PROTECTED
OnDownloadStateChanged       PROCEDURE(LONG pDownloadID, CoreWebView2DownloadState pState, | 
                               CoreWebView2DownloadInterruptReason pInterruptReason), DERIVED, PROTECTED
OnScriptException            PROCEDURE(STRING pException, STRING pErrName, STRING pErrMsg), DERIVED, PROTECTED
OnNewBrowserVersionAvailable PROCEDURE(), DERIVED, PROTECTED
OnProcessInfosChanged        PROCEDURE(), DERIVED, PROTECTED
OnPrintToPdfCompleted        PROCEDURE(BOOL pIsSuccess, STRING pResultFilePath), DERIVED, PROTECTED
OnPrintToPdfStreamCompleted  PROCEDURE(*STRING pBytes), DERIVED, PROTECTED
OnPrintCompleted             PROCEDURE(CoreWebView2PrintStatus pStatus), DERIVED, PROTECTED
OnHostObjectEvent            PROCEDURE(STRING pObjectName, STRING pEventName, | 
                               STRING pParam1, STRING pParam2, STRING pParam3, STRING pParam4, STRING pParam5, |
                               STRING pParam6, STRING pParam7, STRING pParam8, STRING pParam9, STRING pParam10), STRING, DERIVED, PROTECTED
OnFrameHostObjectEvent       PROCEDURE(LONG pFrameInst, STRING pObjectName, STRING pEventName, | 
                               STRING pParam1, STRING pParam2, STRING pParam3, STRING pParam4, STRING pParam5, |
                               STRING pParam6, STRING pParam7, STRING pParam8, STRING pParam9, STRING pParam10), STRING, DERIVED, PROTECTED
OnPlayingAudioStateChanged   PROCEDURE(BOOL pIsDocumentPlayingAudio, BOOL pIsMuted), DERIVED, PROTECTED
OnDefaultDownloadDialogOpenChanged  PROCEDURE(BOOL pIsOpen), DERIVED, PROTECTED
OnBasicAuthenticationRequested  PROCEDURE(STRING pUri, STRING pChallenge, *BOOL pCancel, *STRING pUsername, *STRING pPassword), DERIVED, PROTECTED
OnStatusBarTextChanged       PROCEDURE(), DERIVED, PROTECTED
OnContextMenuRequested       PROCEDURE(CoreWebView2ContextMenuTargetKind pTargetKind, | 
                               *LONG pSelectedCommandId, *BOOL pHandled), DERIVED, PROTECTED
OnCustomItemSelected         PROCEDURE(CoreWebView2ContextMenuTargetKind pTargetKind, | 
                               STRING pLabel, BOOL pIsChecked), DERIVED, PROTECTED
OnClientCertificateRequested PROCEDURE(STRING pHost, LONG pPort, BOOL pIsProxy, | 
                               *BOOL pHandled, *BOOL pCancel, *LONG pSelectedCertIndex), DERIVED, PROTECTED
OnFavIconChanged             PROCEDURE(STRING pFaviconUri, STRING pBytes), DERIVED, PROTECTED
OnZoomFactorChanged          PROCEDURE(), DERIVED, PROTECTED
OnServerCertificateErrorDetected  PROCEDURE(CoreWebView2WebErrorStatus pErrorStatus, STRING pRequestUri, | 
                                    STRING pCertValidFrom, STRING pCertValidTo, STRING pCertSubject, STRING pCertIssuer, |
                                    STRING pCertDerEncodedSerialNumber, STRING pCertDisplayName, |
                                    *CoreWebView2ServerCertificateErrorAction pAction), DERIVED, PROTECTED
OnLaunchingExternalUriScheme    PROCEDURE(STRING pUri, STRING pInitiatingOrigin, BOOL pIsUserInitiated, *BOOL pCancel), DERIVED, PROTECTED
OnNonDefaultPermissionSettings  PROCEDURE(STRING pPermissionSettingsAsJson), DERIVED, PROTECTED
OnBrowserExtensionsChanged      PROCEDURE(), DERIVED, PROTECTED
OnNotificationReceived          PROCEDURE(STRING pSenderOrigin, *BOOL pHandled, TClaEdgeNotification pNotification), DERIVED, PROTECTED
OnNotificationCloseRequested    PROCEDURE(TClaEdgeNotification pNotification), DERIVED, PROTECTED
OnSaveAsUIShowing               PROCEDURE(STRING pContentMimeType, *STRING pSaveAsFilePath, *CoreWebView2SaveAsKind pKind, |
                                        *BOOL pSuppressDefaultDialog, *BOOL pAllowReplace, *BOOL pCancel), DERIVED, PROTECTED
OnSaveAsUIResult                PROCEDURE(STRING pSaveAsFilePath, CoreWebView2SaveAsUIResult pResult), DERIVED, PROTECTED
OnSaveFileSecurityCheckStarting PROCEDURE(STRING pDocumentOriginUri, STRING pFilePath, STRING pFileExtension, |
                                            *BOOL pSuppressDefaultPolicy, *BOOL pCancelSave), DERIVED, PROTECTED
OnScreenCaptureStarting         PROCEDURE(LONG frameInst, *BOOL pHandled, *BOOL pCancel), DERIVED, PROTECTED
OnProfileDeleted                PROCEDURE(), DERIVED, PROTECTED
OnFindCompleted                 PROCEDURE(), DERIVED, PROTECTED
OnFindMatchCountChanged         PROCEDURE(), DERIVED, PROTECTED
OnFindActiveMatchIndexChanged   PROCEDURE(), DERIVED, PROTECTED
OnUrlChanged           PROCEDURE(STRING pUrl), DERIVED, PROTECTED
                     END

edgeARText_env                LIKE(TClaEdgeEnvironmentOptions) !- Environment options for edgeARText

SimTreeQueue  Queue
TqData            Long
              End
QuickWindow          WINDOW('Communication Settings'),AT(,,531,383),FONT('Segoe UI',8,,FONT:regular,CHARSET:DEFAULT), |
  AUTO,CENTER,ICON('settings.ico'),GRAY,IMM,SYSTEM
                       REGION,AT(171,58,355,267),USE(?rgnARText)
                       BUTTON('Edit'),AT(494,329,32,14),USE(?btnEditARText),FONT(,,,FONT:regular)
                       SHEET,AT(164,34,365,322),USE(?sheetEmailing)
                         TAB('Emailing/SMTP Settings'),USE(?tabSMTP)
                           SHEET,AT(164,34,365,322),USE(?sheetemailsettings)
                             TAB('General'),USE(?TabGeneral)
                               PROMPT('Company Email Domain:'),AT(171,41),USE(?LOC:Domain:Prompt),TRN
                               ENTRY(@s100),AT(263,41,240,10),USE(LOC:Emaildomain)
                               PROMPT('BCC User Name all emails To (Leave blank for none)'),AT(171,57,90,17),USE(?SMTPbccAddress:Prompt),TRN
                               STRING('@somedomain.com'),AT(365,63),USE(?StringBCCAtDomain),TRN
                               ENTRY(@s255),AT(263,63,99,10),USE(LOC:SMTPbccAddress),RIGHT
                               PROMPT('Format Of Send From Address:'),AT(171,86,124,10),USE(?LOC:FromAddressFormat:Prompt),TRN
                               LIST,AT(173,100,331,13),USE(LOC:FromAddressFormat),LEFT(1),HSCROLL,DROP(5)
                             END
                             TAB('SMTP Settings'),USE(?tabemailSettingsSMTP)
                               PROMPT('Send Using:'),AT(173,66),USE(?LOC:Sendusing:Prompt),TRN
                               COMBO(@s255),AT(219,63,81,12),USE(LOC:Sendusing),DROP(3),FROM('SMTP|SendGrid'),READONLY
                               IMAGE('SMTPBanner.jpg'),AT(175,35,90,27),USE(?imgSMTPBanner)
                               PROMPT('Server:'),AT(172,82,27),USE(?PromptServer),TRN
                               ENTRY(@s128),AT(216,84,127,10),USE(LOC:Server),REQ,TIP('SMTP Server Address')
                               PROMPT('Helo (Optional):'),AT(347,82),USE(?PromptHelo),TRN
                               ENTRY(@s35),AT(404,84,87,10),USE(LOC:Helo)
                               GROUP('Account'),AT(172,100,336,60),USE(?grpAccount),BOXED,TRN
                                 CHECK('Use a single signon for all emails being sent from this program'),AT(181,114,231),USE(LOC:SingleSignon), |
  LEFT,TRN
                                 PROMPT('User Name:'),AT(181,129),USE(?PromptUserName),TRN
                                 ENTRY(@s128),AT(225,129,277,10),USE(LOC:UserName)
                                 PROMPT('Password'),AT(181,145),USE(?PromptPassword),TRN
                                 ENTRY(@s255),AT(225,142,277,10),USE(LOC:SMTPPassword)
                               END
                               PROMPT('Security Method:'),AT(172,167),USE(?LOC:SSL_method:Prompt),TRN
                               LIST,AT(235,165,127,12),USE(LOC:SSL_method),LEFT(1),DROP(6),FROM('Any TLS|#-1|TLS V1.0|' & |
  '#3|TLS V1.1|#4|TLS V1.2|#5|TLS V1.3|#6')
                               PROMPT('Port'),AT(367,167),USE(?PromptPort),TRN
                               ENTRY(@n6),AT(387,167,35,10),USE(LOC:Port)
                               PROMPT('Timeout:'),AT(427,167),USE(?PromptTimeout),TRN
                               ENTRY(@n6),AT(459,167,35,10),USE(LOC:Timeout)
                               CHECK('Always TLS'),AT(182,199),USE(LOC:Always_tls),LEFT,TRN
                               CHECK('Start TLS'),AT(255,199),USE(LOC:Start_tls),LEFT,TRN
                               ENTRY(@s99),AT(243,226,167,10),USE(LOC:SendTestEmailTo)
                               PROMPT('Send Test Email To:'),AT(173,226),USE(?LOC:SendTestEmailTo:Prompt),TRN
                               BUTTON('Test Settings'),AT(413,220,69,17),USE(?btnTestEmail),LEFT,ICON('Email.ico'),SKIP
                               BUTTON('Test Sendgrid DNS'),AT(318,62),USE(?BUTTON1)
                             END
                             TAB('Header for emails'),USE(?tabHeader)
                             END
                             TAB('Footer for emails'),USE(?tabFooter)
                             END
                           END
                         END
                         TAB('Invoices'),USE(?tabInvoicing)
                           SHEET,AT(164,34,365,322),USE(?sheetInvoicing)
                             TAB('General Invoice Settings'),USE(?tabAddresses)
                               GROUP('Send Emails From User Names'),AT(175,50,346,89),USE(?grpSendFrom),BOXED,TRN
                                 CHECK('Use noreply@:'),AT(185,60),USE(LOC:InvoiceAllowNoReply),LEFT,TRN
                                 CHECK('Use Same for All Modules'),AT(354,60),USE(LOC:UseSameForAllSendFrom),LEFT,TRN
                                 PROMPT('Accounts Receivable:'),AT(183,74),USE(?LOC:apSendFrom:Prompt),TRN
                                 ENTRY(@s255),AT(295,74,99,10),USE(LOC:apSendFrom),RIGHT
                                 STRING('@somedomain.com'),AT(398,74),USE(?StringarSendFrom),TRN
                                 PROMPT('Commercial Record Storage:'),AT(183,90),USE(?LOC:crSendFrom:Prompt),TRN
                                 ENTRY(@s255),AT(295,90,99,10),USE(LOC:crSendFrom),RIGHT
                                 STRING('@somedomain.com'),AT(398,90),USE(?StringcrSendFrom),TRN
                                 PROMPT('Dispatch:'),AT(183,106),USE(?LOC:dmSendFrom:Prompt),TRN
                                 ENTRY(@s255),AT(295,106,99,10),USE(LOC:dmSendFrom),RIGHT
                                 STRING('@somedomain.com'),AT(398,106),USE(?StringdmSendFrom),TRN
                                 PROMPT('Storage Manager:'),AT(183,122),USE(?LOC:smSendFrom:Prompt),TRN
                                 ENTRY(@s255),AT(295,122,99,10),USE(LOC:smSendFrom),RIGHT
                                 STRING('@somedomain.com'),AT(398,122),USE(?StringsmSendFrom),TRN
                               END
                               GROUP('BCC Addresses User Names (Leave blank for none)'),AT(175,145,346,89),USE(?grpBcc),BOXED,TRN
                                 CHECK('Use Same for All Modules'),AT(185,155),USE(LOC:UseSameForAllBCC),LEFT,TRN
                                 PROMPT('Accounts Receivable BCC:'),AT(183,170),USE(?LOC:apbccto:Prompt),TRN
                                 ENTRY(@s255),AT(295,170,99,10),USE(LOC:apbccto),RIGHT
                                 STRING('@somedomain.com'),AT(398,170),USE(?StringarSendFromBCC),TRN
                                 PROMPT('Commercial Record Storage BCC:'),AT(183,186),USE(?LOC:crbccto:Prompt),TRN
                                 ENTRY(@s255),AT(295,186,99,10),USE(LOC:crbccto),RIGHT
                                 STRING('@somedomain.com'),AT(398,186),USE(?StringcrSendFromBCC),TRN
                                 PROMPT('Dispatch BCC:'),AT(183,202),USE(?LOC:dmsbccto:Prompt),TRN
                                 ENTRY(@s255),AT(295,202,99,10),USE(LOC:dmsbccto),RIGHT
                                 STRING('@somedomain.com'),AT(398,202),USE(?StringdmSendFromBCC),TRN
                                 PROMPT('Storage Manager BCC:'),AT(183,218),USE(?LOC:smbccto:Prompt),TRN
                                 ENTRY(@s255),AT(295,218,99,10),USE(LOC:smbccto),RIGHT
                                 STRING('@somedomain.com'),AT(398,218),USE(?StringsmSendFromBCC),TRN
                               END
                               GROUP('Other Settings'),AT(175,245,346,110),USE(?grpOtherSettings),BOXED,TRN
                                 CHECK('Use AR File Number In Subject:'),AT(185,260),USE(LOC:UseARFileNumberInSubject),LEFT,TRN
                                 PROMPT('Overlay File*:'),AT(185,280),USE(?LOC:OverlayFile:Prompt),FONT(,,,FONT:bold),TRN
                                 ENTRY(@s255),AT(238,279,227,10),USE(LOC:OverlayFile)
                                 PROMPT('Note: this must be a network-accessible path available to all users.'),AT(238,291, |
  227,8),USE(?LOC:OverlayFileNote),FONT('Segoe UI',8,,FONT:italic),TRN
                                 PROMPT('Content Offset (Down):'),AT(185,304),USE(?LOC:ContentOffset:Prompt),TRN
                                 ENTRY(@n-9.2),AT(274,304,46,10),USE(LOC:ContentOffset),RIGHT
                               END
                             END
                             TAB('Send Grid Settings'),USE(?tabSendGrid),HIDE
                               IMAGE('SendGridBanner.jpg'),AT(171,96,90,27),USE(?imgSendGridBanner)
                               PROMPT('API Key'),AT(171,127),USE(?apikey:Prompt),TRN
                               ENTRY(@s255),AT(261,128,231,10),USE(LOC:apikey)
                               PROMPT('bcc Address:'),AT(171,144),USE(?LOC:SendGridbccAddress:Prompt),TRN
                               ENTRY(@s255),AT(261,143,231,10),USE(LOC:SendGridbccAddress)
                               ENTRY(@s255),AT(261,158,231,10),USE(LOC:Domain)
                               PROMPT('Domain:'),AT(172,158),USE(?Domain:Prompt:2),TRN
                             END
                             TAB('Header For Invoice'),USE(?tabInvoiceHeader)
                             END
                             TAB('Footer for Invoice'),USE(?tabInvoiceFooter)
                             END
                             TAB('Accounts Receivable Email'),USE(?TABAPText)
                             END
                             TAB('Accounts Receivable Summary Email'),USE(?TABARSText)
                             END
                             TAB('Commercial Record Storage Email'),USE(?TABCRText)
                             END
                             TAB('Dispatch Manager Email'),USE(?TABDMText)
                             END
                             TAB('Dispatch Manager Summary Email'),USE(?TABDMSText)
                             END
                             TAB('Storage Manager Email'),USE(?TABSMText)
                             END
                           END
                         END
                         TAB('User Settings'),USE(?tabUsers)
                           LIST,AT(174,43,343,289),USE(?List),HVSCROLL,FORMAT('32L(2)|MJ~BCC on~@p p@87L(2)|M~Name' & |
  '~@s255@1020L(2)|M~Email Address~@s255@'),FROM(Queue:Browse),IMM
                           BUTTON('&Delete'),AT(431,337,42,12),USE(?btnDelete),HIDE
                           BUTTON('&Change'),AT(475,337,42,12),USE(?Change)
                         END
                       END
                       BUTTON('&OK'),AT(425,361,49,17),USE(?OK),LEFT,ICON('OK.ICO'),DEFAULT,MSG('Accept data a' & |
  'nd close the window'),TIP('Accept data and close the window')
                       BUTTON('&Cancel'),AT(478,361,49,17),USE(?Cancel),LEFT,ICON('CANCEL.ICO'),MSG('Cancel operation'), |
  TIP('Cancel operation')
                       LIST,AT(3,2,157,353),USE(?TabTree),VSCROLL
                       IMAGE,AT(164,1,367,30),USE(?DrawHeaderImage),TILED
                     END

BRW5::LastSortOrder       BYTE
BRW5::SortHeader  CLASS(SortHeaderClassType) !Declare SortHeader Class
QueueResorted          PROCEDURE(STRING pString),VIRTUAL
                  END
    omit('***',WE::CantCloseNowSetHereDone=1)  !Getting Nested omit compile error, then uncheck the "Check for duplicate CantCloseNowSetHere variable declaration" in the WinEvent local template
WE::CantCloseNowSetHereDone equate(1)
WE::CantCloseNowSetHere     long
    !***
ThisWindow           CLASS(DirectWindowManager)
Init                   PROCEDURE(),BYTE,PROC,DERIVED
Kill                   PROCEDURE(),BYTE,PROC,DERIVED
Run                    PROCEDURE(USHORT Number,BYTE Request),BYTE,PROC,DERIVED
SetAlerts              PROCEDURE(),DERIVED
TakeAccepted           PROCEDURE(),BYTE,PROC,DERIVED
TakeEvent              PROCEDURE(),BYTE,PROC,DERIVED
TakeNewSelection       PROCEDURE(),BYTE,PROC,DERIVED
TakeWindowEvent        PROCEDURE(),BYTE,PROC,DERIVED
                     END

Toolbar              ToolbarClass
! ----- ThisTabTree7 --------------------------------------------------------------------------
ThisTabTree7         Class(TabTree)
                     End  ! ThisTabTree7
! ----- end ThisTabTree7 -----------------------------------------------------------------------
! ----- ThisPassPaste --------------------------------------------------------------------------
ThisPassPaste        Class(PassPaste)
    ! derived method declarations
Paste                  PROCEDURE (Long pField),Virtual
                     End  ! ThisPassPaste
! ----- end ThisPassPaste -----------------------------------------------------------------------
! ----- ThisListManager:LOC:FromAddressFormat --------------------------------------------------------------------------
ThisListManager:LOC:FromAddressFormat Class(ListManager)
                     End  ! ThisListManager:LOC:FromAddressFormat
! ----- end ThisListManager:LOC:FromAddressFormat -----------------------------------------------------------------------
! ----- ThisListManager:LOC:SSL_method --------------------------------------------------------------------------
ThisListManager:LOC:SSL_method Class(ListManager)
                     End  ! ThisListManager:LOC:SSL_method
! ----- end ThisListManager:LOC:SSL_method -----------------------------------------------------------------------
! ----- ThisListManager:List --------------------------------------------------------------------------
ThisListManager:List Class(ListManager)
                     End  ! ThisListManager:List
! ----- end ThisListManager:List -----------------------------------------------------------------------
BRW5                 CLASS(BrowseClass)                    ! Browse using ?List
Q                      &Queue:Browse                  !Reference to browse queue
Init                   PROCEDURE(SIGNED ListBox,*STRING Posit,VIEW V,QUEUE Q,RelationManager RM,WindowManager WM)
SetQueueRecord         PROCEDURE(),DERIVED
SetSort                PROCEDURE(BYTE NewOrder,BYTE Force),BYTE,PROC,DERIVED
                     END

! ----- drh --------------------------------------------------------------------------
drh                  Class(DrawHeader)
                     End  ! drh
! ----- end drh -----------------------------------------------------------------------

  CODE
? DEBUGHOOK(AACompanyName:Record)
? DEBUGHOOK(AAUserName:Record)
? DEBUGHOOK(EmailUsers:Record)
  GlobalResponse = ThisWindow.Run()                        ! Opens the window and starts an Accept Loop
  RETURN(RET:Saved)

!---------------------------------------------------------------------------
DefineListboxStyle ROUTINE
!|
!| This routine create all the styles to be shared in this window
!| It`s called after the window open
!|
!---------------------------------------------------------------------------
! ------------------------------------------------------------------------
RebuildSimtreeQueue                routine        !For backward compatibility from SimTabTree
  do RebuildTabTreeQueue:7
RebuildTabTreeQueue:7     routine
  ThisTabTree7.BuildQueue()
  ThisTabTree7.Select()
EnableDisableOnSendGrid ROUTINE
  ?LOC:SMTPPassword{PROP:Password} = true
  CASE LOC:Sendusing
  OF 'SendGrid'
    DO SetLocalsToSendgrid
    ?LOC:UserName{PROP:Password} = FALSE

    DISABLE(?LOC:Server)
    HIDE(?LOC:Helo)
    HIDE(?PromptHelo)
    DISABLE(?LOC:SingleSignon)
    DISABLE(?LOC:Port)
    DISABLE(?LOC:Timeout)
    DISABLE(?LOC:Always_tls)
    DISABLE(?LOC:Start_tls)
    DISABLE(?LOC:SSL_method)
    DISABLE(?LOC:UserName)
    POST(Event:NewSelection, ?LOC:SSL_method)
  OF 'Postmark'
    DO SetLocalsToPostmark
    ENABLE(?LOC:UserName)
    ?LOC:UserName{PROP:Password} = TRUE
    DISABLE(?LOC:Server)
    HIDE(?LOC:Helo)
    HIDE(?PromptHelo)
    DISABLE(?LOC:SingleSignon)
    DISABLE(?LOC:Port)
    DISABLE(?LOC:Timeout)
    DISABLE(?LOC:Always_tls)
    DISABLE(?LOC:Start_tls)
    DISABLE(?LOC:SSL_method)
    POST(Event:NewSelection, ?LOC:SSL_method)
  ELSE
      ?LOC:UserName{PROP:Password} = FALSE
    ENABLE(?LOC:UserName)
    ENABLE(?LOC:Server)
    UNHIDE(?LOC:Helo)
    UNHIDE(?PromptHelo)
    ENABLE(?LOC:SingleSignon)
    ENABLE(?LOC:Port)
    ENABLE(?LOC:Timeout)
    ENABLE(?LOC:Always_tls)
    ENABLE(?LOC:Start_tls)
    ENABLE(?LOC:SSL_method)
    ENABLE(?LOC:UserName)
  END
  DO SingleSignonDisplay

SetLocalsToPostmark ROUTINE

  LOC:Server = 'smtp.postmarkapp.com'
  LOC:SingleSignon = TRUE
  LOC:Port=  587
  LOC:Timeout = 0
  LOC:Always_tls = 0
  LOC:Start_tls = TRUE
  LOC:SSL_method = - 1
SetLocalsToSendGrid ROUTINE

  LOC:Server = 'smtp.sendgrid.net'
  LOC:SingleSignon = TRUE
  LOC:UserName = 'apikey'
  LOC:Port=  587
  LOC:Timeout = 0
  LOC:Always_tls = 0
  LOC:Start_tls = TRUE
  LOC:SSL_method = - 1
  DISABLE(?LOC:UserName)
FillSettings        ROUTINE
  data 
stdbg   StringTheory
  CODE
  
  LOC:Problem = true
  
  IF cSettingsJson.LoadQueue(stSettings, GVF:CompanyID) = Level:Benign
  !StringTheoryToSettings(stSettings,EmailCompany)
 ! Load From a StringTheory object
    IF OriginalHTML.EmailHeader &= NULL
      OriginalHTML.EmailHeader &= NEW StringTheory
      OriginalHTML.EmailHeader.SetValue(cSettingsJson.GetDefaultsEmailheadertext())
    END

    IF OriginalHTML.EmailFooter &= NULL
      OriginalHTML.EmailFooter &= NEW StringTheory 
        OriginalHTML.EmailFooter.SetValue(cSettingsJson.GetDefaultsEmailfootertext())
    END

    IF OriginalHTML.InvoiceHeader &= NULL
      OriginalHTML.InvoiceHeader &= NEW StringTheory
      OriginalHTML.InvoiceHeader.SetValue(cSettingsJson.GetInvoicingInvoiceheader())
    END

    IF OriginalHTML.InvoiceFooter &= NULL
      OriginalHTML.InvoiceFooter &= NEW StringTheory
      OriginalHTML.InvoiceFooter.SetValue(cSettingsJson.GetInvoicingInvoiceFooter())
    END

    IF OriginalHTML.ARText &= NULL
      OriginalHTML.ARText &= NEW StringTheory
      OriginalHTML.ARText.SetValue(cSettingsJson.GetInvoicingAptext())
    END

    IF OriginalHTML.ARSTest &= NULL
      OriginalHTML.ARSTest &= NEW StringTheory
      OriginalHTML.ARSTest.SetValue(cSettingsJson.GetInvoicingARStext())
    END

    IF OriginalHTML.CRSText &= NULL
      OriginalHTML.CRSText &= NEW StringTheory
      OriginalHTML.CRSText.SetValue(cSettingsJson.GetInvoicingCrtext())
    END

    IF OriginalHTML.DMText &= NULL
      OriginalHTML.DMText &= NEW StringTheory
      OriginalHTML.DMText.SetValue(cSettingsJson.GetInvoicingDMtext())
    END

    IF OriginalHTML.DMSText &= NULL
      OriginalHTML.DMSText &= NEW StringTheory
      OriginalHTML.DMSText.SetValue(cSettingsJson.GetInvoicingDMStext())
    END

    IF OriginalHTML.SMText &= NULL
      OriginalHTML.SMText &= NEW StringTheory
      OriginalHTML.SMText.SetValue(cSettingsJson.GetInvoicingSMtext())
    END

    
    LOC:SendUsing = cSettingsJson.GetDefaultsSendusing()
    If LOC:SendUsing = '' THEN LOC:SendUsing = 'SMTP'.
    LOC:SingleSignon = cSettingsJson.GetSmtpSinglesignon()
    LOC:UserName = cSettingsJson.GetSinglesignonsettingsUsername()
    LOC:SMTPPassword = cSettingsJson.GetSinglesignonsettingsSmtppassword()
    LOC:Server = cSettingsJson.GetServersettingsServer()
    LOC:EmailDomain = cSettingsJson.GetSmtpEmaildomain()
    LOC:Always_tls = cSettingsJson.GetServersettingsAlwaystls()
    LOC:Start_tls= cSettingsJson.GetServersettingsStarttls()
    LOC:SSL_method = cSettingsJson.GetServersettingsSslmethod()
    LOC:Helo  = cSettingsJson.GetServersettingsHelo()
    LOC:Port = cSettingsJson.GetServersettingsPort()
    LOC:SMTPbccAddress = cSettingsJson.GetSmtpSmtpbccaddress()

    LOC:SendGridbccAddress = cSettingsJson.GetSendgridapiApibccaddress()
    LOC:apikey = cSettingsJson.GetSendgridapiApikey()
    LOC:Domain = cSettingsJson.GetSendgridapiDomain()

    LOC:InvoiceAllowNoReply = cSettingsJson.GetInvoicingAllownoreply()
    LOC:UseSameForAllSendFrom = cSettingsJson.GetInvoicingUsesameforallsendfrom()
    LOC:apSendFrom = cSettingsJson.GetInvoicingApsendfrom()
    LOC:crSendFrom = cSettingsJson.GetInvoicingCrsendfrom()
    LOC:dmSendFrom = cSettingsJson.GetInvoicingDmssendfrom()
    LOC:smSendFrom = cSettingsJson.GetInvoicingSmsendfrom()

    LOC:UseSameForAllBCC = cSettingsJson.GetInvoicingUsesameforallbcc()
    LOC:apbccto = cSettingsJson.GetInvoicingApbccto()
    LOC:crbccto = cSettingsJson.GetInvoicingCrbccto()
    LOC:dmsbccto = cSettingsJson.GetInvoicingDmsbccto()
    LOC:smbccto = cSettingsJson.GetInvoicingSmbccto()
    
    
    
    LOC:UseARFileNumberInSubject = cSettingsJson.GetUseARFileNumber()
    LOC:OverlayFile = cSettingsJson.GetOverlayFile()
    LOC:ContentOffset = cSettingsJson.GetContentOffset()
!    ?ARSText{prop:text} = cSettingsJson.GetInvoicingARStext()
    !?CRText{prop:text} = cSettingsJson.GetInvoicingCrtext()
    !?DMText{prop:text} = cSettingsJson.GetInvoicingDMtext()
!    ?DMSText{prop:text} = cSettingsJson.GetInvoicingDMStext()
!    ?SMText{prop:text} = cSettingsJson.GetInvoicingSMtext()

    !?EmailHeaderText{prop:text} = cSettingsJson.GetDefaultsEmailheadertext()
    
!    ?EmailFooterText{prop:text} = cSettingsJson.GetDefaultsEmailfootertext()
    IF cSettingsJson.GetFromAddressFormat() = 0 Then
      cSettingsJson.SetFromAddressFormat(1)
    END
    LOC:FromAddressFormat = cSettingsJson.GetFromAddressFormat()
  ELSE
    message('Unable to find email settings in json, returning to menu')
    post(EVENT:CloseWindow)
    exit

  END
  stDbg.Trace('After most settings')
  Do UpdateUsersQ
  stDbg.Trace('After UpdateUsersQ')
  DO EnableDisableOnSendGrid
  stDbg.Trace('After EnableDisableOnSendGrid')
  DO UpdatedomainAt
  stDbg.Trace('After UpdatedomainAt')
UpdateDomainAt      ROUTINE
  IF LOC:Emaildomain <> ''
    ?LOC:FromAddressFormat{PROP:From} = cSettingsJson.GetFromFormat(GVF:UserSystemID)
    ?StringBCCAtDomain{prop:text} = '@' & CLIP(LOC:Emaildomain)
    ?StringarSendFrom{prop:text} = '@' & CLIP(LOC:Emaildomain)
    ?StringcrSendFrom{prop:text} = '@' & CLIP(LOC:Emaildomain)
    ?StringdmSendFrom{prop:text} = '@' & CLIP(LOC:Emaildomain)
    ?StringsmSendFrom{prop:text} = '@' & CLIP(LOC:Emaildomain)

    ?StringarSendFromBCC{prop:text} = '@' & CLIP(LOC:Emaildomain)
    ?StringcrSendFromBCC{prop:text} = '@' & CLIP(LOC:Emaildomain)
    ?StringdmSendFromBCC{prop:text} = '@' & CLIP(LOC:Emaildomain)
    ?StringsmSendFromBCC{prop:text} = '@' & CLIP(LOC:Emaildomain)
  ELSE
    ?StringBCCAtDomain{prop:text} = '@somedomain.com'
    ?StringarSendFrom{prop:text} = '@somedomain.com'
    ?StringcrSendFrom{prop:text} = '@somedomain.com'
    ?StringdmSendFrom{prop:text} = '@somedomain.com'
    ?StringsmSendFrom{prop:text} = '@somedomain.com'

    ?StringarSendFromBCC{prop:text} = '@somedomain.com'
    ?StringcrSendFromBCC{prop:text} = '@somedomain.com'
    ?StringdmSendFromBCC{prop:text} = '@somedomain.com'
    ?StringsmSendFromBCC{prop:text} = '@somedomain.com'
  END

CancelSettings       ROUTINE
  cSettingsJson.SetDefaultsEmailHeaderText(OriginalHTML.EmailHeader.GetValue())
  cSettingsJson.SetDefaultsEmailFooterText(OriginalHTML.EmailFooter.GetValue())

  cSettingsJson.SetInvoicingInvoiceHeader(OriginalHTML.InvoiceHeader.GetValue())
  cSettingsJson.SetInvoicingInvoiceFooter(OriginalHTML.InvoiceFooter.GetValue())

  cSettingsJson.SetInvoicingApText(OriginalHTML.ARText.GetValue())
  cSettingsJson.SetInvoicingARSText(OriginalHTML.ARSTest.GetValue())
  cSettingsJson.SetInvoicingCrText(OriginalHTML.CRSText.GetValue())
  cSettingsJson.SetInvoicingDmText(OriginalHTML.DMText.GetValue())
  cSettingsJson.SetInvoicingDMSText(OriginalHTML.DMSText.GetValue())
  cSettingsJson.SetInvoicingSmText(OriginalHTML.SMText.GetValue())


SaveSettings        ROUTINE

  LOC:Problem = true
  !Find correct company
  IF cSettingsJson.SetToCompanyRecord(GVF:CompanyID) = Level:Benign
     !Clear the user queue and fill from table.
    IF NOT cSettingsJson.IsUsersInit()
      cSettingsJson.InitUsers()

    ELSE
      cSettingsJson.FreeUsers()
    END
    SET(EmailUsers)
    LOOP Until Access:EmailUsers.Next()
      cSettingsJson.AddUser(EUSER:id, EUSER:bccToUser, EUSER:useraccount, EUSER:useremail, EUSER:username, EUSER:userpassword, EUSER:OverrideSendGrid)
    END

    AAA:CompanyID = GVF:CompanyID
    IF Access:AACompanyName.Fetch(AAA:KeyCompany) = Level:Benign
      cSettingsJson.SetCompanyname(AAA:CompanyName)
    END
    cSettingsJson.SetFromAddressFormat(LOC:FromAddressFormat)
    cSettingsJson.SetDefaultsSendusing(LOC:SendUsing)
    cSettingsJson.SetSmtpSinglesignon(LOC:SingleSignon)
    cSettingsJson.SetSinglesignonsettingsUsername(LOC:UserName)
    cSettingsJson.SetSinglesignonsettingsSmtppassword(LOC:SMTPPassword)
    cSettingsJson.SetServersettingsServer(LOC:Server)
    cSettingsJson.SetSmtpEmaildomain(LOC:EmailDomain)
    cSettingsJson.SetServersettingsAlwaystls(LOC:Always_tls)
    cSettingsJson.SetServersettingsStarttls(LOC:Start_tls)
    cSettingsJson.SetServersettingsSslmethod(LOC:SSL_method)
    cSettingsJson.SetServersettingsHelo(LOC:Helo)
    cSettingsJson.SetServersettingsPort(LOC:Port)
    cSettingsJson.SetSmtpSmtpbccaddress(LOC:SMTPbccAddress)
    cSettingsJson.SetSendgridapiApibccaddress(LOC:SendGridbccAddress)
    cSettingsJson.SetSendgridapiApikey(LOC:apikey)
    cSettingsJson.SetSendgridapiDomain(LOC:Domain)
    cSettingsJson.SetInvoicingAllownoreply(LOC:InvoiceAllowNoReply)
    cSettingsJson.SetInvoicingUsesameforallsendfrom(LOC:UseSameForAllSendFrom)
    cSettingsJson.SetInvoicingApsendfrom(LOC:apSendFrom)
    cSettingsJson.SetInvoicingCrsendfrom(LOC:crSendFrom)
    cSettingsJson.SetInvoicingDmssendfrom(LOC:dmSendFrom)
    cSettingsJson.SetInvoicingSmsendfrom(LOC:smSendFrom)
    cSettingsJson.SetInvoicingUsesameforallbcc(LOC:UseSameForAllBCC)
    cSettingsJson.SetInvoicingApbccto(LOC:apbccto)
    cSettingsJson.SetInvoicingCrbccto(LOC:crbccto)
    cSettingsJson.SetInvoicingDmsbccto(LOC:dmsbccto)
    cSettingsJson.SetInvoicingsmbccto(LOC:smbccto)
!    cSettingsJson.SetInvoicingInvoiceheader(ckeInvoiceHeader.GetData())
!    cSettingsJson.SetInvoicingInvoicefooter(ckeInvoiceFooter.GetData())
!    cSettingsJson.SetInvoicingAptext(?ARText{prop:text})
    cSettingsJson.SetUseARFileNumber(LOC:UseARFileNumberInSubject)
    cSettingsJson.SetOverlayFile(LOC:OverlayFile)
    cSettingsJson.SetContentOffSet(LOC:ContentOffset)
!    cSettingsJson.SetInvoicingARstext(?ARSText{prop:text})
    !cSettingsJson.SetInvoicingCrtext(?CRText{prop:text})
!    cSettingsJson.SetInvoicingDmtext(?DMText{prop:text})
!    cSettingsJson.SetInvoicingDmstext(?DMsText{prop:text})
!    cSettingsJson.SetInvoicingSmText(?SMText{prop:text})
!    cSettingsJson.SetDefaultsEmailheadertext(CLIP(cke1.GetData()))
!    cSettingsJson.SetDefaultsEmailfootertext(CLIP(cke2.GetData()))
    cSettingsJson.UpdateEmailCompany()

  END

  SyncQueueToCompany(cSettingsJson.GetUserQ())
  cSettingsJson.SaveQueue()
  stSettings.SetValue(cSettingsJson.stSettings)
  thisStartup.PutGlobalSetting('SMTPV2','Set',stSettings)
  !SettingsToStringTheory(stSettings, cSettingsJson.EmailCompany)
UpdateUsersQ        ROUTINE
  DATA
UserQ   &usersQueueType
stuq StringTheory
  CODE
  stuq.Trace('Before Sync')
  SyncCompanyToQueue(cSettingsJson.GetUserQ())!cSettingsJson.EmailCompany.smtp.users)
  stuq.Trace('After Sync')
  SET(EmailUsers)
  LOOP UNTIL Access:EmailUsers.Next()
    Access:EmailUsers.DeleteRecord(0)
  END
  UserQ &= cSettingsJson.GetUserQ()
  LOOP a# = 1 to Records(UserQ)
    Get(UserQ, a#)
    IF NOT ErrorCode()
      EUSER:bccToUser =  UserQ.bccToUser!cSettingsJson.emailcompany.smtp.users.bccToUser
      EUSER:id = UserQ.id!cSettingsJson.emailcompany.smtp.users.id
      EUSER:useraccount = UserQ.useraccount!cSettingsJson.emailcompany.smtp.users.useraccount
      EUSER:useremail = UserQ.useremail!cSettingsJson.emailcompany.smtp.users.useremail
      EUSER:username = UserQ.username!cSettingsJson.emailcompany.smtp.users.username
      EUSER:userpassword = UserQ.userpassword!cSettingsJson.emailcompany.smtp.users.userpassword
      EUSER:OverrideSendGrid = UserQ.OverideSendGrid!cSettingsJson.emailCompany.smtp.users.OverideSendGrid
      Access:EmailUsers.TryInsert()
    END

    
  END
  BRW5.ResetFromFile()
  stuq.Trace('Bottom of UpdateUsersQ')
UpdateUserFromSave  ROUTINE
  DATA
UserQ   &usersQueueType
  CODE

  SET(EmailUsers)
  LOOP until Access:EmailUsers.Next()
    !Update the backend first
    AAD:SystemID = EUSER:id
    IF Access:AAUserName.Fetch(AAD:KeySystemID) = Level:Benign
      IF EUSER:useremail <> AAD:EmailAddress
        AAD:EmailAddress = EUSER:useremail
        Access:AAUserName.TryUpdate()
      END
    END
    UserQ &= cSettingsJson.GetUserQ()
    UserQ.ID = EUSER:id
    Get(UserQ, +UserQ.ID)
    IF NOT Errorcode()
      UserQ.bccToUser = EUSER:bccToUser
      UserQ.UserAccount = EUSER:useraccount
      UserQ.UserEmail = EUSER:useremail
      UserQ.UserPassword = EUSER:userpassword
      UserQ.OverideSendGrid = EUSER:OverrideSendGrid
      PUT(UserQ)


    END

  END



SetTabs             ROUTINE
  if LOC:SendUsing = 'SMTP' THEN
    !HIDE(?tabSendGrid)
    HIDE(?grpSendFrom)
  ELSE
    !UNHIDE(?TabSendGrid)
    UNHIDE(?grpSendFrom)
  END
  DO RebuildSimtreeQueue
SingleSignonDisplay ROUTINE

  IF LOC:SingleSignon
    ENABLE(?LOC:UserName)
    ENABLE(?LOC:SMTPPassword)
  ELSE
    DISABLE(?LOC:UserName)
    DISABLE(?LOC:SMTPPassword)
  END

InvoiceNoReply      ROUTINE

  IF LOC:InvoiceAllowNoReply
    HIDE(?LOC:apSendFrom)
    HIDE(?LOC:smSendFrom)
    HIDE(?LOC:dmSendFrom)
    HIDE(?LOC:crSendFrom)
    HIDE(?StringarSendFrom)
    HIDE(?StringcrSendFrom)
    HIDE(?StringdmSendFrom)
    HIDE(?StringsmSendFrom)
    HIDE(?LOC:crSendFrom:Prompt)
    HIDE(?LOC:dmSendFrom:Prompt)
    HIDE(?LOC:smSendFrom:Prompt)
    HIDE(?LOC:apSendFrom:Prompt)
    HIDE(?LOC:UseSameForAllSendFrom)
  ELSE
    UNHIDE(?LOC:apSendFrom)
    UNHIDE(?LOC:smSendFrom)
    UNHIDE(?LOC:dmSendFrom)
    UNHIDE(?LOC:crSendFrom)
    UNHIDE(?StringarSendFrom)
    UNHIDE(?StringcrSendFrom)
    UNHIDE(?StringdmSendFrom)
    UNHIDE(?StringsmSendFrom)
    UNHIDE(?LOC:crSendFrom:Prompt)
    UNHIDE(?LOC:dmSendFrom:Prompt)
    UNHIDE(?LOC:smSendFrom:Prompt)
    UNHIDE(?LOC:apSendFrom:Prompt)
    UNHIDE(?LOC:UseSameForAllSendFrom)
    IF LOC:UseSameForAllSendFrom
      DO InvoiceAddressesScreen
    END

  END

InvoiceAddressesScreen  ROUTINE
  IF LOC:UseSameForAllSendFrom
    ?LOC:apSendFrom:Prompt{prop:text} = 'Email Address:'
    HIDE(?LOC:crSendFrom:Prompt)
    HIDE(?LOC:dmSendFrom:Prompt)
    HIDE(?LOC:smSendFrom:Prompt)

    HIDE(?StringcrSendFrom)
    HIDE(?StringdmSendFrom)
    HIDE(?StringsmSendFrom)

    HIDE(?LOC:crSendFrom)
    HIDE(?LOC:dmSendFrom)
    HIDE(?LOC:smSendFrom)
  ELSE
    ?LOC:apSendFrom:Prompt{prop:text} = 'Accounts Receivable:'
    UNHIDE(?LOC:crSendFrom)
    UNHIDE(?LOC:dmSendFrom)
    UNHIDE(?LOC:smSendFrom)
    UNHIDE(?LOC:crSendFrom:Prompt)
    UNHIDE(?LOC:dmSendFrom:Prompt)
    UNHIDE(?LOC:smSendFrom:Prompt)
    UNHIDE(?StringcrSendFrom)
    UNHIDE(?StringdmSendFrom)
    UNHIDE(?StringsmSendFrom)
  END

  IF LOC:UseSameForAllBCC
    ?LOC:apbccto:Prompt{prop:text} = 'Email Address:'
    HIDE(?LOC:crbccto:Prompt)
    HIDE(?LOC:dmsbccto:Prompt)
    HIDE(?LOC:smbccto:Prompt)
    HIDE(?LOC:crbccto)
    HIDE(?LOC:dmsbccto)
    HIDE(?LOC:smbccto)
    HIDE(?StringcrSendFromBCC)
    HIDE(?StringdmSendFromBCC)
    HIDE(?StringsmSendFromBCC)
  ELSE
    ?LOC:apbccto:Prompt{prop:text} = 'Accounts Receivable: BCC:'
    UNHIDE(?LOC:crbccto)
    UNHIDE(?LOC:dmsbccto)
    UNHIDE(?LOC:smbccto)

    UNHIDE(?LOC:crbccto:Prompt)
    UNHIDE(?LOC:dmsbccto:Prompt)
    UNHIDE(?LOC:smbccto:Prompt)
    UNHIDE(?StringcrSendFromBCC)
    UNHIDE(?StringdmSendFromBCC)
    UNHIDE(?StringsmSendFromBCC)
  END



ThisWindow.Init PROCEDURE

ReturnValue          BYTE,AUTO

stDebug StringTheory
  CODE
        udpt.Init(UD,'UpdateEmailSettings','UpdateEmailSettings_IBSEmail.clw','IBSEmail.DLL','11/05/2025 @ 03:06PM') 
             
  stDebug.Trace('Top of init')
  IF SharedEdgeEnv.UserDataFolder = ''
    CLEAR(SharedEdgeEnv)
    SharedEdgeEnv.UserDataFolder = 'WebView2\UserData\'
    SharedEdgeEnv.ChannelSearchKind = ChannelSearchKind:MostStable
    SharedEdgeEnv.ScrollBarStyle = ScrollbarStyle:Default
  END
  !---- Noyantis : Chilkat Wrapper - Start ----
  ckTest.InitHelper(TemplateHelper)
  !---- Noyantis : Chilkat Wrapper - End ----
  stDebug.Trace('After ck inithelper')
  GlobalErrors.SetProcedureName('UpdateEmailSettings')
  SELF.Request = GlobalRequest                             ! Store the incoming request
  ReturnValue = PARENT.Init()
  IF ReturnValue THEN RETURN ReturnValue.
  SELF.FirstField = ?rgnARText
  SELF.VCRRequest &= VCRRequest
  SELF.Errors &= GlobalErrors                              ! Set this windows ErrorManager to the global ErrorManager
  CLEAR(GlobalRequest)                                     ! Clear GlobalRequest after storing locally
  CLEAR(GlobalResponse)
  SELF.AddItem(Toolbar)
  Relate:AACompanyName.Open                                ! File AACompanyName used by this procedure, so make sure it's RelationManager is open
  Relate:AAUserName.Open                                   ! File AAUserName used by this procedure, so make sure it's RelationManager is open
  Relate:EmailUsers.Open                                   ! File EmailUsers used by this procedure, so make sure it's RelationManager is open
  SELF.FilesOpened = True
  BRW5.Init(?List,Queue:Browse.ViewPosition,BRW5::View:Browse,Queue:Browse,Relate:EmailUsers,SELF) ! Initialize the browse manager
  !  EmailCompany &= new EmailCompanyType
  cSettingsJson &= new ctSettingsJson
  cSettingsJson.INIT(thisStartup)
  stDebug.Trace('After Settings.init')
  SELF.Open(QuickWindow)                                   ! Open window
  !---- Noyantis : Chilkat Wrapper - Start ----
  ckTest_Feq              = CREATE(0, CREATE:OLE)
  ckTest_Feq{PROP:XPOS}   = 0
  ckTest_Feq{PROP:YPOS}   = 0
  ckTest_Feq{PROP:WIDTH}  = 1
  ckTest_Feq{PROP:HEIGHT} = 1
  ckTest_Feq{PROP:HIDE}   = FALSE
  
  ckTest.InitPrepare(ckTest_Feq{PROP:FEQ})
  !---- Noyantis : Chilkat Wrapper - End ----
  stDebug.Trace('After ckTest Init')
  !---- Noyantis : Chilkat Wrapper - Start ----
  ckTest.Init()
  !---- Noyantis : Chilkat Wrapper - End ----
   IF ?LOC:FromAddressFormat{PROP:LineHeight} < 11 THEN ?LOC:FromAddressFormat{PROP:LineHeight} = 11.
    ComboListFeq# = ?LOC:Sendusing{prop:ListFeq}
    ComboListFeq#{PROP:LineHeight} = 11
   IF ?LOC:SSL_method{PROP:LineHeight} < 11 THEN ?LOC:SSL_method{PROP:LineHeight} = 11.
   IF ?List{PROP:LineHeight} < 11 THEN ?List{PROP:LineHeight} = 11.
   IF ?TabTree{PROP:LineHeight} < 11 THEN ?TabTree{PROP:LineHeight} = 11.
  !LIST  ?LOC:FromAddressFormat
   IF ?LOC:FromAddressFormat{prop:drop} = 0  !Ive put this in so it doesn't colour lists with prop:drop
    ?LOC:FromAddressFormat{PROP:SelectedColor} = 8388608  !FGSelected
    ?LOC:FromAddressFormat{PROP:SelectedFillColor} = 11525621  !BGSelected
    ?LOC:FromAddressFormat{PROPLIST:Grid} = 12632256  !Grid
   END
    ComboListFeq# = ?LOC:Sendusing{prop:ListFeq}
    ComboListFeq#{PROP:SelectedColor} = 8388608
    ComboListFeq#{PROP:SelectedFillColor} = 11525621
    ComboListFeq#{PROPLIST:Grid} = 12632256
  !LIST  ?LOC:SSL_method
   IF ?LOC:SSL_method{prop:drop} = 0  !Ive put this in so it doesn't colour lists with prop:drop
    ?LOC:SSL_method{PROP:SelectedColor} = 8388608  !FGSelected
    ?LOC:SSL_method{PROP:SelectedFillColor} = 11525621  !BGSelected
    ?LOC:SSL_method{PROPLIST:Grid} = 12632256  !Grid
   END
  !LIST  ?List
   IF ?List{prop:drop} = 0  !Ive put this in so it doesn't colour lists with prop:drop
    ?List{PROP:SelectedColor} = 8388608  !FGSelected
    ?List{PROP:SelectedFillColor} = 11525621  !BGSelected
    ?List{PROPLIST:Grid} = 12632256  !Grid
   END
  !LIST  ?TabTree
   IF ?TabTree{prop:drop} = 0  !Ive put this in so it doesn't colour lists with prop:drop
    ?TabTree{PROP:SelectedColor} = 8388608  !FGSelected
    ?TabTree{PROP:SelectedFillColor} = 11525621  !BGSelected
    ?TabTree{PROPLIST:Grid} = 12632256  !Grid
   END
  Do DefineListboxStyle
  Alert(AltKeyPressed)  ! WinEvent : These keys cause a program to crash on Windows 7 and Windows 10.
  Alert(F10Key)         !
  Alert(CtrlF10)        !
  Alert(ShiftF10)       !
  Alert(CtrlShiftF10)   !
  Alert(AltSpace)       !
  WinAlertMouseZoom()
  WinAlert(WE::WM_QueryEndSession,,Return1+PostUser)
  stDebug.Trace('Before Fill Settings')
  
  Do FillSettings
  stDebug.Trace('After Fill Settings')
    QuickWindow{PROP:Buffer} = 1 ! Remove flicker when animating.
    drh.Init(?DrawHeaderImage)
    drh.textX = 75
    drh.SetTextY()
    drh.autoShadow = 1
    drh.shadowColor = 10066329
    drh.iconSize = 32
    drh.iconX = 12
    drh.iconY = 12
    drh.barStartColor = 8605725
    drh.barEndColor = -1
    drh.barHeight = 5
    drh.shadeType =  Draw:NoShade
    drh.OverrideSettings()
  
   drh.displayText = 'General'
  stDebug.Trace('Top of all WebView2 Inits')
  QuickWindow{Prop:Alrt,255} = CtrlShiftP
  edgeARText_env.UserDataFolder = ds_ExpandDirectory('%LOCALAPPDATA%\DirectSystems\EdgeData')
  edgeARText_env.ChannelSearchKind = ChannelSearchKind:MostStable
  edgeARText_env.ScrollBarStyle = ScrollbarStyle:Default
  edgeARText_env.DefaultBackgroundColor = ?rgnARText{PROP:Fill}
  edgeARText.nCodePage = CP_UTF8
  IF edgeARText.Init(edgeARText_env, QuickWindow, ?rgnARText)
  ELSE
    CASE edgeARText.InitErrorReason()
    OF   RuntimeInitErrorReason:RuntimeMismatch
    OROF RuntimeInitErrorReason:RuntimeNotFound
      IF EdgeInstall(edgeARText)
        IF edgeARText.Init(edgeARText_env, QuickWindow, ?rgnARText)
        ELSE
        END    
      ELSE
      END
    OF RuntimeInitErrorReason:LoaderNotFound
      MESSAGE('WebView2Loader.dll not found.', 'ClaEdge error', ICON:Exclamation)
    ELSE
      MESSAGE('Unexpected error.', 'ClaEdge error', ICON:Exclamation)
    END
  END
  edgeARText.bCatchScriptErrors = 1
      drh.Display()
  BRW5.Q &= Queue:Browse
  BRW5.AddSortOrder(,)                                     ! Add the sort order for  for sort order 1
  ?List{PROP:IconList,1} = '~begin.ico'
  BRW5.AddField(EUSER:bccToUser,BRW5.Q.EUSER:bccToUser)    ! Field EUSER:bccToUser is a hot field or requires assignment from browse
  BRW5.AddField(EUSER:username,BRW5.Q.EUSER:username)      ! Field EUSER:username is a hot field or requires assignment from browse
  BRW5.AddField(EUSER:useremail,BRW5.Q.EUSER:useremail)    ! Field EUSER:useremail is a hot field or requires assignment from browse
  BRW5.AddField(EUSER:id,BRW5.Q.EUSER:id)                  ! Field EUSER:id is a hot field or requires assignment from browse
  BRW5.AddField(EUSER:useraccount,BRW5.Q.EUSER:useraccount) ! Field EUSER:useraccount is a hot field or requires assignment from browse
  BRW5.AddField(EUSER:userpassword,BRW5.Q.EUSER:userpassword) ! Field EUSER:userpassword is a hot field or requires assignment from browse
  !---- Noyantis : Chilkat Wrapper - Start ----
  ckTest.InitResize()
  !---- Noyantis : Chilkat Wrapper - End ----
  ThisPassPaste.Init(1,1,1)
  BRW5.AskProcedure = 1                                    ! Will call: UpdateEmailUsers(LOC:SingleSignon, CLIP(LOC:Emaildomain))
  BRW5.AddToolbarTarget(Toolbar)                           ! Browse accepts toolbar control
  SELF.SetAlerts()
  Bind('RunScreenSelectColumns',RunScreenSelectColumns)
  ThisListManager:LOC:FromAddressFormat.Init(?LOC:FromAddressFormat,'RunScreenSelectColumns','Columns...','Hide Column')
  ThisListManager:LOC:SSL_method.Init(?LOC:SSL_method,'RunScreenSelectColumns','Columns...','Hide Column')
  ThisListManager:List.Init(?List,'RunScreenSelectColumns','Columns...','Hide Column')
      Do RebuildTabTreeQueue:7
      ThisTabTree7.Init(?TabTree,?sheetEmailing)
      ThisTabTree7.Control{PROP:Alrt,255} = DownKey
      ThisTabTree7.Control{PROP:Alrt,255} = UpKey
    
      ThisTabTree7.Header = 'Email Settings'
      ThisTabTree7.ColumnHeader = ''
    
      ThisTabTree7.RemoveHotKey = 1
      ThisTabTree7.RememberTab = 0
      ThisTabTree7.Tips = 0
    
      ThisTabTree7.DisabledTip = 'This option disabled'
    
      ThisTabTree7.SetSheetProps(?sheetEmailing,1,0)
      ThisTabTree7.SetSheetProps(?sheetInvoicing,1,0)
      ThisTabTree7.SetSheetProps(?sheetemailsettings,1,0)
      ThisTabTree7.LineHeight = 10
      ThisTabTree7.HeaderIcon = 'FOLDER.ICO'
      ThisTabTree7.HeaderDisabledIcon = 'FOLDER.ICO'
      ThisTabTree7.BranchIcon = 'SimSarrw.ICO'
      ThisTabTree7.BranchDisabledIcon = 'disabled.ICO'
      ThisTabTree7.SelectedIcon = 'SimPtr.ICO'
      ThisTabTree7.SetList(0)
    
  ThisListManager:LOC:FromAddressFormat.Load(Access:RunScreen,RUNS:PrimaryKey,RUNS:User,GVF:UserID,RUNS:Proc,''&GetMOD()&':UpdateEmailSettings:ThisListManager:LOC:FromAddressFormat',RUNS:Settings)
  ThisListManager:LOC:FromAddressFormat.FormatList()
  ThisListManager:LOC:SSL_method.Load(Access:RunScreen,RUNS:PrimaryKey,RUNS:User,GVF:UserID,RUNS:Proc,''&GetMOD()&':UpdateEmailSettings:ThisListManager:LOC:SSL_method',RUNS:Settings)
  ThisListManager:LOC:SSL_method.FormatList()
  ThisListManager:List.Load(Access:RunScreen,RUNS:PrimaryKey,RUNS:User,GVF:UserID,RUNS:Proc,''&GetMOD()&':UpdateEmailSettings:ThisListManager:List',RUNS:Settings)
  ThisListManager:List.FormatList()
  !---- Noyantis : Chilkat Wrapper - Start ----
  ckTest.InitTemplateSettings()
  ckTest.InitComplete()
  !---- Noyantis : Chilkat Wrapper - End ----
  oHH &= NEW tagHTMLHelp
  oHH.Init( GVF:HelpFileLocation & '\' & CLIP(thisStartup.Module) & '.CHM' )
  !Initialize the Sort Header using the Browse Queue and Browse Control
  BRW5::SortHeader.Init(Queue:Browse,?List,'','',BRW5::View:Browse)
  BRW5::SortHeader.UseSortColors = True
  BRW5::SortHeader.HdrSortBackColorAsc = 10526303
  BRW5::SortHeader.ColSortBackColorAsc = 15128749
  BRW5::SortHeader.HdrSortBackColorDec = 10526303
  BRW5::SortHeader.ColSortBackColorDec = 15128749
  BRW5::SortHeader.SetStorageSettings(GVF:IniFile,'UpdateEmailSettings')
    !Set the hlp to local equate
    IF EQ:NOHELP <> EQ:NOHELP
      0{prop:hlp} = EQ:NOHELP
      ohh.SetTopic(EQ:NOHELP)
    END
  
  DO SetTabs
  DO SingleSignonDisplay
  
  DO InvoiceAddressesScreen
  DO InvoiceNoReply
  RETURN ReturnValue


ThisWindow.Kill PROCEDURE

ReturnValue          BYTE,AUTO

  CODE
  DISPOSE(OriginalHTML.EmailHeader)
  DISPOSE(OriginalHTML.EmailFooter)
  DISPOSE(OriginalHTML.InvoiceHeader)
  DISPOSE(OriginalHTML.InvoiceFooter)
  DISPOSE(OriginalHTML.ARText)
  DISPOSE(OriginalHTML.ARSTest)
  DISPOSE(OriginalHTML.CRSText)
  DISPOSE(OriginalHTML.DMText)
  DISPOSE(OriginalHTML.DMSText)
  DISPOSE(OriginalHTML.SMText)
  drh.Kill()
  !---- Noyantis : Chilkat Wrapper - Start ----
  IF ckTest.KillProcessStarted = FALSE
    ckTest.Kill()
    ckTest.KillComplete()
  END
  !---- Noyantis : Chilkat Wrapper - End ----
  If self.opened Then WinAlert().
  DISPOSE(cSettingsJson)
  ReturnValue = PARENT.Kill()
  IF ReturnValue THEN RETURN ReturnValue.
  IF SELF.FilesOpened
    Relate:AACompanyName.Close
    Relate:AAUserName.Close
    Relate:EmailUsers.Close
  !Kill the Sort Header
  BRW5::SortHeader.Kill()
  END
  edgeARText.Kill()
    ThisListManager:LOC:FromAddressFormat.Save(Access:RunScreen,RUNS:PrimaryKey,RUNS:User,GVF:UserID,RUNS:Proc,''&GetMOD()&':UpdateEmailSettings:ThisListManager:LOC:FromAddressFormat',RUNS:Settings)
    ThisListManager:LOC:SSL_method.Save(Access:RunScreen,RUNS:PrimaryKey,RUNS:User,GVF:UserID,RUNS:Proc,''&GetMOD()&':UpdateEmailSettings:ThisListManager:LOC:SSL_method',RUNS:Settings)
    ThisListManager:List.Save(Access:RunScreen,RUNS:PrimaryKey,RUNS:User,GVF:UserID,RUNS:Proc,''&GetMOD()&':UpdateEmailSettings:ThisListManager:List',RUNS:Settings)
  GlobalErrors.SetProcedureName
  IF ~oHH &= NULL
    oHH.Kill()
    DISPOSE( oHH )
  END
            
   
  RETURN ReturnValue


ThisWindow.Run PROCEDURE(USHORT Number,BYTE Request)

ReturnValue          BYTE,AUTO

  CODE
  ReturnValue = PARENT.Run(Number,Request)
  IF SELF.Request = ViewRecord
    ReturnValue = RequestCancelled                         ! Always return RequestCancelled if the form was opened in ViewRecord mode
  ELSE
    GlobalRequest = Request
    UpdateEmailUsers(LOC:SingleSignon, CLIP(LOC:Emaildomain))
    ReturnValue = GlobalResponse
  END
  IF ReturnValue = RequestCompleted
    DO UpdateUserFromSave
  
    ?LOC:FromAddressFormat{PROP:From} = cSettingsJson.GetFromFormat(GVF:UserSystemID)
    DISPLAY(?LOC:FromAddressFormat)
  END
  RETURN ReturnValue


ThisWindow.SetAlerts PROCEDURE

  CODE
  PARENT.SetAlerts
  !Initialize the Sort Header using the Browse Queue and Browse Control
  BRW5::SortHeader.SetAlerts()


ThisWindow.TakeAccepted PROCEDURE

ReturnValue          BYTE,AUTO

Looped BYTE
  CODE
  LOOP                                                     ! This method receive all EVENT:Accepted's
    IF Looped
      RETURN Level:Notify
    ELSE
      Looped = 1
    END
  ReturnValue = PARENT.TakeAccepted()
    CASE ACCEPTED()
    OF ?btnEditARText
      ThisWindow.Update()
      CASE ?sheetEmailing{PROP:ChoiceFEQ}
      OF ?tabSMTP
        CASE ?sheetemailsettings{PROP:ChoiceFEQ}
        
        OF ?tabHeader
          stEditText.SetValue(cSettingsJson.GetDefaultsEmailheadertext())
          EditEmailTextNoTokens(stEditText, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetDefaultsEmailheadertext(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText, 0)
          END
        OF ?tabFooter
          stEditText.SetValue(cSettingsJson.GetDefaultsEmailFootertext())
          EditEmailTextNoTokens(stEditText, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetDefaultsEmailFooterText(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText, 0)
          END
        END
        
      OF ?tabInvoicing 
      
        !We will always update the same view based on tab
        CASE ?sheetInvoicing{PROP:ChoiceFEQ}
        OF ?tabInvoiceHeader
          stEditText.SetValue(cSettingsJson.GetInvoicingInvoiceheader())
          EditEmailTextNoTokens(stEditText, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetInvoicingInvoiceheader(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText, 0)
          END
        OF ?tabInvoiceFooter
          stEditText.SetValue(cSettingsJson.GetInvoicingInvoiceFooter())
          EditEmailTextNoTokens(stEditText, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetInvoicingInvoiceFooter(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText, 0)
          END
        OF ?TABAPText
      
          stEditText.SetValue(cSettingsJson.GetInvoicingAptext())
          EditEmailText(stEditText,MODULE:AR, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetInvoicingAptext(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText)
          END
          
        OF ?TABARSText
          stEditText.SetValue(cSettingsJson.GetInvoicingArstext())
          EditEmailText(stEditText,MODULE:AR, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetInvoicingARStext(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText)
          END
        OF ?TABCRText
          stEditText.SetValue(cSettingsJson.GetInvoicingCrtext())
          EditEmailText(stEditText,MODULE:CR, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetInvoicingCrtext(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText)
          END
        OF ?TABDMText
          stEditText.SetValue(cSettingsJson.GetInvoicingDmtext())
          EditEmailText(stEditText,MODULE:DM, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetInvoicingDmtext(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText)
          END
        OF ?TABDMSText
          stEditText.SetValue(cSettingsJson.GetInvoicingDmStext())
          EditEmailText(stEditText,MODULE:DM, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetInvoicingDmStext(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText)
          END
        OF ?TABSMText
          stEditText.SetValue(cSettingsJson.GetInvoicingSmtext())
          EditEmailText(stEditText,MODULE:SM, EditResult)
          IF EditResult = RequestCompleted
            cSettingsJson.SetInvoicingSmtext(stEditText.GetValue())
            UpdateBrowserView(edgeARText,  stEditText)
          END
        END
      
        
      END
      
    OF ?LOC:Emaildomain
      cSettingsJson.SetSmtpEmaildomain(LOC:EmailDomain)
      Do UpdatedomainAt
    OF ?LOC:SMTPbccAddress
      IF ValidateEmailName(LOC:SMTPbccAddress)
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:SMTPbccAddress)
      END
    OF ?LOC:SingleSignon
      DO SingleSignonDisplay
    OF ?btnTestEmail
      ThisWindow.Update()
      IF LOC:SendTestEmailTo = '' THEN
        BEEP
        SELECT(?LOC:SendTestEmailTo)
        CYCLE
      END
      
      if MESSAGE('Are you sure you want to Send test message to: ' & LOC:SendTestEmailTo & |
        '||All settings will be saved before test','Test email settings?',ICON:Question,BUTTON:YES+BUTTON:NO,BUTTON:NO) = Button:yes
      
        Do SaveSettings
        Do FillSettings
        EmailTest(LOC:SendTestEmailTo)
      END
    OF ?BUTTON1
      ThisWindow.Update()
      IF LOC:Emaildomain <> ''
      
      ! --- Check TXT ---
        IF CKDns.Query('TXT', CLIP(LOC:Emaildomain), CKJsonObject.GetObject())
          stemit.SetValue(CKJsonObject.Emit() & '<13,10>')
      
          IF CKJsonObject.HasMember('answer.txt')
            LOOP i = 0 TO CKJsonObject.SizeOfArray('answer.txt') - 1
              txtLine = LOWER(CLIP(CKJsonObject.StringOf('answer.txt[' & i & '].text')))
          
          ! Optional: remove quotes if present
              IF txtLine[1] = '"' AND txtLine[LEN(txtLine)] = '"'
                txtLine = SUB(txtLine, 2, LEN(txtLine) - 2)
              END
          
              IF INSTRING('v=spf1', txtLine, 1, 1) AND INSTRING('include:sendgrid.net', txtLine, 1, 1)
                FoundSPF = TRUE
              END
            END
          ELSE
            errMsg = errMsg & '|No TXT records found for domain'
          END
        END
      
      ! --- Check CNAME: s1._domainkey ---
        IF CKDns.Query('CNAME', 's1._domainkey.' & CLIP(LOC:Emaildomain), CKJsonObject.GetObject())
          stemit.Append(CKJsonObject.Emit() & '<13,10>')
      
          IF CKJsonObject.HasMember('answer.cname')
            LOOP i = 0 TO CKJsonObject.SizeOfArray('answer.cname') - 1
              cnameSource = LOWER(CLIP(CKJsonObject.StringOf('answer.cname[' & i & '].name')))
              cnameTarget = LOWER(CLIP(CKJsonObject.StringOf('answer.cname[' & i & '].domain')))
          
              IF INSTRING('s1._domainkey', cnameSource, 1, 1) AND INSTRING('.sendgrid.net', cnameTarget, 1, 1)
                FoundS1 = TRUE
              END
            END
          ELSE
            errMsg = errMsg & '|No CNAME records found for s1._domainkey'
          END
        END
      
      ! --- Check CNAME: s2._domainkey ---
        IF CKDns.Query('CNAME', 's2._domainkey.' & CLIP(LOC:Emaildomain), CKJsonObject.GetObject())
          stemit.Append(CKJsonObject.Emit() & '<13,10>')
      
          IF CKJsonObject.HasMember('answer.cname')
            LOOP i = 0 TO CKJsonObject.SizeOfArray('answer.cname') - 1
              cnameSource = LOWER(CLIP(CKJsonObject.StringOf('answer.cname[' & i & '].name')))
              cnameTarget = LOWER(CLIP(CKJsonObject.StringOf('answer.cname[' & i & '].domain')))
          
              IF INSTRING('s2._domainkey', cnameSource, 1, 1) AND INSTRING('.sendgrid.net', cnameTarget, 1, 1)
                FoundS2 = TRUE
              END
            END
          ELSE
            errMsg = errMsg & '|No CNAME records found for s2._domainkey'
          END
        END
      
      ! --- Report ---
        errMsg = ''
        IF ~FoundSPF
          errMsg = errMsg & '|SPF record missing or does not include SendGrid (include:sendgrid.net)'
        END
        IF ~FoundS1
          errMsg = errMsg & '|CNAME record for s1._domainkey is missing or does not point to SendGrid'
        END
        IF ~FoundS2
          errMsg = errMsg & '|CNAME record for s2._domainkey is missing or does not point to SendGrid'
        END
      SETCLIPBOARD(stEmit.GetValue())
        IF errMsg = ''
          MESSAGE('All required SendGrid DNS records found for ' & CLIP(LOC:Emaildomain), 'No issues found', ICON:Application)
        ELSE
          MESSAGE('One or more required SendGrid DNS records are missing for ' & CLIP(LOC:Emaildomain) & ':' & errMsg, 'Errors found', ICON:Exclamation)
        END
      
      END
      
      
      !      STOP(ckTest.GetLastErrorText())
    OF ?LOC:InvoiceAllowNoReply
      DO InvoiceNoReply
    OF ?LOC:UseSameForAllSendFrom
      DO InvoiceAddressesScreen
    OF ?LOC:apSendFrom
      IF ValidateEmailName(LOC:apSendFrom) and NOT LOC:InvoiceAllowNoReply
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:apSendFrom)
      END
    OF ?LOC:crSendFrom
      IF ValidateEmailName(LOC:crSendFrom) and NOT LOC:InvoiceAllowNoReply and not LOC:UseSameForAllSendFrom
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:crSendFrom)
      END
    OF ?LOC:dmSendFrom
      IF ValidateEmailName(LOC:dmSendFrom) and NOT LOC:InvoiceAllowNoReply and not LOC:UseSameForAllSendFrom
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:dmSendFrom)
      END
    OF ?LOC:smSendFrom
      IF ValidateEmailName(LOC:smSendFrom) and NOT LOC:InvoiceAllowNoReply and not LOC:UseSameForAllSendFrom
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:smSendFrom)
      END
    OF ?LOC:UseSameForAllBCC
      DO InvoiceAddressesScreen
    OF ?LOC:apbccto
      IF ValidateEmailName(LOC:apbccto)
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:apbccto)
      END
    OF ?LOC:crbccto
      IF ValidateEmailName(LOC:crbccto) and not LOC:UseSameForAllBCC
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:crbccto)
      END
    OF ?LOC:dmsbccto
      IF ValidateEmailName(LOC:dmsbccto) and not LOC:UseSameForAllBCC
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:dmsbccto)
      END
    OF ?LOC:smbccto
      IF ValidateEmailName(LOC:smbccto) and not LOC:UseSameForAllBCC
        LOC:SMTPbccAddress = ''
        DISPLAY()
        SELECT(?LOC:smbccto)
      END
    OF ?LOC:UseARFileNumberInSubject
      !ARHeading
    OF ?btnDelete
      ThisWindow.Update()
      !Delete
    OF ?OK
      ThisWindow.Update()
      Do SaveSettings
      RET:Saved = TRUE
      post(EVENT:CloseWindow)
    OF ?Cancel
      ThisWindow.Update()
      post(EVENT:CloseWindow)
    OF ?TabTree
      !Tabtree
    END
    RETURN ReturnValue
  END
  ReturnValue = Level:Fatal
  RETURN ReturnValue


ThisWindow.TakeEvent PROCEDURE

ReturnValue          BYTE,AUTO

Looped BYTE
  CODE
  LOOP                                                     ! This method receives all events
    IF Looped
      RETURN Level:Notify
    ELSE
      Looped = 1
    END
      ThisTabTree7.TakeEvent()
    If ThisPassPaste.TakeEvent() then cycle.
    If ThisListManager:LOC:FromAddressFormat.TakeEvent() then cycle.
    If ThisListManager:LOC:SSL_method.TakeEvent() then cycle.
    If ThisListManager:List.TakeEvent() then cycle.
  !Take Sort Headers Events
  IF BRW5::SortHeader.TakeEvents()
     RETURN Level:Notify
  END
  ReturnValue = PARENT.TakeEvent()
    !---- Noyantis : Chilkat Wrapper - Start ----
    ckTest.TakeEvent(EVENT())
    !---- Noyantis : Chilkat Wrapper - End ----
     IF KEYCODE()=CtrlShiftP AND EVENT() = Event:PreAlertKey
      RETURN ReturnValue
      ! CYCLE
     END
     IF KEYCODE()=CtrlShiftP  
          ShowProcedureInformation('UpdateEmailSettings',UD.SetApplicationName('IBSEmail','DLL'),QuickWindow{PROP:Hlp},'01/21/2025 @ 10:29AM','11/05/2025 @ 03:06PM','11/05/2025 @ 07:10PM')  
       CYCLE
     END
    RETURN ReturnValue
  END
  ReturnValue = Level:Fatal
  RETURN ReturnValue


ThisWindow.TakeNewSelection PROCEDURE

ReturnValue          BYTE,AUTO

Looped BYTE
  CODE
  LOOP                                                     ! This method receives all NewSelection events
    IF Looped
      RETURN Level:Notify
    ELSE
      Looped = 1
    END
  ReturnValue = PARENT.TakeNewSelection()
    CASE FIELD()
    OF ?sheetEmailing
      !Just for users
      
      TABFEQ = ?sheetEmailing{PROP:ChoiceFEQ}!{prop:Child,Choice(?sheetemailsettings)}
      ud.Debug('Updateing Draw Header: ' & TABFEQ{prop:text})
      drh.displayText = TABFEQ{prop:text}
      drh.Display()
      IF TABFEQ = ?tabUsers
        HIDE(?rgnARText)
        HIDE(?btnEditARText)
        edgeARText.Visible(false)
      END
      
      !      CASE TABFEQ
      !      OF 1
      !        TABFEQ = ?sheetemailsettings{PROP:ChoiceFEQ}!{prop:Child,Choice(?sheetemailsettings)}
      !        ud.Debug('Tab sheetemailsettings : ' & TABFEQ{prop:text})
      !        drh.displayText = TABFEQ{prop:text}
      !        drh.Display()
      !      OF 2
      !        TABFEQ = ?sheetInvoicing{PROP:ChoiceFEQ}!prop:Child,Choice(?sheetEmailing)}
      !        ud.Debug('Tab sheetInvoicing : ' & TABFEQ{prop:text})
      !        drh.displayText = TABFEQ{prop:text}
      !        drh.Display()
      !      OF 3
      !        TABFEQ = ?sheetEmailing{PROP:ChoiceFEQ}!{prop:Child,Choice(?sheetemailsettings)}
      !        !User
      !        ud.Debug('Tab sheetEmailing : ' & TABFEQ{prop:text})
      !        drh.displayText = TABFEQ{prop:text}
      !        drh.Display()
      !        
      !      END
    OF ?sheetemailsettings
      TABFEQ = ?sheetemailsettings{PROP:ChoiceFEQ}!{prop:Child,Choice(?sheetemailsettings)}
      ud.Debug('Tab sheetemailsettings : ' & TABFEQ{prop:text})
      drh.displayText = TABFEQ{prop:text}
      drh.Display()
      
      
      
      CASE TABFEQ
      of ?TabGeneral
        HIDE(?rgnARText)
        HIDE(?btnEditARText)
        edgeARText.Visible(False)
      OF ?tabHeader
          UNHIDE(?btnEditARText)
          UNHIDE(?rgnARText)
          edgeARText.Visible(true)
          stEditText.SetValue(cSettingsJson.GetDefaultsEmailheadertext())
          UpdateBrowserView(edgeARText, stEditText, 0)
      ! ---- Header editor tab ----
        
      
      OF ?tabFooter
      ! ---- Footer editor tab ----
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        edgeARText.Visible(true)
        stEditText.SetValue(cSettingsJson.GetDefaultsEmailFootertext())
        
        UpdateBrowserView(edgeARText, stEditText, 0)
      ELSE
        HIDE(?btnEditARText)
        HIDE(?rgnARText)
        edgeARText.Visible(false)
      END
      
      
    OF ?LOC:Sendusing
      DO SetTabs
      !*** Setup Sendgrid
      DO EnableDisableOnSendGrid
    OF ?sheetInvoicing
      TABFEQ = ?sheetInvoicing{PROP:ChoiceFEQ}!prop:Child,Choice(?sheetEmailing)}
      CASE TABFEQ 
      OF ?tabInvoiceHeader
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        edgeARText.Visible(true)
        stEditText.SetValue(cSettingsJson.GetInvoicingInvoiceheader())
        UpdateBrowserView(edgeARText, stEditText,0)
      OF ?tabInvoiceFooter
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        edgeARText.Visible(true)
        stEditText.SetValue(cSettingsJson.GetInvoicingInvoiceFooter())
        UpdateBrowserView(edgeARText, stEditText,0)
      OF ?TABAPText
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        edgeARText.Visible(true)
        BuildTokensQueue(TokensQueue, MODULE:AR)
        stEditText.SetValue(cSettingsJson.GetInvoicingAptext())
        UpdateBrowserView(edgeARText, stEditText)
      OF ?TABARSText
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        edgeARText.Visible(true)
        BuildTokensQueue(TokensQueue, MODULE:AR)
        stEditText.SetValue(cSettingsJson.GetInvoicingARStext())
        UpdateBrowserView(edgeArText, stEditText)
      OF  ?TABCRText
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        edgeARText.Visible(true)
        BuildTokensQueue(TokensQueue, MODULE:CR)
        stEditText.SetValue(cSettingsJson.GetInvoicingCRtext())
        UpdateBrowserView(edgeArText, stEditText)
      OF ?TABDMText
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        edgeARText.Visible(true)
        BuildTokensQueue(TokensQueue, MODULE:DM)
        stEditText.SetValue(cSettingsJson.GetInvoicingDMtext())
        UpdateBrowserView(edgeArText, stEditText)
      OF ?TABDMSText
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        BuildTokensQueue(TokensQueue, MODULE:DM)
        stEditText.SetValue(cSettingsJson.GetInvoicingDMStext())
        UpdateBrowserView(edgeArText, stEditText)
      OF ?TABSMText
        UNHIDE(?btnEditARText)
        UNHIDE(?rgnARText)
        BuildTokensQueue(TokensQueue, MODULE:SM)
        stEditText.SetValue(cSettingsJson.GetInvoicingSMtext())
        UpdateBrowserView(edgeArText, stEditText)
      ELSE
        edgeARText.Visible(FALSE)
        HIDE(?rgnARText)
        HIDE(?btnEditARText)
      END
      !      IF ?sheetEmailing{PROP:ChoiceFEQ} <> ?tabInvoicing 
      !        CASE ?sheetInvoicing{PROP:ChoiceFEQ} 
      !        OF ?TABAPText orof ?TABARSText
      !        ELSE
      !          
      !        !- ?TABARSText is hidden
      !          edgeARText.Visible(FALSE)
      !          HIDE(?rgnARText)
      !          HIDE(?btnEditARText)
      !        END
      !        
      !      
      !      END
      
      ud.Debug('Tab sheetInvoicing : ' & TABFEQ{prop:text})
      drh.displayText = TABFEQ{prop:text}
      drh.Display()
    END
    RETURN ReturnValue
  END
  ReturnValue = Level:Fatal
  RETURN ReturnValue


ThisWindow.TakeWindowEvent PROCEDURE

ReturnValue          BYTE,AUTO

Looped BYTE
  CODE
  LOOP                                                     ! This method receives all window specific events
    IF Looped
      RETURN Level:Notify
    ELSE
      Looped = 1
    END
    CASE EVENT()
    OF EVENT:CloseDown
      if WE::CantCloseNow
        WE::MustClose = 1
        cycle
      else
        self.CancelAction = cancel:cancel
        self.response = requestcancelled
      end
      IF GLO:CleanCloseDown
         SELF.CancelAction = Cancel:Cancel
      END
    OF EVENT:CloseWindow
      IF ~RET:Saved
        Do CancelSettings
      END
    OF EVENT:OpenWindow
      ?LOC:FromAddressFormat{PROP:From} = cSettingsJson.GetFromFormat(GVF:UserSystemID)
      ?LOC:InvoiceAllowNoReply{prop:text} = 'Use NoReply@' & cSettingsJson.GetSmtpEmaildomain() & ':'
      LOC:SendTestEmailTo = ''!cSettingsJson.GetFromAddress(GVF:UserSystemID)
      0{prop:text} = 'Communication Settings - Please wait - Loading'
      DISABLE(?sheetEmailing)
      SETCURSOR(CURSOR:Wait)
    END
    !---- Noyantis : Chilkat Wrapper - Start ----
    ckTest.TakeWindowEvent(QuickWindow)
    !---- Noyantis : Chilkat Wrapper - End ----
  ReturnValue = PARENT.TakeWindowEvent()
    CASE EVENT()
    OF EVENT:OpenWindow
      IF ?sheetEmailing{PROP:ChoiceFEQ} <> ?tabInvoicing OR ?sheetInvoicing{PROP:ChoiceFEQ} <> ?TABAPText
        !- ?TABARSText is hidden
        edgeARText.Visible(FALSE)
        HIDE(?rgnARText)
        HIDE(?btnEditARText)
        
      END  
    END
    RETURN ReturnValue
  END
  ReturnValue = Level:Fatal
  RETURN ReturnValue

!---- Noyantis : Chilkat Wrapper - Start ----
ckTest.Drop                              PROCEDURE(STRING paramDragID, STRING paramDropID)
  CODE
  PARENT.Drop(paramDragID, paramDropID)
  RETURN

ckTest.Event                             PROCEDURE(STRING paramEventName, <*SHORT paramReference>, <SIGNED paramOleControl>, <LONG paramCurrentEvent>)
  CODE
  PARENT.Event(paramEventName, paramReference, paramOleControl, paramCurrentEvent)
  RETURN

ckTest.EventFunc                         PROCEDURE(*SHORT Reference, SIGNED OleControl, LONG CurrentEvent)
  CODE
  PARENT.EventFunc(Reference, OleControl, CurrentEvent)
  RETURN

ckTest.EventFuncCommon                   PROCEDURE(*SHORT Reference, SIGNED OleControl, LONG CurrentEvent)
  CODE
  PARENT.EventFuncCommon(Reference, OleControl, CurrentEvent)
  RETURN

ckTest.Init                              PROCEDURE()
  CODE
  SELF.MakeTarget = UPPER('IBSEmail.DLL')
  PARENT.Init()
  RETURN

ckTest.InitComplete                      PROCEDURE()
  CODE
  PARENT.InitComplete()
  RETURN

ckTest.InitPrepare                       PROCEDURE(SIGNED paramOCXCtrl)
  CODE
  SELF.DisableAtRuntime   = FALSE
  
  SELF.BaseDkim              &= CKDkim
  SELF.BaseDns               &= CKDns
  SELF.BaseJsonObject        &= CKJsonObject
  PARENT.InitPrepare(paramOCXCtrl)
  RETURN

ckTest.InitResize                        PROCEDURE()
  CODE
  PARENT.InitResize()
  RETURN

ckTest.InitSecurity                      PROCEDURE()
  CODE
  PARENT.InitSecurity()
  RETURN

ckTest.InitTemplateSettings              PROCEDURE()
  CODE
  PARENT.InitTemplateSettings()
  SELF.ClearTrapableEvents()
  SELF.ClearTrapableKeystrokes()
  RETURN

ckTest.Keystroke                         PROCEDURE(UNSIGNED paramKeycode)
  CODE
  PARENT.Keystroke(paramKeycode)
  RETURN

ckTest.Kill                              PROCEDURE()
  CODE
  PARENT.Kill()
  RETURN

ckTest.KillComplete                      PROCEDURE()
  CODE
  PARENT.KillComplete()
  RETURN

ckTest.ParametersReceived                PROCEDURE()
  CODE
  PARENT.ParametersReceived()
  RETURN

ckTest.ProcessClones                     PROCEDURE()
  CODE
  PARENT.ProcessClones()
  RETURN

ckTest.ProcessMimics                     PROCEDURE()
  CODE
  PARENT.ProcessMimics()
  RETURN

ckTest.ProcessShortcutKey                PROCEDURE(UNSIGNED pKeyCode)
  CODE
  PARENT.ProcessShortcutKey(pKeyCode)
  RETURN

ckTest.RefreshContents                   PROCEDURE(<BYTE paramForce>)
  CODE
  PARENT.RefreshContents(paramForce)
  RETURN

ckTest.SyncOCXHeight                     PROCEDURE(<BYTE pForce>)
  CODE
  PARENT.SyncOCXHeight(pForce)
  RETURN

ckTest.SyncOCXWidth                      PROCEDURE(<BYTE pForce>)
  CODE
  PARENT.SyncOCXWidth(pForce)
  RETURN

ckTest.TakeEvent                         PROCEDURE(SIGNED paramEvent)
  CODE
  PARENT.TakeEvent(paramEvent)
  RETURN

ckTest.TakeNotify                        PROCEDURE(UNSIGNED paramNotifyCode, SIGNED paramThread, LONG paramParameter)
  CODE
  PARENT.TakeNotify(paramNotifyCode, paramThread, paramParameter)
  RETURN

ckTest.TakeSubClassEvent                 PROCEDURE(UNSIGNED paramWndHndl, UNSIGNED paramMsg, UNSIGNED paramWParam, LONG paramLParam)
  CODE
  PARENT.TakeSubClassEvent(paramWndHndl, paramMsg, paramWParam, paramLParam)
  RETURN

ckTest.TakeTimer                         PROCEDURE()
  CODE
  PARENT.TakeTimer()
  RETURN

ckTest.TakeWindowEvent                   PROCEDURE(*WINDOW paramWindow)
  CODE
  PARENT.TakeWindowEvent(paramWindow)
  RETURN

CKDkim.Event                             PROCEDURE(STRING paramEventName, <*SHORT paramReference>, <SIGNED paramOleControl>, <LONG paramCurrentEvent>)
  CODE
  PARENT.Event(paramEventName, paramReference, paramOleControl, paramCurrentEvent)
  RETURN

CKDns.Event                              PROCEDURE(STRING paramEventName, <*SHORT paramReference>, <SIGNED paramOleControl>, <LONG paramCurrentEvent>)
  CODE
  PARENT.Event(paramEventName, paramReference, paramOleControl, paramCurrentEvent)
  RETURN

CKJsonObject.Event                       PROCEDURE(STRING paramEventName, <*SHORT paramReference>, <SIGNED paramOleControl>, <LONG paramCurrentEvent>)
  CODE
  PARENT.Event(paramEventName, paramReference, paramOleControl, paramCurrentEvent)
  RETURN

!---- Noyantis : Chilkat Wrapper - End ----
!----------------------------------------------------
ThisPassPaste.Paste   PROCEDURE (Long pField)
  CODE
  Case pField
  End
  PARENT.Paste (pField)

BRW5.Init PROCEDURE(SIGNED ListBox,*STRING Posit,VIEW V,QUEUE Q,RelationManager RM,WindowManager WM)

  CODE
  PARENT.Init(ListBox,Posit,V,Q,RM,WM)
  IF WM.Request <> ViewRecord                              ! If called for anything other than ViewMode, make the insert, change & delete controls available
    SELF.ChangeControl=?Change
  END
  IF WM.Request <> ViewRecord
    Self.DeleteControl = ?btnDelete
  END


BRW5.SetQueueRecord PROCEDURE

  CODE
  PARENT.SetQueueRecord
  
  IF (EUSER:bccToUser)
    SELF.Q.EUSER:bccToUser_Icon = 1                        ! Set icon from icon list
  ELSE
    SELF.Q.EUSER:bccToUser_Icon = 0
  END


BRW5.SetSort PROCEDURE(BYTE NewOrder,BYTE Force)

ReturnValue          BYTE,AUTO

  CODE
  ReturnValue = PARENT.SetSort(NewOrder,Force)
  IF BRW5::LastSortOrder<>NewOrder THEN
     BRW5::SortHeader.ClearSort()
  END
  IF BRW5::LastSortOrder=0 THEN
     BRW5::LastSortOrder=NewOrder
     BRW5::SortHeader.LoadSort()
  END
  BRW5::LastSortOrder=NewOrder
  RETURN ReturnValue

BRW5::SortHeader.QueueResorted       PROCEDURE(STRING pString)
  CODE
    IF pString = ''
       BRW5.RestoreSort()
       BRW5.ResetSort(True)
    ELSE
       BRW5.ReplaceSort(pString)
    END

UpdateBrowserView   PROCEDURE(*TClaEdgeBrowser edgeBrowser, *stringtheory body, BOOL ShowHeaderFooter = 1)
html                  StringTheory
escaped               StringTheory
scriptCmd             StringTheory
  CODE
  ud.Debug('UpdateBrowserView called')
  IF ShowHeaderFooter
    TokensToHTML(TokensQueue, body)
    html.SetValue(cSettingsJson.GetInvoicingInvoiceheader() & body.GetValue() & cSettingsJson.GetInvoicingInvoiceFooter())
  ELSE
    html.SetValue(body.GetValue())
  END
  
  ! === Escape any backticks or backslashes for JS template literal ===
  escaped.SetValue(html.GetValue())
  escaped.Replace('\', '\\')   ! escape backslashes
  escaped.Replace('`', '\`')   ! escape backticks (used for JS template literal)

  ! === Build JavaScript injection command ===
  scriptCmd.SetValue('document.getElementById("content").innerHTML = `' & escaped.GetValue() & '`;')

  ! === Inject new content instantly without reloading ===
  edgeBrowser.ExecuteScriptAsync(scriptCmd.GetValue())


edgeARText.OnExceptionThrown               PROCEDURE(STRING pExceptionType,STRING pMessage,HRESULT pHR,STRING pSource,STRING pStackTrace)
  CODE
  PARENT.OnExceptionThrown(pExceptionType, pMessage, pHR, pSource, pStackTrace)
edgeARText.OnInitializationCompleted       PROCEDURE()
dataStyle CSTRING(1024)
  CODE
  PARENT.OnInitializationCompleted()
  !- WebView2 settings
  SELF.IsStatusBarEnabled(FALSE)
  SELF.AreDevToolsEnabled(FALSE)
  SELF.AreDefaultContextMenusEnabled(FALSE)
  SELF.IsZoomControlEnabled(FALSE)
  SELF.IsPinchZoomEnabled(FALSE)
  SELF.IsSwipeNavigationEnabled(FALSE)
  SELF.IsReputationCheckingRequired(FALSE)
  SELF.HiddenPdfToolbarItems()
  0{prop:text} = 'Communication Settings'
  ENABLE(?sheetEmailing)
  SETCURSOR(CURSOR:None)
  dataStyle = |
    '<style>' & |
    'body {{ font-family: Calibri, Arial, Helvetica, sans-serif; font-size:12px; color:#222; margin:10px; background:#fff; }' & |
    'a {{ color:#365F91; text-decoration:none; }' & |
    'table {{ border-collapse:collapse; } td, th {{ padding:2px 4px; }' & |
    'img {{ max-width:100%; height:auto; }' & |
    '</style>'
  
  Self.NavigateToString('<html><head>' & dataStyle & '</head><body><div id="content"></div></body></html>')
edgeARText.OnInitializationFailed          PROCEDURE(STRING pSource, STRING pMessage, STRING pStackTrace, LONG pHResult)
  CODE
  PARENT.OnInitializationFailed(pSource, pMessage, pStackTrace, pHResult)
edgeARText.OnControllerCreated             PROCEDURE()
locDlPath                                STRING(MAX_PATH)
locClrScheme                             CoreWebView2PreferredColorScheme(PreferredColorScheme:Auto)
locTrackingPreventionLevel               CoreWebView2TrackingPreventionLevel(TrackingPreventionLevel:None)
  CODE
  PARENT.OnControllerCreated()
  !- Profile settings
  SELF.Profile.DefaultDownloadFolderPath(locDlPath)
  SELF.Profile.PreferredColorScheme(locClrScheme)
  SELF.Profile.PreferredTrackingPreventionLevel(locTrackingPreventionLevel)
edgeARText.OnNavigationStarting            PROCEDURE(STRING pNavigationId, STRING pUri, BOOL isUserInitiated, BOOL isRedirected, STRING pRequestHeaders, CoreWebView2NavigationKind pKind, |
                                           *BOOL pCancel, *STRING pUserAgent, *STRING pAdditionalAllowedFrameAncestors)
jsScript                                 ANY
  CODE
  jsScript = PARENT.OnNavigationStarting(pNavigationId, pUri, isUserInitiated, isRedirected, pRequestHeaders, pKind, |
    pCancel, pUSerAgent, pAdditionalAllowedFrameAncestors)
  !- pCancel=TRUE to prevent this uri from loading.
  !- assign a code to jsScript to execute it in WebView. For example:
  !- jsScript=enc.ToUtf8('alert("This website is not secure!");')
  RETURN jsScript
edgeARText.OnNavigationCompleted           PROCEDURE(STRING pNavigationId, BOOL pIsSuccess, CoreWebView2WebErrorStatus pWebErrorStatus, LONG pHttpStatusCode)
  CODE
  PARENT.OnNavigationCompleted(pNavigationId, pIsSuccess, pWebErrorStatus, pHttpStatusCode)
edgeARText.OnWebMessageStringReceived      PROCEDURE(STRING pSrc, STRING pMsg, LONG pAdditionalObjectsCount)
  CODE
  PARENT.OnWebMessageStringReceived(pSrc, pMsg, pAdditionalObjectsCount)
edgeARText.OnWebMessageJsonReceived        PROCEDURE(STRING pSrc, STRING pMsg, LONG pAdditionalObjectsCount)
  CODE
  PARENT.OnWebMessageJsonReceived(pSrc, pMsg, pAdditionalObjectsCount)
edgeARText.OnDocumentTitleChanged          PROCEDURE()
  CODE
  PARENT.OnDocumentTitleChanged()
edgeARText.OnHistoryChanged                PROCEDURE()
  CODE
  PARENT.OnHistoryChanged()
edgeARText.OnScriptResult                  PROCEDURE(STRING pScriptName, STRING pResult, STRING pException)
  CODE
  PARENT.OnScriptResult(pScriptName, pResult, pException)
edgeARText.OnKeyDown                       PROCEDURE(BOOL pCtrl, BOOL pAlt, BOOL pShift, ULONG pModifiers, | 
                                              ULONG pKeyCode, LONG pKeyValue, ULONG pKeyData, | 
                                              *BOOL pSuppressKeyPress, *BOOL pHandled)
  CODE
  PARENT.OnKeyDown(pCtrl, pAlt, pShift, pModifiers, pKeyCode, pKeyValue, pKeyData, pSuppressKeyPress, pHandled)
edgeARText.OnKeyUp                         PROCEDURE(BOOL pCtrl, BOOL pAlt, BOOL pShift, ULONG pModifiers, | 
                                              ULONG pKeyCode, LONG pKeyValue, ULONG pKeyData, | 
                                              *BOOL pSuppressKeyPress, *BOOL pHandled)
  CODE
  PARENT.OnKeyUp(pCtrl, pAlt, pShift, pModifiers, pKeyCode, pKeyValue, pKeyData, pSuppressKeyPress, pHandled)
edgeARText.OnDevToolsProtocolMethodResult  PROCEDURE(STRING pMethodName, STRING pParameters, STRING pResult)
  CODE
  PARENT.OnDevToolsProtocolMethodResult(pMethodName, pParameters, pResult)
edgeARText.OnDevToolsProtocolMethodForSessionResult  PROCEDURE(STRING pSessionId, STRING pMethodName, STRING pParameters, STRING pResult)
  CODE
  PARENT.OnDevToolsProtocolMethodForSessionResult(pSessionId, pMethodName, pParameters, pResult)
edgeARText.OnDevToolsProtocolEventReceived PROCEDURE(STRING pEventLabel, STRING pSessionId, STRING pParameterObjectAsJson)
  CODE
  PARENT.OnDevToolsProtocolEventReceived(pEventLabel, pSessionId, pParameterObjectAsJson)
edgeARText.OnScriptDialogOpening           PROCEDURE(STRING pUri, CoreWebView2ScriptDialogKind pKind, STRING pMessage, |
                                           STRING pDefaultText, *STRING pResultText, *BOOL pDoAccept)
  CODE
  PARENT.OnScriptDialogOpening(pUri, pKind, pMessage, pDefaultText, pResultText, pDoAccept)
edgeARText.OnProcessFailed                 PROCEDURE(CoreWebView2ProcessFailedKind pKind, |
                                              CoreWebView2ProcessFailedReason pReason, |
                                              LONG pExitCode, |
                                              STRING pProcessDescription, |
                                              STRING pFrameInfosForFailedProcess)
  CODE
  PARENT.OnProcessFailed(pKind, pReason, pExitCode, pProcessDescription, pFrameInfosForFailedProcess)
edgeARText.OnSourceChanged                 PROCEDURE(BOOL isNewDocument)
  CODE
  PARENT.OnSourceChanged(isNewDocument)
edgeARText.OnContentLoading                PROCEDURE(STRING pNavigationId, BOOL isErrorPage)
  CODE
  PARENT.OnContentLoading(pNavigationId, isErrorPage)
edgeARText.OnNewWindowRequested            PROCEDURE(STRING pUri, *BOOL pHandled, BOOL pIsUserInitiated, STRING pName)
  CODE
  PARENT.OnNewWindowRequested(pUri, pHandled, pIsUserInitiated, pName)
edgeARText.OnContainsFullScreenElementChanged  PROCEDURE()
  CODE
  PARENT.OnContainsFullScreenElementChanged()
edgeARText.OnWebResourceRequested          PROCEDURE(*TWebResourceRequest pRequest, *TWebResourceResponse pResponse, CoreWebView2WebResourceContext pContext)
  CODE
  PARENT.OnWebResourceRequested(pRequest, pResponse, pContext)
edgeARText.OnWindowCloseRequested          PROCEDURE()
  CODE
  PARENT.OnWindowCloseRequested()
edgeARText.OnPermissionRequested           PROCEDURE(STRING pUri, CoreWebView2PermissionKind pKind, BOOL pIsUserInitiated, *CoreWebView2PermissionState pState, *BOOL pSavesInProfile, *BOOL pHandled)
  CODE
  PARENT.OnPermissionRequested(pUri, pKind, pIsUserInitiated, pState, pSavesInProfile, pHandled)
edgeARText.OnDOMContentLoaded              PROCEDURE(STRING pNavigationId)
  CODE
  PARENT.OnDOMContentLoaded(pNavigationId)
edgeARText.OnWebResourceResponseReceived   PROCEDURE(TWebResourceRequest pRequest, TWebResourceResponse pResponse)
  CODE
  PARENT.OnWebResourceResponseReceived(pRequest, pResponse)
edgeARText.OnDownloadStarting              PROCEDURE(LONG pDownloadID, STRING pUri, STRING pMimeType, *BOOL pCancel, *STRING pResultFilePath, *BOOL pHandled)
  CODE
  PARENT.OnDownloadStarting(pDownloadID, pUri, pMimeType, pCancel, pResultFilePath, pHandled)
edgeARText.OnDownloadBytesReceivedChanged  PROCEDURE(LONG pDownloadID, LONG pBytesReceived, LONG pTotalBytesToReceive)
  CODE
  PARENT.OnDownloadBytesReceivedChanged(pDownloadID, pBytesReceived, pTotalBytesToReceive)
edgeARText.OnDownloadStateChanged          PROCEDURE(LONG pDownloadID, CoreWebView2DownloadState pState, | 
                                           CoreWebView2DownloadInterruptReason pInterruptReason)
  CODE
  PARENT.OnDownloadStateChanged(pDownloadID, pState, pInterruptReason)
edgeARText.OnScriptException               PROCEDURE(STRING pUri, STRING pErrName, STRING pErrMsg)
  CODE
  PARENT.OnScriptException(pUri, pErrName, pErrMsg)
edgeARText.OnNewBrowserVersionAvailable    PROCEDURE()
  CODE
  PARENT.OnNewBrowserVersionAvailable()
edgeARText.OnProcessInfosChanged           PROCEDURE()
  CODE
  PARENT.OnProcessInfosChanged()
edgeARText.OnPrintToPdfCompleted           PROCEDURE(BOOL pIsSuccess, STRING pResultFilePath)
  CODE
  PARENT.OnPrintToPdfCompleted(pIsSuccess, pResultFilePath)
edgeARText.OnPrintToPdfStreamCompleted     PROCEDURE(*STRING pBytes)
  CODE
  PARENT.OnPrintToPdfStreamCompleted(pBytes)
edgeARText.OnPrintCompleted                PROCEDURE(CoreWebView2PrintStatus pStatus)
  CODE
  PARENT.OnPrintCompleted(pStatus)
edgeARText.OnHostObjectEvent               PROCEDURE(STRING pObjectName, STRING pEventName, | 
                                           STRING pParam1, STRING pParam2, STRING pParam3, STRING pParam4, STRING pParam5, |
                                           STRING pParam6, STRING pParam7, STRING pParam8, STRING pParam9, STRING pParam10)
  CODE
  RETURN PARENT.OnHostObjectEvent(pObjectName, pEventName, |
    pParam1, pParam2, pParam3, pParam4, pParam5, |
    pParam6, pParam7, pParam8, pParam9, pParam10)
edgeARText.OnPlayingAudioStateChanged      PROCEDURE(BOOL pIsDocumentPlayingAudio, BOOL pIsMuted)
  CODE
  PARENT.OnPlayingAudioStateChanged(pIsDocumentPlayingAudio, pIsMuted)
edgeARText.OnDefaultDownloadDialogOpenChanged  PROCEDURE(BOOL pIsOpen)
  CODE
  PARENT.OnDefaultDownloadDialogOpenChanged(pIsOpen)
edgeARText.OnFrameNavigationStarting       PROCEDURE(LONG pFrameInst, STRING pNavigationId, STRING pUri, BOOL isUserInitiated, BOOL isRedirected, |
                                           *BOOL pCancel, *STRING pAdditionalAllowedFrameAncestors)
frame                                    &TClaEdgeFrame
  CODE
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
  RETURN PARENT.OnFrameNavigationStarting(pFrameInst, pNavigationId, pUri, isUserInitiated, isRedirected, pCancel, pAdditionalAllowedFrameAncestors)
edgeARText.OnFrameNavigationCompleted      PROCEDURE(LONG pFrameInst, STRING pNavigationId, BOOL pIsSuccess, CoreWebView2WebErrorStatus pWebErrorStatus, LONG pHttpStatusCode)
frame                                    &TClaEdgeFrame
  CODE
  PARENT.OnFrameNavigationCompleted(pFrameInst, pNavigationId, pIsSuccess, pWebErrorStatus, pHttpStatusCode)
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
edgeARText.OnFrameCreated                  PROCEDURE(LONG pFrameInst, STRING pName)
  CODE
  PARENT.OnFrameCreated(pFrameInst, pName)
edgeARText.OnFrameDestroyed                PROCEDURE(LONG pFrameInst)
  CODE
  PARENT.OnFrameDestroyed(pFrameInst)
edgeARText.OnFrameContentLoading           PROCEDURE(LONG pFrameInst, STRING pNavigationId, BOOL isErrorPage)
frame                                    &TClaEdgeFrame
  CODE
  PARENT.OnFrameContentLoading(pFrameInst, pNavigationId, isErrorPage)
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
edgeARText.OnFrameDOMContentLoaded         PROCEDURE(LONG pFrameInst, STRING pNavigationId)
frame                                    &TClaEdgeFrame
  CODE
  PARENT.OnFrameDOMContentLoaded(pFrameInst, pNavigationId)
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
edgeARText.OnFrameWebMessageStringReceived PROCEDURE(LONG pFrameInst, STRING pSrc, STRING pMsg)
frame                                    &TClaEdgeFrame
  CODE
  PARENT.OnFrameWebMessageStringReceived(pFrameInst, pSrc, pMsg)
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
edgeARText.OnFrameWebMessageJsonReceived   PROCEDURE(LONG pFrameInst, STRING pSrc, STRING pMsg)
frame                                    &TClaEdgeFrame
  CODE
  PARENT.OnFrameWebMessageJsonReceived(pFrameInst, pSrc, pMsg)
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
edgeARText.OnFrameHostObjectEvent          PROCEDURE(LONG pFrameInst, STRING pObjectName, STRING pEventName, | 
                                           STRING pParam1, STRING pParam2, STRING pParam3, STRING pParam4, STRING pParam5, |
                                           STRING pParam6, STRING pParam7, STRING pParam8, STRING pParam9, STRING pParam10)
frame                                    &TClaEdgeFrame
  CODE
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
  RETURN PARENT.OnFrameHostObjectEvent(pFrameInst, pObjectName, pEventName, |
    pParam1, pParam2, pParam3, pParam4, pParam5, |
    pParam6, pParam7, pParam8, pParam9, pParam10)
edgeARText.OnFrameScriptResult             PROCEDURE(LONG pFrameInst, STRING pScriptName, STRING pResult)
frame                                    &TClaEdgeFrame
  CODE
  PARENT.OnFrameScriptResult(pFrameInst, pScriptName, pResult)
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
edgeARText.OnFramePermissionRequested      PROCEDURE(LONG pFrameInst, STRING pUri, CoreWebView2PermissionKind pKind, |
                                           BOOL pIsUserInitiated, *CoreWebView2PermissionState pState, *BOOL pSavesInProfile, *BOOL pHandled)
frame                                    &TClaEdgeFrame
  CODE
  frame &= SELF.frameManager.GetFrame(pFrameInst)
  IF NOT frame &= NULL
  ELSE
  END
  PARENT.OnFramePermissionRequested(pFrameInst, pUri, pKind, pIsUserInitiated, pState, pSavesInProfile, pHandled)
edgeARText.OnBasicAuthenticationRequested  PROCEDURE(STRING pUri, STRING pChallenge, |
                                         *BOOL pCancel, *STRING pUsername, *STRING pPassword)
  CODE
  PARENT.OnBasicAuthenticationRequested(pUri, pChallenge, pCancel, pUsername, pPassword)
edgeARText.OnStatusBarTextChanged          PROCEDURE()
  CODE
  PARENT.OnStatusBarTextChanged()
edgeARText.OnContextMenuRequested          PROCEDURE(CoreWebView2ContextMenuTargetKind pTargetKind, *LONG pSelectedCommandId, *BOOL pHandled)
  CODE
  PARENT.OnContextMenuRequested(pTargetKind, pSelectedCommandId, pHandled)
edgeARText.OnCustomItemSelected            PROCEDURE(CoreWebView2ContextMenuTargetKind pTargetKind, | 
                                           STRING pLabel, BOOL pIsChecked)
  CODE
  PARENT.OnCustomItemSelected(pTargetKind, pLabel, pIsChecked)
edgeARText.OnClientCertificateRequested    PROCEDURE(STRING pHost, LONG pPort, BOOL pIsProxy, | 
                                           *BOOL pHandled, *BOOL pCancel, *LONG pSelectedCertIndex)
  CODE
  PARENT.OnClientCertificateRequested(pHost, pPort, pIsProxy, pHandled, pCancel, pSelectedCertIndex)
edgeARText.OnFavIconChanged                PROCEDURE(STRING pFaviconUri, STRING pBytes)
  CODE
  PARENT.OnFavIconChanged(pFaviconUri, pBytes)
edgeARText.OnZoomFactorChanged             PROCEDURE()
  CODE
  PARENT.OnZoomFactorChanged()
edgeARText.OnServerCertificateErrorDetected   PROCEDURE(CoreWebView2WebErrorStatus pErrorStatus, STRING pRequestUri, | 
                                              STRING pCertValidFrom, STRING pCertValidTo, STRING pCertSubject, STRING pCertIssuer, |
                                              STRING pCertDerEncodedSerialNumber, STRING pCertDisplayName, |
                                              *CoreWebView2ServerCertificateErrorAction pAction)
  CODE
  PARENT.OnServerCertificateErrorDetected(pErrorStatus, pRequestUri, pCertValidFrom, pCertValidTo, pCertSubject, pCertIssuer, |
                                          pCertDerEncodedSerialNumber, pCertDisplayName, pAction)
edgeARText.OnLaunchingExternalUriScheme       PROCEDURE(STRING pUri, STRING pInitiatingOrigin, BOOL pIsUserInitiated, *BOOL pCancel)
  CODE
  PARENT.OnLaunchingExternalUriScheme(pUri, pInitiatingOrigin, pIsUserInitiated, pCancel)
edgeARText.OnNonDefaultPermissionSettings     PROCEDURE(STRING pPermissionSettingsAsJson)
  CODE
  PARENT.OnNonDefaultPermissionSettings(pPermissionSettingsAsJson)
edgeARText.OnBrowserExtensionsChanged         PROCEDURE()
  CODE
  PARENT.OnBrowserExtensionsChanged()
edgeARText.OnNotificationReceived             PROCEDURE(STRING pSenderOrigin, *BOOL pHandled, TClaEdgeNotification pNotification)
  CODE
  PARENT.OnNotificationReceived(pSenderOrigin,pHandled,pNotification)
edgeARText.OnNotificationCloseRequested       PROCEDURE(TClaEdgeNotification pNotification)
  CODE
  PARENT.OnNotificationCloseRequested(pNotification)
edgeARText.OnSaveAsUIShowing                  PROCEDURE(STRING pContentMimeType, *STRING pSaveAsFilePath, *CoreWebView2SaveAsKind pKind, |
                                              *BOOL pSuppressDefaultDialog, *BOOL pAllowReplace, *BOOL pCancel)
  CODE
  PARENT.OnSaveAsUIShowing(pContentMimeType, pSaveAsFilePath, pKind, pSuppressDefaultDialog, pAllowReplace, pCancel)
edgeARText.OnSaveAsUIResult                   PROCEDURE(STRING pSaveAsFilePath, CoreWebView2SaveAsUIResult pResult)
  CODE
  PARENT.OnSaveAsUIResult(pSaveAsFilePath, pResult)
edgeARText.OnSaveFileSecurityCheckStarting    PROCEDURE(STRING pDocumentOriginUri, STRING pFilePath, STRING pFileExtension, |
                                              *BOOL pSuppressDefaultPolicy, *BOOL pCancelSave)
  CODE
  PARENT.OnSaveFileSecurityCheckStarting(pDocumentOriginUri, pFilePath, pFileExtension, pSuppressDefaultPolicy, pCancelSave)
edgeARText.OnScreenCaptureStarting              PROCEDURE(LONG frameInst, *BOOL pHandled, *BOOL pCancel)
  CODE
  PARENT.OnScreenCaptureStarting(frameInst, pHandled, pCancel)
edgeARText.OnProfileDeleted                     PROCEDURE()
  CODE
  PARENT.OnProfileDeleted()
edgeARText.OnFindCompleted                      PROCEDURE()
  CODE
  PARENT.OnFindCompleted()
edgeARText.OnFindMatchCountChanged              PROCEDURE()
  CODE
  PARENT.OnFindMatchCountChanged()
edgeARText.OnFindActiveMatchIndexChanged        PROCEDURE()
  CODE
  PARENT.OnFindActiveMatchIndexChanged()
edgeARText.OnUrlChanged                    PROCEDURE(STRING pUrl)
  CODE
  PARENT.OnUrlChanged(pUrl)
edgeARText.Init                            PROCEDURE(WINDOW pWin, SIGNED pFeq, | 
                                           <STRING pBrowserExecutableFolder>, <STRING pUserDataFolder>, | 
                                           <STRING pLanguage>, <STRING pAdditionalBrowserArguments>, |
                                           BOOL pAllowSingleSignOnUsingOSPrimaryAccount=FALSE, |
                                           BOOL pExclusiveUserDataFolderAccess=FALSE)
locBef                                   ANY
locUdf                                   ANY
locLang                                  ANY
locArgs                                  ANY
locAllowSSO                              BOOL, AUTO
locExcluseveAccess                       BOOL, AUTO
  CODE
  locBef = CLIP(pBrowserExecutableFolder)
  locUdf = CLIP(pUserDataFolder)
  locLang = CLIP(pLanguage)
  locArgs = CLIP(pAdditionalBrowserArguments)
  locAllowSSO = pAllowSingleSignOnUsingOSPrimaryAccount
  locExcluseveAccess = pExclusiveUserDataFolderAccess
  RETURN PARENT.Init(pWin, pFeq, locBef, locUdf, locLang, locArgs, locAllowSSO, locExcluseveAccess)
edgeARText.Init                            PROCEDURE(*TClaEdgeEnvironmentOptions pOptions, WINDOW pWin, SIGNED pFeq)
  CODE
  RETURN PARENT.Init(pOptions, pWin, pFeq)
