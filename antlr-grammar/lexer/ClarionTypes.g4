// ============================================================================
// Clarion Win32 Data Types and Attributes
// ============================================================================
// Extracted from:
// - server/src/tokenizer/TokenPatterns.ts (Type pattern)
// - syntaxes/clarion.tmLanguage.json (dataTypes)
// - ClarionDocs/reserved_words.htm
//
// KEYWORD CLASSIFICATION:
// All keywords in this file are SOFT KEYWORDS - they may be used as labels
// of data structures or statements, but NOT as PROCEDURE names.
//
// The {this.charPositionInLine > 0}? predicate allows these keywords to be
// used as labels at column 0, which is the primary way Clarion distinguishes
// labels from keywords.
// ============================================================================

lexer grammar ClarionTypes;

options { caseInsensitive = true; }

// ============================================================================
// NUMERIC DATA TYPES
// ============================================================================

// Integer Types
BYTE      : {this.charPositionInLine > 0}? 'BYTE' ;
SHORT     : {this.charPositionInLine > 0}? 'SHORT' ;
USHORT    : {this.charPositionInLine > 0}? 'USHORT' ;
LONG      : {this.charPositionInLine > 0}? 'LONG' ;
ULONG     : {this.charPositionInLine > 0}? 'ULONG' ;
SIGNED    : {this.charPositionInLine > 0}? 'SIGNED' ;
UNSIGNED  : {this.charPositionInLine > 0}? 'UNSIGNED' ;

// Floating Point Types
REAL      : {this.charPositionInLine > 0}? 'REAL' ;
SREAL     : {this.charPositionInLine > 0}? 'SREAL' ;
BFLOAT4   : {this.charPositionInLine > 0}? 'BFLOAT4' ;
BFLOAT8   : {this.charPositionInLine > 0}? 'BFLOAT8' ;

// Decimal Types
DECIMAL   : {this.charPositionInLine > 0}? 'DECIMAL' ;
PDECIMAL  : {this.charPositionInLine > 0}? 'PDECIMAL' ;

// ============================================================================
// STRING DATA TYPES
// ============================================================================

STRING    : {this.charPositionInLine > 0}? 'STRING' ;
CSTRING   : {this.charPositionInLine > 0}? 'CSTRING' ;
PSTRING   : {this.charPositionInLine > 0}? 'PSTRING' ;
ASTRING   : {this.charPositionInLine > 0}? 'ASTRING' ;
BSTRING   : {this.charPositionInLine > 0}? 'BSTRING' ;
USTRING   : {this.charPositionInLine > 0}? 'USTRING' ;

// ============================================================================
// DATE/TIME TYPES
// ============================================================================

DATE      : {this.charPositionInLine > 0}? 'DATE' ;
TIME      : {this.charPositionInLine > 0}? 'TIME' ;

// ============================================================================
// SPECIAL TYPES
// ============================================================================

MEMO      : {this.charPositionInLine > 0}? 'MEMO' ;
BLOB      : {this.charPositionInLine > 0}? 'BLOB' ;
BINARY    : {this.charPositionInLine > 0}? 'BINARY' ;  // Attribute for BLOB/MEMO to indicate binary storage
ANY       : {this.charPositionInLine > 0}? 'ANY' ;
BOOL      : {this.charPositionInLine > 0}? 'BOOL' ;
VARIANT   : {this.charPositionInLine > 0}? 'VARIANT' ;

// ============================================================================
// STRUCTURE TYPES (All SOFT KEYWORDS per ClarionDocs)
// ============================================================================

APPLICATION : {this.charPositionInLine > 0}? 'APPLICATION' ;  // SOFT KEYWORD
FILE        : {this.charPositionInLine > 0}? 'FILE' ;         // SOFT KEYWORD
GROUP       : {this.charPositionInLine > 0}? 'GROUP' ;        // SOFT KEYWORD
QUEUE       : {this.charPositionInLine > 0}? 'QUEUE' ;        // SOFT KEYWORD
RECORD    : {this.charPositionInLine > 0}? 'RECORD' ;       // SOFT KEYWORD
VIEW      : {this.charPositionInLine > 0}? 'VIEW' ;          // SOFT KEYWORD
PROJECT   : {this.charPositionInLine > 0}? 'PROJECT' ;       // Not in ClarionDocs
// TABLE removed - not a Clarion keyword, just an identifier

// ============================================================================
// CONTROL/WINDOW TYPES (All SOFT KEYWORDS per ClarionDocs)
// ============================================================================

