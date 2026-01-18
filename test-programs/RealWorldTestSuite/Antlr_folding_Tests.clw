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

    MAP
    END
    