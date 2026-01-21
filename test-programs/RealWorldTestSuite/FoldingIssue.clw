  MEMBER
StringDeformat PROCEDURE (String pValue,<String pPicture>)
ReturnValue   real
spic  StringPicture
part  string(20),dim(3)
numberofparts   long
monthnumber   long
monthpart   long
weekpart  long
daynumber   long
daypart   long
yearnumber  long
yearpart  long
sep   string(1)
  Code
  currentPixelStatus = Val(self.fontQ.data[curPix])
  if text[current] <> ' '
    if rotation = 0 or rotation = 360
      pos = yOffset + xOffset
      rowOffset = 0

      if (3*self.fontQ.charwidth) + xOffset > numPix          ! if the character needs to be clipped
        rowend = (numpix-xOffset)/3
      else
        rowend = self.fontQ.charwidth
      end

      if self.fontQ.charStart = 0
        self.fontQ.charStart = 1
      end
      loop ypos = 1 to cheight
        pos2 = 0
        loop xpos = 1 to rowEnd
          curPix = xpos + rowOffset
          if curPix > FONTQDATASIZE
            break
          end

          
          ! note [1]
  if currentPixelStatus = 255 then currentPixelStatus = 256.
          ! having currentPixelStatus = 255 leads to an out-by-1 error below when in indextransparency mode.
          ! bj, 10 nov 23. That said, in IndexTransparency mode it's recommended Drawer.SetFontMode(Draw:NONANTIALIASED_QUALITY)
          ! because anti-aliasing and index transparency don't mix well.
          ! end note.

          if pos + pos2 > self.bufferSize
            break
          elsif pos + pos2 < 0
            break
          end

          if self.fontMode >= Draw:ANTIALIASED_QUALITY   ! anti aliased, so need to do alpha calcs
            fDest = adrPix + pos + pos2
            if aa! and false                            ! actually draw anti aliased text ! bruce added false test in build 4.29. This block does not work when using index transparency on say layer 2
              Peek(fDest, cBlue)
              cBlue =(cBlue*currentPixelStatus + blue*(255-currentPixelStatus))/256   ! see note[1] above
              Poke(fDest, cBlue)
              fDest += 1

              Peek(fDest, cGreen)
              cGreen = (cGreen*currentPixelStatus + green*(255-currentPixelStatus))/256  ! see note[1] above
              Poke(fDest, cGreen)
              fDest += 1

              Peek(fDest, cRed)
              cRed = (cRed* currentPixelStatus + red*(255-currentPixelStatus))/256     ! see note[1] above
              Poke(fDest, cRed)
            else                                        ! draw the text as solid black (including pixel that would be grey), otherwise the text is essentially alpha channeled twice
              if currentPixelStatus < 0FFh            ! fonts may be anti aliased, which means the values are from 0 (solid) to 255 (transparent)
                fdest = adrpix + pos + pos2
                Poke(fdest, blue)
                fdest += 1
                Poke(fdest, green)
                fdest += 1
                Poke(fdest, red)
              end
            end
          else
            if currentPixelStatus = 0   ! only writes "positive" pixels.
              fdest = adrpix + pos + pos2
              Poke(fdest, blue)
              fdest += 1
              Poke(fdest, green)
              fdest += 1
              Poke(fdest, red)
            end
          end
          pos2 += 3
        end
        pos -= scanline
        rowOffset += cwidth                 ! the offset for the fontQ.data buffer
      end


      xOffset += charWidth
      if xOffset > numPix
        self.fontSize = restoreFontSize
        return
      end
    else
      oldColor = self.penColor
      self.penColor = self.fontColor

      if self.fontMode >= Draw:ANTIALIASED_QUALITY               ! anti aliased fonts
        loop ypos = 0 to cheight-1
          currentscan = ypos * cwidth
          loop xpos = self.fontQ.charwidth to 1 by -1
            curPix =  currentscan + xpos
            currentPixelStatus = Val(self.fontQ.data[curPix])
            curColor = self.GetPixel(x + ypos, y - xpos)             ! get the current color

            ! Do alpha calcs. The red, green and blue vars store the current font color
            cRed = (cRed*currentPixelStatus + red*(255-currentPixelStatus))/255
            cBlue =(cBlue*currentPixelStatus + blue*(255-currentPixelStatus))/255
            cGreen = (cGreen*currentPixelStatus + green*(255-currentPixelStatus))/255

            self.PutPixel(x + ypos, y - xpos, curColor)         ! curColor is over the color components group
          end
        end
      else
        loop ypos = 0 to cheight-1
          currentscan = ypos * cwidth
          loop xpos = self.fontQ.charwidth to 1 by -1
            curPix =  currentscan + xpos
            currentPixelStatus = Val(self.fontQ.data[curPix])
            if currentPixelStatus = 0
              self.putpixel(x+ypos, y-xpos)
            end
          end
        end
      end
      y -= self.fontQ.charwidth
      self.penColor = oldColor
    end
  else                                            ! a space, just add the width of a char
    if rotation = 0 or rotation = 360
      xOffset += spaceWidth
    else
      y -= BShift(fontDevSize, -2) + kerning
    end
  end