WINDOW    : {this.charPositionInLine > 0}? 'WINDOW' ;         // SOFT KEYWORD
REPORT    : {this.charPositionInLine > 0}? 'REPORT' ;         // SOFT KEYWORD
MENU      : {this.charPositionInLine > 0}? 'MENU' ;           // SOFT KEYWORD
MENUBAR   : {this.charPositionInLine > 0}? 'MENUBAR' ;        // SOFT KEYWORD
TOOLBAR   : {this.charPositionInLine > 0}? 'TOOLBAR' ;        // SOFT KEYWORD
SHEET     : {this.charPositionInLine > 0}? 'SHEET' ;          // SOFT KEYWORD
TAB       : {this.charPositionInLine > 0}? 'TAB' ;            // SOFT KEYWORD

// Window Controls (not explicitly listed in ClarionDocs but treated as soft)
BUTTON    : {this.charPositionInLine > 0}? 'BUTTON' ;         // Soft keyword
ENTRY     : {this.charPositionInLine > 0}? 'ENTRY' ;          // Soft keyword
TEXT      : {this.charPositionInLine > 0}? 'TEXT' ;           // Soft keyword
LIST      : {this.charPositionInLine > 0}? 'LIST' ;           // Soft keyword
COMBO     : {this.charPositionInLine > 0}? 'COMBO' ;          // Soft keyword
CHECK     : {this.charPositionInLine > 0}? 'CHECK' ;          // Soft keyword
RADIO     : {this.charPositionInLine > 0}? 'RADIO' ;          // Soft keyword
OPTION    : {this.charPositionInLine > 0}? 'OPTION' ;         // SOFT KEYWORD
IMAGE     : {this.charPositionInLine > 0}? 'IMAGE' ;          // Soft keyword
LINE      : {this.charPositionInLine > 0}? 'LINE' ;           // Soft keyword
BOX       : {this.charPositionInLine > 0}? 'BOX' ;            // Soft keyword
ELLIPSE   : {this.charPositionInLine > 0}? 'ELLIPSE' ;        // Soft keyword
PANEL     : {this.charPositionInLine > 0}? 'PANEL' ;          // Soft keyword
PROGRESS  : {this.charPositionInLine > 0}? 'PROGRESS' ;       // Soft keyword
REGION    : {this.charPositionInLine > 0}? 'REGION' ;         // Soft keyword
PROMPT    : {this.charPositionInLine > 0}? 'PROMPT' ;         // Soft keyword
SPIN      : {this.charPositionInLine > 0}? 'SPIN' ;           // Soft keyword
ITEM      : {this.charPositionInLine > 0}? 'ITEM' ;           // SOFT KEYWORD

// Report Structures (All SOFT KEYWORDS per ClarionDocs)
FORM      : {this.charPositionInLine > 0}? 'FORM' ;           // SOFT KEYWORD
DETAIL    : {this.charPositionInLine > 0}? 'DETAIL' ;         // SOFT KEYWORD
HEADER    : {this.charPositionInLine > 0}? 'HEADER' ;         // SOFT KEYWORD
FOOTER    : {this.charPositionInLine > 0}? 'FOOTER' ;         // SOFT KEYWORD

// OLE Controls (SOFT KEYWORD per ClarionDocs)
OLE       : {this.charPositionInLine > 0}? 'OLE' ;            // SOFT KEYWORD
OCX       : {this.charPositionInLine > 0}? 'OCX' ;            // Not in ClarionDocs
OLECONTROL: {this.charPositionInLine > 0}? 'OLECONTROL' ;     // Not in ClarionDocs
VBX       : {this.charPositionInLine > 0}? 'VBX' ;            // Not in ClarionDocs

// ============================================================================
// DATA ATTRIBUTES
// ============================================================================

DIM : 'DIM' ;           // Array dimensions
OVER : 'OVER' ;         // Overlay on another variable
PRE : 'PRE' ;           // Prefix for structure fields
NAME : {this.charPositionInLine > 0}? 'NAME' ;         // SOFT - External name, can be field name
BINDABLE : 'BINDABLE' ; // Runtime binding
TYPE : 'TYPE' ;         // Type casting/definition
AUTO : 'AUTO' ;         // Automatic variable

// ============================================================================
// FILE/INDEX ATTRIBUTES
// ============================================================================

KEY : 'KEY' ;           // Index key
INDEX : 'INDEX' ;       // Alternative to KEY
DRIVER : {this.charPositionInLine > 0}? 'DRIVER' ;     // SOFT - File driver, can be field name
CREATE : {this.charPositionInLine > 0}? 'CREATE' ;     // SOFT - Create file if not exists, can be field
RECLAIM : 'RECLAIM' ;   // Reuse deleted space
ENCRYPT : 'ENCRYPT' ;   // Encrypt file
OWNER : 'OWNER' ;       // File owner/password
BINARY : 'BINARY' ;     // Binary mode
DUP : 'DUP' ;           // Allow duplicate keys
OPT : 'OPT' ;           // Optional index entries
NOCASE : 'NOCASE' ;     // Case-insensitive
PRIMARY : 'PRIMARY' ;   // Primary key

