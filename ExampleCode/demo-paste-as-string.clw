PROGRAM

  MAP
  END

  CODE
  
! =========================================================================
! DEMO: Paste as Clarion String Feature
! =========================================================================
!
! This file demonstrates the new "Paste as Clarion String" feature.
!
! USAGE:
! 1. Copy some text (e.g., SQL query) to clipboard
! 2. Place cursor where you want the string
! 3. Press Ctrl+Shift+Alt+V or use Command Palette: "Clarion: Paste as String"
! 4. Text is converted to Clarion string format with proper escaping and continuation
!
! CONFIGURATION:
! In VS Code settings, configure:
! - clarion.pasteAsString.lineTerminator: "space", "crlf", or "none"
! - clarion.pasteAsString.trimLeadingWhitespace: true (default) or false
!
! With trimLeadingWhitespace = true (recommended):
!   Leading spaces are removed from each line before wrapping in quotes
!   Perfect for pasting indented code
!
! With trimLeadingWhitespace = false:
!   Original spacing is preserved inside the string
!   Use when the spacing is meaningful
!
! =========================================================================

! Example 1: SQL query with space terminator (default)
! Copy this SQL:
!   SELECT CustomerName, OrderDate, TotalAmount
!   FROM Orders
!   WHERE OrderDate > '2024-01-01'
!   ORDER BY OrderDate DESC
!
! After paste with cursor at position shown by ▼:
!                                ▼
SqlQuery1 STRING('SELECT CustomerName, OrderDate, TotalAmount ' & |
                 'FROM Orders ' & |
                 'WHERE OrderDate > ''2024-01-01'' ' & |
                 'ORDER BY OrderDate DESC')
!
! Notice: All opening quotes (') align at the same column!

! Example 2: Multi-line message with CRLF terminator
! Copy this text:
!   This is line 1
!   This is line 2
!   This is line 3
!
! With lineTerminator = "crlf", it becomes:
Message1 STRING('This is line 1<13,10>' & |
                'This is line 2<13,10>' & |
                'This is line 3')

! Example 3: HTML with quotes that need escaping
! Copy this HTML:
!   <div class="container">
!     <h1>Welcome to the App</h1>
!   </div>
!
! After paste:
HtmlContent STRING('<div class="container"> ' & |
                   '  <h1>Welcome to the App</h1> ' & |
                   '</div>')

! Example 4: Complex SQL with indentation
! The feature aligns all opening quotes at the cursor position
! Copy this SQL:
!   SELECT
!     c.Name,
!     o.Total
!   FROM Customers c
!   JOIN Orders o ON c.ID = o.CustomerID
!
! Place cursor here:  ▼
  ComplexQuery STRING('SELECT ' & |
                      '  c.Name, ' & |
                      '  o.Total ' & |
                      'FROM Customers c ' & |
                      'JOIN Orders o ON c.ID = o.CustomerID')
!
! All continuation line quotes align at the same column as the first line!

! Example 5: Indented code with trimLeadingWhitespace = true (default)
! Copy this indented Clarion code:
!     CASE Value
!     OF 1 ; DoSomething()
!     OF 2 ; DoSomethingElse()
!     END
!
! Result - leading spaces removed:
CodeStr STRING('CASE Value ' & |
               'OF 1 ; DoSomething() ' & |
               'OF 2 ; DoSomethingElse() ' & |
               'END')

! Example 6: With trimLeadingWhitespace = false
! Same code, but spaces preserved inside string:
CodeStr2 STRING('    CASE Value ' & |
                '    OF 1 ; DoSomething() ' & |
                '    OF 2 ; DoSomethingElse() ' & |
                '    END')

! =========================================================================
! BENEFITS:
! =========================================================================
! - Automatically escapes single quotes (converts ' to '')
! - Adds proper Clarion string continuation (& |)
! - Handles multi-line text intelligently
! - **Aligns all opening quotes at the same column position**
! - **Trims leading whitespace by default** (configurable)
! - Configurable line termination (space, CRLF, or none)
! - Works only in Clarion files for safety
! - Saves time formatting strings manually
!
! =========================================================================

  RETURN
