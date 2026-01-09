TestWindow  WINDOW('Test'),AT(,,600,400)
              MENUBAR,USE(?MENUBAR1)
                MENU('&File'),USE(?FileMenu)
                  ITEM('E&xit'),USE(?Exit)
                END
                MENU('&Help'),USE(?HelpMenu)
                  ITEM('&About'),USE(?About)
                END
              END
            END
