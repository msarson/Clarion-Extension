export enum KeywordEnum {
    nil,
    APPLICATION,
    CHECKED,
    CLASS,
    DETAIL,
    ENUM,
    EVENT,
    FILE,
    FOOTER,
    FORM,
    GROUP,
    IN,
    INDEXER,
    HEADER,
    INTERFACE,
    ITEM,
    ITEMIZE,
    JOIN,
    MAP,
    MENU,
    MENUBAR,
    MODULE,
    OLE,
    OPTION,
    PARAMS,
    PROPERTY,
    QUEUE,
    RECORD,
    REPORT,
    SHEET,
    STRUCT,
    TAB,
    TOOLBAR,
    UNCHECKED,
    VIEW,
    WINDOW,
    YIELD,
    ASCENDING,
    DESCENDING,
    EQUALS,
    INTO,
    LET,
    ON,
    ORDERBY,
    SELECT,
    ABS,
    ADD,
    ADDRESS,
    AGE,
    ANY,
    APPEND,
    AT,
    BAND,
    BFLOAT4,
    BFLOAT8,
    BINARY,
    BIND,
    BLOB,
    BOR,
    BSHIFT,
    BXOR,
    BYTE,
    CHR,
    CLEAR,
    COLUMN,
    CREATE,
    DECIMAL,
    DEFORMAT,
    DEVICE,
    DIM,
    DOCK,
    DOCKED,
    DUP,
    ENCRYPT,
    ENTRY,
    EQUATE,
    FORMAT,
    GET,
    HLP,
    ICON,
    IMM,
    INDEX,
    INLIST,
    INRANGE,
    INS,
    INT,
    KEY,
    LIKE,
    LOGOUT,
    LONG,
    MAXIMUM,
    MEMO,
    NOCASE,
    OMITTED,
    OPT,
    OVER,
    OVR,
    OWNER,
    PAGE,
    PAGENO,
    PDECIMAL,
    PEEK,
    POKE,
    PRE,
    PRESS,
    PRINT,
    PROJECT,
    PUT,
    RANGE,
    REAL,
    RECLAIM,
    REQ,
    ROUND,
    SCROLL,
    SHORT,
    SIZE,
    SORT,
    STEP,
    STRING,
    TEXT,
    UPR,
    USE,
    VAL,
    WIDTH,
    ABOVE,
    ABSOLUTE,
    ALONE,
    ALRT,
    ANGLE,
    ASTRING,
    AUTO,
    AUTODISPOSE,
    AUTOSIZE,
    AVE,
    BELOW,
    BEVEL,
    BINDABLE,
    BLANK,
    BOTH,
    BOX,
    BOXED,
    BSTRING,
    BUTTON,
    C,
    CAP,
    CDROM,
    CENTER,
    CENTERED,
    CHECK,
    CLIP,
    CNT,
    COLOR,
    COM,
    COMBO,
    COMPATIBILITY,
    CSTRING,
    CURSOR,
    CUSTOM,
    DATE,
    DEFAULT,
    DEFAULTOF,
    DELAY,
    DERIVED,
    DISABLE,
    DLL,
    DOCUMENT,
    DOUBLE,
    DOWN,
    DRAGID,
    DRIVER,
    DROP,
    DROPID,
    ELLIPSE,
    EXPAND,
    EXTEND,
    EXTERNAL,
    FILL,
    FILTER,
    FIRST,
    FIX,
    FIXED,
    FLAT,
    FONT,
    FROM,
    FULL,
    GRAY,
    GRID,
    HIDE,
    HIDDEN,
    HSCROLL,
    HVSCROLL,
    ICONIZE,
    IMAGE,
    IMPLEMENTS,
    INNER,
    LANDSCAPE,
    LAST,
    LATE,
    LAYOUT,
    LEFT,
    LINE,
    LINEWIDTH,
    LINK,
    LIST,
    MARK,
    MASK,
    MAX,
    MAXIMIZE,
    MDI,
    META,
    MIN,
    MILLIMETERS,
    MODAL,
    MSG,
    NAME,
    NOBAR,
    NOFRAME,
    NOSHEET,
    NOMERGE,
    NOTICKS,
    NULL,
    OEM,
    ONCE,
    OPEN,
    ORDER,
    PAGEAFTER,
    PAGEBEFORE,
    PALETTE,
    PANEL,
    PAPER,
    PASCAL,
    PASSWORD,
    POINTS,
    PREVIEW,
    PRIMARY,
    PRINTER,
    PRIVATE,
    PROC,
    PROGRESS,
    PROMPT,
    PROTECTED,
    PSTRING,
    RADIO,
    RAW,
    READONLY,
    REGION,
    REPEAT,
    REPLACE,
    RESET,
    RESIZE,
    RIGHT,
    RTF,
    SEND,
    SEPARATE,
    SETNONULL,
    SETNULL,
    SINGLE,
    SKIP,
    SLIDER,
    SMOOTH,
    SPIN,
    SPREAD,
    FLOAT,
    STATIC,
    STATUS,
    STD,
    STRETCH,
    SUM,
    SUPPRESS,
    SYSTEM,
    TALLY,
    TARGET,
    THOUS,
    THREAD,
    TILED,
    TIME,
    TIMER,
    TIP,
    TOGETHER,
    TOOLBOX,
    TRN,
    TYPE,
    ULONG,
    UP,
    USHORT,
    VALUE,
    VARIANT,
    VBX,
    VCR,
    VERTICAL,
    VIRTUAL,
    VSCROLL,
    WALLPAPER,
    WHERE,
    WITHNEXT,
    WITHPRIOR,
    WIZARD,
    WRAP,
    ZOOM,
    QUEST,
    DELEGATE,
    INTERNAL,
    OVERRIDE,
    PUBLIC,
    DYNAMIC,
    GETONLY,
    SETONLY,
    GLOBALCLASS,
    NETCLASS,
    PARTIAL,
    UNKNOWN,
    CONSTRUCT,
    DESTRUCT,
    ASSEMBLY,
    PARENT,
    SELF,
    RETURN,
    TOSTRING,
    GETHASHCODE,
    ORDERBYASCENDING,
    ORDERBYDESCENDING,
    ABSTRACT,
    SEALED,
    THEEND,
    AT_CONSTRUCT,
    AT_DESTRUCT,
    AT_PARENT,
    AT_SELF
}

export const ClarionKeywords: Set<string> = new Set(Object.keys(KeywordEnum));
