  MEMBER
  MAP
    
  END
StyleQueueType            QUEUE,TYPE
ID                          STRING(100),Name('ss:ID')         ! attribute
Name                        STRING(100),Name('ss:Name')       ! attribute
Parent                      STRING(100),Name('ss:Parent')     ! attribute
Alignment                   GROUP,Name('Alignment')
Vertical                      STRING(100),Name('ss:Vertical') ! attribute
Horizontal                    STRING(100),Name('ss:Horizontal') ! attribute
Rotate                        STRING(100),Name('ss:Rotate') ! attribute
WrapText                      Long,Name('ss:WrapText')      ! 1 = yes
                            END
Borders                     &BordersTypeQueue,Name('Borders')
Font                        GROUP,Name('Font')
FontName                      STRING(100),Name('ss:FontName') ! attribute
Family                        STRING(100),Name('x:Family')   ! attribute
Size                          LONG,Name('ss:Size')            ! attribute
Color                         STRING(7),Name('ss:Color')      ! attribute #000000
Bold                          Long,Name('ss:Bold')            ! 1 = yes
Italic                        Long,Name('ss:Italic')            ! 1 = yes
Underline                     STRING(6),Name('ss:Underline')   ! '', 'Single', 'Double'  ! SMK 03-Jul-2018
                            END
Interior                    GROUP,name('Interior')
Color                         STRING(7),name('ss:Kolor')      ! attribute #000000
Pattern                       STRING(100),name('ss:Pattern')  ! attribute
                            END
NumberFormat                GROUP,Name('NumberFormat')
Format                        STRING(100),Name('ss:Format')   ! attribute
                            END
                          END
  CODE
  IF SELF.osmode THEN SELF.debugout('DebugerOn[Always]')           ! force debug on regardless of debug in project
                        ELSE SELF.debugout('DebugerOn[Command line]')     ! force debug on a production app
         END