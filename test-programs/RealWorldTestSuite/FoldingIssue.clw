  MEMBER
StringDeformat.DeformatDate PROCEDURE (String pValue,<String pPicture>)
ReturnValue  real
spic         StringPicture
part         string(20),dim(3)
numberofparts long
monthnumber  long
monthpart    long
weekpart     long
daynumber    long
daypart      long
yearnumber   long
yearpart     long
sep          string(1)
  Code
  if pValue = '' then return 0.
  spic.ParsePicture(pPicture)

! remove the time part of an incoming that looks like: 2009-01-31T00:00:00 or 2009-01-31 T 00:00:00
  if (size(pValue) > 13 and pValue[14] = ':' and toUpper(val(pValue[11])) = 84) or | 84='T'
     (size(pValue) > 15 and pValue[16] = ':' and pValue[11] = ' ' and pValue[13] = ' '  and toUpper(val(pValue[12])) = 84) ! 84='T'
    pValue[11 : size(pValue)] = ''
  end

  do MakeParts
  !self.trace('Dformatdate: ' & pValue & ' NumberOfParts=' & NumberOfParts & ' [' & part[1] & '][' & part[2] & '][' & part[3] &']')
  ReturnValue = self.DeformatDateText(NumberOfParts,part[1],part[2],part[3],sep)
  If ReturnValue = 0
    if part[1] = 0 and part[2] = 0 and part[3] = 0           ! needs to be after Textparts
      Return 0
    End
    do MakeYearNumber                                        ! if set, then has to be right. if not set then 2 digit year < 32 is there, or the year is not there at all
    do MakeMonthNumber                                       ! set only if name used. if not set month could be
    do MakeWeekNumber                                        ! identified by a Wnn as one of the first 2 parts
  End
  If ReturnValue = 0 and numberofparts = 1                   ! 1 part
    if weekpart
      returnvalue = self.DateFromWeek(part[1],year(today()),1)
    elsif monthpart
      returnvalue = date(monthnumber,1,year(today()))
    elsif yearpart
      returnvalue = date(1,1,yearnumber)
    elsif part[1] < 32                                       ! treat this as days in current month
      ReturnValue = date(month(today()),part[1],year(today()))
    elsif pValue = 366                                       ! always refers to the last day of this year
      ReturnValue = date(12,31,year(today()))
    elsif part[1] < 367                                      ! treat this as days in current year
      ReturnValue = date(1,1,year(today())) + pValue - 1
    elsif part[1] < 99999
      ReturnValue = part[1]
    else
      ! want to make this smarter to spot dmmyyyy etc such as 31122020
      ! although if pic contains ! then it's doing this already.
      case spic.n
      of 11
        ReturnValue = date(sub(part[1],3,2),sub(part[1],5,2),2000+sub(part[1],1,2))
      of 12
        ReturnValue = date(sub(part[1],5,2),sub(part[1],7,2),sub(part[1],1,4))
      else
        ! but for now just treat as clarion date
        ReturnValue = part[1]
      end
    end
  end
  if returnValue = 0 and numberofparts = 2
    if weekpart
      if yearpart
        returnvalue = self.DateFromWeek(part[weekpart],part[yearpart],1)
      elsif weekpart = 1
        returnvalue = self.DateFromWeek(part[1],year(today()),part[2])
      elsif weekpart = 2
        returnvalue = self.DateFromWeek(part[2],part[1],1)
      end
    elsif yearpart and monthpart = 0 ! know year for sure, month is the other part
      monthpart = choose(yearpart=1,2,1)
      monthnumber = part[monthpart]
    end
  end
  if returnvalue = 0 and numberofparts = 2
    if yearpart and monthpart
      returnvalue = date(monthnumber,1,yearnumber)
    else
      ! know month for sure, day is the other part
      if monthpart and yearpart = 0
        daypart = choose(monthpart=1,2,1)
        daynumber = part[daypart]
        returnvalue = date(monthnumber,daynumber,year(today()))
      else
        ! two unknown parts, check if one is > 12 (not >31 else the year would have claimed this part)
        do MakeDayNumber
        ! if know day then other part is the month part
        if daypart
          monthpart = choose(daypart=1,2,1)
          monthnumber = part[monthpart]
          returnvalue = date(monthnumber,daynumber,year(today()))
        else
          ! two unknown parts, both < 13. Use pic to give a hint as to which is which
          case spic.n
          of 0 orof 1 orof 2 orof 3 orof 4 ! mm/dd
            daypart = 2
            monthpart = 1
            daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
            monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
            returnvalue = date(monthnumber,daynumber,year(today()))
          of 5 orof 6 orof 7 orof 8        ! dd/mm
            daypart = 1
            monthpart = 2
            daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
            monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
            returnvalue = date(monthnumber,daynumber,year(today()))
          else                             ! yy/mm
            yearpart = 1
            monthpart = 2
            monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
            yearnumber = choose(part[yearpart] >= 1,part[yearpart],year(today()))
            returnvalue = date(monthnumber,1,yearnumber)
          end
        end
      end
    end
  end
  if returnvalue = 0 and numberofparts = 3
    ! know year part and monthpart, then day is the other part
    if weekpart
      if yearpart
        if yearpart <> 3 and weekpart <> 3 then daypart = 3
        elsif yearpart <> 2 and weekpart <> 2 then daypart = 2
        elsif yearpart <> 1 and weekpart <> 1 then daypart = 1
        end
        returnvalue = self.DateFromWeek(part[weekpart],part[yearpart],part[daypart])
      else
        if weekpart = 1
          returnvalue = self.DateFromWeek(part[1],part[2],part[3])
        else
          returnvalue = self.DateFromWeek(part[2],part[1],part[3])
        end
      end
    elsif yearpart and monthpart
      if yearpart <> 3 and monthpart <> 3 then daypart = 3
      elsif yearpart <> 2 and monthpart <> 2 then daypart = 2
      elsif yearpart <> 1 and monthpart <> 1 then daypart = 1
      end
      daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
      returnvalue = date(monthnumber,daynumber,yearnumber)
    else
      ! know year part, try and get daypart
      if yearpart
        do MakeDayNumber
        if daypart
          if yearpart <> 1 and daypart <> 1 then monthpart = 1
          elsif yearpart <> 2 and daypart <> 2 then monthpart = 2
          else monthpart = 3
          end
          monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
        ! know yearpart, but monthpart and daypart are both < 13 so if year part =1 then y/m/d
        elsif yearpart = 1
          monthpart = 2
          monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
          daypart = 3
          daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
        else
          ! know yearpart, but monthpart and daypart are both < 13, and yearpart > 1
          case spic.n
          of 0 orof 1 orof 2 orof 3 orof 4 ! mm/dd
            daypart = 2
            monthpart = 1
          of 5 orof 6 orof 7 orof 8        ! dd/mm
            daypart = 1
            monthpart = 2
          else
            daypart = 2
            monthpart = 1
          end
          daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
          monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
        end
        returnvalue = date(monthnumber,daynumber,yearnumber)
      else
        ! 3 completely undistingushable parts, use pic
        case spic.n
        of 0 orof 1 orof 2 orof 3 orof 4 ! m/d/y
          daypart = 2
          monthpart = 1
          yearpart = 3
        of 5 orof 6 orof 7 orof 8        ! d/m/y
          daypart = 1
          monthpart = 2
          yearpart = 3
        else                             ! y/m/d
          daypart = 3
          monthpart = 2
          yearpart = 1
        end
        if part[monthpart] > 12 and part[daypart] <= 12
          daynumber = monthpart
          monthpart = daypart
          daypart = daynumber
        end
        daynumber = choose(part[daypart] >= 1 and part[daypart] <= 31,part[daypart],1)
        monthnumber = choose(part[monthpart] >= 1 and part[monthpart] <=12,part[monthpart],1)
        yearnumber = choose(part[yearpart] >= 1,part[yearpart],year(today()))
        returnvalue = date(monthnumber,daynumber,yearnumber)
      end
    end
  end
  if spic.milli
    returnvalue = self.ClarionToUnixDate(returnvalue,0,true)
  elsif spic.u
    returnvalue = self.ClarionToUnixDate(returnvalue,0,false)
  end
  return returnvalue

