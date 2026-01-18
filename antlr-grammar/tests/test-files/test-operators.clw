  PROGRAM

  MAP
  END

StrVar   STRING(100)
NumVar   LONG
DeepRec  GROUP
Name       STRING(50)
Value      LONG
         END

  CODE
  ! Test new operators
  StrVar &= 'appended'     ! String concatenation assignment
  NumVar += 10
  NumVar *= 2
  NumVar /= 4
  
  ! Test deep assignment
  DeepRec :=: DeepRec      ! Deep copy all fields
