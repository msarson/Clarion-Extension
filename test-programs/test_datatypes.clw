  PROGRAM

  MAP
  END

! Test Clarion Data Types for Hover and Signature Help

! ===== Numeric Types =====
MyByte      BYTE                    ! Hover over BYTE should show: 1 byte, 0-255
MyShort     SHORT                   ! Hover over SHORT should show: 2 bytes signed
MyUShort    USHORT                  ! Hover over USHORT should show: 2 bytes unsigned
MyLong      LONG                    ! Hover over LONG should show: 4 bytes signed
MyULong     ULONG                   ! Hover over ULONG should show: 4 bytes unsigned
MySReal     SREAL                   ! Hover over SREAL should show: 4-byte float
MyReal      REAL                    ! Hover over REAL should show: 8-byte float

! ===== Decimal Types with Parameters =====
Price       DECIMAL(10,2)           ! Hover over DECIMAL - should show syntax with length/places
Amount      DECIMAL(12,2)           ! Signature help when typing: DECIMAL(
Counter     PDECIMAL(5,0)           ! PDECIMAL is synonym for DECIMAL
Balance     DECIMAL(15,2,100.50)    ! With initial value

! ===== String Types =====
Name        STRING(50)              ! Hover over STRING - shows fixed-length string
Address     STRING(100)             ! Signature help: STRING(length | constant | @picture)
Phone       CSTRING(20)             ! Hover over CSTRING - null-terminated
Email       PSTRING(100)            ! Hover over PSTRING - Pascal-style
Notes       ASTRING                 ! Hover over ASTRING - atomic/dynamic string

! ===== Date/Time Types =====
BirthDate   DATE                    ! Hover over DATE - 4-byte date value
StartTime   TIME                    ! Hover over TIME - centiseconds since midnight
OrderDate   DATE(TODAY())           ! With initial value function

! ===== Special Types =====
Comments    MEMO(1000)              ! Hover over MEMO - variable-length text
Photo       BLOB(50000)             ! Hover over BLOB - binary large object
GenericRef  ANY                     ! Hover over ANY - generic type placeholder

! ===== Arrays and Attributes =====
Numbers     LONG,DIM(100)           ! LONG with DIM attribute
Matrix      LONG,DIM(10,10)         ! Multi-dimensional array
NameArray   STRING(30),DIM(50)      ! STRING array

! ===== With Initial Values =====
Count1      BYTE(0)                 ! BYTE with initial value
Count2      SHORT(100)              ! SHORT with initial value
Count3      LONG(1000)              ! LONG with initial value
Rate        SREAL(3.14)             ! SREAL with initial value
Pi          REAL(3.14159)           ! REAL with initial value

! ===== Complex Declarations =====
GROUP:Person    GROUP
FirstName         STRING(30)        ! Hover should work in nested structures
LastName          STRING(30)
Age               BYTE
Salary            DECIMAL(10,2)
HireDate          DATE
              END

CustomerQueue   QUEUE
ID                LONG              ! In queues
Name              STRING(50)
Balance           DECIMAL(12,2)
                END
! Test GROUP with TYPE - can be reused
PersonType  GROUP,TYPE
FirstName     STRING(30)
LastName      STRING(30)
            END
  
Person1     PersonType              ! Using TYPE as data type
  
  ! Test QUEUE with PRE and TYPE
CustomerQType QUEUE,PRE(CQ),TYPE
CQ:ID           LONG
CQ:Name         STRING(50)
              END
  
Customers   CustomerQType           ! Using QUEUE TYPE
  CODE
  ! Test typing new variables here:
  ! Try typing: NewVar STRING(
  ! Should get signature help for STRING parameter
  
  ! Try typing: TestAmount DECIMAL(
  ! Should get signature help for DECIMAL parameters
  
  ! ===== Complex Type Tests =====
  ! Hover over GROUP, QUEUE, CLASS keywords
  ! Hover over TYPE, PRE, BINDABLE attributes
  
  
  
  RETURN