MakeParts  routine
  data
x    long,auto
p    long,auto
mode long(-1)
  code
  p = 0
  loop x = 1 to len(clip(pValue))
    case val(pValue[x])
    of 48 to 57        ! '0' to '9'
      if mode = 2 or mode = -1
        mode = 1
        p += 1
        if p > 3 then break.
      end
      part[p] = clip(part[p]) & pValue[x]
      if spic.s = '!'  ! input is a single number with no separator. So break on part length.
        if p = 1 and (spic.n = 10 or spic.n = 12 or spic.n = 16)
          if len(clip(part[p])) = 4
            p += 1
            if p > 3 then break.
          end
        else
          if len(clip(part[p])) = 2
            p += 1
            if p > 3 then break.
          end
        end
      end
    of 44 orof 46 orof 47 orof 45 orof 32 orof 95 orof 92 orof 43 ! ',' orof '.' orof '/' orof '-' orof space orof '_' orof '\' orof '+'
      if p = 0 then p = 1.
      sep = pValue[x]
      mode = 0
      if part[p] <> ''
        p += 1
        if p > 3 then break.
      end
    of 97 to 122  ! 'a' to 'z'
    orof 65 to 90 ! 'A' to 'Z'
      if mode = 1 or mode = -1
        mode = 2
        p += 1
        if p > 3 then break.
      end
      part[p] = clip(part[p]) & pValue[x]
    end
  end
  if part[3] <> '' then numberofparts = 3
  elsif part[2] <> '' then numberofparts = 2
  else numberofparts = 1
  end

