PROGRAM

MAP
  Dos2DriverPipe(Long pOpCode, long pClaFCB, long pVarList),long,name(LongName)
  Dos2DriverPipeView(Long pOpCode, Long pClaVCB, long pVarList),long
  Dos2DriverSetObject(Long pOpCode, Long pClaFCB, long pVarList),Long
  Dos2DriverSetViewObject(Long pOpCode, Long pClaVCB, long pVarList),Long
  !Dos2DriverCreateIFace(),*IDrvMetaWindow,NAME('DOS2_META_CREATE')

  module('windows')
    ods(*cstring msg), raw, pascal, name('OutputDebugStringA')
  end
END

PROCEDURE Dos2DriverPipe(Long pOpCode, long pClaFCB, long pVarList)
CODE
  RETURN 0

PROCEDURE Dos2DriverPipeView(Long pOpCode, Long pClaVCB, long pVarList)
CODE
  RETURN 0