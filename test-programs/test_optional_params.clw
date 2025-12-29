  PROGRAM

  MAP
  END

Win WINDOW('Optional Parameter Test'),AT(,,300,200),FONT('Arial',12)
      ! Test FONT with omitted parameters
      BUTTON('Test 1'),AT(10,10,80,20),FONT(,14)              ! Omit typeface, specify size
      BUTTON('Test 2'),AT(10,35,80,20),FONT('Times',,,700)    ! Omit size and color, specify style
      BUTTON('Test 3'),AT(10,60,80,20),FONT(,12,,FONT:bold)   ! Omit typeface and color
      
      ! Test COLOR with omitted parameters  
      STRING('Text 1'),AT(100,10),COLOR(0FF0000h)             ! Only background color
      STRING('Text 2'),AT(100,35),COLOR(0FF0000h,00FF00h)     ! Background and selected fore
      
      ! Test AT with omitted parameters (already working)
      BUTTON('OK'),AT(,,80,20),USE(?OK)                       ! Omit x,y
      BUTTON('Cancel'),AT(10,,,20),USE(?Cancel)               ! Omit y and width
    END

  CODE
  OPEN(Win)
  
  ! Test MESSAGE with omitted parameters
  MESSAGE('Simple message')                                   ! Only text
  MESSAGE('With title','My App')                              ! Text and caption
  MESSAGE('With icon','Warning',ICON:Exclamation)             ! Text, caption, icon
  MESSAGE('Full','Test',ICON:Question,BUTTON:Yes+BUTTON:No)  ! Multiple params
  
  ! Test INCLUDE with optional section parameter
  !INCLUDE('common.inc')                                      ! Include entire file
  !INCLUDE('common.inc', 'GLOBALS')                           ! Include specific section
  
  ! Test MEMBER with optional program parameter  
  !MEMBER()                                                   ! Single-program
  !MEMBER('MyApp')                                            ! Multi-program
  
  ! Test LINK with optional flag parameter
  !LINK('mylib.lib')                                          ! Always link
  !LINK('debug.obj', DEBUG)                                   ! Conditional link
  
  ! Test CLEAR with optional n parameter
  CLEAR(Win)                                                  ! Default clear
  !CLEAR(MyVar, 1)                                            ! Clear to max values
  
  ! Test OMIT with optional expression
  !OMIT('!End')                                               ! Always omit
  !OMIT('!End', ~DEBUG)                                       ! Conditional omit
  
  ! Test COMPILE with optional expression
  !COMPILE('!End')                                            ! Always compile
  !COMPILE('!End', DEBUG)                                     ! Conditional compile
  
  ! Test DISPLAY with optional parameters
  DISPLAY()                                                   ! Display all controls
  DISPLAY(?OK)                                                ! Display single control
  !DISPLAY(?OK, ?Cancel)                                      ! Display range
  
  ACCEPT
    CASE FIELD()
    OF ?OK
      BREAK
    OF ?Cancel  
      BREAK
    END
  END
  
  RETURN