makedaynumber   routine
  data
x long,auto
  code
  loop x = 1 to 3
    if part[x] >= 13 and part[x] <= 31
      daypart = x
      daynumber = part[x]
      break
    end
  end

makeyearnumber  routine
  data
x long,auto
  code
  loop x = 1 to 3
    if (part[x] >= 1800 and part[x] <= 2100) or (part[x] > 31 and part[x] < 100)
      yearpart = x
      yearnumber = part[x]
      break
    end
  end

makeweeknumber  routine
  data
x long,auto
  code
  loop x = 1 to 2
    if sub(upper(part[x]),1,1) = 'W' and sub(part[x],2,2) >= 1 and sub(part[x],2,2) <= 53
      weekpart = x
      break
    end
  end

makemonthnumber  routine
  data
x long,auto
  code
  monthnumber = 0
  loop x = 1 to 3
    case lower(part[x])
    of self.translate('jan')
      orof 'janeiro'                    !portuguese
      orof 'enero' orof 'ene'           !spanish
      orof 'januar'                     !german   !danish  !norwegian
      orof 'januari'                    !dutch
      orof 'januarie'                   !afrikaans
      orof self.translate('january')
        monthnumber = 1
    of self.translate('feb')
      orof 'fevereiro'                  !portuguese
      orof 'febrero'                    !spanish
      orof 'februar'                    !german !danish  !norwegian
      orof 'februari'                   !dutch
      orof 'februarie'                  !afrikaans
      orof self.translate('february')
        monthnumber = 2
    of self.translate('mar')
      orof 'mar<231>o'                  !portuguese
      orof 'marzo'                      !spanish
      orof 'mars'                       !norwegian
      orof 'm<228>rz'                   !german
      orof 'marts'                      !danish
      orof 'maart'                      !dutch   ! afrikaans
      orof self.translate('march')
        monthnumber = 3
    of self.translate('apr')
      orof 'abril' orof 'abr'           !spanish !portuguese
      orof self.translate('april')      ! afrikaans  ! dutch  ! danish ! german ! norwegian
        monthnumber = 4
    of self.translate('may')
      orof 'mayo'                       !spanish
      orof 'maio'                       !portuguese
      orof 'maj'                        !danish !norwegian
      orof 'kann'                       !german
      orof 'mei'                        !afrikaans  !dutch
        monthnumber = 5
    of self.translate('jun')
      orof 'junio'                      !spanish
      orof 'junho'                      !portuguese
      orof 'junie'                      !afrikaans
      orof 'juni'                       !dutch   !german !danish !norwegian
      orof self.translate('june')
        monthnumber = 6
    of self.translate('jul')
      orof 'julio'                      !spanish
      orof 'julho'                      !portuguese
      orof 'juli'                       !norwegian  !danish  !german  !dutch
      orof 'julie'                      !afrikaans
      orof self.translate('july')
        monthnumber = 7
    of self.translate('aug')
      orof 'agosto' orof 'ago'          !spanish    !portuguese
      orof 'augustus'                   !afrikaans  !dutch
      orof self.translate('august')     !danish !german !norwegian
        monthnumber = 8
    of self.translate('sep') orof self.translate('sept')
      orof 'setembro'                   !portuguese
      orof 'septiembre'                 !spanish
      orof self.translate('september')  ! norwegian !danish !german !afrikaans !dutch
        monthnumber = 9
    of self.translate('oct')
      orof 'okt'                        ! various short
      orof 'octubre'                    !portuguese
      orof 'outubro'                    !spanish
      orof 'oktober'                    !afrikaans !dutch  !german !danish !norwegian
      orof self.translate('october')
        monthnumber = 10
    of self.translate('nov')
      orof 'novembro'                   !portuguese
      orof 'noviembre'                  !spanish
      orof self.translate('november')   !norwegian  !danish  !german !afrikaans ! dutch
        monthnumber = 11
    of self.translate('dec')
      orof 'dezembro'                   !portuguese
      orof 'diciembre' orof 'dic'       !spanish
      orof 'desember'                   !norwegian  !afrikaans !
      orof 'dezember'                   !german
      orof self.translate('december')   !danish  !dutch
        monthnumber = 12
    end
    if monthnumber = 0
      case tolower(val(part[x,1]))
      of 102                            ! 'f'
        monthnumber = 2
      of 115                            ! 's'
        monthnumber = 9
      of 111                            ! 'o'
        monthnumber = 10
      of 110                            ! 'n'
        monthnumber = 11
      !of val('d')  finds d in dd,mm,yy
      !  monthnumber = 12
      end
    end
    if monthnumber > 0
      monthpart = x
      part[monthpart] = monthnumber
      break
    end
  end