// ============================================================================
// VIEW/JOIN ATTRIBUTES
// ============================================================================

JOIN : {this.charPositionInLine > 0}? 'JOIN' ;                 // SOFT KEYWORD (join declaration)
INNER : 'INNER' ;       // Inner join
OUTER : 'OUTER' ;       // Outer join
FILTER : 'FILTER' ;     // View filter
ORDER : 'ORDER' ;       // Sort order

// ============================================================================
// CONTROL ATTRIBUTES
// ============================================================================

AT : 'AT' ;             // Position/size
USE : 'USE' ;           // Use variable
FROM : 'FROM' ;         // List data source
REQ : 'REQ' ;           // Required entry
DEFAULT : 'DEFAULT' ;   // Default button
HIDE : 'HIDE' ;         // Hidden control
DISABLE : 'DISABLE' ;   // Disabled control (also a statement)
READONLY : 'READONLY' ; // Read-only control
FLAT : 'FLAT' ;         // Flat appearance
BOXED : 'BOXED' ;       // Boxed appearance
DROP : 'DROP' ;         // Dropdown style
SCROLL : 'SCROLL' ;     // Scrollbar
RESIZE : 'RESIZE' ;     // Resizable
CENTER : 'CENTER' ;     // Centered (also a constant)
CENTERED : 'CENTERED' ; // Centered (alternative)
ICON : {this.charPositionInLine > 0}? 'ICON' ;         // SOFT - Icon specification - can be field name
FONT : 'FONT' ;         // Font specification
COLOR : 'COLOR' ;       // Color specification
TIP : 'TIP' ;           // Tooltip
TRN : 'TRN' ;           // Transparent
HLP : 'HLP' ;           // Help context
MSG : 'MSG' ;           // Status message
IMM : 'IMM' ;           // Immediate
INS : 'INS' ;           // Insert typing mode (ENTRY control)
OVR : 'OVR' ;           // Overwrite typing mode (ENTRY control)
ALRT : 'ALRT' ;         // Alert key
TIMER : 'TIMER' ;       // Timer
CURSOR : 'CURSOR' ;     // Cursor style
VCR : 'VCR' ;           // VCR controls
STD : 'STD' ;           // Standard behavior
MODAL : 'MODAL' ;       // Modal window
MDI : 'MDI' ;           // MDI child
SYSTEM : 'SYSTEM' ;     // System menu
MAXIMIZE : 'MAXIMIZE' ; // Maximize box
ICONIZE : 'ICONIZE' ;   // Minimize box (iconize)
RESIZE_ : 'RESIZE_' ;     // Resizable window (avoid conflict)
GRAY : 'GRAY' ;         // Gray background
WALLPAPER : 'WALLPAPER' ; // Background image
FULL : 'FULL' ;         // Full screen
ZOOOM : 'ZOOOM' ;         // Zoom
TOOLBOX : {this.charPositionInLine > 0}? 'TOOLBOX' ;   // SOFT KEYWORD - Toolbox window
PALETTE : {this.charPositionInLine > 0}? 'PALETTE' ;   // SOFT KEYWORD - Palette window
DOCK : 'DOCK' ;         // Dockable
DOCKED : 'DOCKED' ;     // Initially docked
NOFRAME : 'NOFRAME' ;   // Frameless
NOSHEET : 'NOSHEET' ;   // No tab control appearance
WIZARD : 'WIZARD' ;     // Wizard-style sheet

// ============================================================================
// REPORT ATTRIBUTES
// ============================================================================

PAGE : 'PAGE' ;         // Page attribute
PAPER : 'PAPER' ;       // Paper size
THOUS : 'THOUS' ;       // Thousands separator
LANDSCAPE : 'LANDSCAPE' ; // Landscape orientation
PREVIEW : 'PREVIEW' ;   // Preview mode
ALONE : 'ALONE' ;       // Print alone

// ============================================================================
// MISC ATTRIBUTES
// ============================================================================

PRIVATE : 'PRIVATE' ;   // Private access
PROTECTED : 'PROTECTED' ; // Protected access
PASCAL : 'PASCAL' ;     // Pascal calling convention
// Note: 'C' keyword handled separately to avoid conflict with fragment C
RAW : 'RAW' ;           // Raw parameters
PROC : 'PROC' ;         // Procedure attribute
EXTERNAL : 'EXTERNAL' ; // External definition
OEM : 'OEM' ;           // OEM character set
