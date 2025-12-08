SystemStringClass.ToFile PROCEDURE(STRING fileName)
SystemStringClass_OutFile FILE,DRIVER('DOS'),CREATE
          RECORD
buffer      STRING(32768)
          END
        END
sz      LONG,AUTO
start   LONG,AUTO
amount  LONG,AUTO
CurErr  SIGNED,AUTO
 CODE
